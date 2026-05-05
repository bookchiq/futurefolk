---
name: Stale doc references to renamed `lib/bot.ts` (now `lib/slash-command.ts`)
description: README.md, .v0/findings.md, and webhooks/discord/route.ts comment all reference `lib/bot.ts`, which was renamed in PR #009. Anyone onboarding via README looks in a file that doesn't exist.
type: code-review
issue_id: 034
priority: p1
status: complete
tags: [code-review, documentation, stale]
---

## Problem Statement

`lib/bot.ts` was renamed to `lib/slash-command.ts` per `todos/009-complete-p3-rename-bot-ts-to-slash-command-ts.md`. Three docs still reference the old path:

1. **`README.md` lines 49, 58, 60, 98** — primary onboarding doc. Critical: someone reading "how is this code organized?" looks in a file that doesn't exist.
2. **`.v0/findings.md` lines 47, 62, 66, 75** — append-only research log. Convention is to append `> [Superseded YYYY-MM-DD]` notes when a previously-recorded fact has changed; these references lack the note.
3. **`.v0/findings.md:174`** — references `getRecentMessages` (now dead — see issue #048).
4. **`app/api/webhooks/discord/route.ts:9-12`** — claims the endpoint "is also designed to receive forwarded Gateway events" — that approach was abandoned when PR #003 introduced the Railway worker.
5. **`prompts/02-discord-bot.md:52`** — historical artifact (the original v0 chat seed). Probably leave; it's a snapshot of the prompt that produced the original code, not docs about the current code.

## Findings

- `/Users/sarahlewis/Code/futurefolk/README.md` lines 49, 58, 60, 98
- `/Users/sarahlewis/Code/futurefolk/.v0/findings.md` lines 47, 62, 66, 75, 174
- `/Users/sarahlewis/Code/futurefolk/app/api/webhooks/discord/route.ts:9-12`

## Proposed Solutions

Sequence:

1. **README.md** — replace `lib/bot.ts` → `lib/slash-command.ts` in all 4 places.
2. **.v0/findings.md** — add `> [Superseded YYYY-MM-DD: see PR #009 — renamed to lib/slash-command.ts]` callouts under the affected entries (preserve append-only convention). Add a similar callout under line 174 for `getRecentMessages` (will be removed by issue #048).
3. **app/api/webhooks/discord/route.ts:9-12** — rewrite the comment to reflect today's reality (this endpoint serves slash command interactions only; Gateway events are handled by the Railway worker in `scripts/gateway-worker.ts`).

## Recommended Action

Do all three together. None are large.

## Technical Details

- README.md: 4 line edits.
- .v0/findings.md: 5 superseded callouts (one per stale reference).
- webhooks/discord/route.ts: ~5 line comment rewrite.

## Acceptance Criteria

- [ ] `grep -n "lib/bot\.ts" README.md` returns zero hits.
- [ ] `grep -n "lib/bot\.ts" .v0/findings.md` is OK to still have hits, but each is now annotated with a `[Superseded YYYY-MM-DD]` note nearby.
- [ ] `app/api/webhooks/discord/route.ts:9-12` describes the current behavior (slash interactions only, no Gateway forwarding).

## Work Log

**2026-05-05** — Resolved in Wave 1 PR.
- README.md: replaced 4 `lib/bot.ts` references with `lib/slash-command.ts`.
- `.v0/findings.md`: added 5 `> [Superseded 2026-05-05]` callouts (4 for the rename, 1 for the upcoming `getRecentMessages` deletion in #044).
- `app/api/webhooks/discord/route.ts`: rewrote the file-level JSDoc (lines 1-10) to describe today's reality (slash interactions only; Gateway events live in the worker).
- Left `prompts/02-discord-bot.md` untouched as a historical artifact.

## Resources

- Surfaced by: pattern-recognition-specialist (P1)
- Related: issue #048 deletes `getRecentMessages` (one of the stale references will resolve naturally).
