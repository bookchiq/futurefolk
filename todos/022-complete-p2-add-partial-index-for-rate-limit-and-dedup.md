---
name: Add partial index for rate-limit and dedup queries
description: Both queries filter on discord_user_id + role + created_at. No matching index — sequential scan on every call. At scale this becomes the dominant cost.
type: code-review
issue_id: 022
priority: p2
status: complete
tags: [code-review, performance, database]
---

## Problem Statement

`isRateLimited` (`lib/conversation.ts:99-108`) and partly `isDuplicateUserMessage` (`lib/conversation.ts:80-96`) filter on `discord_user_id` + `role = 'user'` + `created_at`. The existing index is `(channel_id, created_at DESC, id DESC)`. Neither query starts with `channel_id`, so the rate-limit query falls back to a sequential scan of `conversation_messages` on every call.

Runs on every slash command, every DM, every ⏳ reaction. Per-call cost grows linearly with table size.

## Findings

- `lib/conversation.ts:99-108` — rate-limit query
- `lib/conversation.ts:80-96` — dedup query (partly served by existing index via `channel_id` leg)

## Proposed Solutions

### Recommended: partial index keyed on (discord_user_id, created_at DESC) WHERE role = 'user'

```sql
CREATE INDEX CONCURRENTLY conversation_messages_user_recent_idx
  ON conversation_messages (discord_user_id, created_at DESC)
  WHERE role = 'user';
```

Partial index keeps it small (only user turns matter for rate limit + dedup). Serves both queries' user-id leg. Estimated impact: rate-limit query goes from O(table) seq scan to ~5ms index lookup at any table size.

## Recommended Action

Run the CREATE INDEX in Neon. No code change needed. Add a migration file for documentation if the project picks up a migrations convention.

## Technical Details

- Apply via Neon dashboard or psql. `CREATE INDEX CONCURRENTLY` so it doesn't lock the table during creation.

## Acceptance Criteria

- [ ] `EXPLAIN ANALYZE` on the rate-limit query shows index scan, not seq scan.
- [ ] `EXPLAIN ANALYZE` on the dedup query shows the new index used at least for the user-id filter.
- [ ] No regression on `getRecentMessages` (uses the existing channel_id index).

## Work Log

**2026-05-03** — Sarah applied the partial index manually on Neon after PR #10 merged. The recommended SQL from this todo:

```sql
CREATE INDEX CONCURRENTLY conversation_messages_user_recent_idx
  ON conversation_messages (discord_user_id, created_at DESC)
  WHERE role = 'user';
```

Now in place. `isRateLimited` and the user-id leg of `isDuplicateUserMessage` should both be served by index lookup, not seq scan. Verification SQL is documented in `docs/OPERATIONS.md`.

## Resources

- Surfaced by: performance-oracle (P1) + security-sentinel (P2 perf concern).
- Related: todo 014 (verify existing index).
