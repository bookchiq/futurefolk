/**
 * Scheduled check-in workflow.
 *
 * Started by `lib/scheduled-check-ins.ts::scheduleCheckIn` when a user
 * invokes `/futureself` with a `schedule:` ISO date. The workflow sleeps
 * until the date (durably — the sleep survives deploys, crashes,
 * infrastructure changes), wakes up, atomically claims the row to prevent
 * double-delivery on step retry, generates a "future-you reaching out"
 * message, posts it to the user's DM, and persists conversation history.
 *
 * Idempotence on retry (issue #031): the `reserveAndDeliver` step does an
 * atomic `UPDATE ... SET status='sent' WHERE status='pending' RETURNING`
 * BEFORE calling Discord. If the workflow restarts or the step retries, the
 * conditional UPDATE returns 0 rows and we bail without re-sending. The
 * trade-off: if the conversation-turn persistence step fails after delivery,
 * the user has the DM but history is missing. Bounded loss; better than
 * double-DMing.
 *
 * Run-id self-recording (issue #032): the workflow records its own
 * `runId` to the row in its first step, so the slash command doesn't have
 * to race against the workflow's wake-up. The runId is needed by
 * `cancelScheduledCheckIn` to cancel the durable run.
 *
 * Cancellation: the user can cancel a pending check-in via
 * `cancelScheduledCheckIn`. That marks the row `cancelled` and calls
 * `getRun(...).cancel()`. The workflow's atomic-claim UPDATE will return
 * 0 rows on wake (status is no longer `pending`) so the bail is safe.
 */

import { sleep, getWorkflowMetadata } from "workflow";

import { generateFutureSelfResponse } from "@/lib/future-self";
import { sendDiscordDM } from "@/lib/discord-dm";
import { appendMessage } from "@/lib/conversation";
import { sql } from "@/lib/db";
import {
  markCheckInFailed,
  setCheckInWorkflowRunId,
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

  // Self-record our run_id to the row before sleeping. Eliminates the race
  // where the slash command's setCheckInWorkflowRunId UPDATE hadn't landed
  // by the time the workflow wakes (issue #032). The slash command no
  // longer needs to know our runId.
  const { workflowRunId } = getWorkflowMetadata();
  await recordRunId(args.checkInId, workflowRunId);

  // Suspend until the scheduled date. Doesn't consume resources while
  // sleeping; survives Vercel deploys, function cold starts, etc.
  await sleep(new Date(args.scheduledForIso));

  // Generation may take 10-30s; do it BEFORE the atomic claim so we don't
  // hold the row in `sent` while we're still talking to Anthropic. Cost of
  // this ordering: if cancellation arrives during generation, we'll
  // generate a reply that gets thrown away. Acceptable — the alternative
  // is the row being marked `sent` while we're still working.
  let reply: string;
  try {
    reply = await generateScheduledMessage(args);
  } catch (err) {
    await markFailed(args.checkInId);
    console.error("[Futurefolk] scheduled-check-in: generation failed", err);
    return { status: "failed", reason: "generation" };
  }

  // Atomic claim + delivery. The single SQL UPDATE both reserves the slot
  // (so step retry can't double-deliver) and tells us whether to proceed.
  let channelId: string;
  try {
    const claimed = await reserveAndDeliver({
      checkInId: args.checkInId,
      discordUserId: args.discordUserId,
      content: reply,
    });
    if (!claimed) {
      // Already sent (retry) or cancelled while we were generating.
      return { status: "skipped", reason: "not-pending" };
    }
    channelId = claimed.channelId;
  } catch (err) {
    await markFailed(args.checkInId);
    console.error("[Futurefolk] scheduled-check-in: delivery failed", err);
    return { status: "failed", reason: "delivery" };
  }

  // Persist conversation turns so future DM continuations have history.
  // Best-effort: if this fails, the user has the DM and the row says
  // `sent`; the next continuation just lacks one assistant turn in
  // history. Bounded loss; do not re-deliver.
  try {
    await appendConversationTurns({
      channelId,
      discordUserId: args.discordUserId,
      horizon: args.horizon,
      topic: args.topic,
      reply,
    });
  } catch (err) {
    console.error(
      "[Futurefolk] scheduled-check-in: persistConversationTurns failed (DM was delivered, history skipped)",
      err
    );
  }

  return { status: "sent" };
}

// ---------------------------------------------------------------------------
// Steps — each one runs in a step boundary so retries, persistence, and
// observability work as expected. Steps have full Node.js / npm access.
// ---------------------------------------------------------------------------

async function recordRunId(
  checkInId: number,
  workflowRunId: string,
): Promise<void> {
  "use step";
  // Idempotent on step retry: writing the same runId back is a no-op.
  // setCheckInWorkflowRunId only writes if workflow_run_id IS NULL so a
  // second run (shouldn't happen, but defensive) doesn't clobber.
  await setCheckInWorkflowRunId(checkInId, workflowRunId);
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

/**
 * Atomically claim the row (status: pending → sent) BEFORE calling Discord.
 *
 * - If the conditional UPDATE returns 0 rows, the row is no longer pending
 *   (already sent on a prior retry, or cancelled). Return null and bail.
 * - If it returns 1 row, we own the slot — only this step instance will
 *   call Discord. On retry, the second attempt sees 0 rows.
 *
 * This is the load-bearing primitive for issue #031 (idempotence under
 * step retry) and the close to issue #033's cancellation race (cancel
 * arrives between generation and delivery — the UPDATE returns 0 rows).
 */
async function reserveAndDeliver(args: {
  checkInId: number;
  discordUserId: string;
  content: string;
}): Promise<{ channelId: string } | null> {
  "use step";
  const claimed = (await sql`
    UPDATE scheduled_check_ins
    SET status = 'sent', sent_at = now()
    WHERE id = ${args.checkInId} AND status = 'pending'
    RETURNING id
  `) as Array<{ id: number }>;

  if (claimed.length === 0) {
    return null;
  }

  const { channelId } = await sendDiscordDM(
    args.discordUserId,
    args.content
  );
  return { channelId };
}

async function appendConversationTurns(args: {
  channelId: string;
  discordUserId: string;
  horizon: Horizon;
  topic: string;
  reply: string;
}): Promise<void> {
  "use step";
  // Persist the topic as a synthetic "user" turn AND the assistant reply
  // so DM continuations have grounding context. Note: ordering differs
  // from the live (slash + DM + reaction) paths — there the user turn
  // is a real DM that arrived. Here it's the topic the schedule was
  // created with.
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
}

async function markFailed(checkInId: number): Promise<void> {
  "use step";
  await markCheckInFailed(checkInId);
}
