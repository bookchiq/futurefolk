---
name: Extract cookie management + `sanitizeNext` into a shared `lib/session.ts` module
description: Cookie names, max-ages, and security flags are duplicated across 5+ files. `sanitizeNext` is duplicated in two OAuth route handlers. Hoist to one place — coordinates with issue #038's signing migration.
type: code-review
issue_id: 039
priority: p2
status: pending
tags: [code-review, security, refactor]
---

## Problem Statement

Cookie names duplicated as string literals or const declarations:

- `app/api/auth/discord/start/route.ts:29-32` — `USER_ID_COOKIE`, `PENDING_COOKIE`, `ff_oauth_next`
- `app/api/auth/discord/callback/route.ts:25-32` — same three
- `app/onboarding/actions.ts:32-34` — `ff_user_id`
- `app/profile/page.tsx:19` — `ff_user_id`
- `app/profile/actions.ts:22` — `ff_user_id`

`sanitizeNext` (open-redirect defense, issue #033) is identical between `start/route.ts:35-41` and `callback/route.ts:34-39`.

Today: changing `USER_ID_COOKIE_MAX_AGE_SECONDS` requires editing two files and the values happening to match. Changing `sanitizeNext` (e.g., to add the backslash check from #033) requires both edits, in lockstep, with a security implication if you forget one.

## Findings

- 5+ files reference cookie names directly
- 2 files contain identical `sanitizeNext`
- Setup work for issue #038 (cookie signing migration) — easier with one place to change

## Proposed Solutions

Create `lib/session.ts` (or `lib/auth-cookies.ts`) that owns:

```ts
export const SESSION_COOKIE = "ff_session"; // or ff_user_id pre-rename
export const PENDING_COOKIE = "ff_pending_session";
export const NEXT_COOKIE = "ff_oauth_next";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const PENDING_MAX_AGE_SECONDS = 60 * 30; // 30 min
export const NEXT_MAX_AGE_SECONDS = 60 * 10; // 10 min

export function getSessionUserId(): Promise<string | null> { ... }
export function setSessionUserId(response, userId): void { ... }

export function sanitizeNext(value: string | null | undefined): string | null { ... }
```

Then all the call sites import from one place. The cookie security flags (httpOnly, secure-in-prod, sameSite=lax) live in the setter helpers so no caller can accidentally weaken them.

This is also the natural seam for issue #038 — when `getSessionUserId` becomes "look up `ff_session` cookie, parse HMAC, verify, return discord_user_id," all callers benefit.

## Recommended Action

Land this BEFORE issue #038 (so the signing change is one file, not five). Or land them together as one PR.

## Technical Details

- New `/Users/sarahlewis/Code/futurefolk/lib/session.ts`
- 5 file edits to switch to imports
- `sanitizeNext` callers: `app/api/auth/discord/start/route.ts`, `app/api/auth/discord/callback/route.ts`

## Acceptance Criteria

- [ ] `grep -rn '"ff_user_id"' app/` returns zero hits (all reads/writes go through helpers).
- [ ] `grep -rn '"ff_pending_session"' app/` zero hits.
- [ ] Cookie security flags (httpOnly, sameSite, secure) live in one place.
- [ ] `sanitizeNext` is imported from one module and the dual-fix from issue #033 lives there.

## Work Log

(none yet)

## Resources

- Surfaced by: pattern-recognition-specialist (P2 — sanitizeNext) + architecture-strategist (#7 — cookie name duplication)
- Coordinates with: #033 (sanitizeNext bug fix), #038 (cookie signing)
