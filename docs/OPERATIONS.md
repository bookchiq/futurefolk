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

## Tunables (env vars)

| Var | Default | Purpose |
|---|---|---|
| `RATE_LIMIT_USER_TURNS_PER_MINUTE` | 15 | Per-user cap on user-role turns persisted per minute |
| `DEDUP_WINDOW_SECONDS` | 30 | Window inside which an identical `(channel, user, content)` is treated as a redelivery |

Set the same value in Vercel project env AND Railway service env. Otherwise the two processes apply different caps.

## Required env vars

Both processes need: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `DISCORD_BOT_TOKEN`.
Vercel additionally needs: `DISCORD_APP_ID` (or `DISCORD_APPLICATION_ID`), `DISCORD_PUBLIC_KEY`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `NEXT_PUBLIC_BASE_URL`.
Railway worker doesn't need the OAuth/public-key vars (it doesn't serve HTTP).
