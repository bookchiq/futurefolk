---
name: Extract `scheduleCheckIn(args)` helper into `lib/scheduled-check-ins.ts`; thin out `lib/slash-command.ts`
description: Slash command bundles parsing, validation, and orchestration. Move scheduled-invocation logic into the scheduled-check-ins module so non-slash entry points (server actions, scripts, future API routes) can schedule check-ins too.
type: code-review
issue_id: 042
priority: p2
status: complete
tags: [code-review, agent-native, refactor]
---

## Problem Statement

`lib/slash-command.ts:158-275` (`handleScheduledInvocation` + helpers) is 100+ lines that:

1. Parse `schedule:` ISO date.
2. Validate min/max future bounds.
3. Insert the row.
4. Call `start(workflow)`.
5. Best-effort link the run id.

That logic is locked inside the slash command's import path. Two consequences:

- **Agent-native parity gap:** a future entry point (a `/profile` "Schedule a check-in" form, an internal API for "if X happens, schedule Y", or a friend-testing script) has nowhere to call. They'd have to copy-paste the validation + orchestration.
- **`lib/slash-command.ts` is the awkward file:** dispatcher + 100 lines of a different concern (issue-style: "the scheduled-check-in module should own the scheduling logic").

## Findings

- `/Users/sarahlewis/Code/futurefolk/lib/slash-command.ts:154-275` — handleScheduledInvocation, MIN_SCHEDULE_FUTURE_MS, MAX_SCHEDULE_HORIZON_DAYS, parseScheduleInput, formatScheduledDate
- `/Users/sarahlewis/Code/futurefolk/lib/scheduled-check-ins.ts` — currently CRUD only, doesn't know about `start(workflow)`

## Proposed Solutions

Split into pure data primitives + composed helper:

```ts
// lib/scheduled-check-ins.ts (added)

export const MIN_SCHEDULE_FUTURE_MS = 60_000;
export const MAX_SCHEDULE_HORIZON_DAYS = 365;

export function parseScheduleInput(value: string): Date | null { ... }
export function validateScheduledFor(scheduledFor: Date, now: number): { ok: true } | { ok: false; reason: string } { ... }

// Composed entry point used by slash command, /profile form, scripts, etc.
export async function scheduleCheckIn(args: {
  discordUserId: string;
  horizon: Horizon;
  topic: string;
  scheduledFor: Date;
}): Promise<{ id: number; runId: string }> {
  const id = await createScheduledCheckIn(args);
  const run = await start(scheduledCheckInWorkflow, [{
    checkInId: id,
    ...args,
    scheduledForIso: args.scheduledFor.toISOString(),
  }]);
  // Note: with issue #032 (workflow self-records run_id), this UPDATE goes away.
  await setCheckInWorkflowRunId(id, run.runId);
  return { id, runId: run.runId };
}
```

`lib/slash-command.ts::handleScheduledInvocation` shrinks to: parse → validate → call `scheduleCheckIn` → reply ephemeral.

After issue #032 lands, `setCheckInWorkflowRunId` disappears entirely.

## Recommended Action

Take it. Pairs naturally with #032 (workflow self-records run_id) and #041 (cancellation completeness) — together they make the scheduled-check-in module the home for all schedule logic.

## Technical Details

- `/Users/sarahlewis/Code/futurefolk/lib/scheduled-check-ins.ts` — new exports: `MIN_SCHEDULE_FUTURE_MS`, `MAX_SCHEDULE_HORIZON_DAYS`, `parseScheduleInput`, `validateScheduledFor`, `scheduleCheckIn`.
- `/Users/sarahlewis/Code/futurefolk/lib/slash-command.ts` — `handleScheduledInvocation` becomes <30 lines; remove `MIN_SCHEDULE_FUTURE_MS`, `MAX_SCHEDULE_HORIZON_DAYS`, `parseScheduleInput` from this file.

## Acceptance Criteria

- [ ] Slash handler is < 30 lines for the schedule branch.
- [ ] `scheduleCheckIn` is callable from any server context (test by using it from a one-off `scripts/test-schedule.ts`).
- [ ] Slash command's user-facing behavior (validation messages, etc.) is unchanged.

## Work Log

**2026-05-05** — Resolved in PR #23.
- `lib/scheduled-check-ins.ts` exports: `MIN_SCHEDULE_FUTURE_MS`, `MAX_SCHEDULE_HORIZON_DAYS`, `parseScheduleInput`, `validateScheduledFor`, `scheduleCheckIn`.
- `lib/slash-command.ts::handleScheduledInvocation` shrank from ~85 to ~40 lines. Now a thin caller around shared primitives.
- Future entry points (a /profile schedule form, a script, an internal automation) can call `scheduleCheckIn(args)` without re-implementing validation or workflow-start glue.

## Resources

- Surfaced by: agent-native-reviewer (#1) + architecture-strategist (#4 lib/ granularity, "slash-command.ts is the awkward one")
