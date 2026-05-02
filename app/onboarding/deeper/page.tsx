"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useOnboarding } from "../context";
import { OPTIONAL_QUESTIONS, OnboardingResponses } from "../types";
import { ChevronDown } from "lucide-react";

export default function DeeperQuestionsPage() {
  const router = useRouter();
  const { responses, updateResponses, submitAll } = useOnboarding();
  const [localResponses, setLocalResponses] = useState<
    Record<string, string>
  >(() => {
    const initial: Record<string, string> = {};
    OPTIONAL_QUESTIONS.forEach((q) => {
      initial[q.id] =
        (responses[q.id as keyof OnboardingResponses] as string) || "";
    });
    return initial;
  });
  const [expandedId, setExpandedId] = useState<string | null>(
    OPTIONAL_QUESTIONS[0].id
  );

  const handleChange = (id: string, value: string) => {
    setLocalResponses((prev) => ({ ...prev, [id]: value }));
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleSave = async () => {
    // Filter out empty responses
    const filledResponses = Object.fromEntries(
      Object.entries(localResponses).filter(([, v]) => v.trim().length > 0)
    );
    // Merge into context state and submit in one shot — avoids the
    // setState-then-read-state race that would otherwise drop these answers.
    updateResponses(filledResponses);
    const result = await submitAll(filledResponses);
    if (!result.ok) {
      // Stay on the page so the user knows something failed; the submitAll
      // helper already logs the reason. We could surface a toast here later.
      return;
    }
    router.push("/onboarding/connect");
  };

  const handleBack = () => {
    router.push("/onboarding/voice");
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <h2 className="text-2xl">A few more, if you like.</h2>
        <p className="text-muted leading-relaxed">
          These are optional. They help the future-selves know you better, but
          you can skip them entirely or come back later.
        </p>
      </div>

      {/* Collapsible questions */}
      <div className="space-y-3">
        {OPTIONAL_QUESTIONS.map((q) => (
          <div
            key={q.id}
            className="border border-border rounded-sm overflow-hidden"
          >
            <button
              onClick={() => toggleExpand(q.id)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-bg-subtle transition-colors"
            >
              <span className="text-base pr-4">{q.question}</span>
              <ChevronDown
                className={`w-5 h-5 text-muted shrink-0 transition-transform duration-200 ${
                  expandedId === q.id ? "rotate-180" : ""
                }`}
              />
            </button>
            <div
              className={`overflow-hidden transition-all duration-200 ${
                expandedId === q.id ? "max-h-48" : "max-h-0"
              }`}
            >
              <div className="px-4 pb-4">
                <textarea
                  value={localResponses[q.id]}
                  onChange={(e) => handleChange(q.id, e.target.value)}
                  placeholder="Your answer..."
                  className="w-full bg-bg border border-border-subtle rounded-sm px-3 py-2 text-ink placeholder:text-muted/50 resize-none min-h-24 transition-colors focus:border-accent focus:outline-none"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center pt-4">
        <button
          onClick={handleBack}
          className="text-muted hover:text-ink transition-colors"
        >
          Back
        </button>

        <button
          onClick={handleSave}
          className="px-6 py-2 bg-primary text-bg rounded-sm transition-colors hover:bg-primary-hover"
        >
          Save and continue
        </button>
      </div>
    </div>
  );
}
