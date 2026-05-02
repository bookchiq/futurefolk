"use client";

import { OnboardingProvider } from "./context";

export function OnboardingClientWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return <OnboardingProvider>{children}</OnboardingProvider>;
}
