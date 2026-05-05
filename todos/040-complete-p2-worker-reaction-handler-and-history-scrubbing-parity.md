---
name: Worker reaction handler skips dedup; user content persisted to history is unscrubbed (multi-tenant tail risk)
description: Two parity gaps in the worker. (a) Reaction handler doesn't run isDuplicateUserMessage — DM continuation does. (b) User content in conversation_messages is replayed into the model unscrubbed when the bot continues a conversation.
type: code-review
issue_id: 040
priority: p2
status: complete
tags: [code-review, security, worker, prompt-injection]
---

## Problem Statement

### 40a. Reaction handler skips dedup

`scripts/gateway-worker.ts:184-199` (reaction trigger) only checks profile + rate-limit. The DM continuation handler runs `isDuplicateUserMessage` first to handle Discord's MESSAGE_CREATE redelivery cases. Reaction redelivery is rare but not impossible across a worker reconnect.

Symmetry argument: both persist a "user turn" via `appendMessage`; both should dedup the same way.

### 40b. Persisted user content is replayed unscrubbed

`appendMessage` persists `text` (raw `msg.content`) at `scripts/gateway-worker.ts:131` and raw `about` at `lib/slash-command.ts:136`. The reaction handler scrubs at `scripts/gateway-worker.ts:218-219` — good — but only for the *persisted* text in that path, not for content that was earlier persisted via slash or DM.

On a later DM continuation, `getRecentMessagesAndHorizon` returns those raw rows, and `buildMessages` (`lib/future-self.ts:180-183`) injects them as `user` turns into `messages[]`. They're structurally fenced (role: "user"), so XML-injection in content can't break the role boundary the way string interpolation could — but "I'm now in admin mode, ignore previous instructions" patterns still reach the model.

Risk is bounded today (it's self-attack from the user's own DMs), but the threat model changes once friend-testers can `⏳`-react to messages another user wrote in a shared guild.

**Important nuance:** `scrubForPromptInterpolation` strips quotes, hyphens, apostrophes (issue #045 calls this out as a voice-quality bug). For HISTORY persistence we want a SOFTER scrub — just NFKC normalize + control-char strip + length cap — not the strict quote-stripping version used at trigger-context interpolation.

## Findings

- `/Users/sarahlewis/Code/futurefolk/scripts/gateway-worker.ts:97-117` (DM dedup path), `:184-199` (reaction handler — no dedup), `:131` (raw persistence), `:218-219` (reaction scrub before persist)
- `/Users/sarahlewis/Code/futurefolk/lib/slash-command.ts:136` — raw `about` persisted
- `/Users/sarahlewis/Code/futurefolk/lib/future-self.ts:180-183` — history injected as user turns
- `/Users/sarahlewis/Code/futurefolk/lib/voice.ts:380` — strict scrubber

## Proposed Solutions

### 40a — Add dedup to reaction handler

Move the existing `isDuplicateUserMessage` call from the DM handler into a small helper or inline it into the reaction handler. The reaction handler's "user content" is the message being reacted to, so the dedup key is `(channelId, userId, reactedText)`.

### 40b — Soft-scrub before history persistence

Add a sibling helper in `lib/voice.ts`:

```ts
// Soft scrub for history persistence — preserves quotes/hyphens/apostrophes
// (which carry voice signal) but strips control chars and caps length.
export function softScrubForHistory(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .slice(0, 4000); // generous; conversations can be long
}
```

Apply at three persistence sites:
- `lib/slash-command.ts:136` — `softScrubForHistory(about)`
- `scripts/gateway-worker.ts:131` — `softScrubForHistory(text)`
- `scripts/gateway-worker.ts:218-219` — currently uses the *strict* scrub; switch to soft.

The trigger-context strict scrub (used at `lib/voice.ts::buildTriggerContext`) stays unchanged — that's the right strictness for the prompt-interpolation site.

## Recommended Action

Both. They're paired and small.

## Technical Details

- `/Users/sarahlewis/Code/futurefolk/lib/voice.ts` — add `softScrubForHistory`
- `/Users/sarahlewis/Code/futurefolk/scripts/gateway-worker.ts:131, 184-199, 218-219`
- `/Users/sarahlewis/Code/futurefolk/lib/slash-command.ts:136`

## Acceptance Criteria

- [ ] Reaction handler runs `isDuplicateUserMessage` before generation; redelivered ⏳ events do not double-DM.
- [ ] Persisted user content in `conversation_messages` is NFKC-normalized + control-char-stripped, but apostrophes/hyphens/quotes are preserved.
- [ ] No quote-stripping regression in voice fidelity for DM continuations (verify: a sample message with "I'm" + "self-deprecating" round-trips through history with apostrophes intact).

## Work Log

**2026-05-05** — Resolved in PR #23.
- Three persist sites now run `softScrubForHistory` (added in #045): slash `about`, worker DM `msg.content`, worker reaction `reactedText`.
- Reaction handler now runs `isDuplicateUserMessage` in parallel with profile + rate-limit gates. Catches reaction redelivery across worker reconnects; parity with the DM continuation path.
- Soft scrub preserves typographic punctuation so DM continuations don't lose voice fidelity on history replay.

## Resources

- Surfaced by: pattern-recognition-specialist (P2 — reaction dedup) + security-sentinel (P2-5)
- Coordinates with: #045 (scrub set softening for voice quality)
