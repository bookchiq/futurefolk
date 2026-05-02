# Findings

Append-only document. When you discover something other agents should know — a footgun, a quirk, a workaround, a thing v0 keeps getting wrong — add it here with the date.

Format:

```
## YYYY-MM-DD — Short title
What happened. What works. What to avoid.
```

---

## 2026-05-02 — Onboarding flow architecture

The onboarding flow uses React Context (`app/onboarding/context.tsx`) to persist responses across the multi-step flow. The context provides `responses`, `updateResponse`, `updateResponses`, and `submitAll` functions.

Key files:
- `app/onboarding/types.ts` — Contains `REQUIRED_QUESTIONS` and `OPTIONAL_QUESTIONS` arrays with exact question text from instructions.md. Do not modify these.
- `app/onboarding/context.tsx` — State management for the flow. Currently logs to console; needs database integration.
- `app/onboarding/layout.tsx` — Wraps all onboarding routes in the provider.

The voice questions (`/onboarding/voice`) are one question per screen with navigation state tracked locally. The deeper questions (`/onboarding/deeper`) are all on one page with collapsible accordions.

Discord OAuth is scaffolded at `/api/auth/discord/callback` — it currently just redirects to `/onboarding/done`. Needs `NEXT_PUBLIC_DISCORD_CLIENT_ID` env var and full token exchange implementation.

## 2026-05-02 — Tailwind v4 + custom palette

Using Tailwind CSS v4 with `@theme` directive in `app/globals.css`. Custom color tokens:
- `bg`, `bg-subtle` — cream backgrounds
- `ink` — near-black text
- `primary`, `primary-hover` — deep slate-navy
- `accent`, `accent-hover` — muted gold
- `muted` — warm grey for secondary text
- `border`, `border-subtle` — paper-toned borders

Use these tokens directly in Tailwind classes: `bg-bg`, `text-ink`, `border-border`, etc.

Fonts: EB Garamond loaded via `next/font/google`, applied as `--font-serif` and `--font-display` CSS variables.
