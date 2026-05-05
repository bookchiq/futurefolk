/**
 * Voice profile editor.
 *
 * Server component that resolves the user via the `ff_user_id` cookie. If
 * the cookie is absent or stale (no matching `users` row), renders a
 * "Sign in with Discord" link that runs the OAuth flow with `?next=/profile`
 * so the user lands back here after auth.
 *
 * If authenticated, renders the editor form pre-populated with the user's
 * current onboarding responses. Saves go through `saveProfileEdit`.
 */

import Link from "next/link";
import { cookies } from "next/headers";

import { getUser } from "@/lib/voice-profile";
import { ProfileEditForm } from "./edit-form";

const USER_ID_COOKIE = "ff_user_id";

// Always render dynamically — this page depends on cookies.
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(USER_ID_COOKIE)?.value;

  if (!userId) {
    return <SignInPrompt />;
  }

  const user = await getUser(userId);
  if (!user) {
    return <SignInPrompt />;
  }

  const { styleFeatures, fewShotPairs } = user.profile;

  return (
    <main className="min-h-screen px-6 pt-16 pb-32">
      <div className="max-w-2xl mx-auto space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl tracking-tight">Your voice profile</h1>
          <p className="text-muted leading-relaxed">
            What your future-selves draw from.
            {user.displayName && (
              <>
                {" "}Linked to{" "}
                <span className="text-ink">{user.displayName}</span> on
                Discord.
              </>
            )}
          </p>
        </header>

        <ProfileEditForm initial={user.rawResponses} />

        <details className="mt-12 rounded-sm border border-border bg-bg-subtle p-6">
          <summary className="cursor-pointer text-sm text-muted">
            What future-you sees (advanced)
          </summary>
          <div className="mt-4 space-y-6 text-sm">
            <div>
              <h3 className="mb-2 text-base font-medium text-ink">
                Style features
              </h3>
              {styleFeatures ? (
                <pre className="overflow-x-auto rounded-sm border border-border-subtle bg-bg p-3 text-xs text-ink">
                  {JSON.stringify(styleFeatures, null, 2)}
                </pre>
              ) : (
                <p className="text-muted leading-relaxed">
                  Still being extracted. Check back in a minute.
                </p>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-base font-medium text-ink">
                Few-shot demo pairs
              </h3>
              {fewShotPairs ? (
                <pre className="overflow-x-auto rounded-sm border border-border-subtle bg-bg p-3 text-xs text-ink">
                  {JSON.stringify(fewShotPairs, null, 2)}
                </pre>
              ) : (
                <p className="text-muted leading-relaxed">
                  Still being generated. Check back in a minute.
                </p>
              )}
            </div>
          </div>
        </details>
      </div>
    </main>
  );
}

function SignInPrompt() {
  return (
    <main className="min-h-screen px-6 pt-24 pb-32">
      <div className="max-w-md mx-auto text-center space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl tracking-tight">Your voice profile</h1>
          <p className="text-muted leading-relaxed">
            Sign in with Discord to edit how your future-selves speak.
          </p>
        </header>
        <Link
          href="/api/auth/discord/start?next=/profile"
          prefetch={false}
          className="inline-flex items-center gap-3 px-8 py-3 bg-[#5865F2] text-white rounded-sm text-lg transition-opacity hover:opacity-90"
        >
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
          </svg>
          Sign in with Discord
        </Link>
        <p className="text-sm text-muted">
          Haven&apos;t onboarded yet?{" "}
          <Link href="/onboarding" className="text-ink underline">
            Start here
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
