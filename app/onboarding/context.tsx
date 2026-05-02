"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { OnboardingResponses } from "./types";
import { submitOnboardingResponses } from "./actions";

interface OnboardingContextType {
  responses: Partial<OnboardingResponses>;
  updateResponse: (key: keyof OnboardingResponses, value: string) => void;
  updateResponses: (updates: Partial<OnboardingResponses>) => void;
  /**
   * Persist the current responses as a pending voice profile.
   *
   * Optionally takes a `mergeWith` patch — useful when a page wants to save
   * the latest local edits without waiting for a re-render after
   * `updateResponses()`. The patch is merged into the in-memory responses
   * AND included in the submission.
   *
   * Returns `{ ok: true }` on success. Caller should only navigate to
   * /connect if ok.
   */
  submitAll: (
    mergeWith?: Partial<OnboardingResponses>
  ) => Promise<{ ok: true } | { ok: false; reason: string }>;
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

  const submitAll = async (mergeWith?: Partial<OnboardingResponses>) => {
    // Build the final payload BEFORE state setters that won't have flushed yet.
    const final: Partial<OnboardingResponses> = mergeWith
      ? { ...responses, ...mergeWith }
      : responses;
    if (mergeWith) {
      setResponses(final);
    }
    const result = await submitOnboardingResponses(final);
    if (!result.ok) {
      console.error(
        "[Futurefolk] failed to save pending voice profile:",
        result.reason
      );
    }
    return result;
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
