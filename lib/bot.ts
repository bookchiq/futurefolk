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
 * State is in-memory for now (per prompt 02). Swap to @chat-adapter/state-redis or
 * @chat-adapter/state-pg before any real deploy — the in-memory adapter loses
 * subscriptions on every cold start, which kills DM continuation in production.
 * See .v0/findings.md.
 */

import { Chat } from "chat";
import { createDiscordAdapter } from "@chat-adapter/discord";
import { createMemoryState } from "@chat-adapter/state-memory";

import { getVoiceProfile, type Horizon } from "./voice-profile";
import {
  generateFutureSelfResponse,
  type FutureSelfTurn,
} from "./future-self";

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
//
// Discord delivers slash commands via HTTP Interactions. The Discord adapter
// automatically defers the response (so we satisfy Discord's 3-second ACK
// requirement) and resolves it once we post.
//
// `event.channel.post(...)` is the deferred-response resolution. We do that
// synchronously with a brief "ok, opening DMs..." line, then DM the user
// asynchronously with the actual future-self message.

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
    // Scheduling is intentionally NOT wired here. Workflows handles this in chat 4.
    // Acknowledge and tell the user we'll handle it later — do NOT setTimeout.
    await event.channel.postEphemeral(
      event.user,
      "Scheduled check-ins are coming. For now, opening DMs with future-you for an immediate conversation.",
      { fallbackToDM: true },
    );
  } else {
    // Acknowledge in-channel (ephemeral, falls back to DM if Discord doesn't support
    // ephemeral here). This resolves the deferred interaction.
    await event.channel.postEphemeral(
      event.user,
      `Opening DMs with you, ${horizon === "1y" ? "a year on" : "five years on"}…`,
      { fallbackToDM: true },
    );
  }

  // Open the DM thread, generate placeholder reply, post.
  const profile = await getVoiceProfile(event.user.userId);
  const reply = await generateFutureSelfResponse({
    profile,
    horizon,
    prompt: about,
    trigger: "slash",
  });

  const dm = await bot.openDM(event.user);

  // Subscribe BEFORE posting so the thread is marked subscribed before the
  // user can possibly reply. After this, follow-up DM messages route to
  // onSubscribedMessage below.
  await dm.subscribe();
  await dm.setState({ horizon, topic: about });
  await dm.post(reply);
});

// ---------------------------------------------------------------------------
// Trigger 2: ⏳ reaction on any message in any channel the bot is in
// ---------------------------------------------------------------------------
//
// Reactions arrive via the Gateway WebSocket, not HTTP Interactions. The
// gateway listener route keeps a connection alive on a cron schedule and
// forwards reaction events back to the webhook endpoint, which lands here.

bot.onReaction(async (event) => {
  // Ignore removals and non-hourglass reactions.
  if (!event.added) return;
  if (event.rawEmoji !== HOURGLASS) return;
  // Don't react to the bot's own reactions.
  if (event.user.isMe) return;

  const reactedText = event.message?.text ?? "";
  console.log("[Futurefolk] ⏳ reaction", {
    user: event.user.userId,
    msgPreview: reactedText.slice(0, 80),
  });

  const horizon = REACTION_DEFAULT_HORIZON;
  const profile = await getVoiceProfile(event.user.userId);
  const reply = await generateFutureSelfResponse({
    profile,
    horizon,
    prompt:
      reactedText ||
      "(reacted to a message I couldn't read — context unavailable)",
    trigger: "reaction",
  });

  const dm = await bot.openDM(event.user);
  await dm.subscribe();
  await dm.setState({ horizon, topic: reactedText.slice(0, 200) });
  await dm.post(reply);
});

// ---------------------------------------------------------------------------
// Trigger 3: DM continuation
// ---------------------------------------------------------------------------
//
// After the bot's first DM post, the thread is subscribed (see above), so
// every subsequent user message in that DM lands here. We carry the horizon
// from thread state and rebuild conversation history from the thread itself
// — no external store needed.

bot.onSubscribedMessage(async (thread, message) => {
  // Belt-and-suspenders: only continue conversations in DMs.
  if (!thread.isDM) {
    console.log("[Futurefolk] subscribed message in non-DM thread, ignoring", {
      threadId: thread.id,
    });
    return;
  }

  const state = (await thread.state) ?? {};
  const horizon: Horizon = state.horizon ?? REACTION_DEFAULT_HORIZON;
  const topic = state.topic ?? "";

  // Rebuild thread history (oldest → newest), skipping the current incoming
  // message — it's passed separately as `prompt`.
  const history: FutureSelfTurn[] = [];
  for await (const m of thread.allMessages) {
    if (m.id === message.id) continue;
    history.push({
      role: m.author.isMe ? "assistant" : "user",
      text: m.text,
    });
  }

  console.log("[Futurefolk] DM continuation", {
    user: message.author.userId,
    horizon,
    historyTurns: history.length,
  });

  const profile = await getVoiceProfile(message.author.userId);
  const reply = await generateFutureSelfResponse({
    profile,
    horizon,
    prompt: message.text,
    history,
    trigger: "continuation",
  });

  await thread.post(reply);

  // Topic only needs to be remembered if it isn't set yet (e.g. an edge case
  // where the thread was subscribed without setState). Keep horizon stable.
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
