# Prompt 3: AI Integration with Voice Profiles

**Use this in a fresh v0 chat,** AFTER the Discord bot scaffold is working. Connect to the same GitHub repo.

---

Read `AGENTS.md`, `.v0/instructions.md`, and `.v0/prompts.md` first. Confirm you've read them before continuing.

**IMPORTANT:** This is the heart of the project. The voice quality is what makes it work or fail. Do not soften the system prompts. Do not add encouraging language. Do not "improve" the voice direction. Read the prompts.md file carefully and use those system prompts exactly.

Replace the placeholder responses from the Discord bot scaffold with real AI-generated future-self responses, driven by the user's voice profile.

## What to build

### 1. Voice profile construction

When onboarding completes, build a voice profile from the user's responses. The profile is a structured object passed to the system prompt at runtime.

```typescript
type VoiceProfile = {
  overusedPhrase: string;
  badNewsExample: string;
  changedBelief: string;
  hillIdDieOn: string;
  notSoundingLike: string;
  sampleMessages: string[];
  seasonOfLife: string;
  // optional deeper questions
  optional: Record<string, string>;
};
```

Store this in the database keyed by Discord user ID. Pull it on each AI call.

### 2. System prompt construction at `lib/voice.ts`

Build a function `buildSystemPrompt(profile, horizon, triggerContext)` that returns the full system prompt for the AI call. Use the templates in `.v0/prompts.md`. Specifically:

- Start with the shared base prompt
- Append the horizon-specific overlay (1y or 5y)
- Inject the voice profile into the `{VOICE_PROFILE}` placeholder
- Inject the trigger context into the `{TRIGGER_CONTEXT}` placeholder
- Return the complete prompt as a string

### 3. AI integration with AI SDK 6

Use `@ai-sdk/anthropic` (Claude) or whatever the AI Gateway routes to. The model should be configured for moderate-length responses. Model options:
- Claude Opus 4.7 (highest quality, costs more)
- Claude Sonnet 4.6 (good balance)
- Default to Sonnet 4.6 unless quality is poor

Use `streamText` from AI SDK for streaming responses to Discord. ChatSDK's Discord adapter handles streaming via the `post()` function — it accepts an AI SDK text stream directly.

### 4. Conversation memory

For each DM thread:
- Store messages in the database keyed by Discord channel ID (DMs have unique channel IDs per user)
- On each new message, load the recent thread history and include in the AI call
- The system prompt is reconstructed each time with current voice profile + thread context

### 5. Stay-in-character enforcement

If the AI response includes any of these tells, regenerate (or have it edit itself):
- "Great question"
- "I'd be happy to help"
- "Here's the thing:"
- Three-bullet structures when not asked for
- "As an AI" or anything in that family

This is a safety net; the prompt should prevent these, but a runtime check is cheap.

## Hard constraints from instructions.md

Re-read these from `.v0/instructions.md`:

- Future-self does not predict the future. They speak from texture, not prophecy.
- Future-self is not a coach.
- Future-self can refuse to answer.
- Future-self matches the user's length.
- Future-self stays in the user's idiom (curses if user curses, etc.)

## What NOT to do

- Do not add a "fallback" system prompt that's gentler if the user seems sad. The voice handles this naturally; don't override.
- Do not add "personality presets" or let the user choose between voice options. There are exactly two future-selves: 1y and 5y. That's it.
- Do not add temperature controls or model swap UI for users. Defaults only.
- Do not log the conversation content to anywhere external. Privacy is a hard constraint.

## Definition of done

- Voice profile is built from onboarding responses and stored in the database
- `buildSystemPrompt` correctly assembles the system prompt from profile + horizon + context
- Slash commands and reactions trigger real AI responses, streamed to Discord DMs
- DM continuation maintains conversation context
- Responses match the voice direction (you'll need to manually test with Sarah's voice profile)

Update `.v0/findings.md` if you discover anything important about voice quality, prompt construction, or model behavior.
