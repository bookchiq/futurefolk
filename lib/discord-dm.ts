/**
 * Raw Discord REST DM sender.
 *
 * Used by the scheduled-check-in workflow to deliver messages without
 * carrying ChatSDK or discord.js into a Vercel Function bundle. The bot
 * speaks to Discord via two unauthenticated-by-us / signed-by-token API
 * calls: open the canonical DM channel for a user, then post a message.
 *
 * Returns the channel ID so callers can persist conversation history under
 * the same key the slash command and gateway worker write to (raw Discord
 * channel ID, per `lib/conversation.ts`).
 */

const DISCORD_API = "https://discord.com/api/v10";

export interface SendDmResult {
  /** Raw Discord DM channel ID — same shape used as `conversation_messages.channel_id`. */
  channelId: string;
  /** ID of the message we just posted. */
  messageId: string;
}

export async function sendDiscordDM(
  discordUserId: string,
  content: string
): Promise<SendDmResult> {
  if (!/^\d{15,25}$/.test(discordUserId)) {
    throw new Error("[Futurefolk] sendDiscordDM: invalid discordUserId shape");
  }

  if (process.env.FUTUREFOLK_DRY_RUN === "1") {
    console.log("[Futurefolk] DRY_RUN sendDiscordDM:", {
      discordUserId,
      contentPreview: content.slice(0, 200),
    });
    return { channelId: "dry-run-channel", messageId: "dry-run-message" };
  }

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error("[Futurefolk] sendDiscordDM: DISCORD_BOT_TOKEN is not set");
  }

  // 1. Open (or fetch the existing) DM channel for this user.
  const dmRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recipient_id: discordUserId }),
  });
  if (!dmRes.ok) {
    throw new Error(
      `[Futurefolk] sendDiscordDM: open DM failed (${dmRes.status})`
    );
  }
  const dm = (await dmRes.json()) as { id: string };

  // 2. Post the message.
  const msgRes = await fetch(`${DISCORD_API}/channels/${dm.id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });
  if (!msgRes.ok) {
    throw new Error(
      `[Futurefolk] sendDiscordDM: send failed (${msgRes.status})`
    );
  }
  const msg = (await msgRes.json()) as { id: string };

  return { channelId: dm.id, messageId: msg.id };
}
