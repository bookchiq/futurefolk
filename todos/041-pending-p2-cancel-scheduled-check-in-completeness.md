---
name: Cancellation completeness — wrap getRun().cancel() inside helper, ship UI or delete dead exports, add reconciler
description: cancelScheduledCheckIn returns the workflow_run_id but doesn't actually cancel the workflow. UI doesn't exist yet. Decide: ship the /profile section + scripts/cancel.ts, or delete the dead helpers and the workflow_run_id column's only use case.
type: code-review
issue_id: 041
priority: p2
status: pending
tags: [code-review, scheduled-check-ins, agent-native, cleanup]
---

## Problem Statement

The cancellation story is half-built:

1. `lib/scheduled-check-ins.ts:125-138` — `cancelScheduledCheckIn(checkInId, discordUserId)` UPDATEs the row to `'cancelled'` and returns the `workflow_run_id`. The caller is expected to ALSO call `getRun(runId).cancel()` — but no caller exists.
2. `lib/scheduled-check-ins.ts:141-154` — `listScheduledCheckIns(discordUserId)` exists for "the (future) /profile section." No caller.
3. `lib/slash-command.ts:214-235` — best-effort writes `workflow_run_id` to the row "so /profile can cancel it later." Workflow_run_id has no consumer today.
4. The workflow re-checks `getCheckInStatus` on wake (`workflows/scheduled-check-in.ts:55-58`), so a row marked `'cancelled'` will not deliver a DM — but the workflow is still alive, sleeping in durable storage, costing nothing but lying around as a zombie until its `scheduled_for` passes.

When the cancel UI lands, the call sequence will be:
- UPDATE row to `'cancelled'` (step 1).
- Call `getRun(runId).cancel()` (step 2).

Failure modes:
- Step 1 succeeds, step 2 fails → workflow wakes, `checkStillPending` returns `'cancelled'`, returns `{status: "skipped"}`. **Safe.** Already handled.
- Step 1 fails, step 2 succeeds → row stays `pending`, workflow killed, UI lies. **Not handled.** Reconciler needed.
- Step 1 partial → row state unknown. Caller retries; idempotent due to `WHERE status='pending'`. Safe.

## Findings

- `/Users/sarahlewis/Code/futurefolk/lib/scheduled-check-ins.ts:125-138, 141-154`
- `/Users/sarahlewis/Code/futurefolk/lib/slash-command.ts:228-234` — comment promises "/profile cancel later"
- `/Users/sarahlewis/Code/futurefolk/workflows/scheduled-check-in.ts:55-58` — already honors cancellation

## Proposed Solutions

### Step 1 (always do this) — Wrap the workflow cancel inside the helper

```ts
import { getRun } from "workflow/api";

export async function cancelScheduledCheckIn(args: {
  id: number;
  discordUserId: string;
}): Promise<{ cancelled: boolean }> {
  const updated = await sql`
    UPDATE scheduled_check_ins
    SET status = 'cancelled'
    WHERE id = ${args.id}
      AND discord_user_id = ${args.discordUserId}
      AND status = 'pending'
    RETURNING workflow_run_id
  `;
  if (updated.length === 0) return { cancelled: false };
  const runId = updated[0].workflow_run_id;
  if (runId) {
    try {
      await getRun(runId).cancel();
    } catch (err) {
      console.error("[Futurefolk] cancelScheduledCheckIn: getRun.cancel failed", err);
      // Row is already 'cancelled' — workflow's own checkStillPending will honor it.
    }
  }
  return { cancelled: true };
}
```

Single composed primitive. Future callers can't forget step 2.

### Step 2 — Pick a path: ship a caller OR delete the dead helpers

**Path A: Ship the cancel surface (recommended).**
- Add a `/profile` section listing pending check-ins with cancel buttons. Server action calls `cancelScheduledCheckIn`.
- OR (faster) add `scripts/cancel-check-in.ts` — `pnpm tsx scripts/cancel-check-in.ts <id>` — to give Sarah and friend-testers an out.

**Path B: Delete dead code.**
- Drop `cancelScheduledCheckIn`, `listScheduledCheckIns`, `ScheduledCheckIn` interface, `CheckInRow`, `rowToCheckIn`. ~50 LOC.
- Drop `setCheckInWorkflowRunId` and the column itself (becomes unused).
- Drop the inner try/catch in `lib/slash-command.ts:228-234`.
- Re-add when the cancel feature is actually being built.

### Step 3 — Add a reconciler (whichever path is taken)

For the "step 2 succeeded but step 1 failed" case: a periodic job that scans `pending` rows and probes `getRun(workflow_run_id).status` — if the run is `'cancelled'` or `'failed'` and the row is still `'pending'`, reconcile.

Cheap form: a Vercel cron (`/api/cron/reconcile-check-ins`) that runs every hour. Only matters once the cancel surface ships, so do this with Path A.

## Recommended Action

**Path A.** Ship `scripts/cancel-check-in.ts` immediately (an admin escape hatch even before the /profile UI), wrap `cancelScheduledCheckIn` to compose both steps, defer the reconciler until the UI lands.

If you don't expect to ship the cancel UI within the next two weeks, prefer Path B — uncalled exports rot fast.

## Technical Details

- `/Users/sarahlewis/Code/futurefolk/lib/scheduled-check-ins.ts:125-138` — wrap `getRun().cancel()` inside.
- `/Users/sarahlewis/Code/futurefolk/scripts/cancel-check-in.ts` (new) — admin script.
- `/Users/sarahlewis/Code/futurefolk/app/profile/...` (new) — pending-check-ins section + cancel button.

## Acceptance Criteria

- [ ] `cancelScheduledCheckIn` calls `getRun().cancel()` itself; callers don't have to remember.
- [ ] Either a `/profile` cancel button OR `scripts/cancel-check-in.ts` exists.
- [ ] Cancelling between status check and DM delivery in the workflow does not result in a delivered DM (this overlaps with #031's fix).

## Work Log

(none yet)

## Resources

- Surfaced by: agent-native-reviewer (#2) + architecture-strategist (#5) + simplicity-reviewer (#1, conflicting recommendation: delete; needs Sarah's call)
- Coordinates with: #031 (workflow idempotence — fixes the cancel-during-generation race)
