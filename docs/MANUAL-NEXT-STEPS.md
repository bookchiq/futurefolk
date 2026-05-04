# Manual Next Steps

Things only you can do, sequenced so you can move through them while Claude works on voice quality in parallel. **Total: ~30-45 min of your time.**

If something's unclear, the rationale lives in `docs/STRATEGY-REVIEW.md` and `docs/OPERATIONS.md`.

---

## 1. Merge PR #11 ⏱ 1 min

URL: https://github.com/bookchiq/futurefolk/pull/11

Closes the last review-housekeeping items, adds version logging to both processes, and adds `docs/OPERATIONS.md`.

After merging, you can keep going. No code changes needed locally — Claude will pull `main` when starting voice work.

---

## 2. Provision Railway for the gateway worker ⏱ 10-15 min

This replaces the local worker on your laptop with a hosted process. After this lands, you can close the worker terminal and forget it exists.

### Steps

1. Go to https://railway.app and sign in.
2. **New Project → Deploy from GitHub repo →** `bookchiq/futurefolk`. Railway auto-detects the package.json and offers to deploy.
3. Once the service is created, open it. **Settings tab:**
   - **Start Command:** `pnpm start:worker`
   - **Watch Paths:** leave blank (deploy on every push to `main`)
4. **Variables tab:** add the following, copying from your Vercel project's "Production" env (or your local `.env.local`):
   - `DISCORD_BOT_TOKEN`
   - `ANTHROPIC_API_KEY`
   - `DATABASE_URL`
5. Optional tunables (leave unset to use defaults):
   - `RATE_LIMIT_USER_TURNS_PER_MINUTE` (default 15)
   - `DEDUP_WINDOW_SECONDS` (default 30)
6. Click **Deploy**. Watch **Deploy Logs**. You should see, within ~30s of build completing:
   ```
   [gateway-worker] connected as Futurefolk#9047 (version=<sha>)
   ```
   If `version=unknown` shows up, Railway didn't expose the git commit SHA. Under Settings → Variables, add `RAILWAY_GIT_COMMIT_SHA` with reference value `${{ RAILWAY_GIT_COMMIT_SHA }}` (or check Railway's docs for the current variable name; this changes occasionally). Not blocking, just nice-to-have.

### Verify

Test from Discord:
- **DM continuation:** open an existing DM thread with Futurefolk and reply. Worker should respond within ~10s.
- **⏳ reaction:** in any server the bot is in, react ⏳ to a message you wrote. Bot should DM you.

Both work? Then:
- Find the local worker terminal on your laptop (likely running `pnpm start:worker` from a previous session) and stop it (Ctrl+C). It's no longer needed.

If something doesn't work, check the Railway "Deploy Logs" and "HTTP Logs" tabs for errors. Most common issue: missing env var.

---

## 3. Discord User App configuration ⏱ 10 min

This unlocks multi-tenant testing — friends can install the bot to their Discord account without you sharing a server with them.

### Steps in the Discord Developer Portal

1. Go to https://discord.com/developers/applications and open the Futurefolk app.
2. **Sidebar: Installation.**
3. Under **Installation Contexts**, enable **User Install** (toggle on) alongside the existing **Guild Install**.
4. Under **Default Install Settings → User Install**, set scopes to `applications.commands`. (The `bot` scope only applies to Guild Install.)
5. **Save.**

Then:
6. Still in the Installation tab, copy the **User Install URL**. You'll share this with friends. Looks like `https://discord.com/oauth2/authorize?client_id=<id>&integration_type=1&scope=applications.commands`.

### What this does

- Anyone with the link can install Futurefolk to their own Discord account in one click.
- They don't need to share a server with you or anyone else.
- The `/futureself` slash command becomes available to them in any server, in DMs, and in group DMs.

---

## 4. Wait for Claude to update `register-commands.ts` ⏱ ~

Claude will be modifying `scripts/register-commands.ts` to mark the `/futureself` slash command as installable in user contexts (`integration_types: [0, 1]` and `contexts: [0, 1, 2]`).

You'll know this is ready when Claude tells you. Until then, skip step 5.

If you want to do it yourself: the changes go on the `command` object in `scripts/register-commands.ts:30-59`:
```ts
const command = {
  name: "futureself",
  description: "...",
  type: 1,
  integration_types: [0, 1],   // 0 = guild install, 1 = user install
  contexts: [0, 1, 2],         // 0 = guild, 1 = bot DM, 2 = private channel/group DM
  options: [/* ... */],
};
```

---

## 5. Re-register slash commands ⏱ 1 min

Once steps 3 and 4 are both complete:

```bash
pnpm register:commands
```

Wait up to an hour for Discord to propagate global commands.

**Faster iteration:** for testing, set `DISCORD_GUILD_ID` to your test server's ID — guild commands propagate instantly:
```bash
DISCORD_GUILD_ID=<your-guild-id> pnpm register:commands
```

Don't ship a guild-only command to production though; re-run without `DISCORD_GUILD_ID` once you're satisfied.

---

## 6. Test with a friend ⏱ 5 min + their time

Send a friend the User Install URL from step 3.6.

They:
1. Click the link → **Authorize** → done.
2. Visit https://futurefolk.vercel.app, complete the onboarding survey.
3. Connect Discord (the OAuth flow at the end of onboarding).
4. In Discord, anywhere — a server you don't share with them, their own DMs, anywhere — they invoke:
   ```
   /futureself horizon:1y about:something they're thinking about
   ```
5. Within ~10s, they get a DM from "Futurefolk" speaking as their 1-year-future-self.

### Things to watch for

- **First /futureself fails or hangs.** Check Railway logs — most likely the worker is on a stale deploy or the friend's profile didn't link. Check `users` table on Neon for their Discord user ID.
- **Voice feels off.** Expected for v1. Claude is working on this in parallel.
- **DM continuation works for them?** Reply in the DM thread should work. If not, the gateway worker is the suspect.

Once verified with one friend, share the install link more broadly.

---

## What Claude is doing in parallel

While you're working through these steps, Claude is implementing **active stylometric extraction at onboarding** (PLAN P2b in `docs/PLAN.md`). This is the highest-leverage voice improvement available given the current architecture: a one-time LLM call at onboarding extracts concrete stylistic features (lowercase ratio, average sentence length, common openers, hedge frequency, idioms) from the sample messages. The runtime prompt then cites these as concrete numbers/patterns instead of relying on the model to absorb the message corpus on every call.

Estimated work: ~1-2 hours. Claude will open a PR when ready.

If you finish manual steps before Claude finishes voice work, the next things to consider:

- Voice second pass — few-shot dialogue pairs in the messages array (PLAN P2a). Bigger build than P2b; benefits from P2b's extracted features as anchors.
- `/profile` page (PLAN P6) — let users edit their voice profile after onboarding.
- Scheduled check-ins via Workflow SDK (PLAN P8) — the unique product feature.

These are listed in priority order in `docs/PLAN.md`.
