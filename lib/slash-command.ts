/**
 * Slash command handler — `/futureself` invocations only.
 *
 * Mounted by `app/api/webhooks/discord/route.ts` against ChatSDK's Discord
 * webhook (HTTP Interactions endpoint). The ChatSDK `Chat` instance lives
 * here because it's required for slash command dispatch + Ed25519 signature
 * verification, but its Gateway-side handlers are deliberately not registered.
 *
 * Gateway-side triggers (DM continuations, ⏳ reactions) live in
 * scripts/gateway-worker.ts using discord.js directly. They were previously
 * wired here as `bot.onSubscribedMessage` and `bot.onReaction`, but ChatSDK's
 * Gateway listener requires a long-lived process that Vercel Hobby cannot
 * provide, so those handlers were inert. The standalone worker (deployed on
 * Railway) calls the same `generateFutureSelfResponse` and conversation-memory
 * helpers directly, with no ChatSDK involvement.
 *
 * Conversation memory is persisted to Postgres keyed by Discord channel ID
 * (lib/conversation.ts). The ChatSDK in-memory state adapter is required by
 * the Chat constructor's type signature but is otherwise unused.
 * See .v0/findings.md for the detailed split rationale.
 */

import { Chat } from "chat";
import { createDiscordAdapter } from "@chat-adapter/discord";
import { createMemoryState } from "@chat-adapter/state-memory";

import { type Horizon } from "./voice-profile";
import { generateFutureSelfResponse } from "./future-self";
import {
  appendMessage,
  isDuplicateUserMessage,
  isRateLimited,
} from "./conversation";
import {
  MAX_SCHEDULE_HORIZON_DAYS,
  parseScheduleInput,
  scheduleCheckIn,
  validateScheduledFor,
} from "./scheduled-check-ins";
import { VERSION } from "./version";

// Logged once per cold start so deploy drift between Vercel + Railway is
// visible. Lives at module scope so the log fires on first import (i.e.
// first slash command per cold start), not on every invocation.
console.log(`[Futurefolk] slash-command module loaded (version=${VERSION})`);

// Discord adapter auto-detects DISCORD_BOT_TOKEN, DISCORD_PUBLIC_KEY, and
// DISCORD_APPLICATION_ID. Sarah's env uses DISCORD_APP_ID (per SETUP.md), so we
// pass applicationId explicitly to handle either spelling.
const discord = createDiscordAdapter({
  applicationId:
    process.env.DISCORD_APPLICATION_ID ?? process.env.DISCORD_APP_ID,
  // botToken and publicKey fall through to env vars.
});

export const bot = new Chat<{ discord: typeof discord }>({
  userName: "futurefolk",
  adapters: { discord },
  state: createMemoryState(),
});

// ---------------------------------------------------------------------------
// /futureself slash command
// ---------------------------------------------------------------------------

bot.onSlashCommand("/futureself", async (event) => {
  const options = parseSlashOptions(event.raw);
  const horizon = normalizeHorizon(options.horizon);
  const about = (options.about ?? "").trim();
  const schedule = options.schedule;

  console.log("[Futurefolk] /futureself invoked", {
    user: event.user.userId,
    horizon,
    about: about.slice(0, 80),
    schedule: schedule ?? null,
  });

  if (!about) {
    await event.channel.postEphemeral(
      event.user,
      "Need an `about:` — what do you want to talk to future-you about?",
      { fallbackToDM: true },
    );
    return;
  }

  if (await isRateLimited(event.user.userId)) {
    console.log(
      "[Futurefolk] /futureself rate-limited",
      event.user.userId,
    );
    await event.channel.postEphemeral(
      event.user,
      "you're moving fast. give it a minute and try again.",
      { fallbackToDM: true },
    );
    return;
  }

  if (schedule) {
    await handleScheduledInvocation({
      event,
      horizon,
      about,
      schedule,
    });
    return;
  }

  await event.channel.postEphemeral(
    event.user,
    `Opening DMs with you, ${horizon === "1y" ? "a year on" : "five years on"}…`,
    { fallbackToDM: true },
  );

  // Open DM, persist user turn, generate, post, persist assistant turn.
  // Conversation history is keyed by the raw Discord channel ID so the
  // Railway gateway worker (which uses discord.js, not ChatSDK) can read it
  // back. Use `dm.channelId`, not `dm.id` — the latter is ChatSDK's encoded
  // form `discord:@me:<channelId>` and would not match `msg.channelId` from
  // the worker's perspective.
  const dm = await bot.openDM(event.user);
  const channelId = dm.channelId;

  if (await isDuplicateUserMessage(channelId, event.user.userId, about)) {
    console.log(
      `[Futurefolk] /futureself duplicate, skipping for ${event.user.userId}`
    );
    return;
  }

  // Persist the user turn before generation so a crash mid-call doesn't lose
  // the question.
  await appendMessage(channelId, event.user.userId, horizon, "user", about);

  const reply = await generateFutureSelfResponse({
    discordUserId: event.user.userId,
    horizon,
    prompt: about,
    trigger: "slash",
  });

  await dm.post(reply);

  await appendMessage(channelId, event.user.userId, horizon, "assistant", reply);
});

