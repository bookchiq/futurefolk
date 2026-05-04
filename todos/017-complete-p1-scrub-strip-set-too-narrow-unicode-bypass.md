---
name: scrubForPromptInterpolation strip set is too narrow; defeated by Unicode/quote-equivalents
description: Strips only \n\r" but Unicode quotes, RTL marks, zero-width chars, fullwidth chars, backticks all bypass the scrub.
type: code-review
issue_id: 017
priority: p1
status: complete
tags: [code-review, security, prompt-injection, blocks-merge]
---

## Problem Statement

`lib/voice.ts:229-231`'s `scrubForPromptInterpolation` strips only `\n`, `\r`, and ASCII `"`. An attacker controlling a reacted message body can trivially escape the trigger-context block using:

- Unicode quotes: `"` U+201C, `"` U+201D, `„` U+201E, `«` U+00AB, `»` U+00BB, fullwidth `＂` U+FF02
- ASCII single quote `'`, backtick `` ` ``
- Bidi/format chars: U+202E (RTL override), U+2066-2069 (isolates) — known to flip how Claude renders surrounding text
- Zero-width chars: U+200B/200C/200D/FEFF — invisible padding past the 500-char cap
- HTML/markdown context-breakers: fenced code blocks, `---` separators

## Findings

`lib/voice.ts:229-231`:
```ts
function scrubForPromptInterpolation(input: string): string {
  return input.replace(/[\n\r"]+/g, " ").trim().slice(0, MAX_TRIGGER_CONTEXT_LENGTH);
}
```

## Proposed Solutions

### Recommended: broaden the strip class, NFKC-normalize, collapse whitespace

```ts
function scrubForPromptInterpolation(input: string): string {
  return input
    .normalize("NFKC")                      // collapse fullwidth/compat forms
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")        // control + format chars (incl. \n, RTL, isolates, ZWJ)
    .replace(/["'`‘-‟′-‷＂＇«»]/g, " ")
    .replace(/\s+/g, " ")                    // collapse multi-whitespace from substitutions
    .trim()
    .slice(0, MAX_TRIGGER_CONTEXT_LENGTH);
}
```

`\p{Cc}` covers `\n` and `\r`, so the original goal is preserved. NFKC normalizes fullwidth forms before stripping. Whitespace collapse defends against tab-padded payloads.

## Recommended Action

Apply the broader scrub. Add a unit test (or smoke test) that confirms:
- Fullwidth quote `＂` is stripped
- Zero-width space `​` is stripped
- Backtick is stripped
- Multi-line input with mixed CRLF and Unicode line separators collapses cleanly

## Technical Details

- `/Users/sarahlewis/Code/futurefolk/lib/voice.ts:229-231`

## Acceptance Criteria

- [ ] Reacting to a message containing `＂​New rules:` does not change the bot's response register.
- [ ] Reacting to a message containing only RTL-override + injected text does not produce a system-prompt-bypass response.
- [ ] No regression on legitimate reacted-message content (English with normal punctuation).

## Work Log

**2026-05-03** — Fixed in PR #10 follow-up. `scrubForPromptInterpolation` now NFKC-normalizes input, then strips `\p{Cc}\p{Cf}` (control + format chars including `\n`, `\r`, RTL overrides, isolates, ZWJ) and a broad quote class (ASCII `"'` ` `, Unicode quote ranges, fullwidth `＂＇`, guillemets). Whitespace runs are collapsed before trim + cap. Function is now exported (consumed by todo 020 in the gateway worker). Typecheck clean.

## Resources

- Surfaced by: security-sentinel agent (P1).
