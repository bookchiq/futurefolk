# Futurefolk Docs Bundle

These are the docs to drop into your repo before you start building tomorrow.

## What's where

```
AGENTS.md                          # Top-level pointer for any agent (v0, Claude Code, Cursor)
SETUP.md                           # Things to do BEFORE opening v0 (Discord setup, env vars, etc.)
.v0/
  instructions.md                  # Canonical project doc — scope, voice, design, architecture
  prompts.md                       # System prompts for the future-self characters
  findings.md                      # Empty append-only doc for "things v0 keeps getting wrong"
prompts/
  01-onboarding.md                 # Paste into your first v0 chat
  02-discord-bot.md                # Paste into your second v0 chat (after onboarding works)
  03-ai-integration.md             # Paste into your third v0 chat (after bot scaffold works)
  04-workflows-scheduling.md       # Paste into your fourth v0 chat (STRETCH — only if ahead)
```

## Suggested flow for tomorrow

1. **Before the event** (tonight if you have energy, otherwise first thing morning of):
   - Set up the Discord application following SETUP.md
   - Create the GitHub repo, copy these docs in, push
   - Connect Vercel to the repo
   - Set env vars in Vercel
   - Set up the database (Vercel Postgres recommended)
   - Connect v0 to the GitHub repo
   - Paste the contents of `.v0/instructions.md` into v0's project Instructions

2. **During the event**, in order:
   - v0 chat 1: paste `prompts/01-onboarding.md`. Goal: onboarding flow renders correctly with the right questions and aesthetic.
   - v0 chat 2: paste `prompts/02-discord-bot.md`. Goal: bot responds to slash commands, reactions, and DM continuations with placeholder text.
   - v0 chat 3: paste `prompts/03-ai-integration.md`. Goal: future-self responses are real AI calls in your voice. **DEMO IS POSSIBLE FROM HERE.**
   - v0 chat 4 (stretch): paste `prompts/04-workflows-scheduling.md`. Goal: scheduled check-ins work and survive deploys.

3. **In parallel/manually** (not in v0):
   - Register the Discord slash command (script will exist after chat 2)
   - Iterate on your own voice profile to get future-self responses feeling right
   - Pre-record your demo flow at least once before presenting

## Discord bot (split: ChatSDK webhook + discord.js Gateway worker)

As of the 2026-05-03 ChatSDK split, Discord is handled by **two separate processes** that share the same database and AI pipeline. Each trigger has exactly one home — there is no fallback path between them.

| Trigger | Transport | Process | Code |
| --- | --- | --- | --- |
| `/futureself horizon:<1y\|5y> about:<topic>` | HTTP Interactions (webhook) | Vercel function | `app/api/webhooks/discord/route.ts` → `lib/slash-command.ts` (ChatSDK) |
| Any reply in a DM thread the bot started | Gateway WebSocket | Standalone worker (Railway-deployable) | `scripts/gateway-worker.ts` (discord.js directly) |
| ⏳ reaction on any message in a channel the bot is in | Gateway WebSocket | Standalone worker | `scripts/gateway-worker.ts` |

Why split: Vercel serverless functions can't hold a Gateway WebSocket open, and Vercel Hobby caps cron at one run per day, so a gateway-keepalive cron is also off the table. The slash command path is genuinely cleaner with ChatSDK; everything Gateway is genuinely cleaner with discord.js. See `.v0/findings.md` (2026-05-03 entry) for the full rationale.

### Slash command — webhook path

- `app/api/webhooks/discord/route.ts` — Discord interactions endpoint. Set `https://<your-domain>/api/webhooks/discord` as the Interactions Endpoint URL in the Discord Developer Portal. ChatSDK's Discord adapter handles Ed25519 signature verification automatically.
- `lib/slash-command.ts` — ChatSDK `Chat` instance with one handler: `bot.onSlashCommand("futureself", ...)`. Parses options out of `event.raw.data.options`, calls `generateFutureSelfResponse`, opens a DM, posts the reply.

