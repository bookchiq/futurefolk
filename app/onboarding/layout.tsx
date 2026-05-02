import { OnboardingProvider } from "./context";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OnboardingProvider>
      <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-xl">{children}</div>
      </main>
    </OnboardingProvider>
  );
}
