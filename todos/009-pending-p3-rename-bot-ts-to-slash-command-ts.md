---
name: Rename lib/bot.ts to lib/slash-command.ts (or split chat-sdk + slash-command)
description: With Gateway handlers gone, the file owns slash command logic only. Filename misleads readers who'd expect bot behavior.
type: code-review
issue_id: 009
priority: p3
status: pending
tags: [code-review, naming, refactor]
---

## Problem Statement

`lib/bot.ts` is now ~150 lines of slash command handler + parsing helper + ChatSDK plumbing. The name "bot" implies the file owns the bot's behavior, but the bot's behavior is split across this file AND `scripts/gateway-worker.ts`. A reader will reasonably assume `lib/bot.ts` is where DM continuations live; the comment block at top tries to correct that, but the filename fights the comment.

## Findings

- `lib/bot.ts` — currently the slash command handler + helpers
- `scripts/gateway-worker.ts` — owns DM + reaction handling
- Comment at top of `lib/bot.ts:1-19` tries to explain the split

## Proposed Solutions

### Option A (minimal): rename
`lib/bot.ts` → `lib/slash-command.ts`. Update the import in `app/api/webhooks/discord/route.ts`. Done.

### Option B: split into two files
- `lib/chat-sdk.ts` — exports `bot` (Chat instance + adapter wiring; ~10 lines)
- `lib/slash-command.ts` — registers `/futureself` handler on `bot`; option-parsing helpers

Cleaner separation; the file location communicates the scope.

### Option C: leave it
The comment explains the situation. Renaming is churn for marginal clarity.

## Recommended Action

Option A. Lowest effort, real readability win. Defer Option B to when there are more bot-instance consumers.

## Technical Details

Affected files:
- `/Users/sarahlewis/Code/futurefolk/lib/bot.ts` → `lib/slash-command.ts`
- `/Users/sarahlewis/Code/futurefolk/app/api/webhooks/discord/route.ts` — update import

## Acceptance Criteria

- [ ] `lib/bot.ts` no longer exists.
- [ ] `lib/slash-command.ts` exists with the same exports.
- [ ] `app/api/webhooks/discord/route.ts` imports from the new path.
- [ ] Typecheck passes.
- [ ] Smoke test: `/futureself` still works.

## Work Log

(none yet)

## Resources

- Surfaced by: architecture-strategist agent.
