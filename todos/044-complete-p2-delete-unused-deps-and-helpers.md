---
name: Delete unused exports and dependencies (cn, getRecentMessages, clsx, tailwind-merge, cva, saveUserProfile peek)
description: Round of dead-code cleanup surfaced by multiple reviewers. ~70 LOC reduction; one fewer module + 3 unused npm deps removed.
type: code-review
issue_id: 044
priority: p2
status: complete
tags: [code-review, cleanup, dead-code]
---

## Problem Statement

Several dead exports + unused npm deps:

### 44a. `lib/utils.ts::cn` — zero importers
v0 scaffolding. Confirmed by grep — nothing imports `cn` from `lib/utils.ts`. Ship the file deletion + remove `clsx` (`^2.1.1`) and `tailwind-merge` (`^3.5.0`) from `package.json`.

### 44b. `class-variance-authority` — zero importers
Listed in `package.json:27`, no imports anywhere. Remove dependency.

### 44c. `lib/conversation.ts::getRecentMessages` — wrapper with no callers
Only `getRecentMessagesAndHorizon` is called; `getRecentMessages` was kept "for compatibility" but nothing references it. Delete (~7 LOC).

### 44d. `lib/voice-profile.ts::saveUserProfile` peek-and-warn block
`lib/voice-profile.ts:255-267` does a SELECT before the upsert to log a "voice profile is being overwritten" warning. The comment says "until the /profile page (P6) lets us surface a UI confirmation." The /profile page exists now, and the warning fires on every save (the new normal flow), generating noise that no longer indicates the unusual case the comment described. Delete the peek + the warn (~14 LOC).

## Findings

- `/Users/sarahlewis/Code/futurefolk/lib/utils.ts` — file contains only `cn`
- `/Users/sarahlewis/Code/futurefolk/package.json:27` — `class-variance-authority`, `clsx`, `tailwind-merge`
- `/Users/sarahlewis/Code/futurefolk/lib/conversation.ts:46-52` — `getRecentMessages`
- `/Users/sarahlewis/Code/futurefolk/lib/voice-profile.ts:245-267` — peek + warn

## Proposed Solutions

Single sweep PR:

1. Delete `lib/utils.ts`. Verify no imports first (`rg "from .*lib/utils"`).
2. Remove `clsx`, `tailwind-merge`, `class-variance-authority` from `package.json` deps. Run `pnpm install`.
3. Delete `getRecentMessages` from `lib/conversation.ts:46-52`. Update `.v0/findings.md:174` callout (already noted in #034).
4. Delete `lib/voice-profile.ts:245-267` peek+warn block. Keep the upsert.

Note: simplicity-reviewer also flagged deleting `cancelScheduledCheckIn`/`listScheduledCheckIns`. That conflicts with #041's "ship the cancel surface" recommendation — handled in #041 separately. Do NOT delete those here.

## Recommended Action

Take all four. Do as one sweep PR.

## Technical Details

- `/Users/sarahlewis/Code/futurefolk/lib/utils.ts` — delete file
- `/Users/sarahlewis/Code/futurefolk/package.json` — remove 3 deps
- `/Users/sarahlewis/Code/futurefolk/lib/conversation.ts:46-52`
- `/Users/sarahlewis/Code/futurefolk/lib/voice-profile.ts:245-267`

## Acceptance Criteria

- [ ] `pnpm typecheck` clean after all four deletions.
- [ ] `lib/utils.ts` no longer exists.
- [ ] `clsx`, `tailwind-merge`, `class-variance-authority` no longer in `package.json`.
- [ ] No `[Futurefolk] saveUserProfile: voice profile is being overwritten` log lines on profile save.

## Work Log

**2026-05-05** — Resolved in Wave 1 PR.
- Deleted `lib/utils.ts` (the `cn` helper had zero importers).
- Removed `clsx`, `tailwind-merge`, `class-variance-authority` from `package.json`; regenerated `pnpm-lock.yaml`.
- Removed `getRecentMessages` from `lib/conversation.ts`. Only `getRecentMessagesAndHorizon` remains.
- Removed the `saveUserProfile` peek-and-warn block (the comment justifying it as "until /profile lets us surface a UI confirmation" — /profile exists now).
- Incidental: updated a stale doc-comment reference in `lib/voice.ts:374` from `getRecentMessages` to `getRecentMessagesAndHorizon` to keep the docstring consistent. Comment-only.
- Typecheck clean.

## Resources

- Surfaced by: pattern-recognition-specialist (P2 #9 — dead code) + simplicity-reviewer (#7, P2 list)
