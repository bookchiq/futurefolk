---
name: Add Anthropic prompt caching on the system prompt
description: ~50% input-token cost reduction; regen path becomes ~80% cheaper. Single largest perf/cost win available.
type: code-review
issue_id: 004
priority: p2
status: pending
tags: [code-review, performance, cost]
---

## Problem Statement

Each `generateText` call in `lib/future-self.ts:88-93, 107-122` sends ~1500 tokens of system prompt (SHARED_BASE + horizon overlay + voice profile + onboarding context + the new contrastive example block). The same content is sent on every invocation, plus AGAIN on every regen (~30-50% trip rate with the new tells). Anthropic's prompt caching would cache the static prefix and reduce cached-input cost to ~10%.

## Findings

- `lib/future-self.ts:88-93` — first generation
- `lib/future-self.ts:107-122` — regen path (sends the same system prompt + history)

## Proposed Solutions

### Recommended: ephemeral cache breakpoint at end of system prompt

```ts
const first = await generateText({
  model: MODEL,
  system: systemPrompt,
  messages,
  maxOutputTokens: MAX_OUTPUT_TOKENS,
  providerOptions: {
    anthropic: {
      cacheControl: { type: "ephemeral" },
    },
  },
});
```

Verify exact API shape against `@ai-sdk/anthropic` current docs (the SDK exposes `cache_control` markers; the API may have changed since v3.0.74). 5-minute TTL covers the regen path and rapid follow-up DMs.

## Recommended Action

Add caching to both `generateText` calls. ~10 lines of change. Verify with a test invocation that the response usage object shows `cache_creation_input_tokens` on first call and `cache_read_input_tokens` on regen.

## Technical Details

Affected files:
- `/Users/sarahlewis/Code/futurefolk/lib/future-self.ts`

Verification: use `result.usage` (AI SDK v6 exposes provider metadata) to confirm cache hits.

## Acceptance Criteria

- [ ] System prompt is cached on first generation (`cache_creation_input_tokens > 0` on first call).
- [ ] Regen call within 5 min hits cache (`cache_read_input_tokens > 0`).
- [ ] No behavior change in voice quality.
- [ ] No measurable latency regression.

## Work Log

(none yet)

## Resources

- Surfaced by: performance-oracle agent (P1.1).
- Anthropic docs: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- AI SDK Anthropic provider: https://ai-sdk.dev/providers/ai-sdk-providers/anthropic
