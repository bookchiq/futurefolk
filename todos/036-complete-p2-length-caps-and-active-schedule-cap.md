---
name: Length caps on user-supplied profile fields, schedule topic, and per-user active scheduled cap
description: Server actions accept unbounded `responses` blobs; `/futureself about:` and `schedule:` have no server-side length cap; `schedule:` can be invoked 15× per minute and pile up workflows. Three related denial-of-wallet defenses.
type: code-review
issue_id: 036
priority: p2
status: complete
tags: [code-review, security, denial-of-wallet, multi-tenant]
---

## Problem Statement

### 36a. No length caps on profile fields

`app/onboarding/actions.ts:36-56` and `app/profile/actions.ts:24-49` validate required fields with `trim().length === 0` only. A bad actor can post 500 KB into `phraseOveruse`, `sampleMessages`, etc. which:

- Bloats the `users.voice_profile` JSONB row (Neon storage cost).
- Gets passed as input to `extractStyleFeatures` and `extractFewShotPairs` — burning Anthropic input tokens on extraction (output is capped at 600 tokens; input is not).
- Persists into every future `/futureself` system prompt as `formatVoiceProfile` interpolation. Cost is paid forever on every generation.

`scrubForPromptInterpolation` caps interpolated values at 500 chars but the raw value still persists in the JSONB and feeds the AI extractors.

### 36b. No length cap on `/futureself about:` and `schedule:`

`lib/slash-command.ts:67-88` accepts `about:` from a slash command (Discord caps at 6000 chars) and stores raw into `topic` on `scheduled_check_ins`. The workflow then passes `args.topic` as `prompt` to `generateFutureSelfResponse`. Same shape — uncapped input → ongoing token cost.

### 36c. No max-active-scheduled-check-ins-per-user cap

`isRateLimited` is checked before scheduling, capping at 15 user turns/minute. But scheduled invocations don't generate `conversation_messages` rows yet (the schedule fires later). A user can schedule 15 check-ins per minute, all firing in 6+ months. After 1 hour: 900 pending workflows for one user.

`MAX_SCHEDULE_HORIZON_DAYS = 365` caps how far out, not how many.

## Findings

- `/Users/sarahlewis/Code/futurefolk/app/onboarding/actions.ts:36-56` — trim-only validation
- `/Users/sarahlewis/Code/futurefolk/app/profile/actions.ts:24-49` — trim-only validation
- `/Users/sarahlewis/Code/futurefolk/lib/slash-command.ts:67-88` — no `about:`/`schedule:` length cap
- `/Users/sarahlewis/Code/futurefolk/lib/scheduled-check-ins.ts:56-76` — `createScheduledCheckIn` accepts arbitrary topic
- `/Users/sarahlewis/Code/futurefolk/lib/conversation.ts::isRateLimited` — counts turns, not scheduled rows

## Proposed Solutions

### 36a — Per-field max lengths

In both `submitOnboardingResponses` and `saveProfileEdit`, after the missing-field check:

```ts
const MAX_FIELD_LENGTH = 2000;
const MAX_SAMPLE_MESSAGES_LENGTH = 20_000;

for (const [key, value] of Object.entries(responses)) {
  const max = key === "sampleMessages" ? MAX_SAMPLE_MESSAGES_LENGTH : MAX_FIELD_LENGTH;
  if (value && value.length > max) {
    return { ok: false, reason: `field-too-long: ${key}` };
  }
}
```

Also cap `splitSampleMessages` at e.g. 50 entries before persistence (in `lib/parse-sample-messages.ts` or post-split in the actions).

### 36b — Cap `about:` and `schedule:`

In `lib/slash-command.ts`, immediately after `const about = (options.about ?? "").trim();`:

```ts
if (about.length > 1500) {
  await event.channel.postEphemeral(event.user, "Keep `about:` under 1500 characters.", { fallbackToDM: true });
  return;
}
```

`schedule:` is naturally bounded by Date parsing but a 100-char cap as defense-in-depth is cheap.

### 36c — Active-schedule cap

Before `createScheduledCheckIn`:

```ts
const ACTIVE_LIMIT = 5;
const [{ cnt }] = await sql<{ cnt: number }[]>`
  SELECT count(*)::int AS cnt
  FROM scheduled_check_ins
  WHERE discord_user_id = ${userId} AND status = 'pending'
`;
if (cnt >= ACTIVE_LIMIT) {
  await event.channel.postEphemeral(
    event.user,
    `You already have ${cnt} pending check-ins. Cancel one before scheduling another.`,
    { fallbackToDM: true },
  );
  return;
}
```

Recommend `ACTIVE_LIMIT = 5` for v1; loosen as friend-tester feedback warrants.

## Recommended Action

All three. Each is small (5-10 LOC) and they're related defenses against the same threat class.

## Technical Details

- `/Users/sarahlewis/Code/futurefolk/app/onboarding/actions.ts:36-56`
- `/Users/sarahlewis/Code/futurefolk/app/profile/actions.ts:24-49`
- `/Users/sarahlewis/Code/futurefolk/lib/slash-command.ts:67-88, 158-175`

## Acceptance Criteria

- [ ] Onboarding/profile save with a 50KB sample-messages blob returns a `field-too-long` error.
- [ ] `/futureself about:<2000-char string>` returns the ephemeral length-limit message.
- [ ] After scheduling 5 check-ins, the 6th attempt returns a "you already have 5 pending check-ins" message.

## Work Log

**2026-05-05** — Resolved in PR #23.
- Extracted `validateOnboardingResponses` + `MAX_FIELD_LENGTH` (2000) + `MAX_SAMPLE_MESSAGES_LENGTH` (20000) into `app/onboarding/types.ts`. Both server actions call it.
- Slash command caps `about:` at 1500 chars before passing into the schedule path.
- `scheduleCheckIn` enforces `MAX_ACTIVE_SCHEDULED_PER_USER = 5` via `ActiveScheduledCapExceededError` (typed throw); slash command surfaces it as a user-friendly ephemeral.

## Resources

- Surfaced by: security-sentinel (P2-1, P2-2, P2-10)
