---
name: Small code simplifications (intensifier regex, parseSlashOptions)
description: A few drive-by simplifications. ~10 LOC reduction, slightly clearer code.
type: code-review
issue_id: 011
priority: p3
status: complete
tags: [code-review, simplicity, performance]
---

## Problem Statement

Three small simplifications surfaced by the simplicity reviewer:

### 11a. `hasIntensifierStacking` builds 4 RegExps per call
`lib/future-self.ts:221-229` loops through 4 intensifier words, building a fresh RegExp each time. Hoist to a single regex.

### 11b. `parseSlashOptions` repeats three branches
`lib/bot.ts:127-141` has near-identical conditional branches for `horizon`, `about`, `schedule`. Compact via literal union.

## Findings

- `lib/future-self.ts:221-229` — hasIntensifierStacking
- `lib/bot.ts:127-141` — parseSlashOptions
- Performance-oracle also flagged 11a (P2.2): regex compilation in a loop, microsecond saving + cleaner code.

## Proposed Solutions

### 11a:
```ts
const INTENSIFIER_RE = /\b(genuinely|truly|actually|really)\b/gi;
function hasIntensifierStacking(text: string): boolean {
  const matches = text.match(INTENSIFIER_RE);
  return (matches?.length ?? 0) >= 3;
}
```

### 11b:
```ts
function parseSlashOptions(raw: unknown): ParsedSlashOptions {
  const options = (raw as { data?: { options?: DiscordSlashOption[] } })?.data?.options ?? [];
  const out: ParsedSlashOptions = {};
  for (const { name, value } of options) {
    if (typeof value !== "string") continue;
    if (name === "horizon" || name === "about" || name === "schedule") {
      out[name] = value;
    }
  }
  return out;
}
```

## Recommended Action

Both. Trivial diff, real readability + perf wins.

## Technical Details

Affected files:
- `/Users/sarahlewis/Code/futurefolk/lib/future-self.ts:221-229`
- `/Users/sarahlewis/Code/futurefolk/lib/bot.ts:127-141`

## Acceptance Criteria

- [ ] Both functions still pass typecheck.
- [ ] Tell-detector still flags intensifier-stacked responses (manual test with a 3-intensifier string).
- [ ] Slash command still parses options correctly (manual test with `/futureself horizon:1y about:test`).

## Work Log

**2026-05-03** — Resolved by parallel agents (Wave 3 of /resolve_todo_parallel).

- 11a (`hasIntensifierStacking`): hoisted `INTENSIFIER_RE` to module scope alongside `SUBSTRING_TELLS`. Function body collapsed to `text.match(INTENSIFIER_RE); return (matches?.length ?? 0) >= 3`.
- 11b (`parseSlashOptions`): compacted three near-identical conditional branches into a literal-union `if (name === "horizon" || name === "about" || name === "schedule") { out[name] = value }`. Same semantics, type-safe via the union narrowing. JSDoc preserved.

## Resources

- Surfaced by: code-simplicity-reviewer + performance-oracle (P2.2).
