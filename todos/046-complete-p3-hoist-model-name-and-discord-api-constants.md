---
name: Hoist `MODEL_NAME` and `DISCORD_API` constants
description: claude-sonnet-4-6 literal in 3 files, https://discord.com/api/v10 in 2 files. Hoist to single constants for one-place-to-update.
type: code-review
issue_id: 046
priority: p3
status: complete
tags: [code-review, cleanup]
---

## Problem Statement

### 46a. `claude-sonnet-4-6` repeated

- `lib/future-self.ts:41`
- `lib/style-features.ts:105`
- `lib/few-shot-pairs.ts:96`

When Claude 4.7 ships, three edits in three files is silly.

### 46b. `https://discord.com/api/v10` repeated

- `lib/discord-dm.ts:14` — `const DISCORD_API = "https://discord.com/api/v10"` (already a const, just local)
- `scripts/register-commands.ts:92-93` — inline twice

`register-commands.ts` runs at deploy time only, so cosmetic. But still.

## Findings

3 files for 46a, 2 for 46b.

## Proposed Solutions

### 46a

Add `MODEL_NAME` to `lib/future-self.ts` as the canonical export:

```ts
export const MODEL_NAME = "claude-sonnet-4-6";
```

Import from the other two files. Or — given all three files use the AI SDK — add to a small `lib/ai-config.ts` if you'd rather not couple `style-features.ts` to `future-self.ts`.

### 46b

Either add to a tiny `lib/constants.ts` (`DISCORD_API`), or accept the duplication since `register-commands.ts` is a CLI script that doesn't share runtime with the rest.

## Recommended Action

Take 46a. Skip 46b unless touching `register-commands.ts` for another reason.

## Technical Details

- `/Users/sarahlewis/Code/futurefolk/lib/future-self.ts:41` — export `MODEL_NAME`
- `/Users/sarahlewis/Code/futurefolk/lib/style-features.ts:105`, `/Users/sarahlewis/Code/futurefolk/lib/few-shot-pairs.ts:96` — import

## Acceptance Criteria

- [ ] `grep -rn "claude-sonnet-4-6" lib/` returns one hit (the const declaration).

## Work Log

**2026-05-05** — Resolved sub-item 46a in Wave 1 PR.
- `MODEL_NAME = "claude-sonnet-4-6"` exported from `lib/future-self.ts`.
- `lib/style-features.ts` and `lib/few-shot-pairs.ts` import + use it.
- `grep -rn "claude-sonnet-4-6" lib/` returns 1 hit (the const declaration).
- Sub-item 46b (DISCORD_API duplication) skipped — register-commands.ts is a CLI script and the duplication is acceptable.

## Resources

- Surfaced by: pattern-recognition-specialist (P3 — magic strings)
