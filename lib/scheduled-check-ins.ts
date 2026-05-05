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

import { start } from "workflow/api";

import { scheduledCheckInWorkflow } from "@/workflows/scheduled-check-in";
import { sql } from "./db";
import type { Horizon } from "./voice-profile";

// === Schedule input parsing + validation ===

/** Minimum lead time for a scheduled check-in. */
export const MIN_SCHEDULE_FUTURE_MS = 60_000;

/** Maximum future date for a scheduled check-in. */
export const MAX_SCHEDULE_HORIZON_DAYS = 365;

/**
 * Parse a slash-command `schedule:` value into a Date.
 *
 * Accepts:
 *   - Bare YYYY-MM-DD (interpreted as midnight UTC, the user's
 *     expected "morning of that day" semantics in most time zones —
 *     the alternative is to pin to local time, but slash commands have
 *     no tz info on the server).
 *   - Full ISO 8601 timestamp (e.g. `2026-11-02T15:00:00Z`).
 *
 * Returns null if the value is empty or unparseable.
 */
export function parseScheduleInput(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const isoDateOnly = /^\d{4}-\d{2}-\d{2}$/;
  const candidate = isoDateOnly.test(trimmed) ? `${trimmed}T00:00:00Z` : trimmed;
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

/**
 * Validate a `Date` against the min lead time and max horizon. Returns
 * `{ ok: true }` or `{ ok: false, reason }` with a user-presentable
 * reason string. Pure — no side effects, no DB.
 */
export function validateScheduledFor(
  scheduledFor: Date,
  now: number = Date.now()
): { ok: true } | { ok: false; reason: "past" | "too-far" } {
  if (scheduledFor.getTime() - now < MIN_SCHEDULE_FUTURE_MS) {
    return { ok: false, reason: "past" };
  }
  const maxFuture = now + MAX_SCHEDULE_HORIZON_DAYS * 24 * 60 * 60 * 1000;
  if (scheduledFor.getTime() > maxFuture) {
    return { ok: false, reason: "too-far" };
  }
  return { ok: true };
}

// === Composed entry point ===

/**
 * One-stop helper to schedule a check-in: insert the row, start the
 * workflow. Used by the slash command and any future entry point
 * (`/profile` schedule form, scripts, internal automations).
 *
 * The workflow self-records its run_id in its first step (issue #032),
 * so this helper doesn't need to call setCheckInWorkflowRunId.
 *
 * Throws on DB or workflow-start failure. Caller decides how to surface
 * the error — slash command shows an ephemeral message; a script can
 * just print to stderr.
 */
export async function scheduleCheckIn(args: {
  discordUserId: string;
  horizon: Horizon;
  topic: string;
  scheduledFor: Date;
}): Promise<{ id: number }> {
  const id = await createScheduledCheckIn(args);
  await start(scheduledCheckInWorkflow, [
    {
      checkInId: id,
      discordUserId: args.discordUserId,
      horizon: args.horizon,
      topic: args.topic,
      scheduledForIso: args.scheduledFor.toISOString(),
    },
  ]);
  return { id };
}

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
