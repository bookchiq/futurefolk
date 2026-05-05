/**
 * Cancel a pending scheduled check-in by row id.
 *
 * Admin escape hatch until the /profile cancel UI ships. Useful for:
 *   - Friend-tester says "actually never mind, cancel that one"
 *   - Sarah scheduled a test check-in for tomorrow and wants to kill it
 *   - Cleanup after a workflow restart leaves a row in a confused state
 *
 * Usage:
 *   pnpm tsx scripts/cancel-check-in.ts <discord-user-id> <check-in-id>
 *
 * Requires DATABASE_URL. Workflow cancel also requires whatever auth
 * Vercel Workflow expects (typically just project credentials picked up
 * from the environment).
 */

import { cancelScheduledCheckIn } from "@/lib/scheduled-check-ins";

async function main(): Promise<void> {
  const [, , discordUserIdRaw, idRaw] = process.argv;

  if (!discordUserIdRaw || !idRaw) {
    console.error(
      "Usage: pnpm tsx scripts/cancel-check-in.ts <discord-user-id> <check-in-id>",
    );
    process.exit(1);
  }

  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    console.error(`Invalid check-in id: ${idRaw}`);
    process.exit(1);
  }

  const result = await cancelScheduledCheckIn({
    id,
    discordUserId: discordUserIdRaw,
  });

  if (!result.cancelled) {
    console.error(
      `No pending check-in with id=${id} for user ${discordUserIdRaw}.`,
    );
    process.exit(1);
  }

  console.log(
    `Cancelled check-in ${id} for user ${discordUserIdRaw}. workflow run cancelled: ${result.runCancelled}`,
  );
  if (!result.runCancelled) {
    console.log(
      "(Workflow run cancel didn't succeed, but the row is marked cancelled. The workflow's atomic-claim UPDATE will skip the DM on wake.)",
    );
  }
}

main().catch((err) => {
  console.error("[cancel-check-in] failed:", err);
  process.exit(1);
});
