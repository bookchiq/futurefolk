/**
 * Local Gateway worker for DM continuations and ⏳ reactions.
 *
 * Vercel Hobby can't hold a WebSocket open, so DM messages and reactions
 * never reach the /api/webhooks/discord endpoint. This worker holds the
 * Gateway connection open (locally, or on Railway) and replies using the
 * same future-self generator and DB the deployed slash command path uses.
 *
 *   pnpm start:worker
 *
 * Reads DISCORD_BOT_TOKEN, ANTHROPIC_API_KEY, DATABASE_URL from the env.
 * Optional tunables: DEDUP_WINDOW_SECONDS, RATE_LIMIT_USER_TURNS_PER_MINUTE.
 */

import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type Message,
  type MessageReaction,
  type PartialMessageReaction,
  type User,
  type PartialUser,
} from "discord.js";

import { generateFutureSelfResponse } from "../lib/future-self";
import {
  appendMessage,
  getRecentMessagesAndHorizon,
  isDuplicateUserMessage,
  isRateLimited,
} from "../lib/conversation";
import { getVoiceProfile, type Horizon } from "../lib/voice-profile";
import { softScrubForHistory } from "../lib/voice";
import { VERSION } from "../lib/version";

const HOURGLASS = "⏳";
const REACTION_DEFAULT_HORIZON: Horizon = "1y";

// Drain budget on shutdown. Railway's default SIGTERM grace is ~30s; we leave
// some headroom for the final exit. The generateText calls in lib/future-self
// have their own AbortSignal.timeout(60s) but a single in-flight handler
// shouldn't hold the worker that long during shutdown — bound it here.
const SHUTDOWN_DRAIN_MS = 25_000;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  // DM channels and reactions on uncached messages arrive as partials.
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

client.once(Events.ClientReady, (c) => {
  console.log(
    `[gateway-worker] connected as ${c.user.tag} (version=${VERSION})`
  );
});

// ---------------------------------------------------------------------------
// Lifecycle state — tracked so SIGTERM can drain in-flight work cleanly.
// ---------------------------------------------------------------------------

let isShuttingDown = false;
let inFlight = 0;

// ---------------------------------------------------------------------------
// DM continuations
// ---------------------------------------------------------------------------

client.on(Events.MessageCreate, async (msg: Message) => {
  if (isShuttingDown) return;
  if (msg.author.bot) return;
  // 1:1 DMs only. Group DMs (ChannelType.GroupDM) are out of scope.
  if (msg.channel.type !== ChannelType.DM) return;

  inFlight++;
  try {
    const channelId = msg.channelId;
    const userId = msg.author.id;
    const text = msg.content;

    // Run all four independent gates/reads in parallel:
    //   - rate limit (always check first conceptually; cheap query)
    //   - dedup (against MESSAGE_CREATE redelivery)
    //   - profile (onboarding gate)
    //   - history + horizon (combined helper, one round-trip)
    // Even though one bail wastes the others, the happy path is the common
    // case and parallelizing saves 60-160ms per DM. Bails return before any
    // expensive work (LLM, DM send) runs.
    const [rateLimited, isDup, profile, recent] = await Promise.all([
      isRateLimited(userId),
      isDuplicateUserMessage(channelId, userId, text),
      getVoiceProfile(userId),
      getRecentMessagesAndHorizon(channelId, 20),
    ]);

    if (rateLimited) {
      console.log(`[gateway-worker] DM rate-limited, dropping: ${userId}`);
      return;
    }
    if (isDup) {
      console.log(`[gateway-worker] DM duplicate, skipping: ${userId}`);
      return;
    }
    if (!profile) {
      console.log(
        `[gateway-worker] DM from un-onboarded user ${userId}, ignoring`
      );
      return;
    }

    const horizon: Horizon = recent.horizon ?? REACTION_DEFAULT_HORIZON;
    const history = recent.history;

    console.log(
      `[gateway-worker] DM from ${userId} (${horizon}, len=${text.length})`
    );

    await msg.channel.sendTyping().catch(() => undefined);

    // Persist the user turn before generation so a crash mid-call doesn't
    // lose the question. History was already read above; the model's
    // `prompt` argument carries the new turn separately. softScrub
    // normalizes encoding + caps length without damaging typographic
    // punctuation (so DM continuations don't lose voice fidelity on
    // replay — issue #040).
    await appendMessage(
      channelId,
      userId,
      horizon,
      "user",
      softScrubForHistory(text)
    );

    const reply = await generateFutureSelfResponse({
      discordUserId: userId,
      horizon,
      prompt: text,
      history,
      trigger: "continuation",
    });

    await msg.channel.send(reply);
    await appendMessage(channelId, userId, horizon, "assistant", reply);

    console.log(`[gateway-worker] DM replied (len=${reply.length})`);
  } catch (err) {
    console.error("[gateway-worker] DM handler error:", err);
  } finally {
    inFlight--;
  }
});

