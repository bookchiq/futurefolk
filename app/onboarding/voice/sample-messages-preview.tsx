"use client";

import { useMemo } from "react";
import { splitSampleMessages } from "@/lib/parse-sample-messages";

const PREVIEW_LIMIT = 8;
const PREVIEW_MAX_CHARS = 140;

export function SampleMessagesPreview({ value }: { value: string }) {
  const parsed = useMemo(() => splitSampleMessages(value), [value]);

  // Don't render anything until the user has written something. Empty preview
  // would feel like noise during the first few keystrokes.
  if (value.trim().length === 0) return null;

  const count = parsed.length;
  const visible = parsed.slice(0, PREVIEW_LIMIT);
  const hidden = count - visible.length;

  // Heuristic warning: if there's only one parsed message but the input
  // contains newlines, the blank-line-vs-newline heuristic decided the user
  // used neither and treated the whole blob as one message. Likely a paste
  // issue worth pointing out.
  const looksMisparsed =
    count === 1 && /\n/.test(value) && parsed[0].length > 200;

  return (
    <div className="mt-4 space-y-3 text-sm">
      <p className="text-muted">
        {count === 1
          ? "We see 1 message:"
          : `We see ${count} messages:`}
      </p>

      <ol className="space-y-1.5 list-decimal list-inside text-ink/80">
        {visible.map((msg, i) => (
          <li
            key={i}
            className="leading-relaxed pl-1"
          >
            <span className="italic">
              &ldquo;
              {msg.length > PREVIEW_MAX_CHARS
                ? `${msg.slice(0, PREVIEW_MAX_CHARS).trim()}…`
                : msg}
              &rdquo;
            </span>
          </li>
        ))}
      </ol>

      {hidden > 0 && (
        <p className="text-muted text-xs pl-1">
          …and {hidden} more.
        </p>
      )}

      {looksMisparsed && (
        <p className="text-xs text-[#6b1f2e] leading-relaxed border-l-2 border-[#6b1f2e]/40 pl-3 italic">
          That looks like one big message. If you have multiple messages,
          try separating each one with a blank line so we can pick them apart.
        </p>
      )}
    </div>
  );
}