// ---------------------------------------------------------------------------
// Scheduled check-in path
// ---------------------------------------------------------------------------

type SlashEvent = Parameters<Parameters<typeof bot.onSlashCommand>[1]>[0];

async function handleScheduledInvocation(args: {
  event: SlashEvent;
  horizon: Horizon;
  about: string;
  schedule: string;
}): Promise<void> {
  const { event, horizon, about, schedule } = args;

  const scheduledFor = parseScheduleInput(schedule);
  if (!scheduledFor) {
    await event.channel.postEphemeral(
      event.user,
      `Couldn't parse \`schedule:\`. Use a future ISO date like \`2026-11-02\` or \`2026-11-02T15:00:00Z\`.`,
      { fallbackToDM: true },
    );
    return;
  }

  const validation = validateScheduledFor(scheduledFor);
  if (!validation.ok) {
    const message =
      validation.reason === "past"
        ? "That schedule is in the past (or right now). Pick a date at least a minute out."
        : `That's more than a year out. Try a date within ${MAX_SCHEDULE_HORIZON_DAYS} days.`;
    await event.channel.postEphemeral(event.user, message, {
      fallbackToDM: true,
    });
    return;
  }

  try {
    await scheduleCheckIn({
      discordUserId: event.user.userId,
      horizon,
      topic: about,
      scheduledFor,
    });
  } catch (err) {
    console.error("[Futurefolk] /futureself: scheduleCheckIn failed", err);
    await event.channel.postEphemeral(
      event.user,
      "Couldn't save the schedule. Try again in a moment.",
      { fallbackToDM: true },
    );
    return;
  }

  const horizonLabel = horizon === "1y" ? "a year on" : "five years on";
  await event.channel.postEphemeral(
    event.user,
    `Scheduled. You, ${horizonLabel}, will DM you on ${formatScheduledDate(scheduledFor)} about: ${about}`,
    { fallbackToDM: true },
  );
}

function formatScheduledDate(date: Date): string {
  // Use UTC so the message doesn't lie about the time zone we don't know.
  return date
    .toISOString()
    .replace("T", " ")
    .replace(/:\d{2}\.\d{3}Z$/, " UTC")
    .replace(/Z$/, " UTC");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface DiscordSlashOption {
  name: string;
  type: number;
  value?: string | number | boolean;
  options?: DiscordSlashOption[];
}

interface ParsedSlashOptions {
  horizon?: string;
  about?: string;
  schedule?: string;
}

/**
 * Pull typed options from the raw Discord interaction payload.
 *
 * ChatSDK flattens slash command option *values* into `event.text`, but for
 * named options (horizon, about, schedule) we need the original tree, which
 * lives in `event.raw.data.options`. Per chat-sdk.dev/docs/slash-commands:
 * "Consumers needing the full option tree (names, types) can use event.raw."
 */
function parseSlashOptions(raw: unknown): ParsedSlashOptions {
  const options =
    (raw as { data?: { options?: DiscordSlashOption[] } })?.data?.options ?? [];
  const out: ParsedSlashOptions = {};
  for (const { name, value } of options) {
    if (typeof value !== "string") continue;
    if (name === "horizon" || name === "about" || name === "schedule") {
      out[name] = value;
    }
  }
  return out;
}

function normalizeHorizon(value: string | undefined): Horizon {
  return value === "5y" ? "5y" : "1y";
}
