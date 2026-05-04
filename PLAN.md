# Futurefolk — Post-Hackathon Backlog

Single source of truth for what to do next. Items in execution order.
Rationale for each item lives in `STRATEGY-REVIEW.md`.

Status legend: `[ ]` not started • `[~]` in progress • `[x]` done

---

## P0. Voice tightening (in flight, partially shipped)

Original em-dash work, expanded in scope after the strategy review.

- [x] Em-dash hard rule in system prompt (`lib/voice.ts`, `.v0/prompts.md`)
- [x] Em-dash post-process strip in `lib/future-self.ts::cleanup`
- [x] Verdict-opener tells added to `detectTells`
- [x] Intensifier-stacking detector (genuinely/truly/actually/really, 3+ uses)
- [x] Contrastive coach-vs-friend example block in system prompt

These shipped during the conversation on 2026-05-03.

---

## P1. Quick cleanups (~15 min, zero risk)

Free-the-head fixes. None blocking, all noticed during the strategy review.

- [x] Remove `console.log("[v0] ...")` debug statements in `app/onboarding/voice/page.tsx`
- [x] Add `tsconfig.tsbuildinfo` to `.gitignore`, untrack with `git rm --cached`
- [x] `lib/db.ts` — replace `console.warn` with throw-at-import. Clear failure beats mysterious one.
- [x] `app/onboarding/connect/page.tsx:38` — `useRouter()` is used by the back button. No removal needed.
- [ ] (Deferred) Silence the per-request `MemoryStateAdapter is not recommended for production` warning. Will revisit if it becomes annoying; we can't drop the adapter (ChatSDK's Chat constructor requires it), and the warning itself is harmless.

---

## P2. Voice quality — second pass (highest ceiling-raise)

The em-dash work is the safety net; this is the actual fix. See STRATEGY-REVIEW.md §1.

### P2a. Few-shot dialogue pairs in the messages array

