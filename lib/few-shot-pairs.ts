/**
 * Few-shot dialogue pairs for the future-self prompt.
 *
 * One-time LLM call per user that produces 3 example user→assistant
 * exchanges in their voice. The pairs get prepended to the messages array
 * at runtime as concrete demonstrations of the target voice register —
 * dramatically more reliable than asking the model to follow abstract
 * voice rules.
 *
 * Pairing this with `lib/style-features.ts`: stylometric features give the
 * model concrete numbers/patterns to match; few-shot pairs show it what
 * those features look like in actual exchanges. Both feed the runtime
 * prompt; both are extracted once per user, persisted on the voice
 * profile, and reused on every generation.
 */

import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

import { MODEL_NAME } from "./future-self";
import { buildSystemPrompt, buildTriggerContext } from "./voice";
import type { VoiceProfile } from "./voice-profile";

const FewShotPairSchema = z.object({
  userPrompt: z
    .string()
    .min(10)
    .max(300)
    .describe(
      "A brief thing present-them might say to their future self. 1-3 short sentences. In their idiom — match their lowercase ratio, their hedge frequency, their punctuation. Each of the 3 pairs should have a different topic shape (e.g. one about a decision they keep avoiding; one about a feeling about themselves; one about a worry about something months out). Don't make up specific personal facts beyond what's in the voice profile.",
    ),
  assistantReply: z
    .string()
    .min(20)
    .max(500)
    .describe(
      "How their 1-year-future-self would respond. 2-5 sentences. Friend register, not coach. NO em dashes. NO verdict opener like 'X is worth doing' or 'X is a real concern'. NO third-person restatement of the topic. NO 'genuinely/actually/really' as intensifiers. Use their hedge vocabulary, common openers, and signature phrases naturally where they fit. Should read like overhearing the user texting themselves.",
    ),
});

const FewShotPairsSchema = z.object({
  pairs: z
    .array(FewShotPairSchema)
    .length(3)
    .describe(
      "Exactly 3 demonstration exchanges. Each pair should have a distinct topic shape from the other two — diverse, not redundant.",
    ),
});

export type FewShotPair = z.infer<typeof FewShotPairSchema>;

const META_PROMPT_PREAMBLE = `You are generating few-shot examples that will be injected into the runtime prompt of a future-self bot at execution time. The model imitating these examples is dramatically more reliable than the model following abstract voice rules — which is what makes this generation step worth doing carefully.

Below is the EXACT runtime system prompt the bot will see at execution time. Read it carefully. Then produce 3 user→assistant exchanges that perfectly embody the voice it describes:

- Match the voice register precisely. Friend, not coach.
- Match the user's idiom from the voice profile and style features. Lowercase ratio, common openers, hedge vocabulary, signature phrases.
- NO em dashes. NO verdict openers. NO third-person restatement. NO 'genuinely/actually/really' as intensifiers.
- Each pair should have a distinct topic shape — diverse, not three variations of the same thing.
- Don't invent personal facts beyond what's in the profile. Keep topics generic enough to not contradict who this user actually is.
- Keep replies tight. Length should match the user's average message length from the style features.

Do not mention that you are generating examples. Do not break character. The output schema is structured JSON.

THE RUNTIME SYSTEM PROMPT IS:

`;

/**
 * Generate 3 demonstration user→assistant pairs in the user's voice.
 * Returns null if there are no sample messages to anchor the voice on.
 *
 * Uses the runtime system prompt (built from the voice profile + a
 * placeholder trigger context) so the generator sees exactly what the
 * runtime model will see, minus the per-turn trigger context. This
 * keeps the demonstrations aligned with the runtime register rather
 * than producing a parallel "what we think your voice is" sample.
 */
export async function extractFewShotPairs(
  profile: VoiceProfile,
): Promise<FewShotPair[] | null> {
  if (profile.sampleMessages.length === 0) return null;

  // Use the preview trigger context as a neutral placeholder. The trigger
  // context shapes the per-turn opening; for the meta prompt we just need
  // the model to see the full voice profile + style features + horizon
  // overlay + hard rules.
  const placeholderTrigger = buildTriggerContext({ trigger: "preview" });
  const runtimeSystemPrompt = buildSystemPrompt(
    profile,
    "1y",
    placeholderTrigger,
  );

  const result = await generateObject({
    model: anthropic(MODEL_NAME),
    schema: FewShotPairsSchema,
    system: META_PROMPT_PREAMBLE + runtimeSystemPrompt,
    prompt:
      "Produce 3 demonstration exchanges per the schema. Each pair must have a distinct topic shape. Tight, on-register replies.",
    abortSignal: AbortSignal.timeout(45_000),
  });

  return result.object.pairs;
}
