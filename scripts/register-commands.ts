/**
 * Register the /futureself slash command with Discord.
 *
 * One-time setup. Re-run if you change the command name, parameters, or
 * descriptions. ChatSDK does NOT register slash commands for you — only
 * incoming command dispatch is handled (per chat-sdk.dev/docs/slash-commands).
 *
 * Usage:
 *   pnpm register:commands
 *   # or
 *   npx tsx scripts/register-commands.ts
 *
 * Required env vars:
 *   DISCORD_BOT_TOKEN
 *   DISCORD_APPLICATION_ID  (or DISCORD_APP_ID — Sarah's SETUP.md uses APP_ID)
 *
 * Optional:
 *   DISCORD_GUILD_ID  — when set, registers the command to a single guild
 *                       (instant updates, useful while iterating). When unset,
 *                       registers globally (Discord can take up to an hour to
 *                       propagate global commands).
 */

const APPLICATION_COMMAND_OPTION_TYPE_STRING = 3;

// Discord interaction option types — we only use STRING here.
// See: https://discord.com/developers/docs/interactions/application-commands#application-command-object-application-command-option-type

const command = {
  name: "futureself",
  description: "Talk to a future version of yourself.",
  // CHAT_INPUT (slash command in the message composer). Default; included for clarity.
  type: 1,
  options: [
    {
      name: "horizon",
      description: "How far in the future is this version of you?",
      type: APPLICATION_COMMAND_OPTION_TYPE_STRING,
      required: true,
      choices: [
        { name: "1 year from now", value: "1y" },
        { name: "5 years from now", value: "5y" },
      ],
    },
    {
      name: "about",
      description: "What do you want to talk to future-you about?",
      type: APPLICATION_COMMAND_OPTION_TYPE_STRING,
      required: true,
    },
    {
      name: "schedule",
      description:
        "Optional: ISO date for a scheduled check-in (e.g. 2026-11-02). Wired up later.",
      type: APPLICATION_COMMAND_OPTION_TYPE_STRING,
      required: false,
    },
  ],
};

async function main(): Promise<void> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const appId =
    process.env.DISCORD_APPLICATION_ID ?? process.env.DISCORD_APP_ID;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!botToken) throw new Error("DISCORD_BOT_TOKEN is not set");
  if (!appId) {
    throw new Error("DISCORD_APPLICATION_ID (or DISCORD_APP_ID) is not set");
  }

  const url = guildId
    ? `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`
    : `https://discord.com/api/v10/applications/${appId}/commands`;

  const scope = guildId ? `guild ${guildId}` : "globally";
  console.log(`[register-commands] PUT /futureself → ${scope}`);

  // PUT replaces the full set of commands at this scope with this single
  // command. If you add more slash commands later, include them all here —
  // anything missing from the array will be removed.
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([command]),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Discord API ${res.status} ${res.statusText}: ${body.slice(0, 500)}`,
    );
  }

  const json = (await res.json()) as Array<{ id: string; name: string }>;
  console.log(
    `[register-commands] registered: ${json.map((c) => `/${c.name} (${c.id})`).join(", ")}`,
  );
  if (!guildId) {
    console.log(
      "[register-commands] Global commands can take up to an hour to propagate. " +
        "Set DISCORD_GUILD_ID for instant updates while iterating.",
    );
  }
}

main().catch((err) => {
  console.error("[register-commands] failed:", err);
  process.exit(1);
});
