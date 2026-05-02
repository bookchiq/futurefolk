# Findings

Append-only document. When you discover something other agents should know — a footgun, a quirk, a workaround, a thing v0 keeps getting wrong — add it here with the date.

Format:

```
## YYYY-MM-DD — Short title
What happened. What works. What to avoid.
```

---

## 2026-05-02 — Onboarding flow architecture

The onboarding flow uses React Context (`app/onboarding/context.tsx`) to persist responses across the multi-step flow. The context provides `responses`, `updateResponse`, `updateResponses`, and `submitAll` functions.

Key files:
- `app/onboarding/types.ts` — Contains `REQUIRED_QUESTIONS` and `OPTIONAL_QUESTIONS` arrays with exact question text from instructions.md. Do not modify these.
- `app/onboarding/context.tsx` — State management for the flow. Currently logs to console; needs database integration.
- `app/onboarding/layout.tsx` — Wraps all onboarding routes in the provider.

The voice questions (`/onboarding/voice`) are one question per screen with navigation state tracked locally. The deeper questions (`/onboarding/deeper`) are all on one page with collapsible accordions.

Discord OAuth is scaffolded at `/api/auth/discord/callback` — it currently just redirects to `/onboarding/done`. Needs `NEXT_PUBLIC_DISCORD_CLIENT_ID` env var and full token exchange implementation.

## 2026-05-02 — Tailwind v4 + custom palette

Using Tailwind CSS v4 with `@theme` directive in `app/globals.css`. Custom color tokens:
- `bg`, `bg-subtle` — cream backgrounds
- `ink` — near-black text
- `primary`, `primary-hover` — deep slate-navy
- `accent`, `accent-hover` — muted gold
- `muted` — warm grey for secondary text
- `border`, `border-subtle` — paper-toned borders

Use these tokens directly in Tailwind classes: `bg-bg`, `text-ink`, `border-border`, etc.

Fonts: EB Garamond loaded via `next/font/google`, applied as `--font-serif` and `--font-display` CSS variables.

## 2026-05-02 — ChatSDK Discord adapter quirks

ChatSDK packages used: `chat`, `@chat-adapter/discord`, `@chat-adapter/state-memory`. Versions installed at the time of this note: 4.27.0 across all three.

### Env var name mismatch

`SETUP.md` standardizes on `DISCORD_APP_ID`, but `@chat-adapter/discord` auto-detects `DISCORD_APPLICATION_ID`. Both `lib/bot.ts` and `scripts/register-commands.ts` read from either: `process.env.DISCORD_APPLICATION_ID ?? process.env.DISCORD_APP_ID`. Don't "fix" this by renaming the env var in SETUP.md without checking everything that already reads `DISCORD_APP_ID` (the OAuth callback, etc.).

### Slash commands need to be registered separately

ChatSDK does not register slash commands with Discord. It only handles dispatch of commands Discord already knows about. There's a one-time-ish setup script at `scripts/register-commands.ts` that does the PUT against `applications/{app}/commands`. Re-run after any change to command name, options, or descriptions.

While iterating, set `DISCORD_GUILD_ID` so commands register to a single guild — Discord propagates guild commands instantly, but global commands can take up to an hour.

### Two transports, one adapter — and Hobby can only do one

Discord splits its event delivery in a way ChatSDK papers over, but the underlying split matters because Vercel Hobby cannot serve both halves:

- **HTTP Interactions** (slash commands, button clicks, the verification PING) — landed at `app/api/webhooks/discord/route.ts`. Works in pure serverless. The adapter handles Ed25519 signature verification automatically; do not parse `request.body` before passing it to `bot.webhooks.discord(...)`.
- **Gateway WebSocket** (regular messages, reactions, DM messages) — needs a process holding a WebSocket open. Originally implemented as a Vercel cron route running `*/9 * * * *` for 10-minute listens, but **Vercel Hobby caps cron at one run per day**, which fails this hard. Cron route and `vercel.json` were removed on 2026-05-02 for that reason.

Current state: `bot.onReaction(...)` and `bot.onSubscribedMessage(...)` handlers are still wired in `lib/bot.ts` — they're correct code, they just have nothing forwarding events into them on Hobby. Slash commands work fine.

Two ways to light up the Gateway-only triggers without touching `lib/bot.ts`:

1. Run a small Gateway worker outside Vercel (Railway/Fly/etc.) that POSTs `MESSAGE_CREATE` + `MESSAGE_REACTION_ADD` events to the same webhook URL.
2. Upgrade to Vercel Pro and re-add a `*/9 * * * *` cron pointing at a new `app/api/discord/gateway/route.ts` that calls `bot.adapters.discord.startGatewayListener()`.

Do not "solve" this by changing the cron to `0 12 * * *` to satisfy Hobby — a once-a-day 10-minute window means reactions only ever respond if someone happens to react during that window, which is worse than honestly broken.

### Reading slash command options

`event.text` flattens leaf option *values* into a single string. For typed options (we need `horizon`, `about`, `schedule` separately), parse `event.raw.data.options` — the docs explicitly call this out. See `parseSlashOptions` in `lib/bot.ts`.

### DM continuation depends on subscription

After the bot's first DM post, call `thread.subscribe()`. From that point on, follow-up user messages route to `onSubscribedMessage`, not `onNewMention` or `onDirectMessage`. Use `thread.isDM` (boolean) to keep that handler scoped to DMs.

Per-thread metadata (which horizon started this thread, what the topic was) is stored via `thread.setState(...)` and read back via `await thread.state`. Carry the horizon through every turn — a thread that started as `5y` must not silently flip to `1y`.

### State adapter is in-memory ON PURPOSE for now

`@chat-adapter/state-memory` is fine for local dev and the demo, but it loses subscriptions on every cold start. Before a real deploy, switch to `@chat-adapter/state-redis` (Upstash works, see chat-sdk skill notes) or `@chat-adapter/state-pg`. Until then, expect DM continuations to break across deploys.

### Hourglass reaction matching

The ⏳ emoji isn't in the predefined `emoji` map (`thumbs_up`, `heart`, etc.). Match on `event.rawEmoji === "⏳"` inside a catch-all `bot.onReaction` handler instead of trying to use `emoji.custom(...)` for a unicode character.

### Turbopack + discord.js native deps

Next 16's Turbopack bundler tries to resolve `discord.js`'s optional native deps (`zlib-sync`, `bufferutil`, `utf-8-validate`) at build time and fails the build with `Module not found: Can't resolve 'zlib-sync'`. These are server-only and only used for Gateway WebSocket compression — the HTTP Interactions path doesn't need them at all.

Fix: list the ChatSDK + discord.js packages in `serverExternalPackages` in `next.config.ts`. Node will `require()` them at runtime and skip the optional natives gracefully. Do not try to `pnpm add zlib-sync` to "fix" it — that pulls in a native build step that breaks on Vercel's build container and isn't needed anyway on the HTTP-only deployment.
