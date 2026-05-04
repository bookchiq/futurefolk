---
name: Stop logging slices of user message content (multi-tenant data exposure)
description: Multiple log lines emit text.slice(0, 80) of user-controlled content. Acceptable for single-tenant demo; becomes data exposure across reactor/reactor-target boundaries the moment the bot scales to friends.
type: code-review
issue_id: 027
priority: p2
status: pending
tags: [code-review, privacy, multi-tenant]
---

## Problem Statement

Several log lines emit slices of user-controlled message content:
- `scripts/gateway-worker.ts:74` — `[gateway-worker] DM from ${userId} (${horizon}): ${text.slice(0, 80)}`
- `scripts/gateway-worker.ts:96` — DM replied length log (fine; just a length)
- `scripts/gateway-worker.ts:121` — onboarding-related (review)
- `scripts/gateway-worker.ts:164` — `[gateway-worker] ⏳ reaction by ${user.id}: ${reactedText.slice(0, 80)}`

For a single-tenant demo the logs are Sarah's own messages. The moment the bot is invited to other servers, these logs persist random users' content (potentially sensitive Discord channel messages) into Railway's log aggregator. Discord ToS and general data hygiene both frown on that.

The reaction case is especially concerning: the reacted message text is from a third party — could be anything posted in any channel the bot can read.

## Findings

- `scripts/gateway-worker.ts:74, 121, 164`
- (Less critical) `lib/bot.ts` log lines also emit `event.user.userId` and option values.

## Proposed Solutions

### Recommended: log shape, not content

Change content slices to length:
```ts
console.log(`[gateway-worker] DM from ${userId} (${horizon}): len=${text.length}`);
console.log(`[gateway-worker] ⏳ reaction by ${user.id}: len=${reactedText.length}`);
```

For onboarding-status logs, content isn't relevant — log just the user ID and the decision (gated, allowed, etc.).

### Alternative: hash content before logging

Stable hash (`crypto.createHash('sha256').update(text).digest('hex').slice(0, 8)`) gives just enough signal to correlate dupes without exposing content. Heavier than needed.

## Recommended Action

Recommended option. Pair with a one-paragraph note in `.v0/findings.md` (or new `OPERATIONS.md`) about logging hygiene under multi-tenant.

## Technical Details

- `/Users/sarahlewis/Code/futurefolk/scripts/gateway-worker.ts:74, 121, 164`

## Acceptance Criteria

- [ ] No log line emits more than the length of user-controlled content (or a short hash).
- [ ] User IDs (`discord_user_id`) are still loggable — they're identifiers, not content.

## Work Log

(none yet)

## Resources

- Surfaced by: security-sentinel agent (P2 multi-tenant concern).
