/**
 * Dry-run a future-self generation against a real user's voice profile,
 * without sending a Discord DM.
 *
 * Usage:
 *   pnpm tsx scripts/dry-run-checkin.ts <discord-user-id> <topic>
 *   FUTUREFOLK_DRY_RUN=1 pnpm tsx scripts/dry-run-checkin.ts 308175... "the pattern thing"
 *
 * Required env: ANTHROPIC_API_KEY, DATABASE_URL.
 */

process.env.FUTUREFOLK_DRY_RUN = "1";

import { generateFutureSelfResponse } from "@/lib/future-self";

async function main(): Promise<void> {
  const [, , discordUserId, ...topicParts] = process.argv;
  const topic = topicParts.join(" ").trim();

  if (!discordUserId || !topic) {
    console.error("Usage: pnpm tsx scripts/dry-run-checkin.ts <discord-user-id> <topic>");
    process.exit(1);
  }

  const reply = await generateFutureSelfResponse({
    discordUserId,
    horizon: "1y",
    prompt: topic,
    trigger: "preview",
  });

  console.log("\n--- REPLY ---\n");
  console.log(reply);
  console.log("\n--- END ---\n");
}

main().catch((err) => {
  console.error("[dry-run-checkin] failed:", err);
  process.exit(1);
});
