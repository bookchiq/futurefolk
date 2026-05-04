/**
 * Parse a single textarea blob of pasted messages into discrete entries.
 *
 * Heuristic, in this order:
 *   1. If the user separated messages with blank lines, use those.
 *   2. Otherwise, split on every newline.
 *   3. If neither produces multiple entries, treat the whole thing as one
 *      message.
 *
 * Pure function with no DB or runtime imports — safe to call from both
 * server-side voice profile construction and client-side onboarding
 * preview rendering. The preview UI on the survey page uses this so the
 * user can see how their paste was interpreted before submitting.
 */
export function splitSampleMessages(blob: string): string[] {
  const trimmed = blob.trim();
  if (!trimmed) return [];

  // Prefer blank-line separators when the user used them.
  const byBlankLine = trimmed
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (byBlankLine.length > 1) return byBlankLine;

  // Fall back to one-message-per-line.
  const byLine = trimmed
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (byLine.length > 0) return byLine;

  return [trimmed];
}
