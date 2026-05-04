---
name: Add observability for silent drops (dedup, rate-limit, onboarding gate)
description: Three different reasons the bot silently drops a request. Console-only today. Friends testing the bot can't distinguish "gated" from "broken." Add either a dropped_events table or richer rate-limit return.
type: code-review
issue_id: 029
priority: p3
status: pending
tags: [code-review, observability, multi-tenant]
---

## Problem Statement

When the worker silently drops a request (dedup match, rate-limit, un-onboarded reaction), only a console.log records it. From outside the worker process, "did my message get dropped?" is unanswerable. Friends testing the bot can't distinguish "gated" from "broken."

## Findings

- `scripts/gateway-worker.ts:72-77` (dedup drop)
- `scripts/gateway-worker.ts:79-84, 179-182` (rate-limit drops)
- `scripts/gateway-worker.ts:172-177` (un-onboarded reaction drop)

## Proposed Solutions

### Option A (light): make `isRateLimited` return count + threshold

Currently boolean-only. Both the count and the threshold are computed. Returning them lets test harnesses inspect state and lets log lines emit useful numbers without re-querying.

```ts
export async function checkRateLimit(userId: string): Promise<{
  limited: boolean;
  count: number;
  threshold: number;
}> { /* ... */ }
```

### Option B (heavier): dropped_events table

```sql
CREATE TABLE dropped_events (
  id BIGSERIAL PRIMARY KEY,
  channel_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Inserts at each drop site. Queryable from anywhere with `DATABASE_URL`. Enables a dashboard later.

### Option C: do nothing for now

Single-tenant, console logs work. Defer until the bot is in 3+ guilds.

## Recommended Action

Option A for cheapness. It's a 5-line change with immediate utility. Defer Option B until friend-testing surfaces actual debugging pain.

## Technical Details

- `/Users/sarahlewis/Code/futurefolk/lib/conversation.ts:99-108`
- (If Option B) new migration + helper

## Acceptance Criteria

- [ ] Rate-limit returns count + threshold (Option A) or dropped_events table exists (Option B).
- [ ] Worker log lines on drops emit the count/threshold without a second DB query.

## Work Log

(none yet)

## Resources

- Surfaced by: agent-native-reviewer agent (P3).
