# Operations

Operational discipline for the Futurefolk dual-process deployment.

## Two processes, one schema

Futurefolk runs as two independent processes that share Postgres:

| Process | Hosted on | Triggers handled | Source |
|---|---|---|---|
| Vercel function | Vercel (Next.js App Router) | `/futureself` slash commands via HTTP webhook | `lib/slash-command.ts` (mounted by `app/api/webhooks/discord/route.ts`) |
| Gateway worker | Railway (or any Node host) | DM continuations + ⏳ reactions via Discord Gateway WebSocket | `scripts/gateway-worker.ts` |

Both call into the same `lib/` core (`future-self`, `voice`, `voice-profile`, `conversation`) and the same `conversation_messages` Postgres schema.

## The coupling rule

**Any change to `lib/*`, the `conversation_messages` schema, or shared env vars must be deployed to BOTH processes before considering it live.**

The two processes redeploy independently:
- Vercel auto-deploys when `main` updates.
- Railway auto-deploys when `main` updates **on its own schedule**, which can lag Vercel's by minutes.

If they're on different commits, the runtime contract between them can drift silently.

### What can drift

- **Schema migrations.** Adding/removing columns, changing constraints. The older runtime tries to insert/query a shape the newer schema rejects (or the newer runtime queries a column that doesn't exist yet).
- **Shared library changes.** `lib/conversation.ts` query shape, `lib/voice-profile.ts` field set, `lib/voice.ts` system-prompt construction. One process produces rows the other can't read.
- **Env-var rotations.** `DATABASE_URL`, `ANTHROPIC_API_KEY`, `DISCORD_BOT_TOKEN`. Easy to update one and forget the other.
- **Threshold tuning.** `RATE_LIMIT_USER_TURNS_PER_MINUTE`, `DEDUP_WINDOW_SECONDS`. Both processes need the same value to be consistent.

### Discipline

- **Schema changes are additive-only by default.** Add nullable columns with safe defaults; don't drop without a deprecation window during which both runtimes can handle absence.
- **Redeploy both immediately after merging anything that touches `lib/*` or schema.** Don't trust that "Vercel got it" means the worker has it.
- **Verify with version logging.** Both processes log their commit SHA on startup:
  - Vercel function: `[Futurefolk] slash-command module loaded (version=…)` on first invocation per cold start.
  - Gateway worker: `[gateway-worker] connected as Futurefolk#9047 (version=…)` on each connect.

  If the SHAs disagree, schedule a redeploy of the stale one immediately.

## Indexes

`conversation_messages` is the hot table. Two supporting indexes are required:

```sql
-- Serves getRecentMessages and the dedup channel-id leg
CREATE INDEX IF NOT EXISTS idx_conversation_messages_channel_created
  ON conversation_messages (channel_id, created_at DESC, id DESC);

-- Serves isRateLimited and the dedup user-id leg
CREATE INDEX IF NOT EXISTS conversation_messages_user_recent_idx
  ON conversation_messages (discord_user_id, created_at DESC)
  WHERE role = 'user';
```

Both applied to Neon as of 2026-05-03.

## Scheduled check-ins schema (apply when PR #21 merges)

The scheduled-check-in workflow (PLAN P8) requires a new table. Apply on Neon manually — there's no migration system in this repo. Idempotent: rerunning is a no-op.

```sql
CREATE TABLE IF NOT EXISTS scheduled_check_ins (
  id BIGSERIAL PRIMARY KEY,
  discord_user_id TEXT NOT NULL,
  horizon TEXT NOT NULL CHECK (horizon IN ('1y', '5y')),
  topic TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  workflow_run_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS scheduled_check_ins_user_status_idx
  ON scheduled_check_ins (discord_user_id, status, scheduled_for);
```

The workflow itself runs as a durable Vercel Function — it sleeps until `scheduled_for` (the sleep survives deploys/restarts) then wakes, generates the check-in message, posts it via raw Discord REST API, and persists the assistant turn into `conversation_messages` so subsequent DM replies thread cleanly.

## Debugging scheduled check-ins

To answer "did user X's scheduled check-in fire correctly?" today, sweep four
systems. There's no unified view yet — capture the steps so they're not
re-derived under pressure.

1. **Postgres** (source of truth for state):
   ```sql
   SELECT id, status, scheduled_for, sent_at, workflow_run_id, topic
   FROM scheduled_check_ins
   WHERE discord_user_id = '<id>'
   ORDER BY scheduled_for DESC
   LIMIT 20;
   ```
2. **`status = 'sent'`** — confirm DM landed: check Railway worker logs near `sent_at` for any DM continuation thread the user wrote in response.
3. **`status = 'failed'`** — `npx workflow inspect run <workflow_run_id>` shows the failed step and error.
4. **`status = 'pending'` past `scheduled_for`** — workflow may be stuck in storage. `npx workflow inspect run <workflow_run_id>` to confirm; if the run shows `cancelled` or `failed` but the row is still pending, that's a reconciler-needed case (see issue #041).

## Tunables (env vars)

| Var | Default | Purpose |
|---|---|---|
| `RATE_LIMIT_USER_TURNS_PER_MINUTE` | 15 | Per-user cap on user-role turns persisted per minute |
| `DEDUP_WINDOW_SECONDS` | 30 | Window inside which an identical `(channel, user, content)` is treated as a redelivery |
| `FUTUREFOLK_DRY_RUN` | (unset) | When `"1"`, `sendDiscordDM` short-circuits without calling Discord — logs the intended payload and returns stub IDs. Used by `scripts/dry-run-checkin.ts` for testing without DMs. |

Set the same value in Vercel project env AND Railway service env. Otherwise the two processes apply different caps.

## Required env vars

Both processes need: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `DISCORD_BOT_TOKEN`.
Vercel additionally needs: `DISCORD_APP_ID` (or `DISCORD_APPLICATION_ID`), `DISCORD_PUBLIC_KEY`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `NEXT_PUBLIC_BASE_URL`, `SESSION_SIGNING_SECRET`.
Railway worker doesn't need the OAuth/public-key/session vars (it doesn't serve HTTP).

