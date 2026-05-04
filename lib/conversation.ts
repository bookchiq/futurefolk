/**
 * DM conversation memory.
 *
 * Rows are keyed by the raw Discord channel ID (a numeric string like
 * "1500227847134285894"). Both the slash command path (`lib/bot.ts`, via
 * `dm.channelId`) and the gateway worker (`scripts/gateway-worker.ts`, via
 * `msg.channelId` / `dm.id` from discord.js) write under the same key, so
 * either path can read the other's history back.
 *
 * Do NOT use ChatSDK's `Thread.id` here — that's the encoded form
 * `"discord:@me:<channelId>"` and would diverge from the worker's keys.
 */

import { sql } from "./db";
import type { Horizon } from "./voice-profile";

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

/** Append a message to a DM thread's history. */
export async function appendMessage(
  channelId: string,
  discordUserId: string,
  horizon: Horizon,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  await sql`
    INSERT INTO conversation_messages (
      channel_id, discord_user_id, horizon, role, content
    )
    VALUES (
      ${channelId}, ${discordUserId}, ${horizon}, ${role}, ${content}
    )
  `;
}

/**
 * Load the most recent N turns for a thread, ordered oldest → newest (the
 * order the model expects). Default 20 turns is a comfortable balance —
 * Claude handles plenty more, but the system prompt is heavy and the voice
 * stays tighter when context doesn't bloat.
 */
export async function getRecentMessages(
  channelId: string,
  limit = 20
): Promise<ConversationTurn[]> {
  const rows = (await sql`
    SELECT role, content
    FROM conversation_messages
    WHERE channel_id = ${channelId}
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit}
  `) as Array<{ role: "user" | "assistant"; content: string }>;

  return rows.reverse().map((r) => ({ role: r.role, content: r.content }));
}
