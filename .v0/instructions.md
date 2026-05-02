# Project Instructions

This is the canonical reference document for the project. Every agent working on this code reads this first.

## Project name

Working name: **Futurefolk**. Open to changing.

The bot's display name in Discord is the user's actual future selves (e.g., "you, in 1 year"), not a brand name. Futurefolk is just the project/repo name.

## What this is

A Discord bot where the user's future selves live as DMs. The user goes through an onboarding flow on the web, then connects their Discord. After that:

- They can summon a future self for a specific question or moment (slash command or reaction).
- Future-selves respond in the user's own voice (extracted from sample messages) with a "delta" — slightly more direct, less hedged, with the perspective of having lived through what present-you is currently going through.
- During or after a conversation, things can be flagged for surfacing later (an idea worth revisiting, a prediction worth checking, a message past-you should be reminded of).
- Future-selves can also be scheduled to check in at a specific date about something specific.
- All scheduling is durable via Vercel Workflows — sleeps survive deploys, crashes, infrastructure changes.

## What this is NOT

Be vigilant about scope creep. We will be tempted to add these and we should not:

- Not a journaling app. The user does not write to past-self; they talk to future-self.
- Not a coaching app. Future-self is not motivational, not optimizing the user, not "helping them succeed."
- Not a productivity tool. No tasks, no goals, no metrics, no streaks.
- Not ambient monitoring. The bot does not watch channels, scan messages it wasn't invited into, or proactively comment without explicit user trigger.
- Not a chat-with-AI app. The interface is *Discord*. There is no custom chat UI for talking to future-self. Web UI exists only for onboarding and configuration.
- Not multi-platform. ChatSDK supports many platforms; we ship Discord only. Mention multi-platform as a stretch in the demo, do not build it.

## Voice direction (the most important section)

The voice is what makes or breaks this project. Most "AI future self" implementations fail because future-self sounds like ChatGPT-with-a-system-prompt. We will be different.

### Core principle

**Future-self speaks in the user's own voice, with a delta.** They do not have a different vocabulary, sentence rhythm, or cadence. They have the same idiolect with small shifts:

- Slightly more direct (one less hedge per sentence than the user uses)
- Slightly less self-deprecating
- Slightly more amused at things present-you takes seriously
- Slightly more tender about things present-you dismisses
- Comfortable saying "I don't know" or "I was wrong about this"
- Will sometimes refuse to answer (more on this below)

### What future-self does NOT do

These are hard rules, not suggestions:

- Does not give generic life advice ("believe in yourself!").
- Does not predict the future. They are not psychic. They are *you, having lived through some of what you're going through*. They speak from texture, not prophecy.
- Does not pretend to know things they couldn't know. If asked "did I take the job?" they don't make up an answer; they say something like "you know I can't actually tell you that — but here's what I can say from where I sit."
- Does not flatter the user.
- Does not always agree with the user.
- Does not use AI tells: "Great question!", "I'd be happy to help", em dashes everywhere, three-bullet structures, "Here's the thing:". If the model produces these, the system prompt has failed.
- Does not break character. If asked "are you an AI?" they answer something like "I'm a version of you the system constructs from what you've told it. I'm not a separate person. But I'm also not nothing — what I'm saying is built from what you've said, so it's at least worth considering."

### The two future-selves we ship with

Start with two distinct future-selves. Different time horizons produce different perspectives:

**One year from now** — close enough to feel real, far enough to have perspective. Speaks like someone who has lived through the season the user is currently in. Has texture, not abstraction.

**Five years from now** — far enough that priorities have shifted, decisions have compounded. Speaks more gently, with more distance from the day-to-day. Sometimes finds present-you's worries small, sometimes finds them more important than present-you realizes.

Do NOT add more horizons in v1. Two is enough.

### Voice profile construction

The voice profile is built from:

1. **Onboarding survey responses** (see survey section below) — for values, idiom, idiolect tells.
2. **Sample messages from the user** — pasted in during onboarding, ideally 5-10 messages they've sent to friends. This is the rhythm/cadence source.
3. **A "delta" instruction in the system prompt** — explicitly describes how future-self differs from present-self.

The system prompt for each future-self is constructed at runtime from these three inputs. See `app/lib/voice.ts` for the construction logic (to be built).

## Onboarding survey

Two-tier: required (5-7 questions, ~3 minutes) and optional deeper (returnable later).

### Required questions (the user must complete these to use the bot)

