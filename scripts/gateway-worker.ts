/**
 * Local Gateway worker for DM continuations.
 *
 * Vercel Hobby can't hold a WebSocket open, so DM messages never reach the
 * /api/webhooks/discord endpoint. Run this script from your laptop during the
 * demo: it opens a Discord Gateway connection, listens for DM messages, and
 * replies using the same future-self generator and DB the deployed app uses.
 *
 *   pnpm exec tsx --env-file=.env.local scripts/gateway-worker.ts
 *
 * Reads DISCORD_BOT_TOKEN, ANTHROPIC_API_KEY, DATABASE_URL from the env.
 */

import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type Message,
  type MessageReaction,
  type PartialMessageReaction,
  type User,
  type PartialUser,
} from "discord.js";

import { generateFutureSelfResponse } from "../lib/future-self";
import {
  appendMessage,
  getRecentMessages,
  isDuplicateUserMessage,
  isRateLimited,
} from "../lib/conversation";
import { sql } from "../lib/db";
import { getVoiceProfile, type Horizon } from "../lib/voice-profile";
import { scrubForPromptInterpolation } from "../lib/voice";

const HOURGLASS = "⏳";
const REACTION_DEFAULT_HORIZON: Horizon = "1y";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  // DM channels and reactions on uncached messages arrive as partials.
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

client.once(Events.ClientReady, (c) => {
  console.log(`[gateway-worker] connected as ${c.user.tag}`);
});

// ---------------------------------------------------------------------------
// DM continuations
// ---------------------------------------------------------------------------

client.on(Events.MessageCreate, async (msg: Message) => {
  try {
    if (msg.author.bot) return;
    // 1:1 DMs only. Group DMs (ChannelType.GroupDM) are out of scope.
    if (msg.channel.type !== ChannelType.DM) return;

    const channelId = msg.channelId;
    const userId = msg.author.id;
    const text = msg.content;

    // Rate-limit BEFORE dedup. Otherwise a flood of identical messages hits
    // the dedup short-circuit, never persists, and the rate counter (which
    // counts persisted user rows) never increments — duplicate-spam slips
    // through unbounded.
    if (await isRateLimited(userId)) {
      console.log(`[gateway-worker] DM rate-limited, dropping: ${userId}`);
      // Silent drop — no DM back, since a rate-limited user is probably
      // hostile or accidental and either way the right move is restraint.
      return;
    }

    // Dedup against Discord MESSAGE_CREATE redelivery (which happens when
    // the worker reconnects with an unacknowledged session).
    if (await isDuplicateUserMessage(channelId, userId, text)) {
      console.log(`[gateway-worker] DM duplicate, skipping: ${userId}`);
      return;
    }

    // Onboarding gate. Mirrors the reaction handler — un-onboarded users
    // should not receive a bot-initiated DM (Discord anti-spam stance), and
    // the soft-fail string in lib/future-self.ts would otherwise reach them
    // here on a continuation if they were ever DM'd before their profile
    // was created/restored.
    const profile = await getVoiceProfile(userId);
    if (!profile) {
      console.log(
        `[gateway-worker] DM from un-onboarded user ${userId}, ignoring`
      );
      return;
    }

    // Pull the horizon from the most recent persisted turn so 5y stays 5y.
    const rows = (await sql`
      SELECT horizon FROM conversation_messages
      WHERE channel_id = ${channelId}
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `) as Array<{ horizon: Horizon }>;
    const horizon: Horizon = rows[0]?.horizon ?? REACTION_DEFAULT_HORIZON;

    console.log(
      `[gateway-worker] DM from ${userId} (${horizon}): ${text.slice(0, 80)}`
    );

    await msg.channel.sendTyping().catch(() => undefined);

    // Read history BEFORE persisting the new user turn — the model's
    // `prompt` argument carries the new turn separately.
    const history = await getRecentMessages(channelId, 20);

    // Persist the user turn before generation so a crash mid-call doesn't
    // lose the question.
    await appendMessage(channelId, userId, horizon, "user", text);

    const reply = await generateFutureSelfResponse({
      discordUserId: userId,
      horizon,
      prompt: text,
      history,
      trigger: "continuation",
    });

    await msg.channel.send(reply);

    await appendMessage(channelId, userId, horizon, "assistant", reply);

    console.log(`[gateway-worker] DM replied (${reply.length} chars)`);
  } catch (err) {
    console.error("[gateway-worker] DM handler error:", err);
  }
});

// ---------------------------------------------------------------------------
// ⏳ reaction trigger
// ---------------------------------------------------------------------------

client.on(
  Events.MessageReactionAdd,
  async (
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser
  ) => {
    try {
      if (user.bot) return;

      if (reaction.partial) {
        try {
          await reaction.fetch();
        } catch {
          return;
        }
      }
      if (reaction.emoji.name !== HOURGLASS) return;

      if (reaction.message.partial) {
        try {
          await reaction.message.fetch();
        } catch {
          return;
        }
      }

      const reactedText = reaction.message.content ?? "";
      const horizon = REACTION_DEFAULT_HORIZON;
      const promptText =
        reactedText ||
        "(reacted to a message I couldn't read — context unavailable)";

      console.log(
        `[gateway-worker] ⏳ reaction by ${user.id}: ${reactedText.slice(0, 80)}`
      );

      // Onboarding gate: don't open a DM with users who haven't built a
      // voice profile. Otherwise we'd send them an unsolicited
      // "you haven't onboarded" DM, which violates Discord's anti-spam
      // stance and exposes the bot in environments Sarah doesn't control.
      const profile = await getVoiceProfile(user.id);
      if (!profile) {
        console.log(
          `[gateway-worker] reaction from un-onboarded user ${user.id}, ignoring`
        );
        return;
      }

      if (await isRateLimited(user.id)) {
        console.log(`[gateway-worker] reaction rate-limited: ${user.id}`);
        return;
      }

      const fullUser = user.partial ? await user.fetch() : user;
      const dm = await fullUser.createDM();

      // Persist user turn before generation so a crash mid-call doesn't lose
      // the reacted-message context. Scrub the reacted text before persisting
      // — otherwise an attacker's reacted-message body sits in the DM history
      // and re-injects on every subsequent continuation turn (cross-context
      // injection vector). Scrub matches what the system prompt sees.
      const persistedText = scrubForPromptInterpolation(promptText);
      await appendMessage(dm.id, fullUser.id, horizon, "user", persistedText);

      const reply = await generateFutureSelfResponse({
        discordUserId: fullUser.id,
        horizon,
        prompt: promptText,
        trigger: "reaction",
      });

      await dm.send(reply);

      await appendMessage(dm.id, fullUser.id, horizon, "assistant", reply);

      console.log(`[gateway-worker] reaction replied (${reply.length} chars)`);
    } catch (err) {
      console.error("[gateway-worker] reaction handler error:", err);
    }
  }
);

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

let isShuttingDown = false;
const shutdown = (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[gateway-worker] received ${signal}, shutting down`);
  // discord.js's destroy() closes the WebSocket cleanly. We don't await
  // in-flight handlers because they each have their own try/catch and the
  // DB writes inside them complete fast enough that the SIGTERM grace
  // window typically covers them.
  client.destroy();
  process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error("[gateway-worker] DISCORD_BOT_TOKEN is not set");
  process.exit(1);
}

client.login(token).catch((err) => {
  console.error("[gateway-worker] login failed:", err);
  process.exit(1);
});
