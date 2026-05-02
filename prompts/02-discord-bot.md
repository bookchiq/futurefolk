# Prompt 2: Discord Bot Scaffold (ChatSDK)

**Use this in a fresh v0 chat,** AFTER the onboarding flow is working. Connect to the same GitHub repo.

---

Read `AGENTS.md` and `.v0/instructions.md` first. Confirm you've read them before continuing.

**IMPORTANT:** Before writing any ChatSDK code, fetch and read https://chat-sdk.dev/docs. Your training data is thin on this library. Do not guess at APIs.

Build the Discord bot integration using ChatSDK with the Discord adapter.

## What to build

The bot lives in the Next.js app as API routes (ChatSDK is designed for this). It handles three triggers:

### Trigger 1: Slash command `/futureself`

Parameters:
- `horizon` (required): one of `1y` or `5y`
- `about` (required): a short string describing what they want to talk about
- `schedule` (optional): an ISO date string for scheduled check-ins (handle this in a later chat)

When invoked, the bot should:
1. Acknowledge the command (Discord requires acknowledgment within 3 seconds)
2. Look up the user's voice profile (we'll wire this up properly later; for now, return a placeholder)
3. Open a DM with the user
4. Send a future-self response in DMs

For this chat, focus on the *plumbing*. The voice profile lookup and AI response can be stubbed (return a placeholder string). We'll wire AI in a separate chat.

### Trigger 2: ⏳ reaction

When a user reacts with the ⏳ emoji on any message in any channel the bot is in:
1. Capture the message content as context
2. DM the user a future-self response (default to 1y horizon for reactions)

Use ChatSDK's reaction handler (see chat-sdk.dev docs for `onReaction` or equivalent).

### Trigger 3: Conversation continuation in DMs

When the user replies in a DM thread that was started by the bot:
1. The bot continues the conversation
2. Maintains context of what's been said in that DM thread
3. Stays in the same future-self character (1y or 5y) that started the thread

Use ChatSDK's `onSubscribedMessage` or equivalent for continued DM threads.

## Architecture notes

- Discord interactions endpoint: `app/api/discord/interactions/route.ts` (or wherever ChatSDK convention puts it)
- ChatSDK setup: a single bot instance configured in `lib/bot.ts`
- Use the Discord adapter: see chat-sdk.dev docs for the import path
- Verify Discord webhook signatures (ChatSDK should handle this; confirm)

## Slash command registration

You'll need to register the slash command with Discord. This typically happens via a one-time setup script. Either:
- A `scripts/register-commands.ts` file that can be run with `npx tsx scripts/register-commands.ts`
- Or guidance to register via Discord's API directly

The user (Sarah) has already created the Discord application and has the bot token, app ID, and public key in env vars: `DISCORD_BOT_TOKEN`, `DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`.

## Stubs OK for this chat

You can stub these — we'll wire them in later chats:

- The actual AI response (return a hardcoded "future-self placeholder" string)
- The voice profile lookup (return a hardcoded test profile)
- Database persistence of conversation history (use in-memory for now)
- Workflows-backed scheduling (we'll handle in a separate chat)

## What NOT to do

- Do not write Slack, Teams, or any other adapter code. Discord only.
- Do not invent ChatSDK APIs. If unsure, fetch the docs.
- Do not skip Discord signature verification. It's required for webhooks.
- Do not use `setTimeout` for any kind of "scheduled" message. We'll use Workflows for that.

## Definition of done

- ChatSDK is installed and configured with the Discord adapter
- A `/futureself` slash command can be registered with Discord
- The slash command handler returns a placeholder response in DMs
- Reactions with ⏳ are picked up and trigger a placeholder DM
- DM thread continuations are picked up and respond with placeholder text
- Discord webhook signatures are verified
- A README section explains how to register the slash command

Update `.v0/findings.md` with any quirks discovered during ChatSDK setup.
