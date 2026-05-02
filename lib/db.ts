/**
 * Neon SQL client.
 *
 * Single shared instance. Tables are created out-of-band via the Neon MCP;
 * this module just connects and queries.
 *
 * Schema:
 *   users(discord_user_id PK, display_name, voice_profile JSONB,
 *         onboarding_responses JSONB, created_at, updated_at)
 *   pending_profiles(session_id PK, voice_profile JSONB,
 *                    onboarding_responses JSONB, created_at)
 *   conversation_messages(id, channel_id, discord_user_id, horizon,
 *                         role, content, created_at)
 */

import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  // Don't crash at import time on the client / during build — only when used.
  // Throwing here in dev would break unrelated routes.
  console.warn(
    "[Futurefolk] DATABASE_URL is not set. Voice profile + conversation memory will fail at runtime."
  );
}

export const sql = neon(process.env.DATABASE_URL ?? "");
