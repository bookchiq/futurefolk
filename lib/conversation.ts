/**
 * DM conversation memory.
 *
 * Each DM thread has a stable Discord channel ID. We persist messages keyed
 * by that channel ID so conversation history survives cold starts and the
 * eventual switch to a different state adapter.
 *
 * The in-memory ChatSDK state adapter would otherwise lose subscription
 * (and message) state on every cold start — see .v0/findings.md.
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
