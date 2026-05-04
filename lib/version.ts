/**
 * Build version identifier for both processes (Vercel function + Railway
 * worker). Logged on startup so deploy drift is visible in production logs:
 * if the Vercel function and Railway worker are on different commits, their
 * `[Futurefolk] version` and `[gateway-worker] version` lines will diverge.
 *
 * Vercel automatically sets `VERCEL_GIT_COMMIT_SHA`. Railway sets
 * `RAILWAY_GIT_COMMIT_SHA`. Falls back to "unknown" in local dev or other
 * hosts.
 */
export const VERSION =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.RAILWAY_GIT_COMMIT_SHA ??
  "unknown";
