/**
 * Discord webhook endpoint.
 *
 * Discord delivers two kinds of traffic here:
 *   1. HTTP Interactions  — slash commands, button clicks, the initial PING
 *      verification. ChatSDK's Discord adapter verifies the Ed25519 signature
 *      and routes to the right handler in lib/bot.ts.
 *   2. Forwarded Gateway events — messages and reactions, posted here by our
 *      own Gateway listener (see app/api/discord/gateway/route.ts) which keeps
 *      a WebSocket alive and re-emits events as POSTs to this URL.
 *
 * Configure this URL as your "Interactions Endpoint URL" in the Discord
 * Developer Portal: https://<your-domain>/api/webhooks/discord
 */

import { after } from "next/server";
import { bot } from "@/lib/bot";

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
