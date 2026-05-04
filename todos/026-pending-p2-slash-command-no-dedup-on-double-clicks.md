---
name: Slash command path doesn't dedup; accidental double-clicks produce two LLM calls
description: Discord client retries are real. Slash command path persists and generates twice if the user double-submits. Discord interaction IDs would dedupe cleanly but aren't tracked.
type: code-review
issue_id: 026
priority: p2
status: pending
tags: [code-review, reliability, cost]
---

## Problem Statement

`lib/bot.ts:48-120` handles slash commands without any dedup. If a user accidentally double-clicks `/futureself` (Discord client retry on slow ack, network blip, etc.), the bot generates two LLM responses and DMs both. Wastes tokens; confuses the user.

## Findings

- `lib/bot.ts:48-120`
- Discord interactions have unique IDs in the payload (`event.raw.id`), but we don't track them anywhere.

## Proposed Solutions

### Option A: track interaction IDs in a separate table or column

Add `discord_interaction_id` column to `conversation_messages` (nullable for non-slash rows) with a unique index. Insert with `ON CONFLICT (discord_interaction_id) DO NOTHING`. If insert returns 0 rows affected, treat as duplicate and bail.

### Option B: reuse `isDuplicateUserMessage` content-based check

Apply the same dedup helper used in the worker. Cheaper to implement (no schema change) but slightly less precise (matches on content rather than interaction id).

### Option C (recommended for this iteration): apply Option B now, plan Option A for later

Use the existing helper. Adds one DB query at the top of the slash handler:
```ts
if (await isDuplicateUserMessage(dm.channelId, event.user.userId, about)) {
  console.log("[Futurefolk] /futureself duplicate, skipping");
  return;
}
```
The check uses 30s window — exactly the kind of accidental-double-submit window we want.

## Recommended Action

Option C. Same helper as the worker, same SQL pattern. Schedule Option A for the next schema-extension PR (it pairs naturally with the dedup-by-discord-message-id fix in todo 006's resource note).

## Technical Details

- `/Users/sarahlewis/Code/futurefolk/lib/bot.ts:48-120`
- Reuse `lib/conversation.ts::isDuplicateUserMessage`

## Acceptance Criteria

- [ ] Trigger `/futureself` twice quickly. Confirm only one DM reply is sent.
- [ ] Smoke test: normal slash command works.

## Work Log

(none yet)

## Resources

- Surfaced by: security-sentinel agent (P2 cost / UX concern).
