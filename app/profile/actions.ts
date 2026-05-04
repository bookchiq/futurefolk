"use server";

/**
 * Server actions for the /profile editor.
 *
 * Auth: reads the `ff_user_id` cookie set by the OAuth callback. Lightweight
 * pseudo-session — the cookie is just a Discord ID. If absent or stale, the
 * action returns `{ ok: false, reason: "unauthorized" }` and the page
 * prompts the user to re-authenticate via Discord OAuth.
 */

import { cookies } from "next/headers";

import {
  buildVoiceProfileFromResponses,
  clearDerivedVoiceFields,
  getUser,
  saveUserProfile,
} from "@/lib/voice-profile";
import type { OnboardingResponses } from "@/app/onboarding/types";

const USER_ID_COOKIE = "ff_user_id";

export async function saveProfileEdit(
  responses: Partial<OnboardingResponses>
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const cookieStore = await cookies();
  const userId = cookieStore.get(USER_ID_COOKIE)?.value;
  if (!userId) {
    return { ok: false, reason: "unauthorized" };
  }

  // Required-field guardrail. Same shape as the onboarding survey's server
  // action — we never trust the client. Sample messages can be empty (we
  // have a fallback) but everything else needs a real string.
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

  // Pull the current row to compare sample messages — if they changed, the
  // derived fields (styleFeatures, fewShotPairs) are stale and need to be
  // rebuilt. Lazy backfill in `getVoiceProfile` handles the rebuild on next
  // read.
  const currentUser = await getUser(userId);
  if (!currentUser) {
    return { ok: false, reason: "user-not-found" };
  }

  const newProfile = buildVoiceProfileFromResponses(responses);
  const oldRaw = currentUser.rawResponses.sampleMessages ?? "";
  const newRaw = responses.sampleMessages ?? "";
  const sampleMessagesChanged = oldRaw !== newRaw;

  await saveUserProfile(
    userId,
    currentUser.displayName,
    newProfile,
    responses
  );

  if (sampleMessagesChanged) {
    try {
      await clearDerivedVoiceFields(userId);
      console.log(
        "[Futurefolk] /profile save: sample messages changed, derived fields cleared for",
        userId
      );
    } catch (err) {
      console.error(
        "[Futurefolk] /profile save: clearDerivedVoiceFields failed:",
        err
      );
      // Non-fatal — the save itself succeeded. Worst case, the user keeps
      // the stale style features / few-shot pairs until next manual edit
      // or until they're rebuilt some other way.
    }
  }

  return { ok: true };
}
