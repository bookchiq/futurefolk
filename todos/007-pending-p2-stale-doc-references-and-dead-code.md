---
name: Update docs for ChatSDK split; remove dead code
description: README.md, .v0/findings.md, STRATEGY-REVIEW.md reference removed handlers. UserRecord/getUser/FutureSelfTurn are unused.
type: code-review
issue_id: 007
priority: p2
status: pending
tags: [code-review, documentation, dead-code]
---

## Problem Statement

The PR removed `bot.onSubscribedMessage` and `bot.onReaction` from `lib/bot.ts`, but several docs still describe them as live. Several types and functions are unused.

## Findings

### Stale doc references:
- `README.md:43-70` — describes ChatSDK as the home for all three triggers, says reaction handlers are "still wired up in `lib/bot.ts`." False after this PR.
- `.v0/findings.md:62` — "Current state: `bot.onReaction(...)` and `bot.onSubscribedMessage(...)` handlers are still wired in `lib/bot.ts`…" Contradicted by the new entry at the bottom of the same file. Findings is append-only by design — add a "superseded by 2026-05-03 entry" note rather than deleting.
- `.v0/findings.md:77` — "After the bot's first DM post, call `thread.subscribe()`…" Stale.
- `.v0/findings.md:87` — "Match on `event.rawEmoji === '⏳'` inside a catch-all `bot.onReaction` handler…" Stale; lives in worker now.
- `.v0/findings.md:100` — model name says `claude-sonnet-4.5`, code is `claude-sonnet-4-6`. Constant name says `DEFAULT_MODEL`, actual is `MODEL`.
- `.v0/findings.md:102` — claims `temperature: 0.85`. Actual code does NOT set temperature.
- `.v0/findings.md:106` — references `STAY_IN_CHARACTER_TELLS`. Actual constant is `SUBSTRING_TELLS`. Says "Up to 2 retries"; actual is 1. Says "suffix appended to system prompt"; actual is appended to messages array (with explicit comment that the system prompt is NOT modified).
- `STRATEGY-REVIEW.md:32` — references `lib/bot.ts:239` for `parseSlashOptions`; actual is `lib/bot.ts:127` after the rewrite.
- `STRATEGY-REVIEW.md:34-36` — lists `onSubscribedMessage` at `lib/bot.ts:159` and `onReaction` at `lib/bot.ts:122`. Both removed. Doc was written before the cleanup landed.
- `prompts/02-discord-bot.md:38,47` — instructs v0 to use `onReaction` / `onSubscribedMessage`. Historical scaffolding; arguable whether to update.

### Dead code:
- `lib/voice-profile.ts:30-34, 118-138` — `UserRecord` interface + `getUser()` function. No callers anywhere (verified by grep). Likely intended for the unbuilt `/profile` page (PLAN P6).
- `lib/future-self.ts:46-49` — `FutureSelfTurn` interface, no callers. Leftover from a pre-`ConversationTurn` refactor.

## Proposed Solutions

### Docs:
- Update `README.md:43-70` to describe the split honestly: slash via ChatSDK in `lib/bot.ts`; DM/reaction via discord.js in `scripts/gateway-worker.ts`.
- Append "supersedes earlier note" lines under `.v0/findings.md` lines 62, 77, 87. Don't delete (append-only).
- Fix `.v0/findings.md` line 100, 102, 106 with current values.
- Annotate `STRATEGY-REVIEW.md:32` line ref correction. Mark §2 as executed.
- Leave `prompts/02-discord-bot.md` as-is — it's a historical artifact of v0 prompts.

### Dead code:
- Delete `UserRecord` + `getUser()` for now. Re-add when P6 (/profile) lands.
- Delete `FutureSelfTurn`.

## Recommended Action

Bundle all doc updates + dead code removals into one cleanup commit. Quick.

## Technical Details

Affected files:
- `/Users/sarahlewis/Code/futurefolk/README.md`
- `/Users/sarahlewis/Code/futurefolk/.v0/findings.md`
- `/Users/sarahlewis/Code/futurefolk/STRATEGY-REVIEW.md`
- `/Users/sarahlewis/Code/futurefolk/lib/voice-profile.ts`
- `/Users/sarahlewis/Code/futurefolk/lib/future-self.ts`

## Acceptance Criteria

- [ ] `grep -rn "onReaction\|onSubscribedMessage" --include="*.md"` shows only PR description / dated findings entries explaining the removal.
- [ ] `grep -rn "UserRecord\|FutureSelfTurn\|getUser\b" --include="*.ts"` shows zero matches.
- [ ] Constant names in `.v0/findings.md` match the code.
- [ ] Model name in `.v0/findings.md` matches `claude-sonnet-4-6`.

## Work Log

(none yet)

## Resources

- Surfaced by: pattern-recognition-specialist agent.
