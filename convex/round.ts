import { ShardedCounter } from "@convex-dev/sharded-counter";
import { getOrThrow } from "convex-helpers/server/relationships";
import { ConvexError, Infer } from "convex/values";
import { components, internal } from "./_generated/api";
import { embedWithCache, getTextByTitle } from "./embed";
import {
  error,
  internalMutation,
  internalQuery,
  migrations,
  ok,
  query,
  resultValidator,
  roundLeaderboard,
  userAction,
  userQuery,
  vv as v,
} from "./functions";
import { MAX_ATTEMPTS, NUM_MATCHES } from "./shared";

const counter = new ShardedCounter(components.shardedCounter, {
  shards: {
    "guesses:total": 50,
  },
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
    const guess = await ctx.db
      .query("guesses")
      .withIndex("userId", (q) =>
        q.eq("userId", userId).eq("roundId", args.roundId),
      )
      .first();
    if (!guess) {
      return Infinity;
    }
    return (
      (await roundLeaderboard.offsetOf(
        ctx,
        [args.roundId, guess.score, guess.submittedAt ?? Infinity],
        guess._id,
        { prefix: [args.roundId] },
      )) + 1
    );
  },
});

export const lookupTextEmbedding = internalQuery({
  args: { roundId: v.id("rounds"), title: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => {
    const round = await getOrThrow(ctx, args.roundId);
    const text = await getTextByTitle(ctx, round.namespaceId, args.title);
    return text?.embeddingId;
  },
});

export const makeGuess = userAction({
  args: { roundId: v.id("rounds"), title: v.string() },
  handler: async (ctx, args) => {
    const userId = ctx.userId;
    if (!userId) {
      throw new ConvexError("Not logged in.");
    }
    let embeddingId = await ctx.runQuery(internal.round.lookupTextEmbedding, {
      userId,
      roundId: args.roundId,
      title: args.title,
    });
    if (!embeddingId) {
      // TODO: we should be stricter in only accepting text that matches the
      // stem of valid text.
      const results = await ctx.vectorSearch("embeddings", "embedding", {
        vector: await embedWithCache(ctx, args.title),
        limit: 1,
      });
      if (results.length === 0) {
        throw new ConvexError(`No embedding found for ${args.title}.`);
      }
      embeddingId = results[0]._id;
    }
    await ctx.runMutation(internal.round.insertGuess, {
      userId,
      roundId: args.roundId,
      title: args.title,
      embeddingId,
    });
  },
});

export const insertGuess = internalMutation({
  args: {
    userId: v.id("users"),
    roundId: v.id("rounds"),
    title: v.string(),
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
      throw new ConvexError("Round is not active.");
    }

    const index = round.matches.slice(0, NUM_MATCHES).indexOf(args.embeddingId);
    const rank = index === -1 ? undefined : index;
    const attempt = { title: args.title, rank };
    let score = guess?.score ?? 0;
    if (rank !== undefined) {
      score += NUM_MATCHES - rank;
    }
    if (guess) {
      if (
        guess.attempts.some(
          (t) =>
            t.title === args.title || (rank !== undefined && t.rank === rank),
        )
      ) {
        throw new ConvexError("Guess already submitted.");
      }
      if (guess.attempts.length >= MAX_ATTEMPTS) {
        throw new ConvexError("Max attempts reached.");
      }
      const matched = guess.attempts.filter((t) => t.rank !== undefined).length;
      if (NUM_MATCHES === matched) {
        throw new ConvexError("All matches already guessed.");
      }
      if (guess.submittedAt) {
        throw new ConvexError("Guesses already submitted.");
      }
      const lower = args.title.toLowerCase().trim();
      const check = (word: string) => {
        if (lower.includes(word) || word.includes(lower)) {
          throw new ConvexError(
            "Word cannot include target word. " +
              `Your guess ${args.title} includes ${word}.`,
          );
        }
      };
      check(round.left);
      check(round.right);
      let submittedAt = guess.submittedAt;
      if (rank !== undefined && NUM_MATCHES === matched + 1) {
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
  },
});
export const backfill = migrations.runner(internal.round.addOldGuesses);
