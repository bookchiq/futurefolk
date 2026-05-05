---
name: `setCheckInWorkflowRunId` race makes workflow→DB linking unreliable
description: Slash command does start(workflow) THEN UPDATE workflow_run_id. If the workflow wakes before the UPDATE lands, the run_id is written into a row whose run is already complete (or cancelled).
type: code-review
issue_id: 032
priority: p1
status: pending
tags: [code-review, scheduled-check-ins, race-condition]
---

## Problem Statement

`lib/slash-command.ts:214-235` executes:

1. `start(scheduledCheckInWorkflow, [args])` — workflow begins running, sleeps until `scheduled_for`.
2. `setCheckInWorkflowRunId(checkInId, run.runId)` — UPDATE row with the run id.

If the workflow happens to wake before step 2 lands (clock skew, very-near-future schedules under load, transient DB latency on the UPDATE), the workflow can read `getCheckInStatus(checkInId)` returning `'pending'` (correct), run to completion, and `markCheckInSent` flips the row to `'sent'` — and step 2 then writes `workflow_run_id` into a `'sent'` row.

Cosmetic today, but the cancellation UI (PLAN P8 deferred sub-item) will hit it: the user clicks cancel on a row whose workflow is already on its way to running, and either:
- The UPDATE clobbers a stale `run_id`, OR
- The `getRun(stale_id).cancel()` is called on a run that's already finished.

## Findings

- `/Users/sarahlewis/Code/futurefolk/lib/slash-command.ts:214-235`
- `/Users/sarahlewis/Code/futurefolk/lib/scheduled-check-ins.ts:79-88` — `setCheckInWorkflowRunId` is the only writer

## Proposed Solutions

### Option A — Workflow self-records run_id on first step (recommended)

Pass `checkInId` to `start(...)` as already done. Inside `scheduledCheckInWorkflow`, the very first `"use step"` reads its own `runId` via `getWorkflowMetadata()` and writes it back to the row. Then the slash command no longer needs `setCheckInWorkflowRunId` at all.

```ts
// workflows/scheduled-check-in.ts
import { getWorkflowMetadata } from "workflow";

export async function scheduledCheckInWorkflow(args: ScheduledCheckInArgs) {
  "use workflow";
  await recordRunId(args.checkInId);
  await sleep(new Date(args.scheduledForIso));
  // ...
}

async function recordRunId(checkInId: number): Promise<void> {
  "use step";
  const { runId } = getWorkflowMetadata();
  await setCheckInWorkflowRunId(checkInId, runId);
}
```

Pros: no race possible — the row's run_id is owned by the same process that owns the run.
Cons: the row briefly has `workflow_run_id = NULL` between INSERT and the workflow's first step (typically <1s). If a cancel attempt arrives in that window, it can't kill the run, only mark the row cancelled — but the workflow's `checkStillPending` on wake will honor that anyway.

### Option B — Two-phase: insert pending, write run_id, then start

Insert the row with run_id NULL. Reserve a UUID-token. Start the workflow with the token. Workflow checks the token matches before proceeding. Slash command UPDATEs run_id and waits for the token-check to succeed before responding to the user.

Pros: keeps the slash command authoritative.
Cons: more moving parts. Token round-trip adds latency.

## Recommended Action

**Option A.** Cleanest separation of concerns and removes a footgun.

## Technical Details

- `/Users/sarahlewis/Code/futurefolk/workflows/scheduled-check-in.ts` — add a `recordRunId` step at the top of the workflow.
- `/Users/sarahlewis/Code/futurefolk/lib/slash-command.ts:214-235` — drop the inner try/catch around `setCheckInWorkflowRunId`; the workflow now owns it.

## Acceptance Criteria

- [ ] Slash command no longer calls `setCheckInWorkflowRunId`.
- [ ] Workflow's first step writes `workflow_run_id` to the row.
- [ ] An integration test (using `@workflow/vitest`) verifies `workflow_run_id` is set within ~1s of `start()` returning.

## Work Log

(none yet)

## Resources

- Surfaced by: architecture-strategist (P1 #2)
- Workflow DevKit metadata: `node_modules/workflow/docs/api-reference/workflow/get-workflow-metadata.mdx`
