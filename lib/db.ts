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

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Configure it in Vercel project env (or .env.local for local dev)."
  );
}

export const sql = neon(DATABASE_URL);
