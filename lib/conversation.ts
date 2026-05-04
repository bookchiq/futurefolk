/**
 * DM conversation memory.
 *
 * Rows are keyed by the raw Discord channel ID (a numeric string like
 * "1500227847134285894"). Both the slash command path (`lib/slash-command.ts`,
 * via `dm.channelId`) and the gateway worker (`scripts/gateway-worker.ts`,
 * via `msg.channelId` / `dm.id` from discord.js) write under the same key,
 * so either path can read the other's history back.
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
  const { history } = await getRecentMessagesAndHorizon(channelId, limit);
  return history;
}

/**
 * Combined helper: load the most recent N turns AND the horizon used on the
 * most recent persisted row, in a single round-trip. The gateway worker uses
 * this on every DM continuation; the inline horizon SELECT it replaces was
 * an extra round-trip per message.
 *
 * Returns `horizon: null` if the channel has no rows yet — caller decides
 * the fallback (typically `REACTION_DEFAULT_HORIZON`).
 *
 * Horizon "stickiness": this returns whatever horizon the MOST RECENT
 * persisted user/assistant turn used. The slash command repins horizon by
 * inserting a fresh row with the requested value (1y or 5y); the worker DM
 * continuation reads back the most recent value (so 5y stays 5y across
 * replies). A reaction trigger always inserts at `REACTION_DEFAULT_HORIZON`
 * (1y), which can re-pin a 5y DM channel to 1y if the user happens to also
 * react to a server message before continuing the DM thread. Users can
 * re-pin explicitly by running `/futureself` again with the desired
 * horizon.
 */
export async function getRecentMessagesAndHorizon(
  channelId: string,
  limit = 20
): Promise<{ history: ConversationTurn[]; horizon: Horizon | null }> {
  const rows = (await sql`
    SELECT role, content, horizon
    FROM conversation_messages
    WHERE channel_id = ${channelId}
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit}
  `) as Array<{ role: "user" | "assistant"; content: string; horizon: Horizon }>;

  const horizon = rows[0]?.horizon ?? null;
  const history = rows
    .reverse()
    .map((r) => ({ role: r.role, content: r.content }));
  return { history, horizon };
}

/**
 * Dedup window for Discord MESSAGE_CREATE redelivery.
 *
 * If the worker reconnects with an unacknowledged session, Discord will
 * redeliver the same Gateway event. Without dedup the worker generates a
 * fresh reply every time, double-DMing the user. We can't dedupe by
 * `discord_message_id` yet (no column), so we approximate by checking
 * whether the same `(channel_id, user, content)` tuple was just persisted.
 *
 * Tunable via `DEDUP_WINDOW_SECONDS` env. Default 30s.
 */
const DEDUP_WINDOW_SECONDS =
  Number(process.env.DEDUP_WINDOW_SECONDS) || 30;

/**
 * Per-user rate limit. Counts only USER turns (not assistants) so the bot
 * doesn't rate-limit itself. Conservative enough for legit conversation,
 * tight enough to bound denial-of-wallet.
 *
 * Tunable via `RATE_LIMIT_USER_TURNS_PER_MINUTE` env. Default 15.
 */
const RATE_LIMIT_USER_TURNS_PER_MINUTE =
  Number(process.env.RATE_LIMIT_USER_TURNS_PER_MINUTE) || 15;

/** Has this exact user message been persisted in the dedup window? */
export async function isDuplicateUserMessage(
  channelId: string,
  discordUserId: string,
  content: string
): Promise<boolean> {
  const rows = (await sql`
    SELECT 1
    FROM conversation_messages
    WHERE channel_id = ${channelId}
      AND discord_user_id = ${discordUserId}
      AND role = 'user'
      AND content = ${content}
      AND created_at > now() - make_interval(secs => ${DEDUP_WINDOW_SECONDS})
    LIMIT 1
  `) as Array<unknown>;
  return rows.length > 0;
}

/** Is this user above the per-minute user-turn rate limit? */
export async function isRateLimited(discordUserId: string): Promise<boolean> {
  const rows = (await sql`
    SELECT count(*)::int AS cnt
    FROM conversation_messages
    WHERE discord_user_id = ${discordUserId}
      AND role = 'user'
      AND created_at > now() - interval '1 minute'
  `) as Array<{ cnt: number }>;
  return (rows[0]?.cnt ?? 0) >= RATE_LIMIT_USER_TURNS_PER_MINUTE;
}
