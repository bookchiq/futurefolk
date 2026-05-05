/**
 * Scheduled check-in CRUD.
 *
 * One row per pending/sent/cancelled check-in. The workflow run ID is
 * stored alongside so the editor (or admin) can cancel a pending check-in
 * via `getRun(workflow_run_id).cancel()`.
 *
 * Schema lives in `docs/OPERATIONS.md`. Apply manually on Neon when this
 * lands; there's no migration system in this repo.
 */

import { sql } from "./db";
import type { Horizon } from "./voice-profile";

export type CheckInStatus = "pending" | "sent" | "cancelled" | "failed";

export interface ScheduledCheckIn {
  id: number;
  discordUserId: string;
  horizon: Horizon;
  topic: string;
  scheduledFor: Date;
  workflowRunId: string | null;
  status: CheckInStatus;
  createdAt: Date;
  sentAt: Date | null;
}

interface CheckInRow {
  id: number;
  discord_user_id: string;
  horizon: Horizon;
  topic: string;
  scheduled_for: string | Date;
  workflow_run_id: string | null;
  status: CheckInStatus;
  created_at: string | Date;
  sent_at: string | Date | null;
}

function rowToCheckIn(row: CheckInRow): ScheduledCheckIn {
  return {
    id: row.id,
    discordUserId: row.discord_user_id,
    horizon: row.horizon,
    topic: row.topic,
    scheduledFor: new Date(row.scheduled_for),
    workflowRunId: row.workflow_run_id,
    status: row.status,
    createdAt: new Date(row.created_at),
    sentAt: row.sent_at ? new Date(row.sent_at) : null,
  };
}

/** Insert a new pending check-in row. Returns the new id. */
export async function createScheduledCheckIn(args: {
  discordUserId: string;
  horizon: Horizon;
  topic: string;
  scheduledFor: Date;
}): Promise<number> {
  const rows = (await sql`
    INSERT INTO scheduled_check_ins (
      discord_user_id, horizon, topic, scheduled_for, status
    )
    VALUES (
      ${args.discordUserId},
      ${args.horizon},
      ${args.topic},
      ${args.scheduledFor.toISOString()},
      'pending'
    )
    RETURNING id
  `) as Array<{ id: number }>;
  return rows[0].id;
}

/**
 * Attach a workflow run id to a row.
 *
 * Called by the workflow itself in its first step (`recordRunId`), not by
 * the slash command — this avoids the race where the slash command's
 * UPDATE hadn't landed by the time the workflow wakes (issue #032).
 *
 * Idempotent: only writes if `workflow_run_id IS NULL`. A step retry
 * writes the same value back (no-op); a stray re-call from anywhere else
 * can't clobber the original.
 */
export async function setCheckInWorkflowRunId(
  id: number,
  workflowRunId: string
): Promise<void> {
  await sql`
    UPDATE scheduled_check_ins
    SET workflow_run_id = ${workflowRunId}
    WHERE id = ${id} AND workflow_run_id IS NULL
  `;
}

/** Look up a check-in's current status. Used by the workflow on wake to skip cancelled rows. */
export async function getCheckInStatus(
  id: number
): Promise<CheckInStatus | null> {
  const rows = (await sql`
    SELECT status FROM scheduled_check_ins WHERE id = ${id} LIMIT 1
  `) as Array<{ status: CheckInStatus }>;
  return rows[0]?.status ?? null;
}

/** Mark a check-in as sent. Sets sent_at to now(). */
export async function markCheckInSent(id: number): Promise<void> {
  await sql`
    UPDATE scheduled_check_ins
    SET status = 'sent', sent_at = now()
    WHERE id = ${id} AND status = 'pending'
  `;
}

/** Mark a check-in as failed. Used by the workflow on terminal errors. */
export async function markCheckInFailed(id: number): Promise<void> {
  await sql`
    UPDATE scheduled_check_ins
    SET status = 'failed'
    WHERE id = ${id} AND status = 'pending'
  `;
}

/**
 * Cancel a pending check-in for the given user. Returns the
 * `workflow_run_id` if any (so the caller can call `getRun(id).cancel()`),
 * or null if no matching pending row exists. Idempotent: marks the row
 * cancelled regardless of whether the workflow itself succeeds in
 * cancelling.
 */
export async function cancelScheduledCheckIn(args: {
  id: number;
  discordUserId: string;
}): Promise<string | null> {
  const rows = (await sql`
    UPDATE scheduled_check_ins
    SET status = 'cancelled'
    WHERE id = ${args.id}
      AND discord_user_id = ${args.discordUserId}
      AND status = 'pending'
    RETURNING workflow_run_id
  `) as Array<{ workflow_run_id: string | null }>;
  return rows[0]?.workflow_run_id ?? null;
}

/** List a user's check-ins, newest scheduled first. Used by the (future) /profile section. */
export async function listScheduledCheckIns(
  discordUserId: string,
  limit = 50
): Promise<ScheduledCheckIn[]> {
  const rows = (await sql`
    SELECT id, discord_user_id, horizon, topic, scheduled_for,
           workflow_run_id, status, created_at, sent_at
    FROM scheduled_check_ins
    WHERE discord_user_id = ${discordUserId}
    ORDER BY scheduled_for DESC, id DESC
    LIMIT ${limit}
  `) as CheckInRow[];
  return rows.map(rowToCheckIn);
}
