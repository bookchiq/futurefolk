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
import { sql } from "@/lib/db";
import type { OnboardingResponses } from "./types";

const PENDING_COOKIE = "ff_pending_session";
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

  // Style-feature extraction runs in the background. The survey-submit
  // response returns immediately. By the time the user clicks through
  // Discord OAuth, the features are usually persisted on `pending_profiles`
  // and get copied during promotion. If OAuth wins the race, the lazy
  // backfill in `getVoiceProfile` handles it.
  if (profile.sampleMessages.length > 0) {
    const sessionIdForBackground = sessionId;
    after(async () => {
      try {
        const features = await extractStyleFeatures(profile.sampleMessages);
        if (!features) return;
        // Update the pending row if it still exists. If promotion already
        // happened (sessionId no longer in pending_profiles), update the
        // promoted users row instead. Try-pending-first then users-fallback
        // means we don't need a lookup before the update.
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
          // Pending row already promoted/deleted. Lazy backfill on first
          // /futureself will catch this case.
          console.log(
            "[Futurefolk] background styleFeatures: pending row already gone, deferring to lazy backfill"
          );
        }
      } catch (err) {
        console.error(
          "[Futurefolk] background styleFeatures extraction failed:",
          err
        );
      }
    });
  }

  return { ok: true };
}