There are no `bot.onSubscribedMessage` or `bot.onReaction` handlers in `lib/slash-command.ts` — they were removed in the ChatSDK split because they were inert in production (Vercel Hobby can't hold a Gateway WebSocket open).

### DM continuation + ⏳ reaction — Gateway worker path

- `scripts/gateway-worker.ts` — discord.js client with `messageCreate` and `messageReactionAdd` listeners. Runs as a standalone Node process. Reads horizon from the most recent `conversation_messages` row (no thread-state needed) and calls the same `generateFutureSelfResponse` / `appendMessage` / `getRecentMessages` functions as the webhook path.

Run locally:

```bash
pnpm start:worker
```

For production, deploy to Railway (or any host that can hold a WebSocket open). The worker needs `DISCORD_BOT_TOKEN`, `ANTHROPIC_API_KEY`, and `DATABASE_URL` — same values as the Vercel side.

### Switching horizons mid-thread

Reactions (⏳) always start a 1-year-future-self thread. To start or switch a thread to 5-year-future-self, run `/futureself horizon:5y about:<topic>` in any channel the bot can see. The most recent slash invocation's horizon is the "sticky" horizon for that DM thread until the next slash invocation re-pins it.

### Registering the `/futureself` slash command

ChatSDK dispatches slash commands but does not register them with Discord. Run the script once after each change to the command shape:

```bash
# Register globally (can take up to an hour to propagate)
pnpm register:commands

# Or register to a single guild for instant updates while iterating
DISCORD_GUILD_ID=<your-guild-id> pnpm register:commands
```

The script reads `DISCORD_BOT_TOKEN` and `DISCORD_APPLICATION_ID` (or `DISCORD_APP_ID`) from your local env. Put them in `.env.local` for local invocation; in production they live in Vercel project env vars.

### Required env vars

Already documented in `SETUP.md`. The Vercel side (slash command webhook) needs `DISCORD_APPLICATION_ID` / `DISCORD_APP_ID`, `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, and `DATABASE_URL`. The Gateway worker needs `DISCORD_BOT_TOKEN`, `ANTHROPIC_API_KEY`, and `DATABASE_URL` — same values, set on Railway (or wherever the worker runs).

### State adapter caveat

ChatSDK's `Chat` constructor requires a state adapter, so `@chat-adapter/state-memory` stays as a dependency. Nothing in `lib/slash-command.ts` actually uses subscriptions anymore — the slash command handler doesn't call `dm.subscribe()` or `dm.setState()`. Conversation history lives in our own `conversation_messages` Postgres table (see `lib/conversation.ts`), keyed by Discord channel ID, and is read directly by both processes. The `MemoryStateAdapter is not recommended for production` warning that prints on each webhook hit is harmless given how we're using it.

## A few last reminders

- **The voice IS the project.** Spend time iterating on your voice profile and on what future-self actually says. If chat 3 works but the responses sound generic, that's the bug — keep tweaking the system prompt and your sample messages until it feels right.
- **Stretch goals are stretches.** If the demo works without Workflows, ship it. Workflows is a strong story to add but not at the cost of a working demo.
- **The findings.md doc is your friend.** Every time you discover something v0 keeps getting wrong, write it down. Future v0 chats will read it and avoid the same mistake.
- **Don't onboard live in the demo.** Use your own pre-built voice profile. Offer "want to try it yourself?" as a follow-up after the demo, not during.

## If something breaks

If a v0 chat starts producing garbage or losing the thread, don't keep arguing with it — start a new chat with the same prompt. Memory degrades over long chats; new chats start fresh.

If the Discord side breaks, the docs you'll need are at chat-sdk.dev/docs and Discord's developer portal. Most issues will be signature verification, scope misconfiguration, or the bot not being in the right channels.

If WDK breaks, fetch workflow-sdk.dev/ docs again. v0 will not have current API knowledge.
