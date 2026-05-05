"use server";

/**
 * Server actions for the /profile editor.
 *
 * Auth: reads the session cookie via `getSessionUserId` (lib/session). The
 * cookie value is currently the user's Discord ID; issue #038 is the
 * planned migration to HMAC-signed values. If absent or stale, this
 * returns `{ ok: false, reason: "unauthorized" }` and the page prompts
 * the user to re-authenticate via Discord OAuth.
 */

import {
  buildVoiceProfileFromResponses,
  clearDerivedVoiceFields,
  getUser,
  saveUserProfile,
} from "@/lib/voice-profile";
import { getSessionUserId } from "@/lib/session";
import {
  validateOnboardingResponses,
  type OnboardingResponses,
} from "@/app/onboarding/types";

export async function saveProfileEdit(
  responses: Partial<OnboardingResponses>
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const userId = await getSessionUserId();
  if (!userId) {
    return { ok: false, reason: "unauthorized" };
  }

  // Required-field + length-cap guardrail. Shared with onboarding submit
  // — server actions never trust the client.
  const validation = validateOnboardingResponses(responses);
  if (!validation.ok) return validation;

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
