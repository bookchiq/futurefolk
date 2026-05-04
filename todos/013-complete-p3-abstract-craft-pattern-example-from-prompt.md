---
name: Abstract the "craft pattern side hustle" topic from the contrastive example
description: Hardcoded specific topic in system prompt may bias future-self responses toward "money is a trap" framing on tangential topics.
type: code-review
issue_id: 013
priority: p3
status: complete
tags: [code-review, prompt-engineering, voice-quality]
---

## Problem Statement

`lib/voice.ts:84-88` (and matching block in `.v0/prompts.md`) contains:

> AVOID this register: "The pattern side hustle is genuinely worth doing, but not for the reasons you think. You're probably framing it as 'can this make meaningful money,' and I don't know how that played out, but I can tell you the question that mattered more was whether having to sell something changed how you felt about making it."

The example is concrete (good for register calibration) but topical (potentially bad for prompt contamination). The model could regress toward "the money question is wrong" reasoning when the actual user prompt is about money or side hustles.

## Findings

- `lib/voice.ts:84-88`
- `.v0/prompts.md` — same example

## Proposed Solutions

### Recommended: abstract the topic but keep the register signal

```
AVOID this register (coach voice, default Claude register):
"[Topic X] is genuinely worth doing, but not for the reasons you think. You're probably framing it as 'can this [obvious framing],' and I don't know how that played out, but I can tell you the question that mattered more was whether [deeper reframing]."

AIM for this register (friend voice, what we want):
"yeah I'd do it. but honestly the [obvious framing] is a trap, that's not what's actually at stake. the real question is whether [deeper reframing]. that's what I'd watch out for."
```

The register signal (verdict opener avoidance, no third-person restatement, no "genuinely" intensifier) is preserved. The topical bias is removed.

### Alternative: keep concrete, swap to a less generalizable topic
A specific but unrelated example (e.g., "asking for a raise"). Still risks topical bias if user prompt is about salary.

## Recommended Action

Abstract version. Test with 5+ varied prompts (career, relationships, creative work) to confirm the register signal still lands without topical leakage.

## Technical Details

Affected files:
- `/Users/sarahlewis/Code/futurefolk/lib/voice.ts:84-88`
- `/Users/sarahlewis/Code/futurefolk/.v0/prompts.md`

Keep both files in sync.

## Acceptance Criteria

- [ ] System prompt does not name "craft pattern" or any specific business/topic.
- [ ] Register guidance is preserved (verdict opener, intensifier, third-person restatement, em-dash all still flagged).
- [ ] Manual test on 5 varied prompts: no responses regress to "the money question is a trap" framing on unrelated topics.

## Work Log

**2026-05-03** — Resolved by parallel agent (Wave 3 of /resolve_todo_parallel). The AVOID/AIM example block in `SHARED_BASE` (and mirrored in `.v0/prompts.md`) now uses bracketed placeholders: `[Topic]`, `[obvious framing]`, `[deeper reframing]`. The register signals (verdict opener, "genuinely" intensifier, third-person restatement, lowercase friend voice, "framing is a trap" rhythm, "the real question is..." pivot) are preserved. Only the topical content was abstracted. Both files in sync.

## Resources

- Surfaced by: security-sentinel agent (P3-6).
