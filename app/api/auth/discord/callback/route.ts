import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
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

  // Scaffold: exchange code for token
  // In production, this would:
  // 1. Exchange the code for an access token
  // 2. Fetch user info from Discord
  // 3. Store the user's Discord ID and tokens
  // 4. Set up the bot webhook if not already done

  console.log("[Futurefolk] Discord OAuth code received:", code);
  console.log(
    "[Futurefolk] Would exchange for token and complete bot setup here"
  );

  // For now, just redirect to done
  return NextResponse.redirect(new URL("/onboarding/done", request.url));
}
