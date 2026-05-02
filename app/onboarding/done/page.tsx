import Link from "next/link";

export default function OnboardingDonePage() {
  return (
    <div className="space-y-10 text-center">
      {/* Header */}
      <div className="space-y-4">
        <h2 className="text-2xl">Your future selves are ready.</h2>
        <p className="text-muted leading-relaxed max-w-md mx-auto">
          Your voice profile has been built. You can now talk to your
          future-selves in Discord.
        </p>
      </div>

      {/* What to try first */}
      <div className="bg-bg-subtle border border-border-subtle rounded-sm p-6 text-left space-y-6">
        <h3 className="text-lg text-center">What to try first</h3>

        <div className="space-y-5">
          {/* Slash command */}
          <div className="space-y-2">
            <p className="text-ink">
              <span className="font-mono text-sm bg-bg px-2 py-0.5 rounded border border-border">
                /futureself
              </span>
            </p>
            <p className="text-muted text-sm leading-relaxed">
              Ask your future self about something you&apos;re thinking about.
              Pick a horizon — one year or five years from now.
            </p>
          </div>

          {/* Reaction */}
          <div className="space-y-2">
            <p className="text-ink">
              <span className="text-xl">⏳</span>
              <span className="ml-2 text-muted text-sm">
                React to any message
              </span>
            </p>
            <p className="text-muted text-sm leading-relaxed">
              When you see something worth a second opinion, react with ⏳. Your
              future self will DM you about it.
            </p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="space-y-4">
        <Link
          href="https://discord.com/channels/@me"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-8 py-3 bg-primary text-bg rounded-sm text-lg transition-colors hover:bg-primary-hover"
        >
          Open Discord
        </Link>

        <p className="text-sm text-muted">
          You can update your voice profile anytime from the dashboard.
        </p>
      </div>
    </div>
  );
}
