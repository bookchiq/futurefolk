---
name: Ops discipline — version logging, deploy coupling, index verification
description: Both processes (Vercel + Railway) share schema and core lib code but redeploy independently. Risk of silent drift. Plus verify the conversation_messages index.
type: code-review
issue_id: 014
priority: p3
status: pending
tags: [code-review, operations, observability]
---

## Problem Statement

Three operational hygiene items.

### 14a. Schema-incompatible deploys can break only one process
Vercel function + Railway worker redeploy independently. If one is on commit A and the other on commit B, schema migrations or `lib/*` changes can break one but not the other. Slash commands work, DM continuations don't (or vice versa).

### 14b. No version logging
Neither process logs its current commit SHA on startup. When something breaks, hard to tell if drift is responsible.

### 14c. Index on conversation_messages may not exist
`.v0/findings.md:117` says the index is on `(channel_id, created_at DESC)`. The PR doesn't include a migration. Need to verify against Neon.

## Findings

- `scripts/gateway-worker.ts` — boot logs only `connected as Futurefolk#9047`
- `lib/bot.ts` — no version log
- `lib/conversation.ts:48-57` — relies on `(channel_id, created_at DESC, id DESC)` index

## Proposed Solutions

### 14a (deploy coupling):
- Add a deploy checklist to `PLAN.md` or new `OPERATIONS.md`: "after merging anything that touches schema or `lib/*`, redeploy both Vercel and Railway."
- Treat schema migrations as backward-compatible (additive, nullable, no drops without deprecation period).

### 14b (version logging):
Tiny `lib/version.ts`:
```ts
export const VERSION = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? "unknown";
```
Log on worker boot and once on first slash command per cold start.

### 14c (index):
Run on Neon:
```sql
\d+ conversation_messages
EXPLAIN ANALYZE SELECT role, content FROM conversation_messages
  WHERE channel_id = '...' ORDER BY created_at DESC, id DESC LIMIT 20;
```
If missing:
```sql
CREATE INDEX IF NOT EXISTS idx_conversation_messages_channel_created
  ON conversation_messages (channel_id, created_at DESC, id DESC);
```

## Recommended Action

All three. 14c is a 30-second SQL check; 14b is 15 min; 14a is doc only.

## Technical Details

Affected files:
- `/Users/sarahlewis/Code/futurefolk/lib/version.ts` (new)
- `/Users/sarahlewis/Code/futurefolk/scripts/gateway-worker.ts` (log version on boot)
- `/Users/sarahlewis/Code/futurefolk/lib/bot.ts` (log version once)
- `/Users/sarahlewis/Code/futurefolk/PLAN.md` or new `OPERATIONS.md` (deploy discipline)
- Neon dashboard (verify index)

## Acceptance Criteria

- [ ] Worker boot log shows commit SHA.
- [ ] Slash command logs commit SHA on first invocation per cold start.
- [ ] EXPLAIN on `getRecentMessages` query shows index scan, not seq scan.
- [ ] Operations note exists explaining "redeploy both processes after lib/* or schema changes."

## Work Log

(none yet)

## Resources

- Surfaced by: architecture-strategist (P2 deploy coupling) + performance-oracle (P1.4 index).
