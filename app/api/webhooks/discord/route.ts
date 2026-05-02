/**
 * Discord webhook endpoint.
 *
 * Today this only serves HTTP Interactions — slash commands, button clicks,
 * and the initial PING verification. ChatSDK's Discord adapter verifies the
 * Ed25519 signature and routes to the right handler in lib/bot.ts.
 *
 * The same endpoint is also designed to receive forwarded Gateway events
 * (regular messages, reactions) once a Gateway worker exists. That worker is
 * intentionally NOT in this repo on Vercel Hobby — see README.md and
 * .v0/findings.md for why and what the two real options are.
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