// ---------------------------------------------------------------------------
// ⏳ reaction trigger
// ---------------------------------------------------------------------------

client.on(
  Events.MessageReactionAdd,
  async (
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser
  ) => {
    if (isShuttingDown) return;
    if (user.bot) return;

    inFlight++;
    try {
      if (reaction.partial) {
        try {
          await reaction.fetch();
        } catch {
          return;
        }
      }
      if (reaction.emoji.name !== HOURGLASS) return;

      if (reaction.message.partial) {
        try {
          await reaction.message.fetch();
        } catch {
          return;
        }
      }

      const fullUser = user.partial ? await user.fetch() : user;
      const dm = await fullUser.createDM();

      const reactedText = reaction.message.content ?? "";
      const horizon = REACTION_DEFAULT_HORIZON;
      const promptText =
        reactedText ||
        "(reacted to a message I couldn't read — context unavailable)";
      // Same softer normalize the persistence form gets — needed to
      // compare against the dedup query, which sees the persisted shape.
      const persistedText = softScrubForHistory(promptText);

      // Run profile + rate-limit + dedup in parallel — three gates
      // required. Dedup catches reaction redelivery across worker
      // reconnects and parity with the DM continuation path (issue #040).
      const [profile, rateLimited, isDup] = await Promise.all([
        getVoiceProfile(user.id),
        isRateLimited(user.id),
        isDuplicateUserMessage(dm.id, user.id, persistedText),
      ]);

      if (!profile) {
        console.log(
          `[gateway-worker] reaction from un-onboarded user ${user.id}, ignoring`
        );
        return;
      }
      if (rateLimited) {
        console.log(`[gateway-worker] reaction rate-limited: ${user.id}`);
        return;
      }
      if (isDup) {
        console.log(
          `[gateway-worker] reaction duplicate, skipping: ${user.id}`
        );
        return;
      }

      console.log(
        `[gateway-worker] ⏳ reaction by ${user.id} (len=${reactedText.length})`
      );

      // Persist the soft-scrubbed form. The system prompt's strict scrub
      // (lib/voice.ts::scrubForPromptInterpolation) handles
      // boundary-breaking chars at interpolation time; persistence uses
      // the softer scrub so quotes/apostrophes/hyphens survive in voice
      // history without re-injecting on the next continuation replay.
      await appendMessage(dm.id, fullUser.id, horizon, "user", persistedText);

      const reply = await generateFutureSelfResponse({
        discordUserId: fullUser.id,
        horizon,
        prompt: promptText,
        trigger: "reaction",
      });

      await dm.send(reply);
      await appendMessage(dm.id, fullUser.id, horizon, "assistant", reply);

      console.log(`[gateway-worker] reaction replied (len=${reply.length})`);
    } catch (err) {
      console.error("[gateway-worker] reaction handler error:", err);
    } finally {
      inFlight--;
    }
  }
);

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

const shutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(
    `[gateway-worker] received ${signal}, draining ${inFlight} in-flight handler(s)`
  );

  // Stop accepting new events first, then await the destroy so the WebSocket
  // close frame actually flushes (Discord otherwise records an abnormal
  // disconnect).
  try {
    await client.destroy();
  } catch (err) {
    console.error("[gateway-worker] destroy failed:", err);
  }

  // Drain in-flight handlers up to a deadline. Each handler's generateText
  // call has its own 60s timeout; this drain budget is shorter and bounded
  // by Railway's SIGTERM grace window.
  const deadline = Date.now() + SHUTDOWN_DRAIN_MS;
  while (inFlight > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (inFlight > 0) {
    console.warn(
      `[gateway-worker] exiting with ${inFlight} handler(s) still in flight`
    );
  }
  process.exit(0);
};
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

// Surface async errors that escape the per-handler try/catch — without
// these listeners, an unhandled rejection would crash silently on Node.js
// 24+ (rejection-throw policy), or print an unprefixed warning on older
// versions. Either way, Railway logs lose the prefix that makes them
// findable.
process.on("unhandledRejection", (reason) => {
  console.error("[gateway-worker] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[gateway-worker] uncaughtException:", err);
  // Non-async throws that escape the handler are not safely recoverable;
  // exit so Railway restarts cleanly.
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error("[gateway-worker] DISCORD_BOT_TOKEN is not set");
  process.exit(1);
}

client.login(token).catch((err) => {
  console.error("[gateway-worker] login failed:", err);
  process.exit(1);
});
