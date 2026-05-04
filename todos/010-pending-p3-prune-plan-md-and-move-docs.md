---
name: Prune PLAN.md to checklist; move PLAN.md and STRATEGY-REVIEW.md to docs/
description: PLAN.md duplicates STRATEGY-REVIEW.md prose with checkboxes. Trim to checklist; move both out of repo root.
type: code-review
issue_id: 010
priority: p3
status: pending
tags: [code-review, documentation, simplicity]
---

## Problem Statement

`PLAN.md` (162 lines) and `STRATEGY-REVIEW.md` (130 lines) live at the repo root. PLAN.md duplicates ~80% of STRATEGY-REVIEW.md with checkbox markers, plus a "What we are NOT doing" section that duplicates `.v0/instructions.md`.

STRATEGY-REVIEW.md will rot — section 2's "ChatSDK does about half its job" table is timestamped to a specific commit but nothing in the doc says so.

## Findings

- `/Users/sarahlewis/Code/futurefolk/PLAN.md` — checklist + prose
- `/Users/sarahlewis/Code/futurefolk/STRATEGY-REVIEW.md` — rationale doc, undated

## Proposed Solutions

### A: prune PLAN.md to checklist-only
Drop the prose under each section header, keep only checklist + brief one-liner. Anyone who needs the *why* clicks through to STRATEGY-REVIEW.md. PLAN.md becomes a true backlog, not a narrative.

### B: move both to docs/
- `docs/PLAN.md` — actively-maintained backlog
- `docs/STRATEGY-REVIEW.md` — snapshot, with header noting "Snapshot from 2026-05-03 (commit SHA: <X>). May be stale; verify against current code."

### C: consolidate to a single file
STRATEGY-REVIEW.md becomes the doc, with `[x]/[ ]` markers inline. Rejected — mixes prose with tracking, harder to scan.

### D: also move "What we are NOT doing" out of PLAN.md
Either delete (it's restating `.v0/instructions.md`) or keep as a single sentence linking to `.v0/instructions.md`'s scope discipline section.

## Recommended Action

A + B + D together. ~40-line PLAN.md, dated STRATEGY-REVIEW.md, both in `docs/`.

## Technical Details

Affected files:
- `/Users/sarahlewis/Code/futurefolk/PLAN.md` → `/Users/sarahlewis/Code/futurefolk/docs/PLAN.md` (pruned)
- `/Users/sarahlewis/Code/futurefolk/STRATEGY-REVIEW.md` → `/Users/sarahlewis/Code/futurefolk/docs/STRATEGY-REVIEW.md` (with date header)

## Acceptance Criteria

- [ ] PLAN.md is ≤ 60 lines, checklist + one-liner per item.
- [ ] STRATEGY-REVIEW.md has a date + commit SHA header.
- [ ] Both live in `docs/`.
- [ ] References elsewhere in the repo (if any) updated.

## Work Log

(none yet)

## Resources

- Surfaced by: code-simplicity-reviewer (P2 docs prune) + architecture-strategist (P3 doc location).