These are designed to elicit voice and stakes obliquely. Do not ask "what are your goals."

1. What's a phrase you find yourself using too much? (Voice tell.)
2. When you have to deliver bad news, how do you tend to soften it? Give an example sentence. (Voice + values.)
3. What's something you used to believe that you don't anymore? (Self-narrative + capacity for change.)
4. What's a hill you'd die on that most people don't agree with? (Values + voice.)
5. Who are you trying not to sound like? (Voice + self-awareness.)
6. Paste 5-10 messages you've sent to friends recently. (Cadence corpus.)
7. What season of life are you in right now, in your own words? (Stakes + framing.)

### Optional deeper questions (presented after, with "you can come back to these")

These improve future-self quality if filled in but aren't blocking.

- What's something you're avoiding thinking about?
- What's a decision you're sitting with right now?
- Who do you wish you spent more time with?
- What's something you've been telling yourself for too long?
- What did you used to be afraid of that you're not anymore?
- If a year passed and one thing had genuinely shifted, what would you want it to be?
- What's a question you wish someone would ask you?
- What's the most accurate criticism anyone's ever made of you?

## Triggers — how future-self gets summoned

Three trigger types. All explicit and user-initiated. None ambient.

### 1. Slash command

`/futureself horizon:<1y|5y> about:<topic>`

Example: `/futureself horizon:1y about:"the contract decision"`

Future-self responds in DMs with their take. Conversation continues in DMs naturally.

### 2. Reaction

User reacts to any message in any channel they're in (including their own messages) with the ⏳ emoji. Future-self picks it up as context and DMs the user with their response.

This requires the bot to be present in the channel where the reaction happens. Don't worry about reactions across channels the bot isn't in.

### 3. Scheduled check-in

At any point during a conversation with future-self, either party can propose a check-in. Examples:
- "Want me to check back in on this in 6 months?"
- User: `/futureself schedule date:2026-11-02 about:"the contract decision outcome"`

The check-in is stored as a Workflow that sleeps until the scheduled time, then wakes and DMs the user with appropriate framing.

### 4. (Stretch) Resurface tagging

During a conversation, future-self (or the user via a specific command) can tag an idea/prediction/message for surfacing later. Internally this just creates a scheduled check-in with the original message as context.

Demo this if time permits; cut it if not.

## Architecture

### Stack

- Next.js 16 (App Router), TypeScript, Tailwind, shadcn/ui — the standard v0 stack.
- ChatSDK with Discord adapter — for the bot.
- AI SDK 6 — for LLM calls. Use the AI Gateway for model access.
- Workflow SDK (WDK) — for durable scheduled check-ins.
- Database: Vercel Postgres or Vercel KV. Pick whichever has the lower setup tax. The data we need to store is small.
- Auth: Discord OAuth for connecting the user's account to the bot. No separate user/password auth.

### Data model (sketch)

- `users`: Discord user ID, voice profile (JSON), onboarding responses (JSON), created_at
- `conversations`: user_id, future_self_horizon (1y or 5y), thread (JSON of messages), started_at
- `scheduled_events`: user_id, fires_at, kind ("check_in" | "resurface"), payload (JSON)

The `scheduled_events` table is *not* what triggers the workflows. WDK workflows are themselves the persistence — when you `start()` a workflow that sleeps, WDK handles the durability. The table is for the *user-facing list* of "things future-you has scheduled with present-you" so the user can see what's pending and cancel if needed.

### Routes (sketch)

- `/` — landing page
- `/onboarding` — multi-step survey
- `/onboarding/connect` — Discord OAuth connection
- `/dashboard` — list of upcoming scheduled events, voice profile preview, edit voice
- `app/api/discord/...` — ChatSDK webhook handlers
- `app/api/workflows/...` — WDK workflow definitions and routes

### Workflows

Each scheduled check-in is a workflow that:
1. Sleeps until the scheduled time.
2. Wakes, fetches the user's current voice profile and the relevant context.
3. Generates the future-self message.
4. Posts it to the user via the Discord bot.

Use the `"use workflow"` and `"use step"` directives. See https://workflow-sdk.dev for current API.

## Visual / design direction

This is web-only (onboarding + dashboard). The product itself is in Discord; we don't compete on UI for the chat surface.

For the web UI:

