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

## 2026-05-02 — Voice profile + AI integration

The placeholder Discord responses are gone. Real future-self generation is wired through `lib/future-self.ts` → `lib/voice.ts` → AI Gateway → Anthropic Claude. The shape:

- `lib/voice-profile.ts` builds a `VoiceProfile` from raw onboarding responses, persists pending profiles by session cookie (`ff_session`), and promotes them to a Discord-user-keyed row at OAuth callback time.
- `lib/voice.ts::buildSystemPrompt(profile, horizon, triggerContext)` is the single source of truth for prompt assembly. It uses the **exact** strings from `.v0/prompts.md` — base prompt, two horizon overlays (`1y` / `5y`), and a `{VOICE_PROFILE}` placeholder rendered as a labeled block, plus a `{TRIGGER_CONTEXT}` line. **Do not edit those strings to be friendlier or more "helpful."** They are the product.
- `lib/future-self.ts::generateFutureSelfResponse` calls `generateText` (not `streamText`) so we can run the tell-detection regex once on the full output and regenerate up to 2 times if it fires. ChatSDK `post()` accepts a string — streaming wasn't necessary, and the regen pass cannot be done mid-stream.
- `lib/conversation.ts` reads/writes thread history keyed by Discord channel ID (DMs are unique per user). The system prompt is rebuilt each turn from current profile + last ~20 messages.

### Model choice

Default is `anthropic/claude-sonnet-4.5` via the AI Gateway (Anthropic is zero-config). The brief mentioned hypothetical "Opus 4.7" / "Sonnet 4.6" — those don't exist on the gateway as of 2026-05-02. Confirmed via `curl https://ai-gateway.vercel.sh/v1/models | jq '... | startswith("anthropic/")'`. If quality is poor, swap `DEFAULT_MODEL` in `lib/future-self.ts` to `anthropic/claude-opus-4`. Do NOT add a UI toggle for users to pick — the brief explicitly forbids it.

`temperature: 0.85` and `maxOutputTokens: 600`. Higher temp than typical because the voice depends on idiom and texture, not consistency. Don't drop it below 0.7 without testing.

### Tell-detection regex

`STAY_IN_CHARACTER_TELLS` in `lib/future-self.ts` flags: "Great question", "I'd be happy to help", "Here's the thing:", "As an AI / language model / assistant", and any response with three consecutive `- ` bullet lines when the user didn't ask for a list. On a hit we re-call the model with an explicit "you broke character — try again, no preamble, no list" suffix appended to the system prompt. Up to 2 retries; if we still fail, we ship the last attempt rather than block the user. The prompt itself should prevent these — the regex is a cheap safety net.

### Privacy

Conversation content is stored in Postgres (per-channel) and never logged. `lib/future-self.ts` deliberately does NOT pass `experimental_telemetry` or include message bodies in any console.error path. If you're tempted to add observability, redact content first.

### Schema

Three tables created on Neon (project `square-bird-97106862`):
- `users` — PK `discord_user_id`, JSONB `voice_profile` + `onboarding_responses`.
- `pending_profiles` — PK `session_id` (cookie). Promoted to `users` on OAuth callback, then deleted.
- `conversation_messages` — `(channel_id, discord_user_id, horizon, role, content, created_at)` with index on `(channel_id, created_at DESC)`.

### Onboarding → Discord linkage

The flow is: user fills `/onboarding/voice` → `/onboarding/deeper` → submitAll() writes pending profile under a `ff_session` cookie → `/onboarding/connect` → Discord OAuth → callback reads cookie → promotes pending row into `users` keyed by Discord ID. There is a dev fallback in the connect page; that fallback now also calls a server action to create a synthetic Discord ID from the session cookie so dev users can DM the bot with a real backing profile. **Don't ship the dev fallback to production** — it's gated on `NEXT_PUBLIC_DISCORD_CLIENT_ID` being unset.

### submitAll race condition

