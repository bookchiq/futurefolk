---
name: Cosmetic cleanup bundle (rotted comments, redundant hints, noise logs)
description: Five small cleanup items surfaced across the simplicity + pattern-recognition reviews. Bundle into one PR if touching nearby code.
type: code-review
issue_id: 049
priority: p3
status: complete
tags: [code-review, cleanup, low-priority]
---

## Problem Statement

Small items, none worth a separate todo, but worth bundling:

### 49a. `lib/voice-profile.ts:91-93` rotted refactor comment

Comment narrates the refactor that moved `splitSampleMessages` to its own file. The function is gone from this file; the back-reference is a refactor scar. Delete (~3 LOC).

### 49b. `lib/slash-command.ts:46` module-load log

```ts
console.log(`[Futurefolk] slash-command module loaded (version=${VERSION})`);
```

Fires once per cold start. Comment says "so deploy drift is visible." But the worker version log already serves drift detection (see `docs/OPERATIONS.md:38-41`), and this log only fires AFTER a slash command lands. Marginal value. Delete or keep — judgment call.

### 49c. `app/profile/edit-form.tsx:170-185` two redundant "sample messages changed" hints

One pre-save (warns "voice features will rebuild if you save"), one post-save ("voice features will rebuild"). Pick one — the pre-save one is more useful.

### 49d. `app/profile/actions.ts:72-78` success log + try/catch around `clearDerivedVoiceFields`

```ts
console.log("[Futurefolk] saveProfileEdit: cleared derived voice fields", ...);
```

Fires on every save where `sampleMessagesChanged`. Tells you nothing actionable. Drop. The surrounding try/catch can probably also go (if `saveUserProfile` succeeded, this UPDATE is unlikely to fail in isolation), but conservative thing is to keep the try/catch and just drop the success log.

### 49e. Workflow comment about persist-after-deliver ordering

`workflows/scheduled-check-in.ts::persistAndMarkSent` runs AFTER `deliverDM` — different ordering from the live (slash + worker DM) paths which persist user-turn BEFORE generation. Add a one-line comment in `persistAndMarkSent` explaining why ordering differs (the "user turn" is the synthetic topic, not a real DM).

Note: this becomes obsolete if #031 lands (which restructures the workflow).

## Findings

- `/Users/sarahlewis/Code/futurefolk/lib/voice-profile.ts:91-93`
- `/Users/sarahlewis/Code/futurefolk/lib/slash-command.ts:46`
- `/Users/sarahlewis/Code/futurefolk/app/profile/edit-form.tsx:170-185`
- `/Users/sarahlewis/Code/futurefolk/app/profile/actions.ts:72-88`
- `/Users/sarahlewis/Code/futurefolk/workflows/scheduled-check-in.ts:131-156`

## Proposed Solutions

One sweep PR. Each is 1-10 LOC.

## Recommended Action

Take if touching nearby files for another reason. Otherwise leave for a quiet day.

## Technical Details

See file paths above.

## Acceptance Criteria

- [ ] Rotted comment in voice-profile.ts removed.
- [ ] One sample-messages-changed hint instead of two on profile editor.
- [ ] No success log on `clearDerivedVoiceFields`.

## Work Log

**2026-05-05** — Resolved in PR #23 (partial).
- 49a: deleted rotted refactor comment in `lib/voice-profile.ts:91-93`.
- 49c: removed the redundant post-save sample-messages-changed hint in `app/profile/edit-form.tsx`. Pre-save warning kept.
- 49d: removed the success log on `clearDerivedVoiceFields` in `app/profile/actions.ts`. Try/catch kept.
- Skipped (judgment calls): 49b (module-load log) — kept; weak-but-real signal for deploy drift. 49e (workflow ordering comment) — obsoleted by #031's restructure.

## Resources

- Surfaced by: simplicity-reviewer (#7, #11, #16, #22) + pattern-recognition-specialist (P3 timing-comment)
