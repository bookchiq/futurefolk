---
name: Parallelize independent DB queries in worker hot path; fold horizon into history query
description: Worker DM handler runs 4 sequential DB round-trips before generation. Three are independent (dedup, rate-limit, horizon). Combined with history fold-in, cuts pre-generation DB time by ~40-60%.
type: code-review
issue_id: 025
priority: p2
status: complete
tags: [code-review, performance]
---

## Problem Statement

`scripts/gateway-worker.ts:60-119` does 4 sequential DB round-trips before `generateText`:

1. `isDuplicateUserMessage` — line 72
2. `isRateLimited` — line 79
3. Horizon read — lines 87-93
4. `getRecentMessages` — line 103
5. `appendMessage(user)` — line 107

At Neon serverless HTTP latency (~30-80ms/query from Railway), that's 150-400ms of serial DB work before token generation begins. Users feel it as "the typing indicator takes a beat to appear."

## Findings

- `scripts/gateway-worker.ts:60-119`
- Same pattern (smaller) on the reaction handler at `:131-208`: `getVoiceProfile` + `isRateLimited` are also sequential and independent.

## Proposed Solutions

### Recommended: parallelize independent queries + fold horizon into history

(a) **Parallelize.** Steps 1, 2, 3 are independent. Use `Promise.all`:
```ts
const [isDup, isLimited, horizonRow] = await Promise.all([
  isDuplicateUserMessage(channelId, userId, text),
  isRateLimited(userId),
  // horizon read
]);
if (isDup) return;
if (isLimited) return;
```

(b) **Fold horizon into history.** `getRecentMessages` already orders by `created_at DESC` — extend it to also return horizon (the latest row's value):
```ts
export async function getRecentMessagesAndHorizon(
  channelId: string, limit = 20
): Promise<{ history: ConversationTurn[]; horizon: Horizon | null }> {
  const rows = (await sql`
    SELECT role, content, horizon FROM conversation_messages
    WHERE channel_id = ${channelId}
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit}
  `) as Array<{ role: "user" | "assistant"; content: string; horizon: Horizon }>;
  const horizon = rows[0]?.horizon ?? null;
  return {
    horizon,
    history: rows.reverse().map((r) => ({ role: r.role, content: r.content })),
  };
}
```

(c) Reaction handler: parallelize `getVoiceProfile` + `isRateLimited`.

## Recommended Action

Apply (a) and (c) — they're cheap. Apply (b) as part of todo 028 (move horizon to a helper) so the function lives in the right module.

## Technical Details

- `/Users/sarahlewis/Code/futurefolk/scripts/gateway-worker.ts:60-119` (DM handler)
- `/Users/sarahlewis/Code/futurefolk/scripts/gateway-worker.ts:131-208` (reaction handler)
- `/Users/sarahlewis/Code/futurefolk/lib/conversation.ts` (new helper)

## Acceptance Criteria

- [ ] Pre-generation DB time on DM handler reduced from 4 round-trips to 2-3.
- [ ] Reaction handler runs profile + rate-limit in parallel.
- [ ] No behavior change.

## Work Log

**2026-05-03** — Fixed in PR #10 follow-up.

- Added `getRecentMessagesAndHorizon` in `lib/conversation.ts` that returns history + horizon in a single query (replaces the worker's inline horizon SELECT).
- `getRecentMessages` now wraps the new helper for backward compatibility.
- DM handler runs four queries in parallel via Promise.all: rate-limit, dedup, profile, history+horizon. Bails early on any gate failure. Cuts pre-generation DB latency from ~4 sequential round-trips (150-400ms) to one parallel round-trip wave.
- Reaction handler runs profile + rate-limit in parallel.

This subsumes todo 028 (move horizon read to conversation helper) — the inline SQL is gone.

## Resources

- Surfaced by: performance-oracle agent (P2).
- Related: todo 005 (consolidate DB queries) and todo 028 (move horizon to helper).
