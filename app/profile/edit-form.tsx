"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import {
  REQUIRED_QUESTIONS,
  OPTIONAL_QUESTIONS,
  type OnboardingResponses,
} from "@/app/onboarding/types";
import { SampleMessagesPreview } from "@/app/onboarding/voice/sample-messages-preview";
import { saveProfileEdit } from "./actions";

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; sampleMessagesChanged: boolean }
  | { kind: "error"; message: string };

export function ProfileEditForm({
  initial,
}: {
  initial: Partial<OnboardingResponses>;
}) {
  const [responses, setResponses] = useState<Partial<OnboardingResponses>>(
    () => ({ ...initial })
  );
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [expandedOptional, setExpandedOptional] = useState<string | null>(null);

  const sampleMessagesValue =
    (responses.sampleMessages as string | undefined) ?? "";

  const update = (key: keyof OnboardingResponses, value: string) => {
    setResponses((prev) => ({ ...prev, [key]: value }));
    if (save.kind === "saved" || save.kind === "error") {
      setSave({ kind: "idle" });
    }
  };

  const handleSave = async () => {
    setSave({ kind: "saving" });
    const oldSampleMessages =
      (initial.sampleMessages as string | undefined) ?? "";
    const newSampleMessages = sampleMessagesValue;
    const sampleMessagesChanged = oldSampleMessages !== newSampleMessages;

    const result = await saveProfileEdit(responses);
    if (result.ok) {
      setSave({ kind: "saved", sampleMessagesChanged });
    } else {
      setSave({
        kind: "error",
        message:
          result.reason === "unauthorized"
            ? "Your session expired. Refresh the page and sign in with Discord again."
            : `Couldn't save: ${result.reason}`,
      });
    }
  };

  return (
    <div className="space-y-10">
      {/* Required fields */}
      <section className="space-y-6">
        <h2 className="text-2xl">Voice profile</h2>
        <div className="space-y-6">
          {REQUIRED_QUESTIONS.map((q) => {
            const id = q.id as keyof OnboardingResponses;
            const value = (responses[id] as string | undefined) ?? "";
            const isLarge = "isLarge" in q ? q.isLarge : false;
            return (
              <div key={q.id} className="space-y-2">
                <label
                  htmlFor={`field-${q.id}`}
                  className="block text-base text-ink"
                >
                  {q.question}
                </label>
                {"helperText" in q && q.helperText && (
                  <p className="text-sm text-muted leading-relaxed">
                    {q.helperText}
                  </p>
                )}
                <textarea
                  id={`field-${q.id}`}
                  value={value}
                  onChange={(e) => update(id, e.target.value)}
                  className={`w-full bg-bg-subtle border border-border rounded-sm px-4 py-3 text-ink placeholder:text-muted/50 resize-none transition-colors focus:border-accent focus:outline-none ${
                    isLarge ? "min-h-48" : "min-h-24"
                  }`}
                />
                {q.id === "sampleMessages" && (
                  <SampleMessagesPreview value={value} />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Optional fields */}
      <section className="space-y-3">
        <h2 className="text-2xl">Optional</h2>
        <p className="text-sm text-muted leading-relaxed">
          Any of these you fill in get woven into how your future-selves
          speak. Skip any that don&apos;t apply.
        </p>
        <div className="space-y-3 pt-2">
          {OPTIONAL_QUESTIONS.map((q) => {
            const id = q.id as keyof OnboardingResponses;
            const value = (responses[id] as string | undefined) ?? "";
            const isExpanded = expandedOptional === q.id;
            return (
              <div
                key={q.id}
                className="border border-border rounded-sm overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedOptional(isExpanded ? null : q.id)
                  }
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-bg-subtle transition-colors"
                >
                  <span className="text-base pr-4 flex-1">
                    {q.question}
                    {value.trim().length > 0 && (
                      <span className="text-muted text-sm ml-2">
                        (filled in)
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    className={`w-5 h-5 text-muted shrink-0 transition-transform duration-200 ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <div
                  className={`overflow-hidden transition-all duration-200 ${
                    isExpanded ? "max-h-48" : "max-h-0"
                  }`}
                >
                  <div className="px-4 pb-4">
                    <textarea
                      value={value}
                      onChange={(e) => update(id, e.target.value)}
                      placeholder="Your answer..."
                      className="w-full bg-bg border border-border-subtle rounded-sm px-3 py-2 text-ink placeholder:text-muted/50 resize-none min-h-24 transition-colors focus:border-accent focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Save */}
      <div className="space-y-3 pt-4 border-t border-border-subtle">
        <button
          type="button"
          onClick={handleSave}
          disabled={save.kind === "saving"}
          className="px-8 py-3 bg-primary text-bg rounded-sm transition-colors hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {save.kind === "saving" ? "Saving…" : "Save"}
        </button>
        {sampleMessagesValue !==
          ((initial.sampleMessages as string | undefined) ?? "") && (
          <p className="text-sm text-muted leading-relaxed">
            Your sample messages changed. After saving, your structured
            voice features and demonstration pairs will be rebuilt the next
            time future-self speaks.
          </p>
        )}
        {save.kind === "saved" && (
          <p
            className="text-sm text-[#1f5e2e] leading-relaxed"
            role="status"
          >
            Saved.
          </p>
        )}
        {save.kind === "error" && (
          <p
            className="text-sm text-[#6b1f2e] leading-relaxed"
            role="alert"
          >
            {save.message}
          </p>
        )}
      </div>
    </div>
  );
}
