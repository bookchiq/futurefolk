"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { generateOnboardingPreview } from "../actions";

type PreviewState =
  | { kind: "loading" }
  | { kind: "ready"; reply: string }
  | { kind: "skipped" };

export default function OnboardingDonePage() {
  const [preview, setPreview] = useState<PreviewState>({ kind: "loading" });
  const requested = useRef(false);

  useEffect(() => {
    // Strict-mode double-invoke guard: don't fire two LLM calls.
    if (requested.current) return;
    requested.current = true;

    let cancelled = false;
    generateOnboardingPreview()
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setPreview({ kind: "ready", reply: result.reply });
        } else {
          setPreview({ kind: "skipped" });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setPreview({ kind: "skipped" });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-10 text-center">
      {/* Header */}
      <div className="space-y-4">
        <h2 className="text-2xl">Your future selves are ready.</h2>
        <p className="text-muted leading-relaxed max-w-md mx-auto">
          Your voice profile has been built. You can now talk to your
          future-selves in Discord.
        </p>
      </div>

      {/* First-run preview — only shown if we have a user cookie + the
          generation succeeds. Stays hidden if the user landed here
          without OAuth context (no cookie) or if the call errored. */}
      {preview.kind !== "skipped" && (
        <div className="border-l-2 border-accent pl-6 py-2 text-left max-w-xl mx-auto space-y-3">
          <p className="text-sm text-muted">— a first message from you, in one year</p>
          {preview.kind === "loading" ? (
            <p className="text-muted italic">
              <span className="animate-pulse">your future self is composing</span>
              <span className="sr-only">. Generation typically takes 10 to 30 seconds.</span>
            </p>
          ) : (
            <p className="text-ink/90 italic leading-relaxed whitespace-pre-wrap">
              {preview.reply}
            </p>
          )}
        </div>
      )}

      {/* What to try first */}
      <div className="bg-bg-subtle border border-border-subtle rounded-sm p-6 text-left space-y-6">
        <h3 className="text-lg text-center">What to try first</h3>

        <div className="space-y-5">
          {/* Slash command */}
          <div className="space-y-2">
            <p className="text-ink">
              <span className="font-mono text-sm bg-bg px-2 py-0.5 rounded border border-border">
                /futureself
              </span>
            </p>
            <p className="text-muted text-sm leading-relaxed">
              Ask your future self about something you&apos;re thinking about.
              Pick a horizon — one year or five years from now.
            </p>
          </div>

          {/* Reaction */}
          <div className="space-y-2">
            <p className="text-ink">
              <span className="text-xl">⏳</span>
              <span className="ml-2 text-muted text-sm">
                React to any message
              </span>
            </p>
            <p className="text-muted text-sm leading-relaxed">
              When you see something worth a second opinion, react with ⏳. Your
              future self will DM you about it.
            </p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="space-y-4">
        <Link
          href="https://discord.com/channels/@me"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-8 py-3 bg-primary text-bg rounded-sm text-lg transition-colors hover:bg-primary-hover"
        >
          Open Discord
        </Link>

        <p className="text-sm text-muted">
          You can update your voice profile anytime from the dashboard.
        </p>
      </div>
    </div>
  );
}
