/**
 * Discord OAuth callback.
 *
 * After the user finishes onboarding, the survey responses are stored as a
 * pending profile keyed by an http-only `ff_pending_session` cookie. The
 * /api/auth/discord/start route uses that same session id as the OAuth
 * `state` parameter. When Discord redirects back here we:
 *
 *   1. Verify `state` matches the session cookie (CSRF protection).
 *   2. Exchange the code for an access token (Discord token endpoint).
 *   3. Fetch the user's Discord identity (id, username/global_name).
 *   4. Promote the pending profile to a real `users` row keyed by Discord ID.
 *   5. Clear the session cookie and redirect to /onboarding/done.
 *
 * If Discord OAuth env vars aren't configured locally, we fall through with
 * a useful error rather than a silent success — voice profile is the whole
 * point of the project; faking the connection would just defer the bug.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getUser, promotePendingToUser } from "@/lib/voice-profile";

const PENDING_COOKIE = "ff_pending_session";
const NEXT_COOKIE = "ff_oauth_next";
const USER_ID_COOKIE = "ff_user_id";
// Long enough that returning users can edit their profile without
// re-authing every visit. Not a real session token — the cookie is just
// a Discord ID, kept httpOnly + secure + sameSite=lax. /profile prompts
// re-auth if the cookie has expired.
const USER_ID_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function sanitizeNext(value: string | undefined | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  return value;
}

interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    console.log("[Futurefolk] Discord OAuth error:", error);
    return NextResponse.redirect(
      new URL("/onboarding/connect?error=oauth_error", request.url)
    );
  }

  if (!code) {
    console.log("[Futurefolk] Discord OAuth: no code received");
    return NextResponse.redirect(
      new URL("/onboarding/connect?error=no_code", request.url)
    );
  }

  // Verify the state parameter against the session cookie BEFORE doing any
  // network work. State == session id (set in /api/auth/discord/start). If
  // they don't match, this isn't our redirect — bail.
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(PENDING_COOKIE)?.value;

  if (!state || !sessionId || state !== sessionId) {
    console.error(
      "[Futurefolk] Discord OAuth state mismatch (state present:",
      Boolean(state),
      "cookie present:",
      Boolean(sessionId),
      ")"
    );
    return NextResponse.redirect(
      new URL("/onboarding/connect?error=invalid_state", request.url)
    );
  }

  const clientId =
    process.env.DISCORD_CLIENT_ID ??
    process.env.DISCORD_APP_ID ??
    process.env.DISCORD_APPLICATION_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error(
      "[Futurefolk] Discord OAuth env vars missing (DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET)."
    );
    return NextResponse.redirect(
      new URL("/onboarding/connect?error=oauth_not_configured", request.url)
    );
  }

  const redirectUri = `${request.nextUrl.origin}/api/auth/discord/callback`;

  // 1. Exchange code for token.
  let tokenJson: DiscordTokenResponse;
  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      // Don't log the response body — Discord doesn't put secrets in it, but
      // logging arbitrary upstream payloads in shared environments is bad
      // hygiene. Status code is enough to triage.
      console.error("[Futurefolk] Discord token exchange failed:", tokenRes.status);
      return NextResponse.redirect(
        new URL("/onboarding/connect?error=token_exchange_failed", request.url)
      );
    }
    tokenJson = (await tokenRes.json()) as DiscordTokenResponse;
  } catch (err) {
    console.error("[Futurefolk] Discord token exchange threw:", err);
    return NextResponse.redirect(
      new URL("/onboarding/connect?error=token_exchange_failed", request.url)
    );
  }

  // 2. Fetch user identity.
  let user: DiscordUser;
  try {
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!userRes.ok) {
      // See note above on token exchange — status code only.
      console.error("[Futurefolk] Discord user fetch failed:", userRes.status);
      return NextResponse.redirect(
        new URL("/onboarding/connect?error=user_fetch_failed", request.url)
      );
    }
    user = (await userRes.json()) as DiscordUser;
  } catch (err) {
    console.error("[Futurefolk] Discord user fetch threw:", err);
    return NextResponse.redirect(
      new URL("/onboarding/connect?error=user_fetch_failed", request.url)
    );
  }

  // 3. Promote pending profile (if any) to a real users row.
  // sessionId / cookieStore came from the state-verification step above.
  const displayName = user.global_name || user.username || null;

  let promoted = false;
  try {
    promoted = await promotePendingToUser(sessionId, user.id, displayName);
    if (!promoted) {
      console.warn(
        "[Futurefolk] OAuth callback: no pending profile for session",
        sessionId,
        "(user may have hit /api/auth/discord/start without finishing the survey)"
      );
    } else {
      console.log("[Futurefolk] Voice profile linked to Discord user", user.id);
    }
  } catch (err) {
    console.error("[Futurefolk] Failed to promote pending profile:", err);
  }
  // Clear the pending session cookie — it's single-use.
  cookieStore.delete(PENDING_COOKIE);

  // Read & clear the post-auth target the start route stashed (single-use).
  const nextTarget = sanitizeNext(cookieStore.get(NEXT_COOKIE)?.value);
  cookieStore.delete(NEXT_COOKIE);

  if (!promoted) {
    // No pending profile to promote. Two cases:
    //   1. Returning user re-authenticating (cookie expired, clicked
    //      "Sign in with Discord" on /profile, etc.). They have a `users`
    //      row already — set the user_id cookie and send them where they
    //      were headed.
    //   2. New user who hit OAuth without completing the survey. Send
    //      them back to /onboarding/connect with the no_pending error.
    const existing = await getUser(user.id);
    if (existing) {
      const response = NextResponse.redirect(
        new URL(nextTarget ?? "/profile", request.url)
      );
      response.cookies.set(USER_ID_COOKIE, user.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: USER_ID_COOKIE_MAX_AGE_SECONDS,
      });
      console.log("[Futurefolk] Re-auth for existing Discord user", user.id);
      return response;
    }
    return NextResponse.redirect(
      new URL("/onboarding/connect?error=no_pending", request.url)
    );
  }

  // Promoted: fresh onboarding completion. Set the user_id cookie so
  // /onboarding/done can render the first-run preview, and so future
  // /profile visits don't have to re-auth for 30 days.
  const response = NextResponse.redirect(
    new URL(nextTarget ?? "/onboarding/done", request.url)
  );
  response.cookies.set(USER_ID_COOKIE, user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: USER_ID_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
