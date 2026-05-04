---
name: Worker DM continuation handler missing onboarding gate; soft-fail string becomes unsolicited DM
description: Reaction handler now gates on getVoiceProfile but DM continuation handler doesn't. Un-onboarded user DMing the bot triggers the soft-fail string from future-self.ts — same anti-spam concern.
type: code-review
issue_id: 019
priority: p2
status: complete
tags: [code-review, security, multi-tenant]
---

## Problem Statement

PR #10 added an onboarding gate to the reaction handler (`scripts/gateway-worker.ts:171-177`) to prevent unsolicited DMs to un-onboarded users. The DM continuation handler (`scripts/gateway-worker.ts:60-125`) does NOT have the same gate.

Edge case: an un-onboarded user already has a DM channel open with the bot (rare — they could have used `/futureself` once before their profile was deleted, or the bot DM'd them earlier). They send a message. Worker hits dedup + rate-limit, then calls `generateFutureSelfResponse`, which falls through to the soft-fail string at `lib/future-self.ts:71-75` ("we haven't actually built your voice profile yet…"). The bot DMs them that string — itself an unsolicited bot-initiated message to an un-onboarded user, which is what the reaction-handler gate was specifically designed to prevent.

## Findings

- `scripts/gateway-worker.ts:60-125` — DM continuation handler, no profile gate
- `lib/future-self.ts:71-75` — soft-fail string

## Proposed Solutions

### Recommended: add profile gate at top of DM continuation handler

After the dedup + rate-limit checks, add:
```ts
const profile = await getVoiceProfile(userId);
if (!profile) {
  console.log(`[gateway-worker] DM from un-onboarded user ${userId}, ignoring`);
  return;
}
```

The soft-fail string in `future-self.ts` becomes defense-in-depth (still reachable from slash command, where it's appropriate).

Alternative: also gate the slash command path up-front in `lib/bot.ts`. Symmetry argument. Trade-off: slash commands are explicit consent, so the soft-fail message is appropriate there as a fallback. Keeping the asymmetry is defensible.

## Recommended Action

Add the gate to the worker DM handler. Leave the slash command soft-fail as-is.

## Technical Details

- `/Users/sarahlewis/Code/futurefolk/scripts/gateway-worker.ts:60-125`

## Acceptance Criteria

- [ ] DM the bot from a Discord account with no `users` row. Worker logs `DM from un-onboarded user...`. No DM reply sent.
- [ ] Smoke test: existing onboarded user's DM continuations still work.

## Work Log

**2026-05-03** — Fixed in PR #10 follow-up. Worker DM handler now calls `getVoiceProfile(userId)` after rate-limit + dedup checks. Un-onboarded users hitting the bot via DM (rare edge case) get logged + dropped without an unsolicited reply. The soft-fail string in `lib/future-self.ts:71-75` now functions purely as defense-in-depth for the slash command path (which is explicit consent and where the soft-fail is appropriate UX).

## Resources

- Surfaced by: architecture-strategist + pattern-recognition-specialist.
