---
name: Document horizon stickiness in DM threads
description: Worker reads horizon from most recent persisted row. User can switch via /futureself again, but this isn't documented.
type: code-review
issue_id: 015
priority: p3
status: complete
tags: [code-review, documentation, ux]
---

## Problem Statement

`scripts/gateway-worker.ts:65-71` derives the horizon for DM continuations from the most recent `conversation_messages` row. A user can switch by re-running `/futureself horizon:5y about:...` (which inserts a new row), but this behavior is implicit. Users may notice their 5y conversation has "drifted" to 1y after a reaction-triggered DM.

## Findings

- `scripts/gateway-worker.ts:65-71` — horizon read with 1y fallback
- `scripts/gateway-worker.ts:142-148` — reaction handler always uses 1y, then writes a 1y row, which becomes the new "stickiness" baseline for that DM channel

## Proposed Solutions

### 15a: code comment
Add a comment at gateway-worker.ts:65 explaining that horizon is whatever the most recent persisted turn used, and `/futureself` re-pins it.

### 15b: user-facing copy
Add to `app/onboarding/done/page.tsx` or `README.md`: "Reactions always trigger 1-year-future-self. To switch a DM thread to 5y, run `/futureself horizon:5y about:...` again."

### 15c: feature — explicit horizon switch
Future enhancement: a `/horizon 5y` slash command that updates without starting a new topic. Out of scope for this todo.

## Recommended Action

15a + 15b. Cheap, prevents user confusion.

## Technical Details

Affected files:
- `/Users/sarahlewis/Code/futurefolk/scripts/gateway-worker.ts:65`
- `/Users/sarahlewis/Code/futurefolk/README.md` or `/Users/sarahlewis/Code/futurefolk/app/onboarding/done/page.tsx`

## Acceptance Criteria

- [ ] Code comment explains horizon-stickiness behavior.
- [ ] User-facing doc explains how to switch horizons mid-thread.

## Work Log

**2026-05-03** — Resolved by parallel agent (Wave 3 of /resolve_todo_parallel).

- `lib/conversation.ts` — extended the JSDoc on `getRecentMessagesAndHorizon` with a "Horizon stickiness" paragraph explaining the sticky-by-most-recent-write semantics, including how reactions can re-pin a 5y thread to 1y and how `/futureself` re-pins explicitly.
- `README.md` — added a "Switching horizons mid-thread" subsection adjacent to existing trigger documentation, in user-facing language. Did NOT touch the pre-Wave-2 stale references (those belong to todo 007).

## Resources

- Surfaced by: architecture-strategist agent.
