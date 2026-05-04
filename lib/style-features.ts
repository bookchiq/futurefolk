/**
 * Stylometric feature extraction.
 *
 * One-time LLM call at onboarding (or lazy-backfill for existing profiles)
 * that distills concrete stylistic features from the user's sample messages.
 * The result is stored on the voice profile and cited as numbers/patterns in
 * the system prompt, instead of asking the model to absorb the corpus on
 * every call.
 *
 * Why structured output: vague qualitative descriptors (e.g. "casual") give
 * Claude one more thing to default-back-to. Concrete numbers and lists give
 * it anchors it can match against on each generation.
 */

import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const StyleFeaturesSchema = z.object({
  averageSentenceLength: z
    .number()
    .min(1)
    .max(40)
    .describe(
      "Average words per sentence in the user's messages. A typical casual texter is 6-12; long-form writers run 15-25.",
    ),
  averageMessageLength: z
    .number()
    .min(1)
    .max(500)
    .describe("Average total words per individual message."),
  lowercaseRatio: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "Fraction of sentences that begin with a lowercase letter (i.e. the user does not capitalize after periods or at the start of messages). 0 = always capitalizes; 1 = always lowercase.",
    ),
  capitalizesProperNouns: z
    .boolean()
    .describe(
      "Whether the user reliably capitalizes proper nouns (names, places, brands) even if their messages are otherwise lowercase. True = yes; False = lowercases everything.",
    ),
  commonOpeners: z
    .array(z.string())
    .max(5)
    .describe(
      "Up to 5 short phrases the user begins messages with (e.g. 'yeah', 'honestly', 'ok so', 'lmao', 'wait'). Pull only ones that recur. Empty if no opener pattern stands out.",
    ),
  hedgeWords: z
    .array(z.string())
    .max(5)
    .describe(
      "Up to 5 hedge words or phrases the user uses to soften or qualify (e.g. 'maybe', 'i think', 'kind of', 'i guess', 'sort of'). Empty if they don't hedge much.",
    ),
  signaturePhrases: z
    .array(z.string())
    .max(5)
    .describe(
      "Up to 5 phrases that recur and feel signature to this user's voice. Skip generic openers (already in commonOpeners). Look for things like specific idioms, in-jokes, recurring metaphors, distinctive insults, characteristic transitions.",
    ),
  punctuationStyle: z
    .enum(["formal", "casual", "minimal"])
    .describe(
      "formal: full sentences, periods, commas in the right places. casual: run-on sentences, missing commas, frequent ellipses. minimal: very few periods, sentences run into each other, comma chains.",
    ),
  emojiFrequency: z
    .enum(["never", "rare", "sometimes", "often"])
    .describe(
      "How often the user uses emoji. never = 0 in the sample. rare = 1 or 2. sometimes = several but not most messages. often = most messages have at least one.",
    ),
  styleNotes: z
    .string()
    .max(300)
    .describe(
      "Free-form notes on stylistic quirks not captured by the fields above. Concrete specifics — e.g. 'uses 'rn' instead of 'right now'', 'rarely uses question marks even on questions', 'starts most stories with 'so basically''. Max 300 chars; can be empty if nothing noteworthy.",
    ),
});

export type StyleFeatures = z.infer<typeof StyleFeaturesSchema>;

const SYSTEM_PROMPT = `You are a stylometric analyzer. Given sample messages from one person, you extract concrete, specific stylistic features that another model could use to imitate their voice convincingly.

Be precise and specific. Vague output is useless. If something doesn't apply (e.g. no emojis in the sample, no clear opener pattern), return an empty array or "never" — do not invent features that aren't supported by the corpus.

Do not summarize the user's personality, beliefs, or content. Only describe HOW they write, not WHAT they write about.`;

/**
 * Extract structured stylistic features from a user's sample messages.
 * Returns null if there are no messages to analyze.
 *
 * Cost: one Sonnet call, ~$0.003 per extraction. Bounded by a 30s timeout
 * so a stalled Anthropic stream can't block the calling path indefinitely.
 */
export async function extractStyleFeatures(
  sampleMessages: string[],
): Promise<StyleFeatures | null> {
  if (sampleMessages.length === 0) return null;

  const corpus = sampleMessages
    .map((m, i) => `${i + 1}. ${m.replace(/\n+/g, " ")}`)
    .join("\n");

  const result = await generateObject({
    model: anthropic("claude-sonnet-4-6"),
    schema: StyleFeaturesSchema,
    system: SYSTEM_PROMPT,
    prompt: `Analyze the stylistic features of this person's recent messages. Return concrete numbers and short specific lists per the schema.\n\n${corpus}`,
    abortSignal: AbortSignal.timeout(30_000),
  });

  return result.object;
}
