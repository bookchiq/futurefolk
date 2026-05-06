---
name: Validate `discordUserId` as numeric snowflake before raw URL interpolation in `sendDiscordDM`
description: Defense-in-depth: today the value is trusted from event.user.userId / OAuth-derived users.discord_user_id. Add a snowflake regex check at the boundary so any future code path that supplies a forged value can't inject URL chars.
type: code-review
issue_id: 037
priority: p2
status: complete
tags: [code-review, security, defense-in-depth]
---

## Problem Statement

`lib/discord-dm.ts:23-65` builds the open-DM request body as `JSON.stringify({ recipient_id: discordUserId })`. The response's `dm.id` is then interpolated into the message URL: `${DISCORD_API}/channels/${dm.id}/messages`.

Today this is fine because:
- `discordUserId` comes from either `event.user.userId` (Discord-trusted) or `users.discord_user_id` (OAuth-trusted).
- `dm.id` comes from Discord's response, not the user.

But: if `users.discord_user_id` were ever set from a forged source (e.g., a phantom upsert via the `ff_user_id` cookie path — see issue #038), an attacker could inject URL chars. The invariant is thin.

## Findings

- `/Users/sarahlewis/Code/futurefolk/lib/discord-dm.ts:23-46`
- Discord snowflake shape: 15-25 digit numeric string (`^\d{15,25}$`)

## Proposed Solutions

Single change at the top of `sendDiscordDM`:

```ts
export async function sendDiscordDM(
  discordUserId: string,
  content: string,
): Promise<SendDmResult> {
  if (!/^\d{15,25}$/.test(discordUserId)) {
    throw new Error(`[Futurefolk] sendDiscordDM: invalid discordUserId shape`);
  }
  // ... existing body
}
```

Three lines. Catches both the prompt-injection-into-URL case AND any future bug where a non-snowflake string is passed by mistake.

## Recommended Action

Take it. Pure upside.

## Technical Details

- `/Users/sarahlewis/Code/futurefolk/lib/discord-dm.ts:23`

## Acceptance Criteria

- [ ] `sendDiscordDM("../../etc/passwd", "x")` throws.
- [ ] `sendDiscordDM("123", "x")` throws (shape check rejects too-short).
- [ ] `sendDiscordDM("308175432198765432", "x")` proceeds normally.

## Work Log

**2026-05-05** — Resolved in PR #23.
- `sendDiscordDM` rejects values not matching `^\d{15,25}$` (Discord snowflake shape) at the top of the function — runs even in dry-run mode.

## Resources

- Surfaced by: security-sentinel (P2-11)
