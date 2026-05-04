---
name: Defense-in-depth — __Host- cookie prefix, OAuth log redaction, voice-profile field escaping
description: Self-attack only / low-severity items from the security review. Nice-to-have hardening.
type: code-review
issue_id: 012
priority: p3
status: complete
tags: [code-review, security, defense-in-depth]
---

## Problem Statement

Three low-severity hardening items from security-sentinel.

### 12a. `__Host-` cookie prefix
`ff_pending_session` is set with `path: "/"` and `secure: true` in production. Adding the `__Host-` prefix forbids transmission over HTTP and pins to the exact origin. Cookie value reads with the prefix.

### 12b. OAuth callback verbose error logs
`app/api/auth/discord/callback/route.ts:115, 136` logs the full Discord API response body on token-exchange failure. Discord doesn't put `client_secret` in the response, but logging arbitrary response bodies in shared environments is bad hygiene.

### 12c. Voice-profile field interpolation lacks quote escaping
`lib/voice.ts:140-188` interpolates user-supplied strings (e.g., `profile.notSoundingLike`) into the system prompt with surrounding quotes but no escaping of internal `"` or `\n`. Self-attack only — the user can make their own future-self say weird things — but cheap to escape.

## Findings

- `app/api/auth/discord/start/route.ts:56-62` — pending cookie set
- `app/onboarding/actions.ts:51-58` — same cookie
- `app/api/auth/discord/callback/route.ts:115, 136` — verbose error logging
- `lib/voice.ts:140-188` — unescaped voice profile field interpolation

## Proposed Solutions

### 12a:
Rename cookie to `__Host-ff_pending_session`. Update three call sites (start, callback, actions) to read/write with the prefix.

### 12b:
Truncate the response body to the status code + a short error code lookup:
```ts
console.error("[Futurefolk] Discord token exchange failed:", tokenRes.status);
```
or, if the body is needed for debugging, log only the error code field after parsing JSON.

### 12c:
Add a small helper:
```ts
const escape = (s: string) => s.replace(/[\n\r"]+/g, " ").trim();
```
Use in `formatVoiceProfile`'s string interpolations. Cheap.

## Recommended Action

Skip 12a (cookie security is already good — Lax + secure + httpOnly + state validation). Do 12b (one-line cleanup). Do 12c after the prompt-injection todo (003) lands so the same `escape` helper can be shared.

## Technical Details

Affected files:
- `/Users/sarahlewis/Code/futurefolk/app/api/auth/discord/callback/route.ts`
- `/Users/sarahlewis/Code/futurefolk/lib/voice.ts:140-188`

## Acceptance Criteria

- [ ] Token exchange failures log only `tokenRes.status` (no body).
- [ ] Voice profile fields with embedded `"` or `\n` are scrubbed before interpolation.
- [ ] Cookie unchanged unless 12a is also done.

## Work Log

**2026-05-03** — Resolved by parallel agent (Wave 4 of /resolve_todo_parallel). 12a (cookie prefix) skipped per the recommended action (existing cookie security is sufficient).

- **12b (Discord OAuth log redaction)**: `app/api/auth/discord/callback/route.ts:115, 136` no longer log Discord API response bodies on token-exchange or user-fetch failures. Status code only.
- **12c (voice profile field escaping)**: `lib/voice.ts::formatVoiceProfile` and `formatOnboardingContext` now apply `scrubForPromptInterpolation` to all user-controlled values before interpolation. Static prefix labels left alone. Sample messages with empty post-scrub values are filtered out.

## Resources

- Surfaced by: security-sentinel agent (P3-3, P3-4) + (P2-3 escalated to P3 here since self-attack only).
