"use server";

/**
 * Server actions for the onboarding flow.
 *
 * Onboarding finishes with a "pending profile" — voice profile + raw
 * responses keyed by an opaque session UUID stored in an http-only cookie.
 * The Discord OAuth callback later reads that cookie and promotes the
 * pending row into a real users row keyed by the user's Discord ID.
 *
 * After saving the pending profile, we kick off stylometric feature
 * extraction in the background via `after()`. By the time the user finishes
 * Discord OAuth, the features are usually persisted and copied during
 * promotion. If the OAuth callback wins the race, `getVoiceProfile`'s lazy
 * backfill handles it.
 */

import { cookies } from "next/headers";
import { after } from "next/server";
import { randomUUID } from "node:crypto";

import {
  buildVoiceProfileFromResponses,
  savePendingProfile,
} from "@/lib/voice-profile";
import { extractStyleFeatures } from "@/lib/style-features";
import { extractFewShotPairs } from "@/lib/few-shot-pairs";
import { generateFutureSelfResponse } from "@/lib/future-self";
import { sql } from "@/lib/db";
import type { OnboardingResponses } from "./types";

const PENDING_COOKIE = "ff_pending_session";
const USER_ID_COOKIE = "ff_user_id";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24; // 24h is plenty for "fill out form, hit Discord OAuth, return".

export async function submitOnboardingResponses(
  responses: Partial<OnboardingResponses>
): Promise<{ ok: true } | { ok: false; reason: string }> {
  // Required-field guardrail. The UI already validates, but server actions
  // never trust the client. Sample messages can be empty (we have a
  // fallback) but everything else needs a real string.
  const required: (keyof OnboardingResponses)[] = [
    "phraseOveruse",
    "badNewsSoftening",
    "formerBelief",
    "hillToDieOn",
    "notSoundLike",
    "currentSeason",
  ];
  for (const k of required) {
    const v = responses[k];
    if (typeof v !== "string" || v.trim().length === 0) {
      return { ok: false, reason: `missing field: ${k}` };
    }
  }

  const profile = buildVoiceProfileFromResponses(responses);

  const cookieStore = await cookies();
  let sessionId = cookieStore.get(PENDING_COOKIE)?.value;
  if (!sessionId) {
    sessionId = randomUUID();
    cookieStore.set(PENDING_COOKIE, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
  }

  await savePendingProfile(sessionId, profile, responses);

  // Stylometric extraction + few-shot pair generation run in the
  // background via `after()`. The survey-submit response returns
  // immediately. By the time the user clicks through Discord OAuth, both
  // are usually persisted on `pending_profiles` and get copied during
  // promotion. If OAuth wins the race, the lazy backfills in
  // `getVoiceProfile` handle it.
  //
  // Order: style features FIRST so few-shot generation can read them off
  // the in-memory profile object when building its meta prompt. Each step
  // is wrapped independently so a failure in features doesn't block pairs.
  if (profile.sampleMessages.length > 0) {
    const sessionIdForBackground = sessionId;
    after(async () => {
      try {
        const features = await extractStyleFeatures(profile.sampleMessages);
        if (features) {
          profile.styleFeatures = features;
          const updated = (await sql`
            UPDATE pending_profiles
            SET voice_profile = jsonb_set(
              voice_profile,
              '{styleFeatures}',
              ${JSON.stringify(features)}::jsonb,
              true
            )
            WHERE session_id = ${sessionIdForBackground}
            RETURNING session_id
          `) as Array<{ session_id: string }>;
          if (updated.length === 0) {
            console.log(
              "[Futurefolk] background styleFeatures: pending row already gone, deferring to lazy backfill"
            );
          }
        }
      } catch (err) {
        console.error(
          "[Futurefolk] background styleFeatures extraction failed:",
          err
        );
      }

      try {
        const pairs = await extractFewShotPairs(profile);
        if (pairs && pairs.length > 0) {
          const updated = (await sql`
            UPDATE pending_profiles
            SET voice_profile = jsonb_set(
              voice_profile,
              '{fewShotPairs}',
              ${JSON.stringify(pairs)}::jsonb,
              true
            )
            WHERE session_id = ${sessionIdForBackground}
            RETURNING session_id
          `) as Array<{ session_id: string }>;
          if (updated.length === 0) {
            console.log(
              "[Futurefolk] background fewShotPairs: pending row already gone, deferring to lazy backfill"
            );
          }
        }
      } catch (err) {
        console.error(
          "[Futurefolk] background fewShotPairs extraction failed:",
          err
        );
      }
    });
  }

  return { ok: true };
}

/**
 * Generate a one-off "first-run preview" response for the
 * /onboarding/done page. Reads the Discord user ID from the short-lived
 * `ff_user_id` cookie set by the OAuth callback, looks up the freshly-built
 * voice profile, and asks the model to introduce itself by reflecting on
 * their stated season of life.
 *
 * Cost: one (or two, if the tell-detector regen fires) Sonnet call. May
 * also trigger the lazy stylometric backfill in `getVoiceProfile` if the
 * background extraction from `submitOnboardingResponses` lost the race
 * with OAuth — in that case the first call here pays a one-time
 * ~5-15s extraction cost on top of generation.
 */
export async function generateOnboardingPreview(): Promise<
  { ok: true; reply: string } | { ok: false; reason: string }
> {
  const cookieStore = await cookies();
  const userId = cookieStore.get(USER_ID_COOKIE)?.value;
  if (!userId) {
    return { ok: false, reason: "no-user-cookie" };
  }

  try {
    const reply = await generateFutureSelfResponse({
      discordUserId: userId,
      // 1y feels closer-to-present and more accessible for a first
      // impression than 5y. Both horizons read the same voice profile and
      // structured features; only the overlay differs.
      horizon: "1y",
      // Preview trigger context doesn't reference `prompt` — pass an empty
      // string so the buildMessages helper still puts a (blank) user turn
      // at the end. The system prompt's preview trigger context tells the
      // model to introduce itself by reflecting on the season of life
      // already in the onboarding context.
      prompt: "",
      trigger: "preview",
    });
    return { ok: true, reply };
  } catch (err) {
    console.error("[Futurefolk] preview generation failed:", err);
    return { ok: false, reason: "generation-failed" };
  }
}
