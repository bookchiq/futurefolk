/**
 * Scheduled check-in workflow.
 *
 * Started by `lib/slash-command.ts` when a user invokes `/futureself` with a
 * `schedule:` ISO date. The workflow sleeps until the date (durably — the
 * sleep survives deploys, crashes, infrastructure changes), wakes up,
 * generates a "future-you reaching out" message, posts it to the user's DM,
 * and persists the row in `conversation_messages` so subsequent DM replies
 * land in the same channel-keyed history.
 *
 * Cancellation: the user can cancel a pending check-in via
 * `cancelScheduledCheckIn` (DB row marked `cancelled` + `getRun(...).cancel()`).
 * The workflow also re-checks the row's status on wake — if it's no longer
 * `pending`, it bails out gracefully without sending a DM.
 */

import { sleep } from "workflow";

import { generateFutureSelfResponse } from "@/lib/future-self";
import { sendDiscordDM } from "@/lib/discord-dm";
import { appendMessage } from "@/lib/conversation";
import {
  getCheckInStatus,
  markCheckInFailed,
  markCheckInSent,
} from "@/lib/scheduled-check-ins";
import type { Horizon } from "@/lib/voice-profile";

export interface ScheduledCheckInArgs {
  /** Row id in `scheduled_check_ins`. Used to look up the current status on wake. */
  checkInId: number;
  discordUserId: string;
  horizon: Horizon;
  topic: string;
  /** ISO 8601 date string. The workflow sleeps until this moment. */
  scheduledForIso: string;
}

interface CheckInResult {
  status: "sent" | "skipped" | "failed";
  reason?: string;
}

export async function scheduledCheckInWorkflow(
  args: ScheduledCheckInArgs
): Promise<CheckInResult> {
  "use workflow";

  // Suspend until the scheduled date. Doesn't consume resources while
  // sleeping; survives Vercel deploys, function cold starts, etc.
  await sleep(new Date(args.scheduledForIso));

  // Re-check status on wake. If the user cancelled while we were sleeping,
  // bail without sending a DM.
  const currentStatus = await checkStillPending(args.checkInId);
  if (currentStatus !== "pending") {
    return { status: "skipped", reason: currentStatus ?? "row-missing" };
  }

  let reply: string;
  try {
    reply = await generateScheduledMessage(args);
  } catch (err) {
    await markFailed(args.checkInId);
    console.error("[Futurefolk] scheduled-check-in: generation failed", err);
    return { status: "failed", reason: "generation" };
  }

  let channelId: string;
  try {
    channelId = await deliverDM(args.discordUserId, reply);
  } catch (err) {
    await markFailed(args.checkInId);
    console.error("[Futurefolk] scheduled-check-in: delivery failed", err);
    return { status: "failed", reason: "delivery" };
  }

  await persistAndMarkSent({
    checkInId: args.checkInId,
    channelId,
    discordUserId: args.discordUserId,
    horizon: args.horizon,
    topic: args.topic,
    reply,
  });

  return { status: "sent" };
}

// ---------------------------------------------------------------------------
// Steps — each one runs in a step boundary so retries, persistence, and
// observability work as expected. Steps have full Node.js / npm access.
// ---------------------------------------------------------------------------

async function checkStillPending(
  checkInId: number
): Promise<string | null> {
  "use step";
  return getCheckInStatus(checkInId);
}

async function generateScheduledMessage(
  args: ScheduledCheckInArgs
): Promise<string> {
  "use step";
  return generateFutureSelfResponse({
    discordUserId: args.discordUserId,
    horizon: args.horizon,
    prompt: args.topic,
    trigger: "scheduled",
  });
}

async function deliverDM(
  discordUserId: string,
  content: string
): Promise<string> {
  "use step";
  const { channelId } = await sendDiscordDM(discordUserId, content);
  return channelId;
}

async function persistAndMarkSent(args: {
  checkInId: number;
  channelId: string;
  discordUserId: string;
  horizon: Horizon;
  topic: string;
  reply: string;
}): Promise<void> {
  "use step";
  // Persist the assistant turn to conversation_messages so future DM
  // replies (handled by the gateway worker) load this turn as history.
  // We also persist the topic as a "user" turn so the model has the
  // grounding context on the next continuation.
  await appendMessage(
    args.channelId,
    args.discordUserId,
    args.horizon,
    "user",
    args.topic
  );
  await appendMessage(
    args.channelId,
    args.discordUserId,
    args.horizon,
    "assistant",
    args.reply
  );
  await markCheckInSent(args.checkInId);
}

async function markFailed(checkInId: number): Promise<void> {
  "use step";
  await markCheckInFailed(checkInId);
}
