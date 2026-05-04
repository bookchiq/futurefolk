---
name: Make rate-limit / dedup thresholds env-tunable; add unhandledRejection / uncaughtException listeners
description: Threshold tuning currently requires a code edit + redeploy. Plus, async errors that escape outer try/catch will crash the worker silently.
type: code-review
issue_id: 030
priority: p3
status: complete
tags: [code-review, ops, observability]
---

## Problem Statement

### 30a. Hardcoded thresholds
`DEDUP_WINDOW_SECONDS = 30` and `RATE_LIMIT_USER_TURNS_PER_MINUTE = 15` (`lib/conversation.ts:70, 77`) are not tunable without redeploy. After the first hour of multi-tenant traffic, these are exactly the kind of values you want to tune from a dashboard.

### 30b. Missing async error listeners
Worker has no `process.on('unhandledRejection', ...)` or `process.on('uncaughtException', ...)`. An async error that escapes the outer try/catch (microtask edge cases, timer callbacks, etc.) will crash the process silently. Railway will restart, but logs won't show why.

## Findings

- `lib/conversation.ts:70, 77`
- `scripts/gateway-worker.ts` (no error listeners)

## Proposed Solutions

### 30a:
```ts
const DEDUP_WINDOW_SECONDS = Number(process.env.DEDUP_WINDOW_SECONDS) || 30;
const RATE_LIMIT_USER_TURNS_PER_MINUTE =
  Number(process.env.RATE_LIMIT_USER_TURNS_PER_MINUTE) || 15;
```

Set in Railway dashboard env. Both processes (Vercel + Railway) need the same values to behave consistently — flag in deployment notes.

### 30b:
```ts
process.on("unhandledRejection", (reason) => {
  console.error("[gateway-worker] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[gateway-worker] uncaughtException:", err);
  process.exit(1);
});
```

`uncaughtException` exits — recovery isn't safe after a non-async throw escaped the handler. `unhandledRejection` logs but doesn't exit (Node 16+ default would crash, but in practice these are recoverable).

## Recommended Action

Both. Each is a 3-line change.

## Technical Details

- `/Users/sarahlewis/Code/futurefolk/lib/conversation.ts:70, 77`
- `/Users/sarahlewis/Code/futurefolk/scripts/gateway-worker.ts`

## Acceptance Criteria

- [ ] Thresholds read from env if set; fall back to 30/15 defaults.
- [ ] Worker has both error listeners.
- [ ] Manually trigger an unhandled rejection (e.g., a Promise rejection without await): worker logs it.

## Work Log

**2026-05-03** — Fixed in PR #10 follow-up.

- `DEDUP_WINDOW_SECONDS` now reads from `process.env.DEDUP_WINDOW_SECONDS`, defaulting to 30. Both Vercel + Railway need to set the same value to behave consistently.
- `RATE_LIMIT_USER_TURNS_PER_MINUTE` now reads from env, defaulting to 15.
- Worker has `process.on("unhandledRejection", ...)` (logs and continues) and `process.on("uncaughtException", ...)` (logs and exits 1, since non-async throws aren't safely recoverable). Both prefixed `[gateway-worker]` so they're findable in Railway logs.

## Resources

- Surfaced by: security-sentinel + simplicity-reviewer + pattern-recognition agents.
