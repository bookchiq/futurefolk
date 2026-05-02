# Before You Open v0

Things to do yourself first. v0 cannot do these and trying to make it do them will burn time.

## 1. Discord application setup (~20 min)

Do this first. Without it, the bot has nothing to connect to.

1. Go to https://discord.com/developers/applications
2. Create a new application. Name it something temporary like "Futurefolk-dev" — you can rename for the demo.
3. Go to Bot section, create a bot user.
4. Copy the bot token. Save it. You will need it as `DISCORD_BOT_TOKEN`.
5. Under "Bot" → "Privileged Gateway Intents", enable: Message Content Intent, Server Members Intent, Direct Messages Intent.
6. Under "OAuth2" → "URL Generator":
   - Scopes: `bot`, `applications.commands`
   - Bot permissions: Send Messages, Read Message History, Add Reactions, Use Slash Commands, Send Messages in Threads
7. Use the generated URL to invite the bot to a personal Discord server you control. Create a fresh server for the demo if you don't have one.
8. Copy the application ID (from General Information). You'll need this as `DISCORD_APP_ID`.
9. Copy the public key (from General Information). You'll need this as `DISCORD_PUBLIC_KEY` for verifying webhook signatures.

## 2. Vercel project setup (~5 min)

1. Create a GitHub repo for the project (you said you'd do this).
2. Connect it to Vercel.
3. Note the deployment URL. You'll need this for the Discord interaction endpoint and OAuth redirect.

## 3. Environment variables to set in Vercel (~5 min)

```
DISCORD_BOT_TOKEN=<from step 1.4>
DISCORD_APP_ID=<from step 1.8>
DISCORD_PUBLIC_KEY=<from step 1.9>
DISCORD_CLIENT_ID=<same as APP_ID>
DISCORD_CLIENT_SECRET=<from OAuth2 settings>
ANTHROPIC_API_KEY=<your key — or use Vercel AI Gateway>
DATABASE_URL=<after step 4>
NEXT_PUBLIC_BASE_URL=<your Vercel deployment URL>
```

## 4. Database setup (~5 min)

In Vercel dashboard for your project, add either:
- **Vercel Postgres** (cleaner if you want SQL) — adds `DATABASE_URL` automatically
- **Vercel KV** (simpler but less queryable) — adds `KV_*` variables

Recommend Postgres for this project — the queries we'll need are simple but having SQL makes the dashboard easier later.

## 5. v0 project instructions (~5 min)

In v0, before you start chatting, set the project Instructions (the `+` button in the prompt bar):

```
Read AGENTS.md and .v0/instructions.md from the connected repo before doing anything. Confirm you've read them.

Hard rules:
- Do not invent APIs for ChatSDK or Workflow SDK. Fetch their docs first.
- Do not add features to the onboarding survey. The questions are final.
- Do not soften the voice direction. The voice is the project.
- Do not use Tailwind's default blue/indigo palette. Use the CSS variables in instructions.md.
- Do not use SaaS aesthetic patterns: gradient heroes, three-column feature grids, "Get Started" CTAs.
- Update .v0/findings.md when you discover something other agents should know.
```

Paste the contents of `.v0/instructions.md` into the project Instructions field as well, so v0 has it passively in context every turn.

## 6. Connect v0 to GitHub repo (~2 min)

In v0, connect the project to your GitHub repo. This means everything generates as PRs against your repo, which is your source of truth.

## 7. Local dev environment for the parts v0 can't help with (~10 min)

Some things you'll do outside v0 (likely with Claude Code or directly):
- Discord webhook signature verification — this is fiddly, ChatSDK should handle it but if not, write it carefully
- ChatSDK Discord adapter setup if v0 hasn't done it
- WDK workflow definition files — v0 may struggle here

Have a local Next.js dev environment ready. `npm install`, `npm run dev`, ready to go.

---

# Then, in v0, in this order

Each prompt below is a separate v0 chat. Don't try to do them in one chat.

See `prompts/` directory for the actual prompts to paste.
