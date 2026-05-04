---
name: Dedup-skipped messages bypass the rate limiter; duplicate-spam slips through
description: Worker DM order is dedup → rate-limit → persist. Duplicate spam returns before incrementing the counter, so identical-content flood pays no rate-limit penalty.
type: code-review
issue_id: 018
priority: p1
status: complete
tags: [code-review, security, rate-limiting, blocks-merge]
---

## Problem Statement

`scripts/gateway-worker.ts:72-84` runs:
1. `isDuplicateUserMessage` — returns silent if duplicate
2. `isRateLimited` — counts user turns in last minute
3. (later) `appendMessage` — persists user turn

A user spamming **identical** DMs hits dedup and never persists, so the rate counter (which counts persisted user rows) never increments. An attacker that floods identical content forever pays no rate-limit penalty. The LLM call is gated, so direct cost is zero — but the DB read runs every time. Two queries per spam event indefinitely.

## Findings

- `scripts/gateway-worker.ts:60-99` (DM handler order)
- `lib/conversation.ts:99-108` (rate limiter counts only persisted user rows)

## Proposed Solutions

### Recommended: in-memory leaky bucket as first gate

Add a per-user in-process counter that fires before the DB-backed dedup check. Bounds DB load too.

```ts
// scripts/gateway-worker.ts
const memoryBuckets = new Map<string, { count: number; resetAt: number }>();
const MEM_RATE_PER_MIN = 30; // higher than DB cap; both must pass

function checkMemoryRate(userId: string): boolean {
  const now = Date.now();
  const bucket = memoryBuckets.get(userId);
  if (!bucket || bucket.resetAt < now) {
    memoryBuckets.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (bucket.count >= MEM_RATE_PER_MIN) return false;
  bucket.count += 1;
  return true;
}
```

Apply before dedup. The DB-backed `isRateLimited` becomes a backstop for cross-restart cases (worker process loses memory state on redeploy).

### Alternative: swap dedup and rate-limit order

Run rate-limit first. Dupes still skip persistence (so the counter stays correct for normal traffic) but the rate counter sees them and trips before dedup fires. Simpler — one-line code change, no new in-memory state.

## Recommended Action

Alternative is simpler and addresses the immediate concern. Apply that first; revisit memory bucket only if observed traffic warrants.

Order becomes:
1. `isRateLimited` — check first
2. `isDuplicateUserMessage` — skip if duplicate
3. proceed to generation

## Technical Details

- `/Users/sarahlewis/Code/futurefolk/scripts/gateway-worker.ts:72-84`

## Acceptance Criteria

- [ ] Spam 30 identical DMs in one minute. Confirm bot stops responding after the rate limit hits, regardless of dedup status.
- [ ] Smoke test: normal back-and-forth conversation still works (under threshold).

## Work Log

**2026-05-03** — Fixed in PR #10 follow-up. Worker DM handler now runs `isRateLimited` BEFORE `isDuplicateUserMessage`. Identical-content spam now trips the rate limiter on the first message that exceeds the cap, regardless of whether persistence has happened. Bonus: fewer DB queries on the duplicate-spam path (rate-limit query alone is enough to bounce; dedup is skipped).

## Resources

- Surfaced by: security-sentinel agent (P1).
