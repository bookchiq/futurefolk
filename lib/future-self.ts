/**
 * Future-self response generator — STUB.
 *
 * Returns hardcoded placeholder text. The real implementation will use the
 * AI SDK with a system prompt constructed from the user's voice profile.
 * See `.v0/instructions.md` → "Voice direction" before fleshing this out.
 *
 * The character (1y vs 5y future-self) and the conversation history must
 * be carried through here — that's why the signatures already accept them.
 */

import type { Horizon, VoiceProfile } from "./voice-profile";

export interface FutureSelfTurn {
  role: "user" | "assistant";
  text: string;
}

interface GenerateOpts {
  profile: VoiceProfile;
  horizon: Horizon;
  /** What present-self wanted to talk about (slash command `about`, reaction message text, or follow-up message) */
  prompt: string;
  /** Prior turns in this DM thread (oldest → newest), excluding the current `prompt` */
  history?: FutureSelfTurn[];
  /** How this conversation got started — affects framing of the opening line */
  trigger: "slash" | "reaction" | "continuation";
}

export async function generateFutureSelfResponse(
  opts: GenerateOpts,
): Promise<string> {
  console.log("[Futurefolk] future-self response (stub):", {
    horizon: opts.horizon,
    trigger: opts.trigger,
    historyTurns: opts.history?.length ?? 0,
    promptPreview: opts.prompt.slice(0, 80),
  });

  // STUB. The real version is wired in chat 3 (AI integration).
  // Voice direction lives in .v0/instructions.md and .v0/prompts.md — read both
  // before replacing this. Do NOT default to "encouraging coach" voice.
  const horizonLabel = opts.horizon === "1y" ? "a year" : "five years";

  if (opts.trigger === "continuation") {
    return `[placeholder, ${horizonLabel} on] still here. you said: "${truncate(opts.prompt, 120)}". the real reply gets wired up in chat 3.`;
  }

  if (opts.trigger === "reaction") {
    return `[placeholder, ${horizonLabel} on] saw the ⏳. context was: "${truncate(opts.prompt, 120)}". this is where future-you actually says something — wired up in chat 3.`;
  }

  return `[placeholder, ${horizonLabel} on] you wanted to talk about: "${truncate(opts.prompt, 120)}". real reply lives in chat 3.`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
