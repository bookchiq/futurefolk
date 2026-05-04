# Futurefolk — Post-Hackathon Backlog

Single source of truth for what to do next, in execution order. Rationale for each item lives in `STRATEGY-REVIEW.md`.

Status legend: `[ ]` not started • `[~]` in progress • `[x]` done

---

## P0. Voice tightening (shipped)

- [x] Em-dash hard rule in system prompt (`lib/voice.ts`, `.v0/prompts.md`)
- [x] Em-dash post-process strip in `lib/future-self.ts::cleanup`
- [x] Verdict-opener tells added to `detectTells`
- [x] Intensifier-stacking detector (genuinely/truly/actually/really, 3+ uses)
- [x] Contrastive coach-vs-friend example block in system prompt

## P1. Quick cleanups

- [x] Remove `console.log("[v0] ...")` debug statements in `app/onboarding/voice/page.tsx`
- [x] Add `tsconfig.tsbuildinfo` to `.gitignore`, untrack with `git rm --cached`
- [x] `lib/db.ts` — replace `console.warn` with throw-at-import
- [x] `app/onboarding/connect/page.tsx:38` — `useRouter()` is used by the back button; no removal needed
- [ ] (Deferred) Silence the per-request `MemoryStateAdapter is not recommended for production` warning

## P2. Voice quality — second pass

### P2a. Few-shot dialogue pairs in the messages array

- [x] Define `VoiceProfile.fewShotPairs: FewShotPair[]` on the schema (in `lib/few-shot-pairs.ts`)
- [x] Prepend few-shot pairs as `role: "user"` / `role: "assistant"` entries in `lib/future-self.ts::buildMessages`
- [x] Generate per-user via `extractFewShotPairs` (uses the runtime system prompt as meta-context, including stylometric features). Backfilled lazily in `getVoiceProfile` for existing profiles; extracted in the onboarding `after()` block for new ones.
- [x] System-prompt note tells the model the leading message pairs are demonstrations, not actual past conversation

### P2b. Active stylometric extraction at onboarding

- [x] Add `voiceProfile.styleFeatures` field with concrete extracted patterns
- [x] One-time LLM call (in `lib/style-features.ts::extractStyleFeatures`) populates `styleFeatures`. Triggered in the background after onboarding submit via `after()`; existing profiles get a lazy backfill in `getVoiceProfile`.
- [x] Inject `styleFeatures` into the system prompt as concrete numbers/patterns (`formatStyleFeatures` in `lib/voice.ts`)
- [x] Idempotent — only runs if `styleFeatures` is missing on the profile

### P2c. Two-pass voice transfer (experiment)

- [ ] Spike: branch that generates "the take in plain coach voice" then rewrites in user's voice. A/B against single-pass.

## P3. Durable Gateway worker on Railway + ChatSDK split

### P3a. Worker code

- [x] Extend `scripts/gateway-worker.ts` to also handle `messageReactionAdd`
- [x] Add a `start:worker` npm script
- [x] Promote `discord.js` to a direct dependency

### P3b. ChatSDK split (remove inert code)

- [x] Remove `bot.onSubscribedMessage(...)` from `lib/bot.ts`
- [x] Remove `bot.onReaction(...)` from `lib/bot.ts`
- [x] Remove `dm.subscribe()` and `dm.setState()` calls from the slash command flow
- [x] Update `.v0/findings.md` with the new split
- [ ] (Cannot do) Drop `@chat-adapter/state-memory` from deps — required by ChatSDK's `Chat` constructor type

### P3c. Railway provisioning

- [ ] Connect the GitHub repo on Railway. New service.
- [ ] Set start command: `pnpm start:worker`
- [ ] Paste env vars: `DISCORD_BOT_TOKEN`, `ANTHROPIC_API_KEY`, `DATABASE_URL`
- [ ] Deploy. Verify worker connects in logs.
- [ ] Test from Discord: DM reply + ⏳ reaction
- [ ] Tear down local worker process

## P4. Multi-tenant testability via Discord User App

- [ ] Discord Developer Portal: enable "User Install" alongside "Guild Install"
- [ ] Update `scripts/register-commands.ts`: add `integration_types: [0, 1]` and `contexts: [0, 1, 2]`
- [ ] Re-run `pnpm register:commands`
- [ ] Verify ChatSDK's `bot.openDM(event.user)` works for users not sharing a guild
- [ ] Update `app/onboarding/connect/page.tsx` copy: User Install link
- [ ] Update `README.md` "how to try Futurefolk" section
- [ ] Send install link to ~3 friends; collect feedback

## P5. Onboarding sample-message preview

- [x] Live "we see N messages" preview using `splitSampleMessages` (extracted to `lib/parse-sample-messages.ts` so the client can call it without pulling in the server-only voice-profile module)
- [ ] (Deferred) Allow individual message edits / deletions — needs more UI work; defer until a friend tester reports parsing issues that the current preview can't fix
- [x] "This looks like one big message" hint when the input has newlines but the parser collapsed everything to one entry

## P6. Voice profile editor (`/profile` page)

- [ ] New `/profile` route, gated on Discord OAuth
- [ ] Editable fields: each VoiceProfile field + sample messages array
- [ ] Save button updates the `users` row by Discord ID
- [ ] If P2b is in: trigger stylometric re-extraction on save

## P7. First-run preview on `/onboarding/done`

- [x] Generate a 1y-future-self response (new `"preview"` trigger context that reflects on the user's stated season of life — no question to invent)
- [x] Render on the done page above the existing "What to try first" block, with a graceful loading state and a hide-on-error fallback
- [ ] Thumbs-up / thumbs-down. Down → link to `/profile` (deferred — `/profile` is P6 and unbuilt)

## P8. Scheduled check-ins via Workflow SDK

- [ ] Read `https://workflow-sdk.dev` and `https://vercel.com/docs/workflows`
- [ ] Wire the existing `schedule:` parameter on `/futureself` to a workflow that sleeps until the date
- [ ] On wake: load profile + history, generate a check-in, post to user's DM
- [ ] Allow future-self mid-conversation to propose a check-in (button → schedules workflow)
- [ ] `/profile` page: "scheduled check-ins" section with pending workflows + cancel button

---

Out-of-scope items live in `.v0/instructions.md`.
