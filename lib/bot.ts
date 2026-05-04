/**
 * ChatSDK bot instance for Futurefolk.
 *
 * Scoped to slash command handling only. The HTTP Interactions endpoint at
 * app/api/webhooks/discord/route.ts dispatches into this module.
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
 * See .v0/findings.md for the detailed split.
 */

import { Chat } from "chat";
import { createDiscordAdapter } from "@chat-adapter/discord";
import { createMemoryState } from "@chat-adapter/state-memory";

import { type Horizon } from "./voice-profile";
import { generateFutureSelfResponse } from "./future-self";
import { appendMessage } from "./conversation";

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

  if (schedule) {
    await event.channel.postEphemeral(
      event.user,
      "Scheduled check-ins are coming. For now, opening DMs with future-you for an immediate conversation.",
      { fallbackToDM: true },
    );
  } else {
    await event.channel.postEphemeral(
      event.user,
      `Opening DMs with you, ${horizon === "1y" ? "a year on" : "five years on"}…`,
      { fallbackToDM: true },
    );
  }

  // Open DM, persist user turn, generate, post, persist assistant turn.
  // Conversation history is keyed by the raw Discord channel ID so the
  // Railway gateway worker (which uses discord.js, not ChatSDK) can read it
  // back. Use `dm.channelId`, not `dm.id` — the latter is ChatSDK's encoded
  // form `discord:@me:<channelId>` and would not match `msg.channelId` from
  // the worker's perspective.
  const dm = await bot.openDM(event.user);
  const channelId = dm.channelId;

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
  const data = (raw as { data?: { options?: DiscordSlashOption[] } })?.data;
  const options = data?.options ?? [];
  const out: ParsedSlashOptions = {};
  for (const opt of options) {
    if (opt.name === "horizon" && typeof opt.value === "string") {
      out.horizon = opt.value;
    } else if (opt.name === "about" && typeof opt.value === "string") {
      out.about = opt.value;
    } else if (opt.name === "schedule" && typeof opt.value === "string") {
      out.schedule = opt.value;
    }
  }
  return out;
}

function normalizeHorizon(value: string | undefined): Horizon {
  return value === "5y" ? "5y" : "1y";
}