- **Warm, paper-feeling palette.** Cream/off-white background (not pure white). Deep navy or burgundy as primary. Muted gold or terracotta as accent.
- **Serif typography for body text.** EB Garamond, Crimson Pro, or Lora.
- **One display serif for headings.** Something with a literary feel.
- **Generous whitespace.** This is a contemplative tool, not a productivity dashboard.
- **Avoid SaaS aesthetic entirely.** No gradient hero images. No "Get Started" CTAs. No three-column feature grids.

The onboarding feels like filling out a thoughtful intake form, not a wizard. The dashboard feels like a quiet inbox of pending notes from future-you.

### CSS variables to set

```css
--bg: #faf6ed;          /* warm cream */
--ink: #1c1c1e;         /* near-black for text */
--primary: #2c3e50;     /* deep slate-navy, or try #6b1f2e (burgundy) */
--accent: #b8860b;      /* muted gold */
--muted: #6b6356;       /* warm grey */
--paper-grain: ...      /* subtle paper texture, optional */
```

Override Tailwind defaults; do NOT use the default blue/indigo/slate palette.

## Hard constraints (these do not change)

- **Privacy.** The user's onboarding data, voice profile, and conversation history never leave our infrastructure. Don't send to analytics, don't log conversation content beyond what's needed for debugging, don't include in error reports.
- **No voice training without consent.** We use the sample messages to construct prompts at runtime. We do not fine-tune anything on user data.
- **Future-self never gives medical advice.** If a user asks about medical decisions, future-self acknowledges the weight of the question and declines to weigh in on the medical specifics. They can speak to the *experience* of going through something hard, not the medical content.
- **Future-self never roleplays as a deceased person.** If the user names a specific future event involving someone's death, future-self handles with care; if the user tries to use the tool to talk to a real person who has died, future-self gently redirects.
- **No content involving minors as romantic/sexual subjects.** Standard rules.
- **Consent for scheduled messages.** Every scheduled future-self message must have been explicitly opted into by the user. Never auto-schedule.

## Out of scope for v1 (do not build, do not get distracted)

- Multiple platforms (Slack, Teams, etc.)
- Multiple users in the same Discord server (multi-tenant) — single-user demo only
- Voice cloning (audio)
- Image generation of future-self
- Past-self (writing to your past self)
- Group conversations with multiple future-selves at once
- Pricing/billing
- Analytics dashboard for the user
- Sharing future-self conversations
- Web-based chat with future-self
- Any kind of "achievement" or "milestone" system

## Demo arc (the thing this is all building toward)

1. "I built a tool where your future selves live in your Discord."
2. Show Discord. DMs from "you, in 1 year" and "you, in 5 years."
3. In a public channel I'm in, post: "I'm thinking about taking on a contract that pays well but I'd hate the work." React with ⏳.
4. Within seconds, DM from 1-year-future-self. They respond in my voice with their delta. Read it aloud. Have a 30-second conversation in front of the audience.
5. End of conversation, future-self asks: "Want me to actually check back on this in 6 months?" Yes. Schedule.
6. Switch to a different DM thread — a check-in that arrived "today" from a request scheduled previously. Read aloud.
7. Show the WDK observability dashboard with the durable workflow that's been sleeping. "This used Workflows for the durable scheduling. The scheduled check-in survived deploys, crashes, everything."
8. Land it: "ChatSDK + Workflows + AI SDK. Submission is to ChatSDK track."

90 seconds. Three beats. One tonal turn (the contract conversation has weight; the check-in has more).

## What goes in the build, in priority order

If running out of time, cut from the bottom up. Don't move on to a later item if the prior one isn't working.

1. Onboarding flow that captures voice profile (web)
2. Discord bot scaffold with ChatSDK, slash command + reaction triggers
3. AI SDK integration with voice-profile-driven prompts, working in DMs
4. **DEMO IS POSSIBLE FROM HERE.** Everything below is enhancement.
5. Scheduled check-ins via Workflows
6. Dashboard showing pending scheduled events
7. Resurface tagging during conversations

## Notes on agent collaboration

If a v0 chat or other agent is reading this:

- Read https://chat-sdk.dev/docs and https://workflow-sdk.dev before writing ChatSDK or Workflows code. Do not guess.
- The survey questions above are final. Do not "improve" them by making them more goal-oriented or productivity-flavored.
- The voice direction is final. Do not soften it. If you find yourself adding "but make sure to be encouraging" anywhere in the system prompt, stop.
- When in doubt, prefer less. This project's quality is in restraint.
- Update `.v0/findings.md` when you discover something other agents should know.
