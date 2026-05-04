---
name: dm.id divergence between slash command and worker breaks conversation history
description: Slash command persists rows under encoded ChatSDK thread id; worker reads raw discord.js channel id. Worker sees zero history from slash-started threads.
type: code-review
issue_id: 001
priority: p1
status: complete
tags: [code-review, architecture, bug, blocks-merge]
---

## Problem Statement

`lib/bot.ts:98-99` calls `appendMessage(dm.id, ...)` after `bot.openDM(event.user)`. ChatSDK's `Thread.id` is the **encoded** form `"discord:@me:<channelId>"` (verified in `node_modules/chat/dist/index.d.ts:231-234` and `node_modules/@chat-adapter/discord/dist/index.js:1397-1424`).

`scripts/gateway-worker.ts:92-93, 153-154` calls `appendMessage(channelId, ...)` and `appendMessage(dm.id, ...)` from `fullUser.createDM()` — both of which are the **raw** Discord channel ID `"1234567890"`.

The two paths therefore write to two different `channel_id` values for the same DM thread.

## Findings

Concrete consequences:
1. The worker's `getRecentMessages(channelId, 20)` (gateway-worker.ts:80) returns zero history when the user replies for the first time after a slash command. Future-self has amnesia on the very first follow-up.
2. The horizon recovery query at gateway-worker.ts:66-71 also misses the slash command's row, so a user who started a 5y conversation gets silently dropped to 1y on their first reply (the `?? REACTION_DEFAULT_HORIZON` fallback).
3. The ⏳ reaction → DM continuation chain works internally because both use raw channel ids, but is disconnected from any slash-command-started thread on the same channel.
4. The comment in `lib/conversation.ts:5-6` says rows are "keyed by Discord channel ID" — true for the worker, false for `lib/bot.ts`. Misleading.

## Proposed Solutions

### Option A: Use `dm.channelId` in the slash command path (RECOMMENDED)
Replace `dm.id` with `dm.channelId` in `lib/bot.ts:98-99`. The `Thread` type exposes `channelId` (raw) alongside `id` (encoded) — see `node_modules/chat/dist/index.d.ts:233`.

Pros: single-line change, all paths now agree on raw channel id, matches the comment in `lib/conversation.ts`.
Cons: none.
Effort: Small.
Risk: Very low. Existing rows under encoded ids become orphaned but the demo conversation is the only one to date; we can leave them or clean up with a one-shot SQL script.

### Option B: Normalize encoding in `appendMessage`
Strip the `discord:@me:` prefix inside `lib/conversation.ts::appendMessage` and `getRecentMessages`. Pros: works regardless of caller. Cons: hides the fix in a helper, easier to forget. Not recommended.

## Recommended Action

Option A. Plus add a one-line comment at the call site explaining the choice:
```ts
// Use channelId (raw Discord ID), not id (encoded ChatSDK thread ID),
// so the gateway worker can read this row back keyed on msg.channelId.
await appendMessage(dm.channelId, event.user.userId, horizon, "user", about);
```

Optionally add a startup assertion that `channel_id` rows are pure digits, which would have caught this in dev.

## Technical Details

Affected files:
- `/Users/sarahlewis/Code/futurefolk/lib/bot.ts:98-99`
- `/Users/sarahlewis/Code/futurefolk/lib/conversation.ts:5-6` (update comment)

Optional:
- one-shot SQL to clean up encoded rows in `conversation_messages` if any exist with the `discord:@me:` prefix.

## Acceptance Criteria

- [x] `lib/bot.ts` writes user + assistant turns under `dm.channelId`.
- [ ] After deploy, run `/futureself` then immediately reply in the DM. Worker logs show `historyTurns: 1` (the prior user turn) on the second-turn generation, not 0. (verify in production)
- [ ] After deploy, `SELECT DISTINCT channel_id FROM conversation_messages` returns only numeric ids. (verify in production)
- [x] Comment at `lib/conversation.ts:1-12` is accurate.

## Work Log

**2026-05-03** — Fixed in PR #9 follow-up commit. Changed `lib/bot.ts:88-99` to use `dm.channelId` (raw Discord channel ID) and stored it in a local `channelId` variable for both `appendMessage` calls. Updated comment in `lib/conversation.ts:1-12` to document that rows are keyed by raw channel ID and the gateway worker / slash command must agree on the format. Typecheck clean. Local worker restarted with new code.

## Resources

- Surfaced by: architecture-strategist agent in `/compound-wordpress-engineering:workflows:review` of PR #9.
- ChatSDK thread encoding: `node_modules/@chat-adapter/discord/dist/index.js:1397-1424`
- ChatSDK Thread type: `node_modules/chat/dist/index.d.ts:231-234`
