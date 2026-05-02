"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { OnboardingResponses } from "./types";

interface OnboardingContextType {
  responses: Partial<OnboardingResponses>;
  updateResponse: (key: keyof OnboardingResponses, value: string) => void;
  updateResponses: (updates: Partial<OnboardingResponses>) => void;
  submitAll: () => void;
}

const OnboardingContext = createContext<OnboardingContextType | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [responses, setResponses] = useState<Partial<OnboardingResponses>>({});

  const updateResponse = (key: keyof OnboardingResponses, value: string) => {
    setResponses((prev) => ({ ...prev, [key]: value }));
  };

  const updateResponses = (updates: Partial<OnboardingResponses>) => {
    setResponses((prev) => ({ ...prev, ...updates }));
  };

  const submitAll = () => {
    console.log("[Futurefolk] Onboarding responses submitted:", responses);
  };

  return (
    <OnboardingContext.Provider
      value={{ responses, updateResponse, updateResponses, submitAll }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used within an OnboardingProvider");
  }
  return context;
}
