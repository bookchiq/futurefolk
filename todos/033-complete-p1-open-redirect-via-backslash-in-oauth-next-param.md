---
name: Open-redirect bypass via backslash in `?next=` parameter
description: `sanitizeNext` blocks `//evil.com` but lets `/\/evil.com` through. Browsers normalize backslash to forward slash, redirecting cross-origin.
type: code-review
issue_id: 033
priority: p1
status: complete
tags: [code-review, security, oauth, open-redirect]
---

## Problem Statement

`sanitizeNext` in both OAuth route handlers checks `startsWith("/")` and rejects `startsWith("//")`. That blocks the obvious bypasses (scheme-relative `//evil.com`, absolute `https://evil.com`).

But `/\/evil.com` passes the sanitizer (starts with `/`, second char is `\` not `/`). When `NextResponse.redirect(new URL("/\\/evil.com", request.url))` runs, browsers normalize backslash to forward slash in the path. On Chrome/Firefox the user lands on `https://evil.com/`. Confirmed open redirect.

## Findings

- `/Users/sarahlewis/Code/futurefolk/app/api/auth/discord/start/route.ts:35-41`
- `/Users/sarahlewis/Code/futurefolk/app/api/auth/discord/callback/route.ts:34-39`
- Both files contain identical helpers — fix needed in both, and they should be hoisted to a shared module (see issue #041).

## Proposed Solutions

### Option A — Reject any path containing backslash

```ts
function sanitizeNext(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (value.includes("\\")) return null;  // <-- add
  return value;
}
```

Three lines added; covers `/\/evil.com`, `/\\/evil.com`, and any future variant.

### Option B — Allowlist the path with a strict regex

```ts
if (!/^\/[A-Za-z0-9_\-./?#%&=]*$/.test(value)) return null;
```

Pros: positively allowlists known-safe URL chars.
Cons: easy to under-allow (Unicode in the path, query string with valid `+`, etc.).

## Recommended Action

**Option A.** Minimal, targeted, and the threat model maps cleanly to "anything that browsers normalize-to-slash."

## Technical Details

- Apply the backslash-rejection in both `start/route.ts:35-41` and `callback/route.ts:34-39`. (Issue #041 will hoist this into a shared module.)
- Bonus: also reject control characters (`\x00-\x1F`) and tabs (`\t`) — browsers strip these silently in URL paths and they can be used to slip past startsWith checks.

## Acceptance Criteria

- [ ] `sanitizeNext("/\\/evil.com")` returns `null`.
- [ ] `sanitizeNext("/\\evil.com")` returns `null`.
- [ ] `sanitizeNext("//evil.com")` continues to return `null`.
- [ ] `sanitizeNext("/profile?foo=bar")` continues to return the value.
- [ ] Both `start/route.ts` and `callback/route.ts` updated (or both call the shared helper from issue #041).

## Work Log

**2026-05-05** — Resolved in PR #23.
- Centralized `sanitizeNext` in `lib/session.ts` (per #039).
- Added rejection for backslashes (`/\/evil.com` → blocked).
- Bonus: also rejects newlines/tabs (browsers strip these silently from URL paths and they could otherwise slip past startsWith checks).

## Resources

- Surfaced by: security-sentinel (initially P3-5, escalated to P2-12 in the writeup; recategorized P1 here because it's a real cross-site redirect under standard browser behavior with a 3-line fix).
