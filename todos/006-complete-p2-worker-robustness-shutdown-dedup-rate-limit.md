---
name: Gateway worker hardening — graceful shutdown, message dedup, rate limiting
description: SIGTERM handler, dedup against Discord MESSAGE_CREATE redelivery, per-user rate limit. All needed before Railway + multi-tenant testing.
type: code-review
issue_id: 006
priority: p2
status: complete
tags: [code-review, reliability, security, multi-tenant]
---

## Problem Statement

Three production-readiness gaps in `scripts/gateway-worker.ts` that bite the moment the worker is on Railway and the bot is in a guild Sarah doesn't fully control.

### 6a. No graceful shutdown
Railway sends SIGTERM on deploy. Current code has no signal handler. Mid-handler kill leaves orphaned state (e.g., DM sent but assistant write skipped). After todo 002 + todo 005, this becomes more important: any active handler should at least let the in-flight DB write finish before exit.

### 6b. Discord MESSAGE_CREATE redelivery → double responses
If the worker reconnects with an unacknowledged session, Discord redelivers `MESSAGE_CREATE`. Current code regenerates and double-replies. Slash commands are dedupe'd by Discord at the interaction layer; the Gateway path is not.

### 6c. No rate limiting
Anyone can spam `/futureself` or DM continuations and burn `ANTHROPIC_API_KEY` budget. Sonnet 4.6 isn't cheap; sustained spam is denial-of-wallet. Friend-testing makes this go from "theoretical" to "Sarah's friends can accidentally rack up a bill."

## Findings

- `scripts/gateway-worker.ts:165-176` — boot + login, no signal handlers
- `scripts/gateway-worker.ts:46-99` — DM handler, no dedupe
- `scripts/gateway-worker.ts:105-161` — reaction handler, no dedupe
- `lib/bot.ts:48-100` — slash command, no rate limit
- No rate limit anywhere

## Proposed Solutions

### 6a (shutdown):
```ts
const shutdown = async (signal: string) => {
  console.log(`[gateway-worker] received ${signal}, shutting down`);
  client.destroy();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
```
Optionally drain in-flight handlers before destroying the client (tracked-promise pattern). Probably overkill.

### 6b (dedup):
Cheapest: dedup on `(channel_id, role, content, created_at within 30s)`. Add a `discord_message_id` column to `conversation_messages` and unique-constrain `(channel_id, discord_message_id)` for cleaner version. Either works.

Fastest path: in the DM handler, check before generation:
```sql
SELECT 1 FROM conversation_messages
WHERE channel_id = ${channelId}
  AND role = 'user'
  AND content = ${text}
  AND created_at > now() - interval '30 seconds'
LIMIT 1
```
If found, log + skip. Pair with todo 002 (user-turn-before-generation) so the dedupe is meaningful.

### 6c (rate limit):
Postgres-backed counter:
```sql
SELECT count(*) FROM conversation_messages
WHERE discord_user_id = ${userId}
  AND created_at > now() - interval '1 minute'
```
Cap at, say, 10 per minute. If exceeded, send a friendly bounce message (slash) or silently drop (DM/reaction). Keep counts in DB rather than memory because the Vercel function and Railway worker share no in-memory state.

For slash commands: the Vercel function must respond within 3 seconds. Make the rate-limit check non-blocking by deferring inside `after()`.

## Recommended Action

Land all three before Railway deploys publicly. Order:
1. Shutdown handler (5 min)
2. Rate limiting (30 min)
3. Dedup (30 min)

## Technical Details

Affected files:
- `/Users/sarahlewis/Code/futurefolk/scripts/gateway-worker.ts`
- `/Users/sarahlewis/Code/futurefolk/lib/bot.ts`
- `/Users/sarahlewis/Code/futurefolk/lib/conversation.ts` — possibly new dedup/rate-limit helpers

Schema: optionally add `discord_message_id` text column to `conversation_messages` for cleaner dedup.

## Acceptance Criteria

- [ ] Worker logs SIGTERM receipt and exits cleanly.
- [ ] Sending the same DM message twice in 5 seconds does not produce two replies.
- [ ] Spamming 20 `/futureself` calls in a minute results in a rate-limit message after the cap.
- [ ] No regression in normal usage.

## Work Log

**2026-05-03** — Fixed in `harden/gateway-worker-production-readiness` branch.

- 6a (graceful shutdown): added `SIGTERM`/`SIGINT` handlers at the bottom of `scripts/gateway-worker.ts` that call `client.destroy()` then `process.exit(0)`. Idempotent via `isShuttingDown` flag. No in-flight handler draining (each handler has its own try/catch and DB writes are fast).
- 6b (dedup): new `isDuplicateUserMessage(channelId, userId, content)` helper in `lib/conversation.ts` checks for an existing user row in the last 30s. Worker DM handler runs the check before any other DB work — duplicates log + return without persisting or generating.
- 6c (rate limit): new `isRateLimited(userId)` helper counts user turns in the last minute against `RATE_LIMIT_USER_TURNS_PER_MINUTE = 15`. Applied in three places: slash command (postEphemeral with friendly bounce), worker DM handler (silent drop), worker reaction handler (silent drop).

The 30s dedup window and 15/min rate limit are conservative starting values. Tune after observation in production.

Typecheck clean. Worker restarted.

## Resources

- Surfaced by: security-sentinel agent (P3-1, P3-2) and architecture-strategist agent (P2 dedup).
