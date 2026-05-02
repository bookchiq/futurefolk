import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="max-w-xl text-center space-y-8">
        <h1 className="text-4xl tracking-tight">Futurefolk</h1>
        <p className="text-muted text-xl leading-relaxed">
          Your future selves, living in Discord.
        </p>
        <Link
          href="/onboarding"
          className="inline-block px-8 py-3 bg-primary text-bg rounded-sm text-lg transition-colors hover:bg-primary-hover"
        >
          Begin
        </Link>
      </div>
    </main>
  );
}
