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

import { promotePendingToUser } from "@/lib/voice-profile";

const PENDING_COOKIE = "ff_pending_session";

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
      const body = await tokenRes.text();
      console.error("[Futurefolk] Discord token exchange failed:", tokenRes.status, body);
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
      const body = await userRes.text();
      console.error("[Futurefolk] Discord user fetch failed:", userRes.status, body);
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

  try {
    const promoted = await promotePendingToUser(
      sessionId,
      user.id,
      displayName
    );
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

  return NextResponse.redirect(new URL("/onboarding/done", request.url));
}
