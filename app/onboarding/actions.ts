"use server";

/**
 * Server actions for the onboarding flow.
 *
 * Onboarding finishes with a "pending profile" — voice profile + raw
 * responses keyed by an opaque session UUID stored in an http-only cookie.
 * The Discord OAuth callback later reads that cookie and promotes the
 * pending row into a real users row keyed by the user's Discord ID.
 */

import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";

import {
  buildVoiceProfileFromResponses,
  savePendingProfile,
} from "@/lib/voice-profile";
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
  return { ok: true };
}
