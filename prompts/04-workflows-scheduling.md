# Prompt 4: Workflows Scheduling

**Use this in a fresh v0 chat,** AFTER AI integration is working. Connect to the same GitHub repo.

**THIS IS A STRETCH GOAL.** Only attempt this if the demo is already viable from prompts 1-3 (onboarding + bot + AI working in DMs). If you're behind on time, skip this.

---

Read `AGENTS.md`, `.v0/instructions.md`, and `.v0/prompts.md` first. Confirm you've read them before continuing.

**CRITICAL:** Workflow SDK (WDK) is recent and your training data is thin. Before writing any workflow code, fetch and read https://workflow-sdk.dev and https://vercel.com/docs/workflows. Do not guess at APIs.

Add durable scheduling for future-self check-ins using Vercel's Workflow Development Kit.

## What to build

### 1. The scheduled check-in workflow

A workflow that:
1. Sleeps until a specified date
2. Wakes, fetches the user's current voice profile
3. Generates a check-in message using the system prompt template for "scheduled check-in" (in `.v0/prompts.md`)
4. Posts it to the user via the Discord bot DM

Use `"use workflow"` and `"use step"` directives. The sleep is the durability — it must survive deploys.

### 2. Trigger from conversation

In the AI integration code, when future-self proposes a check-in and the user accepts (e.g., they reply "yes" or use a button), call `start()` on the workflow with:
- `userId`
- `discordChannelId` (so the workflow knows where to post)
- `horizon` (1y or 5y, matches the future-self that scheduled it)
- `topic` (what they want to check in about)
- `originalConversationExcerpt` (the relevant prior messages)
- `firesAt` (the scheduled date)

### 3. User-facing dashboard at `/dashboard`

A page showing:
- All pending scheduled events for this user
- Each one: when it fires, what it's about, who scheduled it (1y or 5y future-self)
- A "cancel" option for each

Pull from the `scheduled_events` table (which mirrors what's in workflows for user-facing display purposes).

When user cancels, mark the event as cancelled in the database. The workflow itself can check its own cancellation flag when it wakes up.

### 4. (Stretch within stretch) Resurface tagging

During a conversation, if future-self identifies something worth surfacing later, the system can:
1. Propose to the user: "want me to bring this back to you in [interval]?"
2. If the user agrees, schedule a workflow with kind="resurface" instead of "check_in"
3. The workflow uses the resurface system prompt template instead

## Architecture notes

Per WDK docs:
- Workflow definition files live at `workflows/` at the same level as `app/` (NOT inside src/)
- Each workflow needs corresponding API routes in `app/api/`
- Use `getWritable()` only inside `"use step"` functions, not directly in workflow functions
- Workflow functions are sandboxed — no native fetch, no setTimeout
- Steps have full Node.js access

## Demo considerations

For the demo, you'll want to be able to show:
1. A scheduled check-in firing (use a short interval like 2 minutes for the live demo, then describe how production would use longer intervals)
2. The WDK observability dashboard showing the sleeping workflow
3. The user-facing dashboard showing pending events

## What NOT to do

- Do not use cron jobs, setTimeout, or queue services. WDK handles all scheduling.
- Do not skip the Workflow docs. Your training data is wrong on this. Fetch them.
- Do not add complex retry logic on top of WDK — WDK has retries built in.
- Do not store sensitive data in workflow inputs without considering encryption (WDK encrypts by default, but verify).

## Definition of done

- A scheduled check-in workflow exists and works
- It can be triggered from the conversation flow
- The dashboard shows pending events
- The WDK observability dashboard shows sleeping workflows
- Cancellation works
- A live demo with a short interval (2 min) successfully fires

Update `.v0/findings.md` with anything you learn about WDK that other agents should know.
