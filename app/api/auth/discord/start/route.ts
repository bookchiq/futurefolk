/**
 * Discord OAuth start.
 *
 * The user clicks "Connect Discord" on /onboarding/connect, which links here.
 * This route:
 *
 *   1. Reads (or creates) the `ff_pending_session` cookie. The session id is
 *      what links the in-progress voice profile to the eventual users row.
 *   2. Redirects the user to Discord's OAuth authorization URL with that
 *      session id as the `state` parameter (CSRF protection — the callback
 *      verifies the returned state matches the cookie).
 *
 * Env vars are read server-side: never inline DISCORD_CLIENT_ID into client
 * code (we deliberately don't use NEXT_PUBLIC_* here).
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";

const PENDING_COOKIE = "ff_pending_session";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24; // 24h, same as submitOnboardingResponses

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

  return response;
}
