---
name: Consolidate DB queries; fire-and-forget persistence after Discord send
description: Halve DB round-trips per DM (horizon+history in one query, single multi-row INSERT for both turns), and remove persistence from critical path.
type: code-review
issue_id: 005
priority: p2
status: complete
tags: [code-review, performance, database]
---

## Problem Statement

Every DM message currently incurs:
1. `SELECT horizon ... LIMIT 1` (gateway-worker.ts:66-71)
2. `getRecentMessages` (lib/conversation.ts:44-57) — second query for the same channel
3. `appendMessage` user (lib/conversation.ts:21-36) — synchronous, blocks return
4. `appendMessage` assistant — synchronous, blocks return

That's 4 DB round-trips per DM. Steps 3-4 happen AFTER `msg.channel.send(reply)` — the user is already looking at the reply, so awaiting them adds latency to nothing user-visible.

## Findings

- `scripts/gateway-worker.ts:66-72, 80, 90-93, 151-154`
- `lib/bot.ts:96-99` (slash command path)
- `lib/conversation.ts:44-57` (separate horizon vs history queries)

## Proposed Solutions

### Recommended: three changes layered

1. **Merge horizon + history into a single query.** Add a new helper or extend `getRecentMessages` to include `horizon` in the SELECT. The newest row's horizon comes back at index 0; the rest is the same history shape.

2. **Single multi-row INSERT for both turns.** Replace two `appendMessage` calls with one `appendTurn(channelId, userId, horizon, userText, assistantText)` that does:
   ```sql
   INSERT INTO conversation_messages (channel_id, discord_user_id, horizon, role, content)
   VALUES (..., 'user', ...), (..., 'assistant', ...)
   ```
   Add to `lib/conversation.ts`.

3. **Fire-and-forget after the user has the reply.** In the worker:
   ```ts
   await msg.channel.send(reply);
   appendTurn(channelId, userId, horizon, text, reply).catch((e) =>
     console.error("[gateway-worker] persist failed:", e)
   );
   ```
   Same pattern in `lib/bot.ts` (slash command).

   **NOTE:** The user-turn-before-generation refactor in todo 002 means the user write happens earlier, NOT in the fire-and-forget path. Only the assistant write is fire-and-forget after send. Update accordingly.

## Recommended Action

Do todo 002 first (user-turn ordering). Then layer this on:
- Merge horizon into history query.
- Single-row assistant INSERT (the user row is already persisted before generation).
- Fire-and-forget the assistant INSERT after Discord send.

## Technical Details

Affected files:
- `/Users/sarahlewis/Code/futurefolk/lib/conversation.ts` — add `appendTurn` helper or extend existing function
- `/Users/sarahlewis/Code/futurefolk/scripts/gateway-worker.ts` — both handlers
- `/Users/sarahlewis/Code/futurefolk/lib/bot.ts` — slash command flow

## Acceptance Criteria

- [ ] Per-DM critical path makes 1 DB round-trip (history+horizon SELECT) before generation.
- [ ] Persistence of assistant turn happens after `send` and does not block return.
- [ ] User turn is persisted before generation (paired with todo 002).
- [ ] Worker still logs persist failures.
- [ ] Smoke test: send a DM, verify reply, verify both rows exist with correct order.

## Work Log

**2026-05-03** — Closed via Wave 2 + 3 work, with the fire-and-forget piece deliberately deferred.

- **Horizon + history in one query**: DONE (Wave 2 todo 025). `getRecentMessagesAndHorizon` returns both in a single round-trip; both worker handlers use it.
- **User-turn-before-generation reorder**: DONE (PR #9 todo 002). The two-INSERT race is moot because the user turn is now persisted before generation.
- **Multi-row INSERT for both turns**: NOT NEEDED. Since user persists before generation, only the assistant turn writes after generation — single-row INSERT remains the right shape.
- **Fire-and-forget assistant persistence**: DEFERRED. Skipping this part deliberately. The latency win is small (~30-100ms), and a fire-and-forget pattern conflicts with the SIGTERM drain in todo 021 — a dangling promise after the handler's `try/finally` would let `inFlight` decrement before the persist completes, so SIGTERM drain wouldn't wait for it. Trade-off favors data safety over latency at current scale.

## Resources

- Surfaced by: performance-oracle agent (P1.2, P1.3).
- Depends on: todo 002 (write ordering).
