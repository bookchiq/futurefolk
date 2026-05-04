/**
 * Discord OAuth start.
 *
 * Used by both:
 *   - /onboarding/connect (first-time onboarding, has a pending profile to
 *     promote).
 *   - /profile (returning user re-authenticating to edit their voice
 *     profile; no pending row to promote).
 *
 * This route:
 *
 *   1. Reads (or creates) the `ff_pending_session` cookie. The session id
 *      doubles as the OAuth state (CSRF) and the lookup key for promoting
 *      the pending profile if one exists.
 *   2. If a `?next=` query param is present and is a same-origin path,
 *      stashes it in a short-lived `ff_oauth_next` cookie so the callback
 *      knows where to send the user after success.
 *   3. Redirects to Discord's OAuth authorization URL with the session id
 *      as the `state` parameter.
 *
 * Env vars are read server-side: never inline DISCORD_CLIENT_ID into
 * client code (we deliberately don't use NEXT_PUBLIC_* here).
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";

const PENDING_COOKIE = "ff_pending_session";
const NEXT_COOKIE = "ff_oauth_next";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24; // 24h, same as submitOnboardingResponses
const NEXT_COOKIE_MAX_AGE_SECONDS = 60 * 10; // 10 min — only needed for the OAuth round-trip

/** Open-redirect defense: only honor same-origin paths starting with "/". */
function sanitizeNext(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  // Plain in-app paths only — no protocol-relative or scheme-included.
  return value;
}

export async function GET(request: NextRequest) {
  const clientId =
    process.env.DISCORD_CLIENT_ID ??
    process.env.DISCORD_APP_ID ??
    process.env.DISCORD_APPLICATION_ID;

  if (!clientId) {
    console.error(
      "[Futurefolk] /api/auth/discord/start: DISCORD_CLIENT_ID not set"
    );
    return NextResponse.redirect(
      new URL("/onboarding/connect?error=oauth_not_configured", request.url)
    );
  }

  const cookieStore = await cookies();
  const existingSession = cookieStore.get(PENDING_COOKIE)?.value;
  const sessionId = existingSession ?? randomUUID();

  const next = sanitizeNext(request.nextUrl.searchParams.get("next"));

  const redirectUri = `${request.nextUrl.origin}/api/auth/discord/callback`;
  const authUrl = new URL("https://discord.com/api/oauth2/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "identify");
  authUrl.searchParams.set("state", sessionId);

  const response = NextResponse.redirect(authUrl.toString());

  // If the user got here without completing the survey first, the cookie
  // won't exist yet — set it now so the callback can read it back.
  if (!existingSession) {
    response.cookies.set(PENDING_COOKIE, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
  }

  // Stash the post-auth target (if any) so the callback can redirect back
  // to wherever the user came from. Defaults to /onboarding/done at the
  // callback if this cookie isn't set.
  if (next) {
    response.cookies.set(NEXT_COOKIE, next, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: NEXT_COOKIE_MAX_AGE_SECONDS,
    });
  }

  return response;
}
