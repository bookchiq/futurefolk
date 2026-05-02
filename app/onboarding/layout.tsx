import { OnboardingClientWrapper } from "./client-wrapper";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OnboardingClientWrapper>
      <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-xl">{children}</div>
      </main>
    </OnboardingClientWrapper>
  );
}
