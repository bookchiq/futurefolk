---
name: Conversation history retention policy + cache Discord DM channelId on users row
description: Two scale-related items. Neither is concerning at 100-user scale; revisit before public launch.
type: code-review
issue_id: 050
priority: p3
status: deferred
tags: [code-review, performance, scale]
---

## Problem Statement

### 50a. `conversation_messages` grows unbounded

`appendMessage` writes forever. After a year of daily DMs, a heavy user has ~700 rows. Reads stay fast (the partial index keeps `LIMIT 20` cheap), but the table grows linearly forever. Not a correctness issue today.

Easy fix when it matters: nightly job that deletes rows older than N days for any (channel_id) where there's been no activity in M days. Or simpler: TRUNCATE-by-date ceiling per user.

### 50b. Discord DM open is uncached

`lib/discord-dm.ts:33-46` does sequential `POST /users/@me/channels` then `POST /channels/{id}/messages`. The first call IS cacheable: Discord guarantees the same user gets the same DM channel ID for a given (bot, user) pair, forever.

For a user who's received 5 scheduled check-ins, that's 5 unnecessary `POST /users/@me/channels` calls. ~150-300ms each.

Cheap form: store `dm_channel_id` on the `users` row. Once-per-user lifetime; the value never changes.

Defer until check-ins per user are common (today: 0-1 per user).

## Findings

- `/Users/sarahlewis/Code/futurefolk/lib/conversation.ts:30-37`
- `/Users/sarahlewis/Code/futurefolk/lib/discord-dm.ts:33-46`

## Proposed Solutions

### 50a — Retention policy

Defer. Document in `docs/OPERATIONS.md` (#048) as a "before public launch" item.

### 50b — channelId cache

Defer. Schema add (1 column) + update flow on first DM open. ~30 LOC. Take when scheduled check-ins reach >5/user/month or when a friend reports DM-send latency.

## Recommended Action

Both deferred. Capture in OPERATIONS.md alongside the production-readiness gap list (#048).

## Technical Details

(See file refs above.)

## Acceptance Criteria

(Deferred — re-evaluate when scale warrants.)

## Work Log

**2026-05-05** — Marked deferred. Both items captured in `docs/OPERATIONS.md::Pre-launch readiness gaps` (added in #048). Revisit when scheduled check-ins exceed ~5/user/month or a friend reports DM-send latency.

## Resources

- Surfaced by: performance-oracle (P3 #5, P2 #2)
