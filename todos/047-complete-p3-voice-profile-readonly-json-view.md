---
name: Read-only voice-profile JSON view on `/profile`
description: Users can edit the form fields but can't see the derived `styleFeatures` or `fewShotPairs` the model is actually conditioning on. Symmetry: the agent should not know things about the user that the UI hides.
type: code-review
issue_id: 047
priority: p3
status: complete
tags: [code-review, agent-native, ux]
---

## Problem Statement

`/profile` lets the user edit `users.onboarding_responses` but doesn't show:

- `voice_profile.styleFeatures` (auto-extracted: avg sentence length, common openers, hedge vocab, signature phrases, etc.)
- `voice_profile.fewShotPairs` (auto-generated: 3 demo exchanges that anchor the model's voice)

This is the asymmetry case for an agent-native product: the agent knows things about the user that the UI doesn't show. A user wondering "why does the bot sound off?" or "what does it think my voice is?" has no way to see.

Sarah debugging the same question has to query Postgres.

## Findings

- `/Users/sarahlewis/Code/futurefolk/app/profile/page.tsx` — renders form fields only
- `/Users/sarahlewis/Code/futurefolk/lib/voice-profile.ts:196-219` — `getUser` already returns `voiceProfile` with all derived fields

## Proposed Solutions

Add a collapsed `<details>` section at the bottom of `/profile` (after the save button):

```tsx
<details className="mt-12 rounded-lg border border-zinc-800 p-6">
  <summary className="cursor-pointer text-sm text-zinc-400">
    What future-you sees (advanced)
  </summary>
  <div className="mt-4 space-y-4">
    <h3 className="text-sm font-medium">Style features</h3>
    <pre className="overflow-x-auto rounded bg-zinc-900 p-3 text-xs">
      {JSON.stringify(user.voiceProfile.styleFeatures, null, 2)}
    </pre>
    <h3 className="text-sm font-medium">Few-shot demo pairs</h3>
    <pre className="overflow-x-auto rounded bg-zinc-900 p-3 text-xs">
      {JSON.stringify(user.voiceProfile.fewShotPairs, null, 2)}
    </pre>
  </div>
</details>
```

`getUser` already returns these — no new server action needed.

Optional improvement: make the few-shot pairs human-readable rather than JSON (the form should look like an actual conversation, since that's what they are). Defer if "JSON in a pre" is good enough for v1.

## Recommended Action

Take it. ~20 LOC for real product value (transparency about the agent's view of the user).

## Technical Details

- `/Users/sarahlewis/Code/futurefolk/app/profile/page.tsx`

## Acceptance Criteria

- [ ] `/profile` shows a collapsed "What future-you sees" section.
- [ ] Expanding it reveals the JSON of `styleFeatures` and `fewShotPairs`.
- [ ] If the user has no derived fields yet (just signed up, lazy backfill hasn't run), the section shows a "still building..." message.

## Work Log

**2026-05-05** — Resolved in Wave 1 PR.
- `app/profile/page.tsx`: added a collapsed `<details>` "What future-you sees (advanced)" section after the edit form.
- Renders `styleFeatures` + `fewShotPairs` as pretty-printed JSON; falls back to "Still being extracted/generated" when the field is missing (covers the lazy-backfill window for fresh signups).
- Used the page's actual semantic palette (`border-border`, `bg-bg-subtle`, `text-ink`, `text-muted`) and `rounded-sm` to match the existing edit form, not the generic zinc tones in the spec.

## Resources

- Surfaced by: agent-native-reviewer (#4)
