---
name: Document four-system debug path in `OPERATIONS.md` + production-readiness checklist
description: Three log surfaces (Vercel, Railway, `workflow inspect`) + Postgres makes "did the scheduled check-in fire correctly?" a 4-step sweep. Worth a doc section. Plus: capture the production-readiness gaps surfaced in review.
type: code-review
issue_id: 048
priority: p3
status: complete
tags: [code-review, ops, observability, documentation]
---

## Problem Statement

To answer "did user X's scheduled check-in fire correctly?" today:

1. Check `scheduled_check_ins.status` (Postgres).
2. If `sent` → look at Railway logs near `sent_at` for the DM continuation thread.
3. If `failed` → look at Vercel Workflow logs (`npx workflow inspect run <id>`).
4. If `pending` past its date → check the workflow run via `workflow inspect`.

Four queries across three systems. No unified view.

Plus, the architecture-strategist surfaced a list of "production-readiness gaps remaining" worth capturing somewhere durable so they don't drift out of mind:

1. Reconciler for stuck workflows (overlaps with #041).
2. Cost ceilings per user (Anthropic tokens, not just message count).
3. Migration system (currently manual SQL on Neon).
4. Structured logging (currently `console.log` with string interpolation).
5. Worker alerting (Railway restarts on failure but no human page).
6. PITR backup/restore plan for `users.voice_profile` (irreplaceable user data).
7. Circuit breaker on Anthropic.
8. PII handling story (delete-my-account flow).

## Findings

- No section in `docs/OPERATIONS.md` explaining the debug path
- The architecture-strategist's gap list captured only in the review summary above (about to scroll out of context)

## Proposed Solutions

Add two sections to `docs/OPERATIONS.md`:

### Debug runbook section

```md
## Debugging scheduled check-ins

To answer "did user X's scheduled check-in fire correctly?":

1. **Postgres**: `SELECT * FROM scheduled_check_ins WHERE discord_user_id = '...' ORDER BY scheduled_for DESC;`
2. If `status = 'sent'`: check Railway logs near `sent_at` for any DM continuation thread.
3. If `status = 'failed'`: `npx workflow inspect run <workflow_run_id>` to see the failed step.
4. If `status = 'pending'` past `scheduled_for`: workflow may have been GC'd or stuck. `npx workflow inspect run <workflow_run_id>` to confirm.
```

### Pre-launch readiness checklist

Capture the 8-item gap list as a checklist so the path to "open this to friend-testers more broadly" is clear.

## Recommended Action

Take it. ~30 lines of docs.

## Technical Details

- `/Users/sarahlewis/Code/futurefolk/docs/OPERATIONS.md`

## Acceptance Criteria

- [ ] OPERATIONS.md has a "Debugging scheduled check-ins" section.
- [ ] OPERATIONS.md has a "Pre-launch readiness gaps" section listing the 8 items.

## Work Log

**2026-05-05** — Resolved in Wave 1 PR.
- `docs/OPERATIONS.md`: added "Debugging scheduled check-ins" section (4-step Postgres → status-branch sweep) after the existing schema section.
- Added "Pre-launch readiness gaps" section at the bottom (8-item checklist: reconciler, cost ceilings, migration system, structured logging, worker alerting, PITR, Anthropic circuit breaker, PII handling).

## Resources

- Surfaced by: agent-native-reviewer (#5) + architecture-strategist (#9)
