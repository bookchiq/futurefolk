/**
 * Voice profile — schema, builder, and DB access.
 *
 * The VoiceProfile is a structured object derived from the user's onboarding
 * responses. It is what gets injected into the system prompt at every AI call.
 *
 * Lookups are keyed by Discord user ID. Onboarding writes a "pending" profile
 * keyed by an opaque session UUID (cookie); the Discord OAuth callback
 * promotes that pending row to the users table once we know the actual
 * Discord user ID.
 */

import { sql } from "./db";
import type { OnboardingResponses } from "@/app/onboarding/types";

export type Horizon = "1y" | "5y";

export interface VoiceProfile {
  overusedPhrase: string;
  badNewsExample: string;
  changedBelief: string;
  hillIdDieOn: string;
  notSoundingLike: string;
  sampleMessages: string[];
  seasonOfLife: string;
  /** Optional deeper questions the user filled in (id → answer) */
  optional: Record<string, string>;
}

// Required keys mapped from OnboardingResponses to VoiceProfile fields. Kept
// in one place so the survey schema and the prompt schema stay aligned.
const OPTIONAL_KEYS = [
  "avoidingThinking",
  "decisionSittingWith",
  "wishMoreTime",
  "tellingTooLong",
  "noLongerAfraid",
  "oneShift",
  "wishAsked",
  "accurateCriticism",
] as const;

/**
 * Build a VoiceProfile from raw onboarding survey responses.
 *
 * The sample messages field is one big text blob in the survey (the user
 * pastes a chunk of recent messages). We split it into discrete messages by:
 *   1) blank-line separators if present (preferred — handles multi-line msgs)
 *   2) newlines otherwise
 * Empty entries are dropped, leading/trailing whitespace trimmed.
 */
export function buildVoiceProfileFromResponses(
  responses: Partial<OnboardingResponses>
): VoiceProfile {
  const optional: Record<string, string> = {};
  for (const key of OPTIONAL_KEYS) {
    const v = responses[key];
    if (typeof v === "string" && v.trim().length > 0) {
      optional[key] = v.trim();
    }
  }

  return {
    overusedPhrase: (responses.phraseOveruse ?? "").trim(),
    badNewsExample: (responses.badNewsSoftening ?? "").trim(),
    changedBelief: (responses.formerBelief ?? "").trim(),
    hillIdDieOn: (responses.hillToDieOn ?? "").trim(),
    notSoundingLike: (responses.notSoundLike ?? "").trim(),
    sampleMessages: splitSampleMessages(responses.sampleMessages ?? ""),
    seasonOfLife: (responses.currentSeason ?? "").trim(),
    optional,
  };
}

function splitSampleMessages(blob: string): string[] {
  const trimmed = blob.trim();
  if (!trimmed) return [];

  // Prefer blank-line separators when the user used them.
  const byBlankLine = trimmed
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (byBlankLine.length > 1) return byBlankLine;

  // Fall back to one-message-per-line.
  const byLine = trimmed
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (byLine.length > 0) return byLine;

  return [trimmed];
}

/** Look up the saved voice profile for a Discord user. Returns null if not onboarded. */
export async function getVoiceProfile(
  discordUserId: string
): Promise<VoiceProfile | null> {
  const rows = (await sql`
    SELECT voice_profile
    FROM users
    WHERE discord_user_id = ${discordUserId}
    LIMIT 1
  `) as Array<{ voice_profile: VoiceProfile }>;

  if (rows.length === 0) return null;
  return rows[0].voice_profile;
}

/** Upsert a user's voice profile keyed by Discord user ID. */
export async function saveUserProfile(
  discordUserId: string,
  displayName: string | null,
  profile: VoiceProfile,
  rawResponses: Partial<OnboardingResponses>
): Promise<void> {
  // Light-touch overwrite detection: peek at the existing row before the
  // upsert. If a non-null voice_profile is already there, we're about to
  // replace it — log a warning so re-onboarding leaves an audit trail until
  // the /profile page (P6) lets us surface a UI confirmation.
  const existing = (await sql`
    SELECT voice_profile
    FROM users
    WHERE discord_user_id = ${discordUserId}
    LIMIT 1
  `) as Array<{ voice_profile: VoiceProfile | null }>;

  if (existing.length > 0 && existing[0].voice_profile !== null) {
    console.warn(
      "[Futurefolk] saveUserProfile: replacing existing voice profile for Discord user",
      discordUserId
    );
  }

  await sql`
    INSERT INTO users (
      discord_user_id, display_name, voice_profile, onboarding_responses, updated_at
    )
    VALUES (
      ${discordUserId},
      ${displayName},
      ${JSON.stringify(profile)}::jsonb,
      ${JSON.stringify(rawResponses)}::jsonb,
      now()
    )
    ON CONFLICT (discord_user_id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      voice_profile = EXCLUDED.voice_profile,
      onboarding_responses = EXCLUDED.onboarding_responses,
      updated_at = now()
  `;
}

/** Save a pending profile keyed by session UUID, before the user has linked Discord. */
export async function savePendingProfile(
  sessionId: string,
  profile: VoiceProfile,
  rawResponses: Partial<OnboardingResponses>
): Promise<void> {
  await sql`
    INSERT INTO pending_profiles (session_id, voice_profile, onboarding_responses)
    VALUES (
      ${sessionId},
      ${JSON.stringify(profile)}::jsonb,
      ${JSON.stringify(rawResponses)}::jsonb
    )
    ON CONFLICT (session_id) DO UPDATE SET
      voice_profile = EXCLUDED.voice_profile,
      onboarding_responses = EXCLUDED.onboarding_responses
  `;
}

/**
 * Promote a pending profile (keyed by session UUID) to a real user record
 * (keyed by Discord user ID) once we know the user's Discord identity.
 *
 * Returns true if a pending profile existed and was promoted.
 */
export async function promotePendingToUser(
  sessionId: string,
  discordUserId: string,
  displayName: string | null
): Promise<boolean> {
  const rows = (await sql`
    SELECT voice_profile, onboarding_responses
    FROM pending_profiles
    WHERE session_id = ${sessionId}
    LIMIT 1
  `) as Array<{
    voice_profile: VoiceProfile;
    onboarding_responses: Partial<OnboardingResponses>;
  }>;

  if (rows.length === 0) return false;

  const { voice_profile, onboarding_responses } = rows[0];
  await saveUserProfile(
    discordUserId,
    displayName,
    voice_profile,
    onboarding_responses
  );
  await sql`DELETE FROM pending_profiles WHERE session_id = ${sessionId}`;
  return true;
}
