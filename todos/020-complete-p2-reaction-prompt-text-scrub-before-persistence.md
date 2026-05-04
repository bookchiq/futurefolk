---
name: Reaction promptText not scrubbed before persistence; cross-context injection on history replay
description: Reaction handler persists raw reacted-message content to conversation_messages. Next continuation turn loads it as history and feeds it back to the model, attacker-controlled.
type: code-review
issue_id: 020
priority: p2
status: complete
tags: [code-review, security, prompt-injection]
---

## Problem Statement

The reaction handler at `scripts/gateway-worker.ts:189` persists raw `promptText` (the reacted-message content from a server channel) into the user's DM `conversation_messages`. The scrub in `lib/voice.ts::buildTriggerContext` only sanitizes the in-flight system prompt; it does NOT touch what's persisted.

On the next DM continuation turn, the worker loads history via `getRecentMessages`, which includes that raw reacted-message text as a `user`-role row. That text is then placed into the `messages` array fed to `generateText`. Attacker-controlled content from a server channel becomes part of the user's prompt history forever.

## Findings

- `scripts/gateway-worker.ts:189` — persists unscrubbed `promptText`
- `lib/voice.ts:229-231` — scrub applied only at trigger-context interpolation, not at persistence
- `lib/conversation.ts:21-36` — `appendMessage` doesn't scrub

## Proposed Solutions

### Recommended: scrub before persistence on the reaction path

Export `scrubForPromptInterpolation` from `lib/voice.ts` (or move to a shared util). Use it before `appendMessage`:
```ts
await appendMessage(dm.id, fullUser.id, horizon, "user", scrubForPromptInterpolation(promptText));
```

The DM continuation handler doesn't need this fix — `text` there is the user's own message, not from a third party. Self-attack only.

### Alternative: scrub inside `appendMessage`

Risky — appendMessage is the canonical persistence helper; scrubbing there changes semantics for the slash command path too (where it's not needed). Reject.

## Recommended Action

Surgical fix at the one call site. Pair with todo 017 (broader scrub character class) so persisted strings benefit from the same hardening.

## Technical Details

- `/Users/sarahlewis/Code/futurefolk/scripts/gateway-worker.ts:189`
- `/Users/sarahlewis/Code/futurefolk/lib/voice.ts` (export the scrub helper)

## Acceptance Criteria

- [ ] React to a message containing injection-shaped content. Confirm `conversation_messages.content` for the resulting user row has the scrubbed form.
- [ ] DM the bot afterward. Confirm history replay does not re-inject the unscrubbed content.

## Work Log

**2026-05-03** — Fixed in PR #10 follow-up. `scrubForPromptInterpolation` is now exported from `lib/voice.ts` (broadened scrub per todo 017) and applied in the worker reaction handler before `appendMessage`. Ensures attacker-controlled reacted-message content can't sit in `conversation_messages` and re-inject on later `getRecentMessages` replay. The system-prompt-side scrub already happens via `buildTriggerContext`.

## Resources

- Surfaced by: security-sentinel agent (P3 escalated; cross-tenant becomes plausible at multi-tenant launch).
