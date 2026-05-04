---
name: appendMessage write order is fragile; persist user turn before generation
description: Both paths post the assistant reply, then write user+assistant rows. Order survives only on insertion-id tiebreak. Refactor risk + crash window.
type: code-review
issue_id: 002
priority: p1
status: complete
tags: [code-review, data-integrity, architecture, blocks-merge]
---

## Problem Statement

Both code paths post the assistant reply, then call `appendMessage(..., "user", ...)` and `appendMessage(..., "assistant", ...)`. `getRecentMessages` orders by `created_at DESC, id DESC` and reverses, so within the same second the order survives only because the user row has a smaller auto-incrementing `id`. This works today but:

1. Any refactor that reorders writes corrupts history silently.
2. If the worker crashes between `msg.channel.send(reply)` and `appendMessage(..., "assistant", ...)`, the user has the reply but it's not in history. The next continuation sees the reply absent and may regenerate or contradict.
3. If `created_at` ever moves to a higher-resolution clock or `id` to a UUID, the tiebreak goes away.

## Findings

- `lib/bot.ts:96-99` — slash command path
- `scripts/gateway-worker.ts:90-93, 151-154` — DM continuation + reaction paths
- `lib/conversation.ts:44-57` — order by `created_at DESC, id DESC`

## Proposed Solutions

### Option A: Reorder writes — persist user turn BEFORE generation (RECOMMENDED)
Move `appendMessage(..., "user", ...)` to before the `generateFutureSelfResponse` call in all three sites.

Pros: idiomatic (persist what they said, then generate, then persist the reply); a crash mid-generation no longer loses the user message; ordering is independent of `id` tiebreak.
Cons: a generation failure leaves a user turn with no assistant follow-up. The next continuation sees an unanswered user turn — fine, that's the actual state.
Effort: Small.
Risk: Very low.

### Option B: Single multi-row INSERT after generation
Combine the two INSERTs into one query (`INSERT ... VALUES (user_row), (assistant_row)`). Pros: atomic. Cons: still loses both rows if crash happens between `send` and the INSERT. Less defensive than Option A.

### Option C: Add an explicit `seq` column
Per-channel monotonic counter. Pros: bulletproof ordering. Cons: schema change, more complex, overkill for current scale.

## Recommended Action

Option A. Future-proof and idiomatic. Pair with the persistence consolidation in todo 005 (multi-row INSERT for the assistant turn).

## Technical Details

Affected files:
- `/Users/sarahlewis/Code/futurefolk/lib/bot.ts:96-99`
- `/Users/sarahlewis/Code/futurefolk/scripts/gateway-worker.ts:90-93, 151-154`

## Acceptance Criteria

- [x] All three sites write the user turn before calling `generateFutureSelfResponse`.
- [ ] Manual test: kill the worker between user-message send and reply-generation completes. After restart, history shows the user turn but not the (never-generated) assistant turn. (manual verification needed)
- [ ] Smoke test: existing `/futureself` flow still works end-to-end. (verify after deploy)

## Work Log

**2026-05-03** — Fixed in PR #9 follow-up commit. Reordered all three call sites (slash command in `lib/bot.ts`, DM handler and reaction handler in `scripts/gateway-worker.ts`) so the user turn is persisted before `generateFutureSelfResponse` is called. The DM-continuation site reads history first, then persists, so the model's `prompt` argument carries the new user turn without duplicating it in `messages`. Typecheck clean. Local worker restarted.

Crash-window note: a generation failure now leaves a user turn with no assistant follow-up. The next turn sees an unanswered user turn and the model can respond appropriately. Per the recommended action in this todo, that's the desired state — better than losing the user message entirely.

## Resources

- Surfaced by: architecture-strategist agent.
