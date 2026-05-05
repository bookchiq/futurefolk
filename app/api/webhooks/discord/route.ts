/**
 * Discord webhook endpoint — slash command interactions only.
 *
 * Serves HTTP Interactions (slash commands + PING verification) via ChatSDK's
 * Discord adapter, which verifies the Ed25519 signature and routes to the
 * handler in lib/slash-command.ts. Gateway events (DM replies, reactions) are
 * handled by the standalone Railway worker in scripts/gateway-worker.ts.
 *
 * Configure as the "Interactions Endpoint URL" in the Discord Developer Portal.
 */

import { after } from "next/server";
import { bot } from "@/lib/slash-command";

// The Discord adapter pulls in discord.js for the Gateway side, so this route
// must run on the Node runtime, not Edge.
export const runtime = "nodejs";
// Allow plenty of headroom for cold starts. Slash command handlers should
// finish quickly because the adapter defers Discord's response automatically.
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return bot.webhooks.discord(request, {
    waitUntil: (task) => after(() => task),
  });
}
