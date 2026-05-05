---
name: Soften `scrubForPromptInterpolation` strip set — stop stripping apostrophes/hyphens (voice quality)
description: The current scrubber's character ranges include U+2018-U+201F (smart quotes including U+2019 = right single quote/apostrophe) and other typographic ranges. Sample messages with "I'm" or "self-deprecating" lose their punctuation when interpolated into the system prompt.
type: code-review
issue_id: 045
priority: p2
status: pending
tags: [code-review, voice-quality, security]
---

## Problem Statement

`lib/voice.ts:380` does:

```ts
.replace(/["'`‘-‟′-‷＂＇«»]/g, " ")
```

The ranges `‘-‟` (U+2018 to U+201F) and `′-‷` (U+2032 to U+2037) match more than intended. Specifically `‘-‟` includes U+2019 (typographic apostrophe / right single quote), which means **every smart-quoted apostrophe in user samples is stripped before interpolation**. Hyphens are also in the strip set despite not being quote-equivalents.

Read the actual prompt the model sees: every sample message with "I'm" / "you're" / "doesn't" loses its apostrophe; "self-deprecating" / "ten-year-old" lose their hyphens.

That meaningfully degrades the cadence reference, which is the most load-bearing part of the prompt. The function is doing more damage than the security goal requires.

The legitimate goal of the scrubber is to prevent untrusted user content from breaking the surrounding `"..."` quoting in the system prompt. Apostrophes and hyphens don't do that.

## Findings

- `/Users/sarahlewis/Code/futurefolk/lib/voice.ts:376-384`
- The two ranges are denser than they look at a glance — worth comment annotation regardless of whether the set is changed

## Proposed Solutions

### Option A — Strip only what genuinely breaks boundaries

```ts
function scrubForPromptInterpolation(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    // Strip only chars that break the surrounding "..." quoting context:
    // ASCII double quote, backtick, backslash, plus typographic double quotes.
    .replace(/["`\\“”„‟«»]/g, " ")
    .slice(0, 500);
}
```

- Removes apostrophes (`'`, `'`, `'`) from the strip set — they don't break double-quote contexts.
- Removes hyphens entirely from the strip set — they're not quote chars.
- Adds backslash to the strip set — was missing; could escape into the prompt template.
- Preserves single-quote-typographic chars by name rather than range, removing the dense-range ambiguity.

### Option B — Keep the existing logic but add comments + annotation tests

If we're nervous about changing the strip set, at minimum add a comment listing what the ranges resolve to and add a unit test verifying behavior on realistic sample messages. Doesn't fix the voice degradation though.

## Recommended Action

**Option A.** The voice quality loss is real. The security goal (prevent quote-context escape) is preserved.

## Technical Details

- `/Users/sarahlewis/Code/futurefolk/lib/voice.ts:376-384` — replace the scrub set.
- Add a quick test in `__tests__/scrub.test.ts` (or wherever appropriate) verifying that "I'm self-deprecating" survives intact.

## Acceptance Criteria

- [ ] `scrubForPromptInterpolation("I'm self-deprecating")` preserves the apostrophe and hyphen.
- [ ] `scrubForPromptInterpolation('I said "hi"')` strips the double quotes.
- [ ] `scrubForPromptInterpolation("path\\with\\backslash")` strips the backslashes.
- [ ] Re-read the assembled system prompt for an existing user — apostrophes/hyphens in their sample messages are intact.

## Work Log

(none yet)

## Resources

- Surfaced by: performance-oracle (#3 voice quality) + pattern-recognition-specialist (P3 — over-strip noted)
- Coordinates with: #040 — uses a separate softer scrub for history persistence
