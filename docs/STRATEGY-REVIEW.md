# Strategy Review

> **Snapshot from 2026-05-03.** Strategic critical-pass review of the codebase at commit (current branch). May be stale; verify against current code before acting on specific line references.

A critical pass over the codebase as it stands on 2026-05-03, the day after the hackathon win. Goal: name the strategic choices that look weak with a fresh eye, separate from "is this code clean," before workstreams #2 (Railway) and #3 (multi-tenant) lock in the current shape.

Opinions are mine and clearly marked. Code quality is fine almost everywhere — the issues below are about *strategy* (what we're betting on, what each layer is buying us, where the ceiling is), not lint.

---

## 1. Voice strategy has a hard ceiling

**Observation.** The voice pipeline today is: survey → `VoiceProfile` JSON → injected into a static system prompt at every call → tell-detector regex on the output → optional regenerate. That's pure prompt engineering with a small post-process safety net. Today's improvements (em-dash strip, verdict-opener detection, intensifier stacking) extend the safety net, but they don't change the underlying bet.

**Why it matters.** Sarah's "this still sounds like Claude" instinct is correct, and the reason is structural: putting a few prose answers and 5-10 sample messages into a system prompt makes the model adopt *some* surface idiom (punctuation, casual register), but the response shape — sentence rhythm, opener pattern, paragraph structure, the implicit "I am a wise advisor" register — defaults back to Claude's training distribution. Abstract instructions like "one less hedge per sentence" don't survive because the model doesn't know what the user's hedge baseline is to subtract from. The verdict-opener tell I just added catches one expression of this, but the underlying register remains unchanged.

**Recommendation.** Three things, in order of leverage:

- **Few-shot dialogue pairs in the messages array, not the system prompt.** The current sample messages are inside the system prompt as a static block. Instead, generate (or write by hand, for the demo user) 2-3 example pairs of `(user prompt → ideal future-self reply)` and prepend them as actual `user`/`assistant` turns in the messages array. This is dramatically more effective than instructions because the model imitates demonstrated behavior much more reliably than described behavior. AI SDK supports it natively.
- **Two-pass voice transfer.** Single-pass "be them in their voice" asks the model to do two cognitively distinct things at once (have the right take + render it in voice). Splitting into "first write the take in plain coach voice → then rewrite it in their voice with these specific differences" usually produces better voice fidelity, at the cost of doubling latency. Worth A/B-ing.
- **Active stylometric extraction.** When the user pastes sample messages, do a one-shot LLM call at onboarding time that extracts concrete stylistic features (lowercase ratio, average sentence length, specific idioms used, common openers, hedge frequency) and stores those as discrete fields on the voice profile. Then the runtime prompt cites concrete numbers and patterns ("their average sentence is 9 words; they use 'honestly' as an opener; they don't capitalize after periods") instead of relying on the model to absorb the corpus on every call. This is a one-time onboarding cost that pays back forever.

The current tell-detector approach hits diminishing returns fast. Adding more patterns means more regens (currently each tell trip costs a full second generation, which is expensive both in latency and tokens), and the patterns themselves are inherently fragile (any new Claude default style is a new tell to chase). The leverage is in not producing the tell in the first place — which means more investment in inputs to the prompt, not more rules in the post-process.

---

## 2. ChatSDK is doing about half its job

> [Status as of 2026-05-03: §2 has been executed; the inert handlers are removed and ChatSDK is scoped to the slash command webhook only. The table below describes the pre-split state for context. See the 2026-05-03 ChatSDK-split entry in `.v0/findings.md` for the current shape.]

**Observation.** ChatSDK was a track requirement at the hackathon. Post-hackathon that constraint is gone. Looking at what it actually buys us in the deployed code:

| ChatSDK feature | Status |
|---|---|
| Discord webhook signature verification | Used. Works. ~10 lines saved. |
| Slash command dispatch + option parsing | Used. The `event.raw.data.options` workaround in `lib/bot.ts:158` shows the abstraction leaks. |
| `bot.openDM(...)`, `dm.post(...)` | Used. Reasonable wrappers. |
| `dm.subscribe()` + `onSubscribedMessage` | Was wired in `lib/bot.ts` but **inert**. State adapter is in-memory (loses subscriptions on cold start) and Hobby can't hold the Gateway WebSocket open anyway. Removed in the 2026-05-03 split. |
| `onReaction(...)` | Was wired in `lib/bot.ts` but inert for the same reason. Removed in the 2026-05-03 split. |
| Multi-platform abstraction | Unused per `.v0/instructions.md` ("ship Discord only"). |
| State adapter for thread metadata | `@chat-adapter/state-memory` — explicitly documented as "not for production" (`.v0/findings.md`). Still required by ChatSDK's `Chat` constructor type; we no longer use subscriptions. |

**Why it matters.** Half of ChatSDK's surface is unused or broken in production. We carry the dependency cost, the indirection cost (the `parseSlashOptions` workaround), and the lock-in cost. And: the Railway Gateway worker we wrote during the hackathon **doesn't use ChatSDK at all** — it uses discord.js directly. So the pattern of "use ChatSDK for the slash command webhook, use discord.js directly for everything Gateway" is already established, just not stated.

**Recommendation.** Lock the split formally and stop investing in ChatSDK:

- Keep ChatSDK exactly where it earns its weight: `app/api/webhooks/discord/route.ts` for slash command dispatch + signature verification. That's it.
- Remove `dm.subscribe()`, `onSubscribedMessage`, `onReaction` from `lib/bot.ts`. They're inert and confusing — readers think the code is doing something it isn't. (`.v0/findings.md` already calls them out as "correct code with nothing forwarding events into them.")
- The Railway worker handles all Gateway-side triggers (DM continuations, reactions) using discord.js directly, calling our existing `generateFutureSelfResponse`/`appendMessage`/`getRecentMessages` functions. No ChatSDK involvement.
- Drop `@chat-adapter/state-memory` from dependencies. Without subscriptions, we don't need it. Conversation history is already in our own `conversation_messages` table.

This isn't a "drop ChatSDK" recommendation. It's a "make the seam clean" recommendation. The slash command path is genuinely cleaner with ChatSDK; the Gateway path is genuinely cleaner without it.

---

## 3. Onboarding under-invests in the highest-signal input

**Observation.** Voice fidelity is overwhelmingly determined by the sample messages corpus. Of the seven required questions, six produce *content/values/stakes* (idiom hints, what they care about) and one — sample messages — produces *cadence* (the actual rhythm and shape of their voice). Yet sample messages gets the same treatment as the others: a single textarea, no preview, no parsing feedback, no follow-up prompt to add more.

**Why it matters.** The split on `\n\s*\n` in `splitSampleMessages` is reasonable but invisible to the user. If they paste five short messages each on one line they get five entries; if they paste five messages with internal line breaks they get one giant blob. The user has no way to see what the system extracted, no way to revise it, and no way to add more after onboarding. After they finish, there is no "your voice profile" page (the done page links to a dashboard that doesn't exist).

**Why it matters strategically.** This is the one input the model can't infer from anything else. If voice quality is the product (per `.v0/instructions.md`: "voice IS the project"), then the corpus is the asset. Treating it as one of seven equal-weight survey questions is incongruous with how much depends on it.

**Recommendation.** Three small interventions, in order of impact:

- **Preview parsed messages before submit.** After the user pastes their corpus, show them "we extracted N messages — does this look right?" with the parsed list. Let them edit individual entries. This catches the line-break parsing case and makes the input legible.
- **Build a real `/profile` page.** Editable voice profile + add-more-messages. Solves the "voice feels off, can't tweak" problem and gives users a reason to return.
- **First-run preview.** After onboarding, before sending them to Discord, generate one sample future-self response for a generic prompt ("what should I tell them about you?") and show it on the done page. Lets them see the voice, give thumbs-up/-down, and revise the profile if it's off. Currently the only way to find out the voice is wrong is to use the bot for real.

The first one is ~30 minutes of work and significantly improves the input data quality. The other two are bigger but compound: a feedback loop on the input that's most responsible for output quality.

---

## 4. The tell-detector + regen pattern is expensive at the current pattern count

**Observation.** Each tell trip costs a full second generation (`lib/future-self.ts:107`) — same model, same context, ~600 tokens. With today's additions (verdict opener, intensifier stacking) on top of the existing patterns, my rough estimate is 30-50% of generations will trip at least one pattern, doubling latency and token cost on those.

**Why it matters.** Latency on a Discord DM matters less than it would on a chat UI (Discord shows "is typing" while we work), so the user-facing cost is modest. But token cost is real, and the failure mode at scale is "every other generation is regenerated, so spend doubles for marginal voice quality gain." Also: regen is a band-aid — if we keep adding patterns to chase tells, we never confront the root cause (the prompt isn't strong enough to prevent them).

**Recommendation.** Treat the tell-detector as a true safety net, not a primary mechanism:

- Keep the regex but cap the patterns. Today's set is already pretty broad. Don't keep adding.
- Invest the next chunk of voice work into prompt strengthening (workstream #1 above), not detector strengthening.
- For em-dashes specifically, the post-process strip we just added is the right answer — Claude's em-dash rate is high enough that regen would trigger constantly, and the strip is deterministic and free.
- Consider: should "verdict opener" be a regen target at all, or is it better expressed as a few-shot example showing the model what NOT to do? The contrastive example we just added in `lib/voice.ts` is actually a better tool for this than a regex.

---

## 5. Scheduled check-ins are the unbuilt feature with the most strategic weight

**Observation.** Per `.v0/instructions.md`, scheduled check-ins via Workflow SDK were planned but cut for the hackathon. The slash command at `scripts/register-commands.ts:51` even has an unused `schedule:` parameter. None of this is in the deployed code.

**Why it matters.** "Future-you DMs you in 30 days about the decision you're sitting with right now" is qualitatively different from "future-you replies when you ask." The first is a unique product capability; the second is "AI advice with a wrapper." Retention, distinctiveness, and the demo arc all hinge on the scheduled trigger more than the on-demand one.

**Recommendation.** Not for now — workstreams #1-#3 should land first, and Workflow SDK has a learning curve that would slow the current improvements. But after voice quality is solid and durability is in place (probably 2-3 weeks), this is the highest-leverage feature to build next. Everything currently shipped is a vehicle for delivering scheduled future-self messages; once that vehicle works, the scheduled-check-in feature is what makes Futurefolk *Futurefolk* and not "yet another Discord LLM bot."

---

## 6. Smaller things worth fixing now, low effort

These don't merit their own section but are worth a follow-up commit:

- `app/onboarding/voice/page.tsx:48,53` — `console.log("[v0] ...")` debug statements left over from v0. Remove.
- `tsconfig.tsbuildinfo` is git-tracked and dirty constantly. Add to `.gitignore` and `git rm --cached` it.
- `app/onboarding/connect/page.tsx:38` — unused `useRouter()` (only `handleBack` uses `router.push`, which is fine, but ensure router isn't otherwise dead).
- `lib/db.ts:18-26` — `console.warn` if `DATABASE_URL` is missing. In production we depend on it; warn is too soft. Either throw at startup, or make the connection lazy and let it surface the real error in context. Current behavior is "log a warning at import time, fail mysteriously later."
- The `MemoryStateAdapter is not recommended for production` warning prints on every webhook hit. Either swap the adapter (out of scope) or silence the warning if it's known.

---

## What I would NOT change

- **The survey questions themselves.** They're good. The hard rule in `.v0/instructions.md` to leave them alone is correct.
- **The voice direction text.** Modulo the changes I already made today (em-dash hard rule, verdict-opener guidance, contrastive example), the prompts are doing their job. Don't rewrite for cleverness.
- **The Postgres + Neon choice.** Right call. Cheap, scales, queries are simple.
- **The ChatSDK split where it earns its weight.** Slash command webhook is genuinely simpler with it. Don't tear that out.
- **The 1y / 5y horizon split.** Two horizons feels right. Don't add more.
- **The "no ambient monitoring, no productivity, no coaching" scope discipline.** This is the most important architectural decision in the project and it shows up in every page. Don't drift from it.

---

## Suggested next-step order, given this review

1. **Workstream #1 (in flight): voice tightening.** Already partially done today. The remaining high-value piece is few-shot dialogue pairs (section 1 above), which is bigger than the em-dash work but has the highest ceiling-raise.
2. **The "smaller things" cleanup** (section 6). 30 minutes total, frees the head from minor irritations.
3. **Workstream #2: Railway gateway worker.** Including formal ChatSDK split (section 2) — drop the inert handlers and state-memory dependency at the same time.
4. **Onboarding preview + parsed-messages feedback** (section 3, first bullet). 30 minutes, substantially improves the most important input.
5. **Workstream #3: multi-tenant via Discord User App install.**
6. **`/profile` page** (section 3, second bullet). Worth doing before friend-testing scales.
7. **First-run preview on done page** (section 3, third bullet).
8. **Scheduled check-ins via Workflow SDK** (section 5). Biggest feature, do it last when everything else is solid.

That order is opinionated. Things 4-7 are interchangeable depending on what feels most missing as friends start testing.
