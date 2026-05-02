import Link from "next/link";

export default function OnboardingWelcome() {
  return (
    <div className="text-center space-y-8">
      <div className="space-y-6">
        <h1 className="text-3xl tracking-tight">
          Your future selves are waiting.
        </h1>
        <div className="space-y-4 text-muted text-lg leading-relaxed">
          <p>
            This is a tool where your future selves can write to you in Discord.
          </p>
          <p>
            Before that can happen, you need to tell us a bit about yourself —
            not for goal-setting, but so the future-selves can sound like you.
          </p>
          <p className="text-sm">Takes about 5 minutes.</p>
        </div>
      </div>

      <Link
        href="/onboarding/voice"
        className="inline-block px-8 py-3 bg-primary text-bg rounded-sm text-lg transition-colors duration-200 hover:bg-primary-hover"
      >
        Begin
      </Link>
    </div>
  );
}
