---
name: SIGTERM handler doesn't await client.destroy() or drain in-flight handlers; kills mid-LLM
description: Railway sends SIGTERM on every redeploy. Current shutdown doesn't await destroy() and doesn't check isShuttingDown at handler entry. A SIGTERM mid-LLM kills the assistant turn write.
type: code-review
issue_id: 021
priority: p2
status: complete
tags: [code-review, reliability, ops]
---

## Problem Statement

`scripts/gateway-worker.ts:213-226` calls `client.destroy()` (returns Promise<void> in discord.js v14) without await, then immediately `process.exit(0)`. Two related issues:

1. **Mid-LLM SIGTERM data loss.** Worst-case path: dedup → rate → horizon → history → `appendMessage(user)` → **`generateText` (1-15s)** → `dm.send` → `appendMessage(assistant)`. SIGTERM during the LLM call kills the in-flight Anthropic request. User turn is persisted but assistant turn never lands. On next worker boot, the user's history has an unanswered question. Half-conversation lost.
2. **Stale handler entries.** New events that already arrived in the discord.js queue still execute after `isShuttingDown = true` because no handler checks the flag at entry. Each fresh handler starts a new LLM call right as the process is dying.
3. **Unflushed close frame.** Discord doesn't see a clean disconnect; counts toward "abnormal disconnect" metrics.

## Findings

- `scripts/gateway-worker.ts:213-226` (shutdown)
- `scripts/gateway-worker.ts:55, 110` (handler bodies — no `isShuttingDown` check)

## Proposed Solutions

### Recommended: track in-flight, await destroy, drain with timeout

```ts
let inFlight = 0;

// Wrap each handler body:
client.on(Events.MessageCreate, async (msg) => {
  if (isShuttingDown) return;
  inFlight++;
  try { /* ... */ } finally { inFlight--; }
});
// (same for MessageReactionAdd)

const shutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[gateway-worker] received ${signal}, draining ${inFlight}`);
  try { await client.destroy(); } catch (err) { console.error("destroy failed:", err); }
  const deadline = Date.now() + 25_000; // under Railway's 30s grace
  while (inFlight > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
```

### Alternative: simplest — just await destroy

```ts
const shutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[gateway-worker] received ${signal}, shutting down`);
  try { await client.destroy(); } catch {}
  process.exit(0);
};
```
Doesn't drain. Still leaves the mid-LLM data loss case. Apply only if the drain pattern is too much for now.

## Recommended Action

Recommended option. Pair with todo 024 (generateText timeout) — bounds worst-case in-flight duration to 60s, well under Railway grace.

## Technical Details

- `/Users/sarahlewis/Code/futurefolk/scripts/gateway-worker.ts:213-226`
- `/Users/sarahlewis/Code/futurefolk/scripts/gateway-worker.ts:55-126` (DM handler entry)
- `/Users/sarahlewis/Code/futurefolk/scripts/gateway-worker.ts:110-208` (reaction handler entry)

## Acceptance Criteria

- [ ] SIGTERM mid-LLM call: worker logs `draining N`, waits for in-flight, exits cleanly.
- [ ] Post-SIGTERM messages don't start new LLM calls.
- [ ] No console errors about unhandled rejection from killed Anthropic request.

## Work Log

**2026-05-03** — Fixed in PR #10 follow-up. Worker now tracks `inFlight` count via increment/decrement in each handler's try/finally. Both handlers bail at entry if `isShuttingDown`. Shutdown handler is now async, awaits `client.destroy()` (so the WebSocket close frame flushes), then drains for up to 25s (`SHUTDOWN_DRAIN_MS`) waiting for in-flight handlers to complete. Logs the surviving in-flight count if drain timeout hits. Paired with todo 024 (60s generateText timeout), so an in-flight handler can't outlive the drain budget.

## Resources

- Surfaced by: security-sentinel + architecture-strategist + performance-oracle (all flagged independently).