- [ ] Define a new optional `voiceProfile.fewShotPairs: Array<{user: string, assistant: string}>` on the schema.
- [ ] For each invocation in `lib/future-self.ts::buildMessages`, prepend few-shot pairs as actual `role: "user"` / `role: "assistant"` entries before the real conversation history.
- [ ] Seed ~3 hand-written pairs in the canonical voice (Sarah's profile, for the demo) so we can validate the approach before building the on-the-fly generation.
- [ ] Document the rule: "few-shot pairs are demonstrations, not examples to copy verbatim. Don't mirror their content; mirror their register."

### P2b. Active stylometric extraction at onboarding

- [ ] Add a new `voiceProfile.styleFeatures` field with concrete extracted patterns (lowercase ratio, avg sentence length, common openers, hedge frequency, idioms used, capitalization habits).
- [ ] Add a one-time LLM call inside `buildVoiceProfileFromResponses` (or a separate post-submit action) that reads the sample messages and outputs structured `styleFeatures` JSON.
- [ ] Inject `styleFeatures` into the system prompt as concrete numbers and patterns ("their average sentence is N words; they use X as an opener; they don't capitalize after periods").
- [ ] Make extraction idempotent and cheap — only re-run when sample messages change.

### P2c. Two-pass voice transfer (experiment, not committed)

- [ ] Spike: a branch that generates "the take in plain coach voice" then rewrites in user's voice in a second call. A/B against single-pass on a few prompts. Ship if clearly better; revert if marginal.

---

## P3. Durable Gateway worker on Railway + ChatSDK split

Replace the laptop-running worker with hosted Railway, AND formalize the ChatSDK boundary at the same time. See STRATEGY-REVIEW.md §2.

### P3a. Worker code

- [x] Extend `scripts/gateway-worker.ts` to also handle `messageReactionAdd`.
- [x] Add a `start:worker` npm script.
- [x] Promote `discord.js` to a direct dependency.

### P3b. ChatSDK split (remove inert code)

- [x] Remove `bot.onSubscribedMessage(...)` from `lib/bot.ts`.
- [x] Remove `bot.onReaction(...)` from `lib/bot.ts`.
- [x] Remove `dm.subscribe()` and `dm.setState()` calls from the slash command flow.
- [x] Update `.v0/findings.md` with the new split.
- [ ] (Cannot do) Drop `@chat-adapter/state-memory` from deps. ChatSDK's `Chat` constructor type requires a state adapter. Stays as a dep.

### P3c. Railway provisioning (requires Sarah's hands)

- [ ] Connect the GitHub repo on Railway. New service.
- [ ] Set start command: `pnpm start:worker`.
- [ ] Paste env vars: `DISCORD_BOT_TOKEN`, `ANTHROPIC_API_KEY`, `DATABASE_URL`. Same values as Vercel.
- [ ] Deploy. Verify in logs that worker connects (`[gateway-worker] connected as Futurefolk#9047`).
- [ ] Test from Discord: reply in an existing DM thread → confirm response. React with ⏳ → confirm DM.
- [ ] Tear down local worker process.

---

## P4. Multi-tenant testability via Discord User App

Let other people install Futurefolk to their Discord account without sharing a server with the bot. See PLAN's earlier draft + STRATEGY-REVIEW.md.

- [ ] In Discord Developer Portal: Application → Installation → enable "User Install" alongside existing "Guild Install."
- [ ] Update `scripts/register-commands.ts`: add `integration_types: [0, 1]` (Guild + User) and `contexts: [0, 1, 2]` (Guild, BotDM, PrivateChannel) to the `/futureself` command.
- [ ] Re-run `pnpm register:commands` to push the updated command shape.
- [ ] Verify ChatSDK's `bot.openDM(event.user)` works for users not sharing a guild with the bot. If it doesn't, document the workaround (likely an ephemeral interaction response with a link to the bot's DM).
- [ ] Update `app/onboarding/connect/page.tsx` copy: "install Futurefolk to your Discord" + a User Install link, alongside (or instead of) the OAuth identify-only flow.
- [ ] Update `README.md` "how to try Futurefolk" section: install → onboarding → link Discord → invoke `/futureself` from anywhere.
- [ ] Send the install link to ~3 friends. Collect feedback.

---

## P5. Onboarding sample-message preview

The most important field gets a parsed-preview UI. See STRATEGY-REVIEW.md §3.

- [ ] After the user fills the sample-messages textarea, show a live "we extracted N messages — does this look right?" preview using the same `splitSampleMessages` logic.
- [ ] Allow individual message edits / deletions in the preview.
- [ ] Optional: a "this looks wrong, paste differently" instruction that explains the blank-line-vs-newline parsing.

---

## P6. Voice profile editor (`/profile` page)

A real dashboard equivalent. Lets users iterate on their voice without redoing onboarding. See STRATEGY-REVIEW.md §3.

- [ ] New `/profile` route, gated on Discord OAuth (link from `/onboarding/done` and from a top-level nav).
- [ ] Editable fields: each VoiceProfile field (overusedPhrase, badNewsExample, etc.) + the sample messages array.
- [ ] Save button that updates the `users` row by Discord ID.
- [ ] If P2b is in: trigger stylometric re-extraction on save.

---

## P7. First-run preview on `/onboarding/done`

Show one sample future-self response before sending the user to Discord. See STRATEGY-REVIEW.md §3.

- [ ] Generate a 1y-future-self response to a generic prompt ("what should I tell them about you?" or similar) using their just-built voice profile.
- [ ] Render on the done page with a "this is your future self speaking — sound right?" frame.
- [ ] Thumbs-up / thumbs-down. Down → "edit your profile" link to P6.

---

## P8. Scheduled check-ins via Workflow SDK

Biggest unbuilt feature. Defer until everything above is solid. See STRATEGY-REVIEW.md §5.

- [ ] Read `https://workflow-sdk.dev` and `https://vercel.com/docs/workflows` carefully. Don't guess at the API.
- [ ] Wire the existing `schedule:` parameter on `/futureself` to actually create a workflow that sleeps until the date.
- [ ] On wake: load profile + history, generate a check-in response, post to the user's DM.
- [ ] Add a way for future-self mid-conversation to propose a check-in ("want me to come back to this in 30 days?") — captured as a button click that schedules the workflow.
- [ ] `/profile` page (P6) gets a "scheduled check-ins" section showing pending workflows + cancel button.

---

## What we are NOT doing

Reaffirmed from `.v0/instructions.md` and the strategy review. If anything below feels tempting, re-read the docs first.

- Multi-platform (Slack/Teams/etc.)
- Voice cloning, audio, video
- Past-self
- Group conversations
- Pricing / billing
- Analytics for users
- Sharing future-self conversations
- Web-based chat with future-self
- Achievements / streaks / gamification
- Adding more horizons beyond 1y / 5y
- Goal tracking
- Ambient channel monitoring
