# Prompt 1: Onboarding Flow

**Use this in a fresh v0 chat.** Connect it to your GitHub repo. This is the first thing to build.

---

Read `AGENTS.md` and `.v0/instructions.md` first. Confirm you've read them before continuing.

Build the onboarding flow for this project. This is the web UI users see when they first arrive. The product itself lives in Discord; this is the bridge.

## What to build

A multi-step onboarding flow at `/onboarding`. The user moves through it linearly.

### Step 1: Welcome screen at `/onboarding`

Single page. The page says, in essence: this is a tool where your future selves can write to you in Discord. Before that can happen, you need to tell us a bit about yourself — not for goal-setting, but so the future-selves can sound like you. Will take about 5 minutes.

A single button: "Begin." No "Get Started." No marketing copy. No three-column feature grid.

### Step 2: The required questions at `/onboarding/voice`

The seven questions are in `.v0/instructions.md` under "Onboarding survey → Required questions." Use those exact questions. Do not add to them. Do not "improve" them.

Layout: one question per screen, with a textarea for the answer. Progress indicator showing where they are (1 of 7). No timer. No "skip" button — these are required.

For question 6 (paste 5-10 messages), give them a larger textarea and explain briefly: "Paste recent messages you've sent to friends. This is how the future-selves will pick up your cadence. Doesn't have to be 10 — even 5 helps. Don't curate; pick whatever's already in your sent folder."

### Step 3: Optional deeper questions at `/onboarding/deeper`

After completing the seven required, present the optional deeper questions (also in instructions.md). 

Layout: all on one page, with a clear note that these are optional and they can come back later. Each question has a small textarea, all collapsible/expandable. A "Save and continue" button at the bottom that works whether they've filled in any or not.

### Step 4: Discord connection at `/onboarding/connect`

A page that explains: now we connect Discord, so your future-selves have somewhere to live. A "Connect Discord" button that initiates Discord OAuth.

For now, scaffold the OAuth flow but do not implement the webhook setup or bot installation. We'll handle that in a separate chat.

### Step 5: Done at `/onboarding/done`

Confirmation page. Tells the user their voice profile has been built and they can now use the bot in Discord. Shows a brief "what to try first" — the two slash commands and the reaction trigger.

## Visual direction

Use the CSS variables and design notes in `.v0/instructions.md` under "Visual / design direction." Specifically:
- Cream background, deep navy or burgundy primary, muted gold accent.
- Serif fonts (EB Garamond or Crimson Pro for body, something with literary feel for headings).
- Generous whitespace.
- No SaaS patterns. This should feel like a thoughtful intake form, not a wizard.

Override Tailwind's default palette. Set the CSS variables in globals.css.

## Data persistence

For this chat, just store the responses in component state and log them. We'll wire up the database in a separate chat.

## What NOT to do

- Do not add motivational copy. No "Let's discover the future you!" or anything in that family.
- Do not add a three-step "How it works" section. The user is in the flow already.
- Do not use blue or indigo. Use the project palette.
- Do not add icons everywhere. Restraint.
- Do not add testimonial sections, FAQs, or footers with too many links.

## Definition of done for this chat

- All five routes exist
- The seven required questions render correctly with no skipping
- The optional deeper section renders with collapsible questions
- The Discord OAuth button initiates the flow (even if the callback isn't fully wired)
- The visual direction is followed (no SaaS aesthetic, serif fonts, paper palette)
- Responses are captured in state and logged on submit

Update `.v0/findings.md` if you discover anything other agents should know.
