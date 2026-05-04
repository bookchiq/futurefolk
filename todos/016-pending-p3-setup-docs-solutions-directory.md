---
name: Set up docs/solutions/ for institutional learnings
description: Compound-engineering pipeline expects docs/solutions/ for tracked learnings. Doesn't exist yet. Worth setting up if Sarah keeps using the workflow.
type: code-review
issue_id: 016
priority: p3
status: pending
tags: [code-review, documentation, process]
---

## Problem Statement

The compound-engineering review pipeline (`/compound-wordpress-engineering:workflows:review`) searches `docs/solutions/` for past institutional learnings. The directory doesn't exist in this repo. The learnings-researcher agent flagged this and recommended setting it up if Sarah plans to use the workflow regularly.

## Findings

- No `/Users/sarahlewis/Code/futurefolk/docs/solutions/` directory.
- `.v0/findings.md` is the closest equivalent — append-only learnings doc — but it's tied to v0/agent guidance specifically, not general engineering learnings.

## Proposed Solutions

### 16a: create docs/solutions/ scaffolded
- `docs/solutions/README.md` explaining the convention.
- Migrate any genuinely institutional learnings from this PR's review (e.g., "ChatSDK Thread.id is the encoded form, not the raw channel id"; "AI Gateway requires a credit card on file" — already in PR #8 context) into individual solution files.

### 16b: skip
The project may not benefit from a separate docs/solutions/ if `.v0/findings.md` already serves the same purpose for the parts of the codebase agents work on.

## Recommended Action

16b for now. The findings.md doc is doing the work. Revisit if the project grows and findings.md becomes too long to scan.

## Technical Details

If pursued: `docs/solutions/{topic}.md` with frontmatter including dates, tags, and a one-sentence problem + solution summary.

## Acceptance Criteria

- [ ] Decision recorded in PLAN.md or AGENTS.md: either "we use docs/solutions/" with a setup or "we use .v0/findings.md instead."

## Work Log

(none yet)

## Resources

- Surfaced by: learnings-researcher agent.