`OnboardingProvider.submitAll()` now accepts an optional `mergeWith` patch. The deeper-questions page was calling `updateResponses(filled); submitAll();` synchronously, which dropped the latest answers because `setState` hadn't flushed. Pages with a "save and go" button should pass the patch directly: `await submitAll(filled)`.

## 2026-05-02 — Turbopack + discord.js native deps

Next 16's Turbopack bundler tries to resolve `discord.js`'s optional native deps (`zlib-sync`, `bufferutil`, `utf-8-validate`) at build time and fails the build with `Module not found: Can't resolve 'zlib-sync'`. These are server-only and only used for Gateway WebSocket compression — the HTTP Interactions path doesn't need them at all.

Fix: list the ChatSDK + discord.js packages in `serverExternalPackages` in `next.config.ts`. Node will `require()` them at runtime and skip the optional natives gracefully. Do not try to `pnpm add zlib-sync` to "fix" it — that pulls in a native build step that breaks on Vercel's build container and isn't needed anyway on the HTTP-only deployment.

## 2026-05-02 — Discord OAuth flow (real, not scaffolded)

The OAuth flow now actually works end-to-end. Two routes own it:

- `app/api/auth/discord/start/route.ts` — entry point. Reads `DISCORD_CLIENT_ID` (server-only; we deliberately do NOT use `NEXT_PUBLIC_DISCORD_CLIENT_ID` anymore), reads-or-creates the `ff_pending_session` cookie, and 302s to Discord's authorize URL with `state=<sessionId>`. Scope is `identify` only — we don't need anything more for account linking.
- `app/api/auth/discord/callback/route.ts` — exchange + linkage. Verifies `state === ff_pending_session` cookie BEFORE any network call (CSRF). Then exchanges the code at `https://discord.com/api/oauth2/token`, fetches `https://discord.com/api/users/@me`, and calls `promotePendingToUser(sessionId, user.id, displayName)` from `lib/voice-profile.ts`.

`/onboarding/connect/page.tsx` is now a dumb page: the "Connect Discord" button is a `<Link href="/api/auth/discord/start">`. There is no longer a client-side OAuth URL builder and no dev fallback that synthesizes a Discord ID — the previous fallback was the source of the "button skips straight to /onboarding/done" bug. If `DISCORD_CLIENT_ID` is unset, the start route now redirects back to `/onboarding/connect?error=oauth_not_configured` and the page renders a real error message. To work locally you must set `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`.

### Cookie name correction

An earlier note in this file calls the cookie `ff_session`. The actual constant is `PENDING_COOKIE = "ff_pending_session"` (see `app/onboarding/actions.ts`, the start route, and the callback). Use that exact name when reading/writing it from any new code.

### Env var precedence

Both the start and callback routes resolve the client id as `DISCORD_CLIENT_ID ?? DISCORD_APP_ID ?? DISCORD_APPLICATION_ID`. ChatSDK's discord adapter still auto-detects `DISCORD_APPLICATION_ID` for the bot itself — same Discord app, same id, two different env var names floating around in this codebase for historical reasons. The OAuth client secret is only ever `DISCORD_CLIENT_SECRET`.

### Error surface

The callback always redirects on failure rather than rendering a JSON error, so the connect page can show something useful. Error codes used: `oauth_error`, `no_code`, `invalid_state`, `oauth_not_configured`, `token_exchange_failed`, `user_fetch_failed`. The connect page maps these to user-facing messages — keep that map in sync if you add new ones.

### Cookie set at /api/auth/discord/start (not just at survey submit)

Previously the cookie was only set inside `submitOnboardingResponses` (the survey server action). If a user somehow lands on `/onboarding/connect` without completing the survey (refresh, deep link), the start route now sets the cookie itself with `randomUUID()` so the state/cookie comparison still works on the way back. The promote step will warn and no-op if there's no matching `pending_profiles` row — that's correct behavior, not a bug to "fix" by inserting a synthetic profile.
