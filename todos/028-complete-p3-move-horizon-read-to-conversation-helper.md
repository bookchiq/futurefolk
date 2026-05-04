---
name: Move inline horizon-from-most-recent-turn read to lib/conversation.ts helper
description: Worker has an inline SQL query for horizon recovery. Moving to a named helper in conversation.ts improves the silent-drift surface (one place to update on schema changes).
type: code-review
issue_id: 028
priority: p3
status: complete
tags: [code-review, architecture, refactor]
---

## Problem Statement

`scripts/gateway-worker.ts:87-93` has an inline `sql\`SELECT horizon FROM conversation_messages…\``. It's the only query against `conversation_messages` outside `lib/conversation.ts`. If the table's schema changes (e.g., column rename, type change), this site won't be found by a simple grep on `conversation.ts` callers.

## Findings

- `scripts/gateway-worker.ts:87-93`

## Proposed Solutions

### Recommended: extract `getMostRecentHorizon(channelId, fallback)` in lib/conversation.ts

```ts
export async function getMostRecentHorizon(
  channelId: string,
  fallback: Horizon
): Promise<Horizon> {
  const rows = (await sql`
    SELECT horizon FROM conversation_messages
    WHERE channel_id = ${channelId}
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `) as Array<{ horizon: Horizon }>;
  return rows[0]?.horizon ?? fallback;
}
```

### Alternative (preferred long-term): fold into `getRecentMessagesAndHorizon` per todo 025

Single query returns history + horizon. Drops one DB round-trip.

## Recommended Action

Do todo 025 instead — it both moves the query and folds it into `getRecentMessages`. This todo subsumes into 025 once that's done; close as a duplicate at that point.

## Technical Details

- `/Users/sarahlewis/Code/futurefolk/scripts/gateway-worker.ts:87-93`
- `/Users/sarahlewis/Code/futurefolk/lib/conversation.ts`

## Acceptance Criteria

- [ ] No SQL queries against `conversation_messages` outside `lib/conversation.ts`.
- [ ] Horizon recovery still works on first DM after slash command.

## Work Log

**2026-05-03** — Subsumed by todo 025. The inline horizon SELECT in `scripts/gateway-worker.ts` is gone; horizon now comes from `getRecentMessagesAndHorizon` in `lib/conversation.ts`. No queries against `conversation_messages` remain outside that module.

## Resources

- Surfaced by: architecture-strategist agent.
- Subsumes into: todo 025.
