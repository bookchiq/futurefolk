---
name: generateText calls have no timeout; Anthropic stalls block SIGTERM cleanup
description: Both first-pass and retry generateText calls run without AbortSignal.timeout. A stalled Anthropic stream pins event-loop slots and prevents graceful shutdown.
type: code-review
issue_id: 024
priority: p2
status: pending
tags: [code-review, reliability, performance]
---

## Problem Statement

`lib/future-self.ts:88-93` (first generation) and `:107-122` (retry) call `generateText` without any timeout. If Anthropic stalls or the AI Gateway hangs, the handler hangs forever. Combined with the SIGTERM hardening in todo 021, an in-flight stalled handler will eat the entire 30s Railway grace window and still get killed dirty.

## Findings

- `lib/future-self.ts:88-93` — first generation
- `lib/future-self.ts:107-122` — retry

## Proposed Solutions

### Recommended: AbortSignal.timeout on both calls

```ts
const first = await generateText({
  model: MODEL,
  system: systemPrompt,
  messages,
  maxOutputTokens: MAX_OUTPUT_TOKENS,
  abortSignal: AbortSignal.timeout(60_000),
});
```

60s is generous for a single completion at 600 maxOutputTokens; tune down if observation shows shorter typical responses. Same for the retry (or a tighter 30s — retry should be smaller).

## Recommended Action

Apply to both. Wrap in try/catch that distinguishes timeout (`err.name === "TimeoutError"`) from other failures and logs accordingly. Consider returning a fallback "I couldn't quite get there — try again?" message on timeout rather than throwing up to the worker, which would log a generic handler error.

## Technical Details

- `/Users/sarahlewis/Code/futurefolk/lib/future-self.ts:88-93`
- `/Users/sarahlewis/Code/futurefolk/lib/future-self.ts:107-122`

## Acceptance Criteria

- [ ] Both generateText calls have AbortSignal.timeout configured.
- [ ] On timeout, handler logs the timeout reason (not a generic stack).
- [ ] Smoke test: normal generation still completes well within timeout.

## Work Log

(none yet)

## Resources

- Surfaced by: security-sentinel + architecture-strategist (P3 each, but combine to P2 importance).
- Depends on: AI SDK v6 abort-signal support (confirmed).
