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
import { appendMessage, getRecentMessages } from "../lib/conversation";
import { sql } from "../lib/db";
import type { Horizon } from "../lib/voice-profile";

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

    const history = await getRecentMessages(channelId, 20);

    const reply = await generateFutureSelfResponse({
      discordUserId: userId,
      horizon,
      prompt: text,
      history,
      trigger: "continuation",
    });

    await msg.channel.send(reply);

    await appendMessage(channelId, userId, horizon, "user", text);
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

      const fullUser = user.partial ? await user.fetch() : user;
      const dm = await fullUser.createDM();

      const reply = await generateFutureSelfResponse({
        discordUserId: fullUser.id,
        horizon,
        prompt: promptText,
        trigger: "reaction",
      });

      await dm.send(reply);

      await appendMessage(dm.id, fullUser.id, horizon, "user", promptText);
      await appendMessage(dm.id, fullUser.id, horizon, "assistant", reply);

      console.log(`[gateway-worker] reaction replied (${reply.length} chars)`);
    } catch (err) {
      console.error("[gateway-worker] reaction handler error:", err);
    }
  }
);

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
