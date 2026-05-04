---
name: OAuth callback handles no-pending and overwrites poorly
description: Callback redirects to /onboarding/done even when no profile linked; saveUserProfile silently overwrites existing profiles.
type: code-review
issue_id: 008
priority: p2
status: complete
tags: [code-review, security, ux, data-integrity]
---

## Problem Statement

Two related issues in the OAuth callback flow:

### 8a. No-pending redirect lies to the user
`app/api/auth/discord/callback/route.ts:153-174` calls `promotePendingToUser`. If it returns `false` (no `pending_profiles` row to promote), the callback logs a warning but still redirects to `/onboarding/done` — which says "Your future selves are ready." That's a lie when no voice profile got created or linked.

### 8b. Silent profile overwrite
`saveUserProfile` (`lib/voice-profile.ts:141-164`) uses `ON CONFLICT (discord_user_id) DO UPDATE SET ...`. Re-onboarding silently replaces any existing profile. No "you already have a profile, are you sure?" check.

## Findings

- `app/api/auth/discord/callback/route.ts:153-174`
- `lib/voice-profile.ts:141-164` (saveUserProfile)
- `lib/voice-profile.ts:191-217` (promotePendingToUser → saveUserProfile)

## Proposed Solutions

### 8a:
On `promoted === false`, redirect to `/onboarding/connect?error=no_pending` (or `/onboarding`) with a message explaining the user needs to complete the survey first.

### 8b:
Two options:
- **Light:** log a warning when an upsert replaces a non-null voice profile (`saveUserProfile` would do `SELECT voice_profile FROM users WHERE ... LIMIT 1` first; logs if non-null).
- **Heavier:** in the callback, refuse to overwrite if `users.discord_user_id` already exists with a profile. Route to "you already have a profile, [view it / replace it from the dashboard]" page. Requires the `/profile` page (P6) to be built first.

Light option is fine until P6 lands.

## Recommended Action

Both. 8a is a one-line redirect change. 8b light option is a five-line addition to `saveUserProfile`.

## Technical Details

Affected files:
- `/Users/sarahlewis/Code/futurefolk/app/api/auth/discord/callback/route.ts:153-174`
- `/Users/sarahlewis/Code/futurefolk/lib/voice-profile.ts:141-164`
- `/Users/sarahlewis/Code/futurefolk/app/onboarding/connect/page.tsx` — add `no_pending` to the error message map

## Acceptance Criteria

- [ ] Visiting `/api/auth/discord/start` then completing OAuth WITHOUT first completing the survey redirects to `/onboarding` (or `/onboarding/connect?error=no_pending`), not `/onboarding/done`.
- [ ] Re-onboarding (running through the whole flow a second time as the same Discord user) logs a warning that an existing profile was replaced.
- [ ] Existing happy path (fresh onboarding) still works.

## Work Log

**2026-05-03** — Resolved by parallel agent (Wave 4 of /resolve_todo_parallel).

- **8a (no-pending redirect)**: callback now hoists `promoted` to outer scope. When `promoted === false`, redirects to `/onboarding/connect?error=no_pending` instead of `/onboarding/done`. Added `no_pending` entry to `ERROR_MESSAGES` map in connect page with user-friendly copy.
- **8b (overwrite warning)**: `saveUserProfile` now does a pre-upsert SELECT on the existing row. If a non-null voice profile already exists, logs `console.warn("[Futurefolk] saveUserProfile: replacing existing voice profile for Discord user", discordUserId)` before proceeding with the upsert. Doesn't refuse — that requires a UI surface (the unbuilt `/profile` page). The warning won't fire on first-time promotion (existing row is null), correct behavior.

## Resources

- Surfaced by: security-sentinel agent (P2-6, P2-7).
