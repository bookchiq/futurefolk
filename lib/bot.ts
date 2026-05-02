/**
 * ChatSDK bot instance for Futurefolk.
 *
 * Single source of truth for the Discord bot. Imported by:
 *   - app/api/webhooks/discord/route.ts  (HTTP Interactions: slash commands)
 *   - app/api/discord/gateway/route.ts   (Gateway listener: messages + reactions)
 *
 * Triggers wired here:
 *   1. /futureself slash command          → onSlashCommand("/futureself")
 *   2. ⏳ reaction on any visible message  → onReaction
 *   3. DM continuation with the bot       → onSubscribedMessage (DM thread is subscribed
 *                                            after the bot's first post)
 *
 * Conversation memory is persisted to Postgres keyed by Discord channel ID
 * (lib/conversation.ts). The ChatSDK in-memory state adapter is still used
 * for subscription state, but message history is durable across cold starts.
 * See .v0/findings.md.
 */

import { Chat } from "chat";
import { createDiscordAdapter } from "@chat-adapter/discord";
import { createMemoryState } from "@chat-adapter/state-memory";

import { type Horizon } from "./voice-profile";
import { generateFutureSelfResponse } from "./future-self";
import { appendMessage, getRecentMessages } from "./conversation";

// Per-thread metadata so DM continuations remember which future-self started the thread.
// 1y vs 5y must persist across messages (a 5y thread does not turn into a 1y thread mid-conversation).
interface ThreadState {
  horizon?: Horizon;
  /** Original topic the user invoked future-self about — useful for grounding follow-ups. */
  topic?: string;
}

const HOURGLASS = "⏳";
const REACTION_DEFAULT_HORIZON: Horizon = "1y";

// Discord adapter auto-detects DISCORD_BOT_TOKEN, DISCORD_PUBLIC_KEY, and
// DISCORD_APPLICATION_ID. Sarah's env uses DISCORD_APP_ID (per SETUP.md), so we
// pass applicationId explicitly to handle either spelling.
const discord = createDiscordAdapter({
  applicationId:
    process.env.DISCORD_APPLICATION_ID ?? process.env.DISCORD_APP_ID,
  // botToken and publicKey fall through to env vars.
});

export const bot = new Chat<{ discord: typeof discord }, ThreadState>({
  userName: "futurefolk",
  adapters: { discord },
  state: createMemoryState(),
});

// ---------------------------------------------------------------------------
// Trigger 1: /futureself slash command
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

  // Open DM, generate, post, persist — in that order so we have the channel
  // ID by the time we write to the conversation_messages table.
  const dm = await bot.openDM(event.user);

  // Subscribe BEFORE posting so the thread is marked subscribed before the
  // user can possibly reply. After this, follow-up DM messages route to
  // onSubscribedMessage below.
  await dm.subscribe();
  await dm.setState({ horizon, topic: about });

  const reply = await generateFutureSelfResponse({
    discordUserId: event.user.userId,
    horizon,
    prompt: about,
    trigger: "slash",
  });

  await dm.post(reply);

  // Persist user "topic" + assistant reply so future continuations have history.
  await appendMessage(dm.id, event.user.userId, horizon, "user", about);
  await appendMessage(dm.id, event.user.userId, horizon, "assistant", reply);
});

// ---------------------------------------------------------------------------
// Trigger 2: ⏳ reaction on any message in any channel the bot is in
// ---------------------------------------------------------------------------

bot.onReaction(async (event) => {
  if (!event.added) return;
  if (event.rawEmoji !== HOURGLASS) return;
  if (event.user.isMe) return;

  const reactedText = event.message?.text ?? "";
  console.log("[Futurefolk] ⏳ reaction", {
    user: event.user.userId,
    msgPreview: reactedText.slice(0, 80),
  });

  const horizon = REACTION_DEFAULT_HORIZON;
  const promptText =
    reactedText ||
    "(reacted to a message I couldn't read — context unavailable)";

  const dm = await bot.openDM(event.user);
  await dm.subscribe();
  await dm.setState({ horizon, topic: reactedText.slice(0, 200) });

  const reply = await generateFutureSelfResponse({
    discordUserId: event.user.userId,
    horizon,
    prompt: promptText,
    trigger: "reaction",
  });

  await dm.post(reply);

  await appendMessage(dm.id, event.user.userId, horizon, "user", promptText);
  await appendMessage(dm.id, event.user.userId, horizon, "assistant", reply);
});

// ---------------------------------------------------------------------------
// Trigger 3: DM continuation
// ---------------------------------------------------------------------------

bot.onSubscribedMessage(async (thread, message) => {
  if (!thread.isDM) {
    console.log("[Futurefolk] subscribed message in non-DM thread, ignoring", {
      threadId: thread.id,
    });
    return;
  }

  const state = (await thread.state) ?? {};
  const horizon: Horizon = state.horizon ?? REACTION_DEFAULT_HORIZON;
  const topic = state.topic ?? "";

  // Pull DB-backed history for this channel. This survives cold starts —
  // unlike thread.allMessages from the in-memory state adapter.
  const history = await getRecentMessages(thread.id, 20);

  console.log("[Futurefolk] DM continuation", {
    user: message.author.userId,
    horizon,
    historyTurns: history.length,
  });

  const reply = await generateFutureSelfResponse({
    discordUserId: message.author.userId,
    horizon,
    prompt: message.text,
    history,
    trigger: "continuation",
  });

  await thread.post(reply);

  // Persist this turn (user + assistant) so the next turn sees it.
  await appendMessage(
    thread.id,
    message.author.userId,
    horizon,
    "user",
    message.text,
  );
  await appendMessage(
    thread.id,
    message.author.userId,
    horizon,
    "assistant",
    reply,
  );

  // Topic only needs to be remembered if it isn't set yet (edge case where
  // the thread was subscribed without setState). Keep horizon stable.
  if (!topic) {
    await thread.setState({ horizon, topic: message.text.slice(0, 200) });
  }
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
