/**
 * Voice profile lookup — STUB.
 *
 * Returns a hardcoded test profile for now. The real implementation will
 * pull the user's onboarding responses (sample messages, idiom, hill-to-die-on,
 * etc.) from the database, keyed by Discord user ID.
 *
 * See `.v0/instructions.md` → "Voice profile construction" for what the real
 * profile should contain. Do not flesh this out here — it's wired in a later
 * chat alongside the AI integration.
 */

export type Horizon = "1y" | "5y";

export interface VoiceProfile {
  /** Discord user ID this profile belongs to */
  discordUserId: string;
  /** Display name to use in conversations (the user's name, not "Futurefolk") */
  displayName: string;
  /** Sample messages for cadence reference */
  sampleMessages: string[];
  /** Onboarding answers, keyed by question id */
  answers: Record<string, string>;
}

export async function getVoiceProfile(
  discordUserId: string,
): Promise<VoiceProfile> {
  console.log("[Futurefolk] voice profile lookup (stub):", discordUserId);

  // STUB. Replace with DB lookup in a later chat.
  return {
    discordUserId,
    displayName: "you",
    sampleMessages: [
      "honestly i don't know, i'm just kind of sitting with it",
      "yeah that tracks. i'll get back to you tonight maybe",
      "ok this is the third time this has happened so. fine.",
    ],
    answers: {
      phraseOveruse: "honestly",
      currentSeason: "a transitional one — figuring out what's next",
    },
  };
}
