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

## Discord bot (ChatSDK)

The bot is wired in `lib/bot.ts` using ChatSDK 4.x with the Discord adapter. Three triggers are live (with placeholder responses — the AI is wired in chat 3):

- `/futureself horizon:<1y|5y> about:<topic>` — slash command, opens DMs with future-you
- ⏳ reaction on any message in a channel the bot is in — DMs the user with a 1y-future-self response
- Any reply in a DM thread the bot started — continues the conversation, holding the horizon

### Routes

- `app/api/webhooks/discord/route.ts` — Discord interactions endpoint. Set this URL (`https://<your-domain>/api/webhooks/discord`) as the Interactions Endpoint URL in the Discord Developer Portal. Signature verification is handled by the adapter.
- `app/api/discord/gateway/route.ts` — Gateway listener invoked by Vercel Cron (`*/9 * * * *`, configured in `vercel.json`). Required for ⏳ reactions and DM messages, which Discord does not deliver via HTTP Interactions.

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

Already documented in `SETUP.md`. ChatSDK additionally needs:

- `CRON_SECRET` — protects the gateway listener route. Set in Vercel project settings; cron requests include it as `Authorization: Bearer <secret>`.

### Stubs in this scaffold

- `lib/voice-profile.ts` — returns a hardcoded test profile. Real DB lookup wired in chat 3.
- `lib/future-self.ts` — returns placeholder strings tagged `[placeholder, …]`. Real AI calls wired in chat 3.
- State is in-memory (`@chat-adapter/state-memory`) — subscriptions are lost on cold start. Swap to `@chat-adapter/state-redis` or `@chat-adapter/state-pg` before any real deploy. See `.v0/findings.md`.

## A few last reminders

- **The voice IS the project.** Spend time iterating on your voice profile and on what future-self actually says. If chat 3 works but the responses sound generic, that's the bug — keep tweaking the system prompt and your sample messages until it feels right.
- **Stretch goals are stretches.** If the demo works without Workflows, ship it. Workflows is a strong story to add but not at the cost of a working demo.
- **The findings.md doc is your friend.** Every time you discover something v0 keeps getting wrong, write it down. Future v0 chats will read it and avoid the same mistake.
- **Don't onboard live in the demo.** Use your own pre-built voice profile. Offer "want to try it yourself?" as a follow-up after the demo, not during.

## If something breaks

If a v0 chat starts producing garbage or losing the thread, don't keep arguing with it — start a new chat with the same prompt. Memory degrades over long chats; new chats start fresh.

If the Discord side breaks, the docs you'll need are at chat-sdk.dev/docs and Discord's developer portal. Most issues will be signature verification, scope misconfiguration, or the bot not being in the right channels.

If WDK breaks, fetch workflow-sdk.dev/ docs again. v0 will not have current API knowledge.
