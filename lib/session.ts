/**
 * Session + auth-cookie helpers.
 *
 * One place that owns:
 *   - Cookie names (SESSION_COOKIE, PENDING_COOKIE, NEXT_COOKIE)
 *   - Cookie max-ages
 *   - Cookie security flags (httpOnly, secure-in-prod, sameSite, path)
 *   - The `?next=` open-redirect sanitizer
 *   - The session-userId getter/setter pair
 *
 * Keeping these in one module so the cookie-signing migration in issue #038
 * is a one-file change instead of a five-file change, and so the
 * `sanitizeNext` security helper can't drift between the OAuth start +
 * callback handlers (it previously was duplicated and could have been fixed
 * in only one — see issue #033 for the backslash-bypass that motivated the
 * stricter version below).
 *
 * The session model is intentionally lightweight for v1: the `ff_user_id`
 * cookie value is the user's Discord ID, set when OAuth completes, with a
 * 30-day TTL. There's no signing, no revocation, no rotation. Issue #038
 * adds HMAC signing as the next step toward a real session model. /profile
 * and /onboarding/done both treat the cookie as a session.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

// === Cookie names ===

/**
 * Session cookie.
 *
 * Renamed from `ff_user_id` to avoid advertising what the value is. The
 * value is no longer the bare Discord ID — it's `<discordUserId>.<HMAC>`
 * signed with `SESSION_SIGNING_SECRET`. See `signSessionValue` /
 * `verifySessionValue` below.
 */
export const SESSION_COOKIE = "ff_session";

/** Pending-onboarding session id. Set by submitOnboardingResponses, doubles as OAuth state. */
export const PENDING_COOKIE = "ff_pending_session";

/** Post-auth redirect target. Set by /api/auth/discord/start when ?next= is present. */
export const NEXT_COOKIE = "ff_oauth_next";

// === TTLs (seconds) ===

/** Long enough that returning users can edit their profile without re-authing every visit. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

/** "Fill out form, hit Discord OAuth, return" — 24h is generous. */
export const PENDING_MAX_AGE_SECONDS = 60 * 60 * 24;

/** Single-use across one OAuth round trip. */
export const NEXT_MAX_AGE_SECONDS = 60 * 10;

// === HMAC signing ===

/**
 * Read the session signing secret from env. Throws if missing — this is a
 * critical security primitive; failing closed is the right move.
 *
 * Set in Vercel project env. The Railway worker doesn't read this — it
 * doesn't serve HTTP and never reads/writes the session cookie.
 */
function getSigningSecret(): string {
  const secret = process.env.SESSION_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "[Futurefolk] SESSION_SIGNING_SECRET must be set to at least 32 chars",
    );
  }
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getSigningSecret()).update(value).digest("hex");
}

/** Encode `<discordUserId>.<HMAC>` for the session cookie value. */
export function signSessionValue(discordUserId: string): string {
  return `${discordUserId}.${sign(discordUserId)}`;
}

/**
 * Verify a session cookie value and return the Discord ID, or null if the
 * value is missing/malformed/tampered.
 *
 * Uses `timingSafeEqual` for the HMAC comparison so an attacker can't
 * brute-force the signature byte-by-byte via timing leaks.
 */
export function verifySessionValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0 || dot === value.length - 1) return null;

  const discordUserId = value.slice(0, dot);
  const providedSignature = value.slice(dot + 1);

  // Validate the discord ID shape before computing HMAC — defense in depth.
  if (!/^\d{15,25}$/.test(discordUserId)) return null;

  const expectedSignature = sign(discordUserId);
  if (providedSignature.length !== expectedSignature.length) return null;

  const a = Buffer.from(providedSignature, "hex");
  const b = Buffer.from(expectedSignature, "hex");
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  return discordUserId;
}

// === Cookie security flags (one place to change) ===

function baseCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

// === Open-redirect defense ===

/**
 * Only honor same-origin paths starting with `/`. Rejects:
 *   - Empty / null / undefined
 *   - Anything not starting with `/`
 *   - Scheme-relative URLs (`//evil.com`)
 *   - Paths containing backslashes (`/\/evil.com` — browsers normalize
 *     `\` → `/` and redirect cross-origin; see issue #033)
 *   - Paths containing newlines or tabs (browsers strip these silently;
 *     they can otherwise slip past startsWith checks)
 */
export function sanitizeNext(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (value.includes("\\")) return null;
  if (/[\r\n\t]/.test(value)) return null;
  return value;
}

// === Session cookie (HMAC-signed Discord ID) ===

/**
 * Read the user's Discord ID from the session cookie, verifying the HMAC.
 * Returns null if the cookie is missing, malformed, or the signature
 * doesn't validate against `SESSION_SIGNING_SECRET`.
 */
export async function getSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value ?? null;
  return verifySessionValue(raw);
}

/** Set the session cookie on a NextResponse (used by OAuth callback before redirect). */
export function setSessionUserIdOnResponse(
  response: NextResponse,
  userId: string,
): void {
  response.cookies.set(
    SESSION_COOKIE,
    signSessionValue(userId),
    baseCookieOptions(SESSION_MAX_AGE_SECONDS),
  );
}

// === Pending-session cookie (onboarding flow) ===

/** Read the pending-onboarding session id, or null if unset. */
export async function getPendingSessionId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(PENDING_COOKIE)?.value ?? null;
}

/** Set the pending-session cookie via the cookieStore (used by server actions). */
export async function setPendingSessionIdOnCookieStore(
  sessionId: string,
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(
    PENDING_COOKIE,
    sessionId,
    baseCookieOptions(PENDING_MAX_AGE_SECONDS),
  );
}

/** Set the pending-session cookie on a NextResponse (used by OAuth start route). */
export function setPendingSessionIdOnResponse(
  response: NextResponse,
  sessionId: string,
): void {
  response.cookies.set(
    PENDING_COOKIE,
    sessionId,
    baseCookieOptions(PENDING_MAX_AGE_SECONDS),
  );
}

/** Clear the pending-session cookie (single-use after promotion). */
export async function clearPendingSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(PENDING_COOKIE);
}

// === Next-redirect cookie ===

/** Set the post-auth redirect target on a NextResponse (start route). */
export function setNextOnResponse(response: NextResponse, next: string): void {
  response.cookies.set(
    NEXT_COOKIE,
    next,
    baseCookieOptions(NEXT_MAX_AGE_SECONDS),
  );
}

/** Read + clear the post-auth redirect target. Returns null if unset/invalid. */
export async function readAndClearNext(): Promise<string | null> {
  const cookieStore = await cookies();
  const next = sanitizeNext(cookieStore.get(NEXT_COOKIE)?.value);
  cookieStore.delete(NEXT_COOKIE);
  return next;
}
