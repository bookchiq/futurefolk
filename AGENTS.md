# Agent Instructions

Before doing anything in this codebase, read these files in order:

1. `.v0/instructions.md` — canonical project instructions, scope, voice, design, architecture
2. `.v0/findings.md` — running list of things to watch out for in this codebase

Then proceed with the user's request. Confirm you've read both files before writing any code.

## Critical external references

This project uses two libraries with thin training-data coverage. Do not guess at APIs for these — fetch the docs.

- **ChatSDK** (Vercel): https://chat-sdk.dev/docs — for the Discord bot
- **Workflow SDK** (Vercel WDK): https://workflow-sdk.dev and https://vercel.com/docs/workflows — for durable scheduling

If you need an API for either of these, fetch the relevant doc page and quote it back before writing code that uses it.

## What this project is, in one sentence

A Discord bot where your future selves live as DMs, powered by an onboarding flow that captures your voice and values, with durable scheduling so future-selves can show up days/weeks/months from now.

## Track

This is for the Vercel hackathon, ChatSDK Agents track. ChatSDK is the required technology. Workflows is used in support but is not the submission track.
