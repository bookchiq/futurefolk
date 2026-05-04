import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="px-6 pt-24 pb-16 max-w-2xl mx-auto">
        <h1 className="text-5xl tracking-tight mb-4 leading-tight">
          Futurefolk
        </h1>
        <p className="text-2xl text-muted leading-snug">
          Your future selves, living in Discord.
        </p>
      </section>

      {/* The bet */}
      <section className="px-6 py-8 max-w-2xl mx-auto text-lg leading-relaxed">
        <p>
          Most tools that try to give you advice sound like advice. They&apos;re
          full of strangers&apos; voices: coaches, gurus, AIs trained to be
          helpful in a way no person you know is helpful. They&apos;re useful
          for what they are. But they don&apos;t sound like you.
        </p>
        <p>
          Futurefolk is built around one bet: that a tool you talk to could
          sound like <em>you</em>, slightly further along, and that hearing
          yourself reflected back from a year (or five) ahead would land
          differently than advice from elsewhere.
        </p>
        <p>
          You spend a few minutes telling Futurefolk how you write. The
          phrase you overuse. How you soften bad news. The hill you&apos;d
          die on. A handful of recent messages, for cadence. Then you connect
          your Discord, and you can talk to your future selves there.
        </p>
      </section>

      {/* Demo excerpt */}
      <section className="px-6 py-12 max-w-2xl mx-auto">
        <div className="border-l-2 border-accent pl-6 py-2 space-y-3 text-lg leading-relaxed">
          <p className="font-mono text-sm text-muted">
            /futureself horizon:5y about:the thing I keep going back and forth
            on
          </p>
          <p className="text-ink/90 italic">
            yeah I remember sitting with that. honestly the question you were
            asking wasn&apos;t quite the right one. the actual thing was the
            part you weren&apos;t naming. that&apos;s what I&apos;d come back
            to.
          </p>
          <p className="text-sm text-muted">— you, in five years</p>
        </div>
      </section>

      {/* What it is */}
      <section className="px-6 py-10 max-w-2xl mx-auto">
        <h2 className="mb-4">What it is</h2>
        <ul className="text-lg leading-relaxed space-y-2 list-none pl-0">
          <li>
            A short survey that captures how you actually write. Not goals.
            Voice.
          </li>
          <li>
            A Discord slash command,{" "}
            <span className="font-mono text-base bg-bg-subtle px-1.5 py-0.5 rounded border border-border-subtle">
              /futureself
            </span>
            , that opens a DM with one of two future selves: a year on, or
            five.
          </li>
          <li>
            Conversations that continue in the DM, in your voice, with the
            texture of having lived a little further along.
          </li>
        </ul>
      </section>

      {/* What it isn't */}
      <section className="px-6 py-10 max-w-2xl mx-auto">
        <h2 className="mb-4">What it isn&apos;t</h2>
        <ul className="text-lg leading-relaxed space-y-2 list-none pl-0">
          <li>
            <span className="text-muted">Not a coach.</span> Future-self
            doesn&apos;t tell you what to do.
          </li>
          <li>
            <span className="text-muted">Not a productivity tool.</span> No
            goals, no streaks, no metrics.
          </li>
          <li>
            <span className="text-muted">Not a journaling app.</span>{" "}
            You&apos;re not writing to past-you. They write to you.
          </li>
          <li>
            <span className="text-muted">Not a generic AI assistant.</span>{" "}
            The voice is the project. If they don&apos;t sound like you, the
            tool failed.
          </li>
        </ul>
      </section>

      {/* How it sounds */}
      <section className="px-6 py-10 max-w-2xl mx-auto text-lg leading-relaxed">
        <h2 className="mb-4">How they speak</h2>
        <p>
          They&apos;re you, with one less hedge per sentence. Slightly less
          self-deprecating. More willing to say &ldquo;I don&apos;t know&rdquo;
          or &ldquo;I was wrong about that.&rdquo; Occasionally amused at
          things present-you takes very seriously. Occasionally tender about
          things present-you dismisses.
        </p>
        <p>
          They&apos;re not psychic. They didn&apos;t actually live the
          specific life you&apos;re going to live. They speak from the texture
          of having been you, recently. They know how this kind of thing
          tends to feel a few months out.
        </p>
      </section>

      {/* Invite */}
      <section className="px-6 pt-16 pb-32 max-w-2xl mx-auto text-center">
        <p className="text-muted text-lg mb-8">
          A few minutes of onboarding. Then they&apos;re in your DMs.
        </p>
        <Link
          href="/onboarding"
          className="inline-block px-12 py-3 bg-primary text-bg rounded-sm text-lg transition-colors hover:bg-primary-hover"
        >
          Begin
        </Link>
      </section>
    </main>
  );
}