### `SESSION_SIGNING_SECRET`

HMAC-SHA-256 secret for the `ff_session` cookie. Generate with:

```bash
openssl rand -hex 32
```

Must be at least 32 chars. Vercel only — the Railway worker never reads/writes this cookie. Rotating invalidates all existing sessions (every signed-in user is logged out and must reauth via Discord). Currently no rolling rotation; pick a value and leave it. If you do rotate, expect one round of `/profile` re-auths.

## Railway-specific config

`railway.json` at the repo root pins Railway's build + start commands so the worker doesn't accidentally try to run the Next.js build. Without this file, Railway's Railpack auto-detects `pnpm run build` and `pnpm run start` from `package.json` (both pointed at Next.js because Vercel uses them) and the deploy fails.

The file declares:

- **Build command:** a no-op `echo`. The worker is just `tsx scripts/gateway-worker.ts` — there's no compile step. Skipping the auto-detected `next build` saves ~10s of build time and avoids the `DATABASE_URL is not set` import-time crash that `next build` triggers when collecting page data.
- **Start command:** `pnpm start:worker` (the npm script that runs the worker via tsx).
- **Restart policy:** `ON_FAILURE`, max 10 retries.

If you change Railway's UI overrides for Build/Start commands, the file's values take precedence on the next deploy. Either edit `railway.json` directly or rely on it being correct.

If you ever provision a new Railway environment for this repo, the config travels with the code — no UI configuration is needed beyond setting the env vars.

## Pre-launch readiness gaps

Tracked here so the path from "friend-tester" to "small public beta" is visible.
None are blocking today; revisit before opening more broadly.

- [ ] **Stuck-workflow reconciler.** Periodic job to scan `pending` rows past `scheduled_for` and reconcile against `getRun(...).status`. (Tracked in todo #041 as the second half of cancellation completeness.)
- [ ] **Per-user cost ceilings.** `isRateLimited` caps message count, not Anthropic tokens spent. A bad actor could chew through tokens via repeated profile edits (each save can trigger lazy re-extraction). Add a daily token budget per user.
- [ ] **Migration system.** Schema changes are manual SQL on Neon today. Pick a tool (`drizzle-kit`, `node-pg-migrate`, or numbered `.sql` files + checksum) before a second person can deploy.
- [ ] **Structured logging.** All logs are `console.log("[Futurefolk] ...")`. Aggregate-friendly JSON logs (with `event`, `user_id`, `horizon`) ship cleanly to Logflare/Axiom.
- [ ] **Worker alerting.** Railway restarts on failure (10 retries) but nothing pages on sustained failure. A "did the worker log `connected as` in the last 10m?" healthcheck → email/Discord webhook would close it.
- [ ] **PITR / backup.** `users.voice_profile` is irreplaceable per-user data. Confirm Neon PITR is on and test-restore at least once.
- [ ] **Anthropic circuit breaker.** Sustained Anthropic outage would queue 60s timeouts in the worker, exhausting memory before Railway restart. A 30s circuit breaker that returns "future-self is taking a moment" would degrade gracefully.
- [ ] **PII handling story.** Onboarding responses can contain personal reflection. No `DELETE my account` flow exists. Pre-launch checklist item.
