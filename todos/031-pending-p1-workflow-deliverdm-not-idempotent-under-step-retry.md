---
name: Workflow `deliverDM` step is not idempotent under step retry — could double-DM
description: Workflow steps retry up to 3 times by default. If `deliverDM`'s POST to Discord succeeds but the step's success-record fails to land, the user gets a second DM on retry.
type: code-review
issue_id: 031
priority: p1
status: pending
tags: [code-review, scheduled-check-ins, durable-workflow, correctness]
---

## Problem Statement

`workflows/scheduled-check-in.ts:114-121` (`deliverDM`) and `workflows/scheduled-check-ins.ts:131-156` (`persistAndMarkSent`) are wrapped as `"use step"` boundaries. Workflow DevKit retries failing steps up to 3 times by default (`node_modules/workflow/docs/foundations/errors-and-retries.mdx:17`).

The shape today:

1. `deliverDM` posts to Discord.
2. `persistAndMarkSent` writes `conversation_messages` user+assistant rows AND marks the check-in `sent`.

Failure modes:

- **Discord 200 returned but step's success-record fails to land** (network blip between Vercel and the workflow durable backend, worker crash mid-write, etc.) → workflow retries `deliverDM` → user gets a second DM. Discord's `POST /channels/{id}/messages` has no native idempotency.
- **`persistAndMarkSent` fails permanently after the DM was sent** → check-in row stays `pending` and on a redeploy the workflow may re-run from the last step boundary, sending the DM a second time. Plus: `appendMessage` is not idempotent — two runs = two pairs of `conversation_messages` rows.

The workflow's existing `markCheckInSent` has a `WHERE status = 'pending'` guard (`lib/scheduled-check-ins.ts:101-107`) — that's the right primitive for idempotence, but it's currently invoked AFTER the DM send.

## Findings

- `/Users/sarahlewis/Code/futurefolk/workflows/scheduled-check-in.ts:69-85, 114-121, 131-156`
- `/Users/sarahlewis/Code/futurefolk/lib/discord-dm.ts:23-65`
- `/Users/sarahlewis/Code/futurefolk/lib/scheduled-check-ins.ts:101-107` — `markCheckInSent` already has the `WHERE status='pending'` guard
- Workflow DevKit retry semantics: `node_modules/workflow/docs/foundations/errors-and-retries.mdx:17`
- Workflow DevKit step idempotency primitive: `node_modules/workflow/docs/foundations/idempotency.mdx:24-44` — `getStepMetadata().stepId` is stable across retries

## Proposed Solutions

### Option A — Reserve-then-deliver (recommended)

Atomically flip the row to `sent` BEFORE calling Discord. The flip is the idempotence anchor:

```ts
async function reserveAndDeliver(args: {
  checkInId: number;
  discordUserId: string;
  content: string;
}): Promise<string> {
  "use step";
  const reserved = await sql`
    UPDATE scheduled_check_ins
    SET status = 'sent', sent_at = now()
    WHERE id = ${args.checkInId} AND status = 'pending'
    RETURNING id
  `;
  if (reserved.length === 0) {
    // Already sent (or cancelled) on a prior run. Skip delivery.
    throw new FatalError("already-delivered-or-cancelled");
  }
  const { channelId } = await sendDiscordDM(args.discordUserId, args.content);
  return channelId;
}
```

Then a separate best-effort step writes `conversation_messages` (it can fail without breaking idempotence — worst case the user has the DM but no DB history; next DM continuation just won't have context for the bot's last message).

Closes the cancellation race too (security finding P2-4): if `cancelScheduledCheckIn` runs between the workflow's status-check-on-wake and `reserveAndDeliver`, the conditional UPDATE returns 0 rows and we bail.

Pros: single SQL operation = atomic; reuses existing `markCheckInSent` guard pattern; fixes the cancellation race for free.
Cons: split-brain shifts (DM sent, history not persisted). Bounded — the next continuation just lacks one assistant turn in history.

### Option B — Per-stepId guard

Persist `deliverDM`'s `getStepMetadata().stepId` on the row before the fetch; check it on entry:

```ts
async function deliverDM(args) {
  "use step";
  const { stepId } = getStepMetadata();
  const claimed = await sql`
    UPDATE scheduled_check_ins
    SET deliver_step_id = ${stepId}
    WHERE id = ${args.checkInId} AND deliver_step_id IS NULL
    RETURNING id
  `;
  if (claimed.length === 0) {
    // This stepId already executed on a prior retry; return cached result.
    return /* cached channel_id from row */;
  }
  return await sendDiscordDM(args.discordUserId, args.content);
}
```

Pros: leans on the framework's stable stepId.
Cons: requires a new column (`deliver_step_id`) and stable channelId caching. More moving parts than Option A.

## Recommended Action

**Option A.** It also closes the cancellation-during-generation race (security P2-4) and uses the SQL primitive already present.

## Technical Details

- `/Users/sarahlewis/Code/futurefolk/workflows/scheduled-check-in.ts` — replace `deliverDM` + parts of `persistAndMarkSent` with `reserveAndDeliver` (claims the slot + sends), then a separate `appendConversationTurns` step that writes the user+assistant rows and is best-effort.
- `/Users/sarahlewis/Code/futurefolk/lib/scheduled-check-ins.ts` — consider adding the conditional UPDATE helper next to `markCheckInSent` for symmetry.

## Acceptance Criteria

- [ ] `deliverDM` cannot send a DM twice on retry. Verify by adding a transient `RetryableError` after the fetch returns 200 in a test branch — the second attempt should bail without re-sending.
- [ ] If `cancelScheduledCheckIn` runs between status check and delivery, no DM is sent. Verify by integration test using `@workflow/vitest`.
- [ ] If `appendConversationTurns` fails after delivery, the check-in row is still `sent` and the workflow does not retry the DM.

## Work Log

(none yet)

## Resources

- Surfaced by: architecture-strategist (P1 #1) + security-sentinel (P2-3, P2-4)
- Workflow DevKit docs: `node_modules/workflow/docs/foundations/idempotency.mdx`, `node_modules/workflow/docs/foundations/errors-and-retries.mdx`
