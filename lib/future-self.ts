/**
 * Future-self response generator.
 *
 * Pulls the user's voice profile, builds the system prompt, and asks the
 * model for a response. The system prompt is the load-bearing part — it's
 * built verbatim from the templates in `.v0/prompts.md`.
 *
 * Flow:
 *   1. Look up VoiceProfile by Discord user ID. If missing, return a brief
 *      "haven't onboarded yet" message and stop.
 *   2. Build system prompt: shared base + horizon overlay + voice + onboarding
 *      context + trigger context.
 *   3. Call generateText with claude-sonnet-4.6 (zero-config in AI Gateway).
 *   4. Run the result through a tell-detector. If it trips, regenerate ONCE
 *      with an explicit "you wrote one of those tells, try again" instruction.
 *      If it still trips, log a warning and ship it anyway — never loop.
 *   5. Return the final string. The caller posts it to Discord.
 *
 * Why generateText and not streamText: ChatSDK can stream into Discord, but
 * the tell-detector is a runtime safety net — we need the full text before
 * deciding whether to regenerate. Sonnet at moderate length is fast enough
 * that the tradeoff is fine.
 */

import { generateText, type ModelMessage, type SystemModelMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

import {
  buildSystemPrompt,
  buildTriggerContext,
} from "./voice";
import {
  getVoiceProfile,
  type Horizon,
  type VoiceProfile,
} from "./voice-profile";
import type { ConversationTurn } from "./conversation";

// Calls Anthropic directly via ANTHROPIC_API_KEY rather than routing through
// Vercel AI Gateway, which requires a credit card on file.
const MODEL = anthropic("claude-sonnet-4-6");
// Hard ceiling so the model can't write essays even if the prompt fails.
// Match-length-of-user is enforced in the system prompt.
const MAX_OUTPUT_TOKENS = 600;

interface GenerateOpts {
  /** Discord user ID — used to load voice profile from DB */
  discordUserId: string;
  horizon: Horizon;
  /**
   * What present-self said. For slash/reaction triggers, this is the topic
   * or reacted-message text. For continuation, this is their latest DM.
   */
  prompt: string;
  /** Prior turns in this DM thread (oldest → newest), excluding `prompt`. */
  history?: ConversationTurn[];
  /** How this conversation got started — affects opening line framing. */
  trigger: "slash" | "reaction" | "continuation" | "preview" | "scheduled";
}

export async function generateFutureSelfResponse(
  opts: GenerateOpts
): Promise<string> {
  const profile = await getVoiceProfile(opts.discordUserId);

  if (!profile) {
    // Soft-fail: user invoked the bot but never onboarded. Return a brief
    // message in a plain voice. Don't pretend to be future-self.
    return "we haven't actually built your voice profile yet. open the futurefolk site and finish onboarding first — then come back and ping me.";
  }

  const triggerContext = buildTriggerContext({
    trigger: opts.trigger,
    topic:
      opts.trigger === "slash" || opts.trigger === "scheduled"
        ? opts.prompt
        : undefined,
    reactedMessage: opts.trigger === "reaction" ? opts.prompt : undefined,
    // "preview" and "continuation" don't take a topic/reacted-message —
    // the trigger context for those references onboarding context /
    // message history directly.
  });

  const systemPrompt = buildSystemPrompt(
    profile,
    opts.horizon,
    triggerContext
  );

  const messages = buildMessages(opts, profile.fewShotPairs);

  // Mark the system prompt as an ephemeral cache breakpoint so Anthropic caches
  // the ~1500-token static prefix; reused across the regen path and any DM
  // follow-up within the 5-min TTL at ~10% of normal input cost.
  const systemMessage: SystemModelMessage = {
    role: "system",
    content: systemPrompt,
    providerOptions: {
      anthropic: { cacheControl: { type: "ephemeral" } },
    },
  };

  const first = await generateText({
    model: MODEL,
    system: systemMessage,
    messages,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    // Bound the call so a stalled Anthropic stream can't hang the worker
    // indefinitely (which would also block SIGTERM clean shutdown).
    abortSignal: AbortSignal.timeout(60_000),
  });

  const firstTrip = detectTells(first.text);
  if (!firstTrip) {
    return cleanup(first.text);
  }

  console.warn(
    "[Futurefolk] tell detected on first generation, regenerating:",
    firstTrip
  );

  // Regenerate with an explicit corrective nudge in the messages array. We
  // do not modify the system prompt — that's the canonical voice direction.
  // Reuses the same cached system message so the retry hits the cache.
  const retry = await generateText({
    model: MODEL,
    system: systemMessage,
    messages: [
      ...messages,
      {
        role: "assistant",
        content: first.text,
      },
      {
        role: "user",
        content: `(meta — this is the system, not them.) Your previous response contained: ${firstTrip}. That's exactly the kind of AI tell the system prompt forbids. Rewrite the response in their voice, without that pattern, without explanation, without apology. Just the rewritten reply.`,
      },
    ],
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    // Tighter timeout on the retry — the regen path is intended to be a
    // quick correction, not another full generation budget.
    abortSignal: AbortSignal.timeout(45_000),
  });

  const retryTrip = detectTells(retry.text);
  if (retryTrip) {
    // Don't loop. Ship the retry — it's at least one degree better — and log.
    console.warn(
      "[Futurefolk] tell still present after one regeneration; shipping anyway:",
      retryTrip
    );
  }

  return cleanup(retry.text);
}

// ---------------------------------------------------------------------------
// Message construction
// ---------------------------------------------------------------------------

function buildMessages(
  opts: GenerateOpts,
  fewShotPairs?: Array<{ userPrompt: string; assistantReply: string }>
): ModelMessage[] {
  const out: ModelMessage[] = [];

  // Prepend few-shot demonstration pairs (if available) at the very start
  // of the messages array. The system prompt has a sibling block letting
  // the model know these are demonstrations, not actual past conversation.
  // Demonstrated voice patterns are dramatically more reliable than
  // described ones, especially for register and idiom.
  if (fewShotPairs && fewShotPairs.length > 0) {
    for (const pair of fewShotPairs) {
      out.push({ role: "user", content: pair.userPrompt });
      out.push({ role: "assistant", content: pair.assistantReply });
    }
  }

  for (const turn of opts.history ?? []) {
    out.push({ role: turn.role, content: turn.content });
  }

  // The current incoming user prompt becomes the final user message. For
  // slash/reaction triggers there's no history, so this is a clean start.
  // For continuation, history already contains prior assistant + user turns.
  out.push({ role: "user", content: opts.prompt });

  return out;
}

// ---------------------------------------------------------------------------
// Tell detector
// ---------------------------------------------------------------------------

interface TellDescription {
  pattern: RegExp;
  label: string;
}

const INTENSIFIER_RE = /\b(genuinely|truly|actually|really)\b/gi;

const SUBSTRING_TELLS: TellDescription[] = [
  {
    pattern: /\bgreat question\b/i,
    label: '"great question"',
  },
  {
    pattern: /\bhappy to help\b/i,
    label: '"happy to help"',
  },
  {
    pattern: /\bhere's the thing[:\u2014]/i,
    label: '"here\'s the thing:"',
  },
  {
    pattern: /\bas an ai\b/i,
    label: '"as an AI"',
  },
  {
    pattern: /\bI'?m an? (ai|language model|large language model)\b/i,
    label: 'self-identifying as an AI ("I\'m an AI/language model")',
  },
  {
    pattern: /\bI cannot (and will not )?(provide|engage|comply)\b/i,
    label: 'AI-refusal boilerplate ("I cannot provide…")',
  },
  {
    pattern: /^(the |that |your |it'?s )[^.!?\n]{0,80}?\bis (genuinely|actually|really|worth|a real|the right)\b/i,
    label: "verdict opener (e.g. 'The X is genuinely worth doing')",
  },
  {
    pattern: /^(that |that'?s )(a |the )(real|right|tough|interesting|important|hard|big) /i,
    label: "verdict opener (e.g. 'That's a real concern', 'That's the right call')",
  },
];

/** Returns a human-readable label of the first tell hit, or null if none. */
export function detectTells(text: string): string | null {
  for (const t of SUBSTRING_TELLS) {
    if (t.pattern.test(text)) return t.label;
  }
  if (hasThreeBulletStructure(text)) {
    return "an unsolicited three-bullet list";
  }
  if (hasIntensifierStacking(text)) {
    return "intensifier stacking (genuinely/truly/actually/really used 3+ times in one response)";
  }
  return null;
}

/**
 * Three or more total uses of validating intensifiers in one response. Each
 * one in isolation is fine; the stack reads as performance ("I genuinely
 * think this is actually really worth doing").
 */
function hasIntensifierStacking(text: string): boolean {
  const matches = text.match(INTENSIFIER_RE);
  return (matches?.length ?? 0) >= 3;
}

/**
 * Three+ consecutive bullet lines starting with -, *, • or numbered 1./2./3.
 * Conservative: only flags the SaaS-style structured listicle, not a single
 * incidental dash.
 */
function hasThreeBulletStructure(text: string): boolean {
  const lines = text.split(/\r?\n/);
  const bulletRe = /^\s*([-*•]|\d+[.)])\s+\S/;

  let run = 0;
  for (const line of lines) {
    if (bulletRe.test(line)) {
      run += 1;
      if (run >= 3) return true;
    } else if (line.trim().length > 0) {
      run = 0;
    }
    // Blank lines don't break a run — bulleted lists with blank separators
    // are still bulleted lists.
  }
  return false;
}

// ---------------------------------------------------------------------------
// Output cleanup
// ---------------------------------------------------------------------------

function cleanup(text: string): string {
  // Normalize line endings, collapse blank-line runs, then strip dash tells.
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return stripDashTells(normalized).trim();
}

/**
 * Replace em dashes, en dashes, and double-hyphens with ". " and capitalize
 * the following letter. Belt-and-suspenders for the prompt rule against them.
 * Claude's training defaults to em dashes regardless of instructions.
 */
function stripDashTells(text: string): string {
  return text.replace(
    /\s*[—–]\s*([a-zA-Z])?|\s+--\s+([a-zA-Z])?/g,
    (_match, c1?: string, c2?: string) => {
      const next = c1 ?? c2;
      if (!next) return ". ";
      return ". " + next.toUpperCase();
    }
  );
}
