/**
 * Discord Gateway listener.
 *
 * Discord's HTTP Interactions API only delivers slash commands and component
 * interactions. Plain messages and reactions require a persistent Gateway
 * WebSocket connection. In a serverless environment we keep that connection
 * alive via a cron job that opens the gateway, listens for ~10 minutes, and
 * forwards each event to our webhook route. Schedule overlaps so there is
 * never a gap.
 *
 * Why the ⏳ reaction trigger lives here, indirectly:
 *   - User adds ⏳ reaction in Discord
 *   - Gateway WebSocket sees REACTION_ADD
 *   - Adapter POSTs the event to /api/webhooks/discord
 *   - Webhook route runs `bot.onReaction(...)` from lib/bot.ts
 *
 * Auth: this route is hit by Vercel Cron, which sets `Authorization: Bearer
 * <CRON_SECRET>`. The same env var must be set in the Vercel dashboard.
 *
 * Reference: https://chat-sdk.dev/adapters/discord (Gateway setup for serverless)
 */

import { after } from "next/server";
import { bot } from "@/lib/bot";

export const runtime = "nodejs";
// 800s gives the listener plenty of room to run for ~10 minutes plus shutdown.
export const maxDuration = 800;

export async function GET(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return new Response("CRON_SECRET not configured", { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Resolve the public URL where Gateway events should be POSTed back to.
  // NEXT_PUBLIC_BASE_URL (set per SETUP.md) is preferred; VERCEL_URL is the
  // automatic fallback Vercel injects.
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

  if (!base) {
    return new Response(
      "No public base URL available. Set NEXT_PUBLIC_BASE_URL.",
      { status: 500 },
    );
  }

  const webhookUrl = `${base.replace(/\/$/, "")}/api/webhooks/discord`;
  const durationMs = 600 * 1000; // 10 minutes; cron fires every 9 to overlap.

  await bot.initialize();

  return bot.adapters.discord.startGatewayListener(
    { waitUntil: (task) => after(() => task) },
    durationMs,
    undefined,
    webhookUrl,
  );
}
