---
name: Parallelize lazy voice-profile backfill + add second cache breakpoint on few-shot pairs
description: Two perf wins in `lib/voice-profile.ts` and `lib/future-self.ts` worth taking together. Cuts ~8-15s off worst-case cold path and reduces token cost on every generation.
type: code-review
issue_id: 035
priority: p1
status: complete
tags: [code-review, performance, voice-pipeline]
---

## Problem Statement

### 35a. Lazy backfill in `getVoiceProfile` is sequential

`lib/voice-profile.ts:121-178` has two backfill blocks that run in sequence:

1. `extractStyleFeatures(sampleMessages)` — ~8-15s Sonnet call
2. `extractFewShotPairs(profile)` — ~8-15s Sonnet call

On the worst-case path (a user whose first /futureself or /onboarding/done preview generation is the first read of their profile, AND OAuth callback won the race against the `after()` background extraction), the user waits ~30s before `generateFutureSelfResponse` even starts. The dependency between the two extractors is *soft*: `extractFewShotPairs` reads `profile.styleFeatures` to enrich its meta-prompt, but it still extracts usefully without features. The dependency is too weak to justify the latency cost.

### 35b. Few-shot pairs are paid in full on every generation

`lib/future-self.ts:162-190` (`buildMessages`) prepends 3 pairs (~300 tokens) as alternating user/assistant messages BEFORE the conversation history. The system prompt has a cache breakpoint (issue #004 — completed) but few-shot pairs do not, so they're sent uncached on every generation.

AI SDK supports up to 4 cache breakpoints. Adding one on the LAST few-shot assistant message (boundary 6 of the prefix) caches `system + few-shot` together. History + final user message stay uncached as they should.

## Findings

- `/Users/sarahlewis/Code/futurefolk/lib/voice-profile.ts:121-178` — sequential backfill, two `jsonb_set` UPDATEs
- `/Users/sarahlewis/Code/futurefolk/lib/future-self.ts:162-190` — `buildMessages` prepends pairs without cache marker
- Estimated savings: ~8-15s on worst-case cold path (a once-per-user event); ~50-100ms TTFT per generation on cached reads + ~$0.0008/call → $0.00008/call on the few-shot tokens
- Bonus: the parallel backfill should also coalesce its two `jsonb_set` UPDATEs into one (saves a row rewrite)

## Proposed Solutions

### 35a — Parallel backfill

```ts
// lib/voice-profile.ts (replacing lines 121-178)
const needsStyleFeatures = !profile.styleFeatures && profile.sampleMessages?.length;
const needsFewShotPairs = !profile.fewShotPairs;

const [styleFeatures, fewShotPairs] = await Promise.all([
  needsStyleFeatures
    ? extractStyleFeatures(profile.sampleMessages!).catch((err) => {
        console.error("[Futurefolk] lazy backfill: extractStyleFeatures failed", err);
        return null;
      })
    : null,
  needsFewShotPairs
    ? extractFewShotPairs(profile).catch((err) => {
        console.error("[Futurefolk] lazy backfill: extractFewShotPairs failed", err);
        return null;
      })
    : null,
]);

if (styleFeatures || fewShotPairs) {
  const updates: string[] = [];
  // Build a single jsonb_set chain to coalesce both writes into one UPDATE.
  // ...
}
```

Note: `extractFewShotPairs(profile)` runs without the just-extracted `styleFeatures` in this scheme. The few-shot generator still produces useful output without features (just less stylometrically anchored). The next read after backfill will have both. Acceptable trade-off.

### 35b — Add cache breakpoint on last few-shot pair

In `lib/future-self.ts::buildMessages`, mark the final few-shot assistant message:

```ts
const lastIndex = pairs.length - 1;
pairs.forEach((pair, i) => {
  messages.push({ role: "user", content: pair.userText });
  messages.push({
    role: "assistant",
    content: pair.assistantText,
    ...(i === lastIndex && {
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    }),
  });
});
```

Pros: 4-line change. The 4-cache-breakpoint budget has plenty of headroom.
Cons: the cache invalidates whenever the user edits their profile (since few-shot pairs derive from the profile). For most users that's "near-permanent" reuse.

## Recommended Action

Take both. They're small, independent, and high-value. Bundle into one PR.

## Technical Details

- `/Users/sarahlewis/Code/futurefolk/lib/voice-profile.ts:121-178` — Promise.all + coalesced UPDATE
- `/Users/sarahlewis/Code/futurefolk/lib/future-self.ts:162-190` — cacheControl on last pair

## Acceptance Criteria

- [ ] When both `styleFeatures` and `fewShotPairs` are missing, backfill runs both extractors in parallel.
- [ ] Both backfilled values land in a single `UPDATE` (verify via `EXPLAIN ANALYZE` or schema log).
- [ ] First /futureself for a user with no derived fields completes in ~half the time it does today (10-15s instead of 25-30s).
- [ ] Per-generation token cost drops on cached reads (verify by inspecting Anthropic API response `usage.cache_read_input_tokens`).

## Work Log

**2026-05-05** — Resolved in PR #23.
- `getVoiceProfile` lazy backfill now runs both extractors via `Promise.all`. ~half the worst-case cold-path latency (10-15s instead of 25-30s).
- Persistence coalesced: when both extractors succeed, both fields land in a single chained `jsonb_set` UPDATE (one row rewrite instead of two). Single-extractor branches kept for partial success.
- Few-shot pairs got a second `cacheControl: { type: "ephemeral" }` breakpoint on the LAST assistant message in `buildMessages`. System + few-shot now cached as one prefix.

## Resources

- Surfaced by: performance-oracle (P1 #1, P1 #2)
