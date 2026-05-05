---
name: Sign + rename `ff_user_id` cookie; lay groundwork for real session model
description: Cookie is unsigned (a bare Discord ID) and named `ff_user_id`, advertising what it contains. Anyone with cookie-set access + a target Discord ID can edit a profile or schedule a check-in as that user. Discord IDs are public-ish.
type: code-review
issue_id: 038
priority: p2
status: complete
tags: [code-review, security, auth, session]
---

## Problem Statement

Today's "lightweight pseudo-session":

- `ff_user_id` cookie is httpOnly + secure + sameSite=lax + 30-day TTL.
- Value is the bare Discord user ID (no signature, no salt).
- Read by `app/profile/page.tsx`, `app/profile/actions.ts::saveProfileEdit`, `app/onboarding/actions.ts::generateOnboardingPreview`.
- Worst-case impact of a stolen/forged cookie: edit voice profile, schedule a check-in, view raw `users.onboarding_responses` (which can contain very personal reflection — survey covers "season of life," "what you're avoiding," "things you're proud of").

Discord IDs are not secret — they're visible in any guild member list. The cookie name `ff_user_id` advertises what it contains. The combination means "guess a Discord ID + set a cookie + edit their profile" is the attack shape, mitigated only by httpOnly (no XSS path to set the cookie) + sameSite=Lax (no CSRF). But:
- Older Safari pre-13 doesn't enforce SameSite.
- Anyone with cookie write access via a same-domain XSS in an unrelated future feature wins the whole site.

## Findings

- `/Users/sarahlewis/Code/futurefolk/app/api/auth/discord/callback/route.ts:25-32, 222-231` — sets cookie
- `/Users/sarahlewis/Code/futurefolk/app/profile/page.tsx:19` — reads cookie as session
- `/Users/sarahlewis/Code/futurefolk/app/profile/actions.ts:22` — reads cookie as auth gate for save
- `/Users/sarahlewis/Code/futurefolk/app/onboarding/actions.ts:32-34` — reads cookie for preview gating

## Proposed Solutions

### Option A — HMAC-sign the existing cookie (cheapest)

Stuff `discordUserId|hex(HMAC(SECRET, discordUserId|exp))` into the cookie. Verify on read. ~30 lines.

- New env var: `SESSION_SIGNING_SECRET` (32 random bytes).
- Helper `signSession(discordUserId): string` and `verifySession(value): string | null` in a new `lib/session.ts` (also see issue #039 — extract cookie management).
- Rename cookie to `ff_session` so the leaky name doesn't suggest the value is "your Discord ID."

Pros: minimal change; closes the forgery vector.
Cons: still a stateless token (no revocation, no rotation, no audit trail).

### Option B — Real session table

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,           -- random 32 bytes hex
  discord_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_seen TIMESTAMPTZ DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX ... (discord_user_id, revoked_at);
```

Cookie holds session ID; lookup joins to `users`. Adds revocation, rotation, audit trail.

Pros: real session, future-proof.
Cons: one DB read per page load (cheap on Neon serverless). More moving parts.

## Recommended Action

**Option A now** as a quick win and the right v1 boundary. Plan toward Option B before public launch (treat as a future migration, not blocking friend-test phase).

Either way, **rename the cookie to `ff_session`** as part of this fix — even before it's a real session token, so we're not committed to the leaky name.

## Technical Details

- New `/Users/sarahlewis/Code/futurefolk/lib/session.ts` (Option A's signing helpers, plus the cookie name + max-age constants — coordinates with issue #039).
- `app/api/auth/discord/callback/route.ts:222-231` — call `signSession(discordUserId)` when setting.
- `app/profile/page.tsx:19`, `app/profile/actions.ts:22`, `app/onboarding/actions.ts:32-34` — call `verifySession(cookie)` when reading.
- New env var documented in `docs/OPERATIONS.md` and `.env.example`.

## Acceptance Criteria

- [ ] `SESSION_SIGNING_SECRET` env var documented; missing throws at import.
- [ ] Cookie is renamed `ff_session`; cookie value is `<discordUserId>|<HMAC>`.
- [ ] Reading code calls `verifySession()` — returns `null` for missing/invalid HMAC.
- [ ] An attacker who copies a known Discord ID into a forged `ff_session=308175...|abc` cookie cannot authenticate.

## Work Log

**2026-05-05** — Resolved in PR #23 (Option A — HMAC sign).
- Cookie renamed `ff_user_id` → `ff_session`.
- Value format: `<discordUserId>.<HMAC-SHA-256>` signed with `SESSION_SIGNING_SECRET`.
- `verifySessionValue` uses `timingSafeEqual` and validates snowflake shape before computing HMAC (defense in depth).
- New env var `SESSION_SIGNING_SECRET` documented in OPERATIONS.md (Vercel only — Railway worker doesn't touch the cookie).
- This invalidates all existing sessions on first deploy. Users re-auth via Discord; voice profiles persist.

## Resources

- Surfaced by: security-sentinel (P2-6) + architecture-strategist (#7 auth model)
- Coordinates with: issue #039 (extract cookie management to shared module)
