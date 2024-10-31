import { ShardedCounter } from "@convex-dev/sharded-counter";
import { getOrThrow } from "convex-helpers/server/relationships";
import { ConvexError, Infer } from "convex/values";
import { components, internal } from "./_generated/api";
import { embedWithCache, getTextByTitle } from "./embed";
import {
  error,
  internalMutation,
  internalQuery,
  leaderboard,
  migrations,
  ok,
  query,
  resultValidator,
  userAction,
  userQuery,
  vv as v,
} from "./functions";

const MAX_ATTEMPTS = 10;
const counter = new ShardedCounter(components.shardedCounter, {
  shards: {
    "guesses:total": 50,
  },
});
// For user-specific counters, we don't need to shard.
const userCounter = new ShardedCounter(components.shardedCounter, {
  defaultShards: 1,
});

const roundValidator = v.object({
  roundId: v.id("rounds"),
  left: v.string(),
  right: v.string(),
});
export type RoundInfo = Infer<typeof roundValidator>;

export const getActiveRound = query({
  args: {},
  returns: resultValidator(roundValidator),
  handler: async (ctx) => {
    const round = await ctx.db
      .query("rounds")
      .withIndex("active", (q) => q.eq("active", true))
      .order("desc")
      .first();
    if (!round) {
      return error("No active rounds found");
    }
    // TODO: if future rounds are invite-only / not public, check access
    return ok({
      roundId: round._id,
      left: round.left,
      right: round.right,
    });
  },
});

export const listGuesses = userQuery({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const userId = ctx.user?._id;
    if (!userId) {
      return null;
    }
    return ctx.db
      .query("guesses")
      .withIndex("userId", (q) =>
        q.eq("userId", userId).eq("roundId", args.roundId),
      )
      .unique();
  },
});

export const myRank = userQuery({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const userId = ctx.user?._id;
    if (!userId) {
      return -1;
    }
    const bestGuess = await ctx.db
      .query("guesses")
      .withIndex("userId", (q) =>
        q.eq("userId", userId).eq("roundId", args.roundId),
      )
      .first();
    if (!bestGuess) {
      return -1;
    }
    return leaderboard.offsetOf(
      ctx,
      [args.roundId, bestGuess.score, bestGuess.submittedAt ?? Infinity],
      bestGuess._id,
      { prefix: [args.roundId] },
    );
  },
});

export const lookupTextEmbedding = internalQuery({
  args: { roundId: v.id("rounds"), text: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => {
    const round = await getOrThrow(ctx, args.roundId);
    const text = await getTextByTitle(ctx, round.namespaceId, args.text);
    return text?.embeddingId;
  },
});

export const makeGuess = userAction({
  args: { roundId: v.id("rounds"), text: v.string() },
  handler: async (ctx, args) => {
    const userId = ctx.userId;
    if (!userId) {
      throw new ConvexError("Not logged in.");
    }
    let embeddingId = await ctx.runQuery(internal.round.lookupTextEmbedding, {
      userId,
      roundId: args.roundId,
      text: args.text,
    });
    if (!embeddingId) {
      // TODO: we should be stricter in only accepting text that matches the
      // stem of valid text.
      const results = await ctx.vectorSearch("embeddings", "embedding", {
        vector: await embedWithCache(ctx, args.text),
        limit: 1,
      });
      if (results.length === 0) {
        return error(`No embedding found for ${args.text}.`);
      }
      embeddingId = results[0]._id;
    }
    await ctx.runMutation(internal.round.insertGuess, {
      userId,
      roundId: args.roundId,
      text: args.text,
      embeddingId,
    });
  },
});

export const insertGuess = internalMutation({
  args: {
    userId: v.id("users"),
    roundId: v.id("rounds"),
    text: v.string(),
    embeddingId: v.id("embeddings"),
  },
  handler: async (ctx, args) => {
    const guess = await ctx.db
      .query("guesses")
      .withIndex("userId", (q) =>
        q.eq("userId", args.userId).eq("roundId", args.roundId),
      )
      .unique();
    const round = await getOrThrow(ctx, args.roundId);
    if (!round.active) {
      return error("Round is not active.");
    }

    const index = round.matches.indexOf(args.embeddingId);
    const rank = index === -1 ? undefined : index;
    const attempt = { text: args.text, rank };
    let score = guess?.score ?? 0;
    if (rank !== undefined) {
      score += round.matches.length - rank;
    }
    if (guess) {
      if (
        guess.attempts.some(
          (t) =>
            t.text === args.text || (rank !== undefined && t.rank === rank),
        )
      ) {
        return error("Guess already submitted.");
      }
      if (guess.attempts.length >= MAX_ATTEMPTS) {
        return error("Max attempts reached.");
      }
      const matches = guess.attempts.filter((t) => t.rank !== undefined).length;
      if (round.matches.length === matches) {
        return error("All matches already guessed.");
      }
      if (guess.submittedAt) {
        return error("Guesses already submitted.");
      }
      let submittedAt = guess.submittedAt;
      if (rank !== undefined && round.matches.length === matches + 1) {
        submittedAt = Date.now();
        // Extra credit for guessing all matches with extra attempts left.
        score += MAX_ATTEMPTS - guess.attempts.length;
      } else if (guess.attempts.length === MAX_ATTEMPTS - 1) {
        submittedAt = Date.now();
      }
      await ctx.db.patch(guess._id, {
        attempts: [...guess.attempts, attempt],
        score,
        submittedAt,
      });
    } else {
      await ctx.db.insert("guesses", {
        roundId: args.roundId,
        userId: args.userId,
        attempts: [attempt],
        score,
      });
    }

    await counter.add(ctx, "guesses:total");
    await counter.add(ctx, `guesses:${args.roundId}`);
    await counter.add(ctx, `guesses:${round.namespaceId}`);
    await userCounter.add(ctx, `guesses:${args.userId}`);
  },
});

export const totalGuesses = query({
  args: {},
  handler: async (ctx) => {
    return counter.count(ctx, "guesses:total");
  },
});

export const addOldGuesses = migrations.define({
  table: "guesses",
  customRange: (query) =>
    query.withIndex("by_creation_time", (q) =>
      q.lt("_creationTime", Number(new Date("2024-10-22T16:20:00.000Z"))),
    ),
  async migrateOne(ctx, doc) {
    const round = await ctx.db.get(doc.roundId);
    if (!round) {
      return;
    }
    await counter.add(ctx, "guesses:total");
    await counter.add(ctx, `guesses:${doc.roundId}`);
    await counter.add(ctx, `guesses:${round.namespaceId}`);
    await userCounter.add(ctx, `guesses:${doc.userId}`);
  },
});
export const backfill = migrations.runner(internal.round.addOldGuesses);
