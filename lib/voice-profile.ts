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
import { extractStyleFeatures, type StyleFeatures } from "./style-features";
import { extractFewShotPairs, type FewShotPair } from "./few-shot-pairs";
import { splitSampleMessages } from "./parse-sample-messages";

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
  /**
   * Concrete stylistic features extracted from `sampleMessages` via one-shot
   * LLM analysis. Optional for backward compatibility — pre-extraction
   * profiles get filled in lazily by `getVoiceProfile` on first read.
   */
  styleFeatures?: StyleFeatures;
  /**
   * Few-shot demonstration pairs in the user's voice. Generated once at
   * onboarding (or lazy-backfilled on first read) and prepended to the
   * messages array at runtime in `lib/future-self.ts::buildMessages`.
   * Optional for backward compatibility.
   */
  fewShotPairs?: FewShotPair[];
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

// `splitSampleMessages` extracted to `./parse-sample-messages` so the
// onboarding survey page can call it client-side for live preview without
// importing this server-only module (which depends on `sql` from `./db`).

/**
 * Look up the saved voice profile for a Discord user. Returns null if not
 * onboarded.
 *
 * Lazy backfill: if the stored profile pre-dates stylometric extraction or
 * few-shot pair generation, run the missing extractors once and persist
 * the result. The first call per user that triggers backfill pays a
 * one-time ~5-30s LLM cost; subsequent reads are back to a single SELECT.
 *
 * Order matters: stylometric features feed into the few-shot generator
 * (it builds the runtime system prompt, which includes the features).
 * Run features first so few-shot has them.
 */
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
  const profile = rows[0].voice_profile;

  if (!profile.styleFeatures && profile.sampleMessages.length > 0) {
    try {
      const features = await extractStyleFeatures(profile.sampleMessages);
      if (features) {
        profile.styleFeatures = features;
        await sql`
          UPDATE users
          SET voice_profile = jsonb_set(
            voice_profile,
            '{styleFeatures}',
            ${JSON.stringify(features)}::jsonb,
            true
          )
          WHERE discord_user_id = ${discordUserId}
        `;
        console.log(
          "[Futurefolk] backfilled styleFeatures for",
          discordUserId
        );
      }
    } catch (err) {
      console.error(
        "[Futurefolk] lazy styleFeatures extract/persist failed:",
        err
      );
      // Fall through — few-shot can still attempt without features.
    }
  }

  if (!profile.fewShotPairs && profile.sampleMessages.length > 0) {
    try {
      const pairs = await extractFewShotPairs(profile);
      if (pairs && pairs.length > 0) {
        profile.fewShotPairs = pairs;
        await sql`
          UPDATE users
          SET voice_profile = jsonb_set(
            voice_profile,
            '{fewShotPairs}',
            ${JSON.stringify(pairs)}::jsonb,
            true
          )
          WHERE discord_user_id = ${discordUserId}
        `;
        console.log(
          "[Futurefolk] backfilled fewShotPairs for",
          discordUserId
        );
      }
    } catch (err) {
      console.error(
        "[Futurefolk] lazy fewShotPairs extract/persist failed:",
        err
      );
      // Fall through with profile sans pairs — generation still works,
      // just without the demonstration examples.
    }
  }

  return profile;
}

/**
 * Combined user record — voice profile + raw survey responses + display
 * name. Used by `/profile` to render the editor with the user's original
 * onboarding answers (the rendered profile alone is missing the source
 * fields the form needs to repopulate).
 */
export interface UserRecord {
  discordUserId: string;
  displayName: string | null;
  profile: VoiceProfile;
  rawResponses: Partial<OnboardingResponses>;
}

/** Look up the full user record. Returns null if not onboarded. */
export async function getUser(
  discordUserId: string
): Promise<UserRecord | null> {
  const rows = (await sql`
    SELECT discord_user_id, display_name, voice_profile, onboarding_responses
    FROM users
    WHERE discord_user_id = ${discordUserId}
    LIMIT 1
  `) as Array<{
    discord_user_id: string;
    display_name: string | null;
    voice_profile: VoiceProfile;
    onboarding_responses: Partial<OnboardingResponses>;
  }>;

  if (rows.length === 0) return null;
  return {
    discordUserId: rows[0].discord_user_id,
    displayName: rows[0].display_name,
    profile: rows[0].voice_profile,
    rawResponses: rows[0].onboarding_responses,
  };
}

/**
 * Strip the derived voice-profile fields (`styleFeatures`,
 * `fewShotPairs`) so that the next `getVoiceProfile` call lazy-rebuilds
 * them from the (just-edited) sample messages. Called by the
 * /profile editor's save action when the user changes their
 * sampleMessages — the existing derived data was extracted from the OLD
 * messages and is now stale.
 *
 * Lazy is the simplest invariant: the worst case is one slow
 * /futureself per user post-edit. Eager re-extraction in a background
 * `after()` would be faster but adds complexity (and the lazy path
 * already exists for backfill).
 */
export async function clearDerivedVoiceFields(
  discordUserId: string
): Promise<void> {
  await sql`
    UPDATE users
    SET voice_profile = (voice_profile - 'styleFeatures' - 'fewShotPairs')
    WHERE discord_user_id = ${discordUserId}
  `;
}

/** Upsert a user's voice profile keyed by Discord user ID. */
export async function saveUserProfile(
  discordUserId: string,
  displayName: string | null,
  profile: VoiceProfile,
  rawResponses: Partial<OnboardingResponses>
): Promise<void> {
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
