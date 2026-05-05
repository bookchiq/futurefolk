---
name: Add `FUTUREFOLK_DRY_RUN` mode in `discord-dm.ts` for end-to-end testing without Discord
description: The pure generation path is testable today — only `sendDiscordDM` is in the way. One env-gated branch unlocks a `pnpm tsx scripts/dry-run.ts <user-id> <topic>` that exercises the full pipeline and dumps the would-be reply.
type: code-review
issue_id: 043
priority: p2
status: pending
tags: [code-review, agent-native, testing]
---

## Problem Statement

Today there is no programmatic way to answer "does my onboarding produce a sane voice profile and a plausibly-in-voice reply?" — Sarah has to type `/futureself` in Discord. CI cannot. Friend-testers can't preview without going through Discord.

The pure function (`generateFutureSelfResponse`) is fully testable; it returns a string. The only side effect that needs Discord is `sendDiscordDM`, which is a 60-line `fetch` wrapper.

A single env-gated short-circuit makes the whole pipeline harness-able.

## Findings

- `/Users/sarahlewis/Code/futurefolk/lib/discord-dm.ts:23-65` — only DM-side-effect surface in the workflow path
- `/Users/sarahlewis/Code/futurefolk/lib/future-self.ts::generateFutureSelfResponse` — already pure
- No tests directory exists (only ad-hoc smoke testing via Discord today)

## Proposed Solutions

```ts
// lib/discord-dm.ts (top of sendDiscordDM)
if (process.env.FUTUREFOLK_DRY_RUN === "1") {
  console.log("[Futurefolk] DRY_RUN sendDiscordDM:", {
    discordUserId,
    contentPreview: content.slice(0, 200),
  });
  return { channelId: "dry-run-channel", messageId: "dry-run-message" };
}
// ... existing implementation
```

Then a tiny driver:

```ts
// scripts/dry-run-checkin.ts
import { generateFutureSelfResponse } from "@/lib/future-self";

const [, , discordUserId, ...topicParts] = process.argv;
const topic = topicParts.join(" ");
process.env.FUTUREFOLK_DRY_RUN = "1";

const reply = await generateFutureSelfResponse({
  discordUserId,
  horizon: "1y",
  prompt: topic,
  trigger: "preview",
});

console.log("\n--- REPLY ---\n");
console.log(reply);
```

Now Sarah (or CI) runs `pnpm tsx scripts/dry-run-checkin.ts 308175... "the pattern thing"` and sees the would-be reply against the user's real voice profile.

## Recommended Action

Take it. Tiny addition with disproportionate value (testing, friend-tester sanity checks, CI foundation, debugging "why does the bot sound off for user X").

## Technical Details

- `/Users/sarahlewis/Code/futurefolk/lib/discord-dm.ts:23-25` — add the dry-run short-circuit.
- `/Users/sarahlewis/Code/futurefolk/scripts/dry-run-checkin.ts` (new) — admin/dev driver.
- Document `FUTUREFOLK_DRY_RUN` in `docs/OPERATIONS.md`.

## Acceptance Criteria

- [ ] Setting `FUTUREFOLK_DRY_RUN=1` causes `sendDiscordDM` to log + return a stub without calling Discord.
- [ ] `pnpm tsx scripts/dry-run-checkin.ts <user-id> "<topic>"` prints a generated reply.
- [ ] Production path is unaffected when the env var is unset.

## Work Log

(none yet)

## Resources

- Surfaced by: agent-native-reviewer (#3)
