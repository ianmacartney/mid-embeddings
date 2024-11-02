import { ShardedCounter } from "@convex-dev/sharded-counter";
import { getOrThrow } from "convex-helpers/server/relationships";
import { ConvexError, Infer } from "convex/values";
import { api, components, internal } from "./_generated/api";
import { embedWithCache, getTextByTitle } from "./embed";
import {
  error,
  globalLeaderboard,
  internalAction,
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
import { Doc } from "./_generated/dataModel";
import { pruneNull } from "convex-helpers";

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
        [args.roundId, guess.score, guess.submittedAt ?? Date.now()],
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
    return { embeddingId: text?.embeddingId, namespaceId: round.namespaceId };
  },
});

export const makeGuess = userAction({
  args: { roundId: v.id("rounds"), title: v.string() },
  handler: async (ctx, args) => {
    const userId = ctx.userId;
    if (!userId) {
      throw new ConvexError("Not logged in.");
    }
    const result = await ctx.runQuery(internal.round.lookupTextEmbedding, {
      userId,
      roundId: args.roundId,
      title: args.title,
    });
    let embeddingId = result?.embeddingId;
    if (!embeddingId) {
      // TODO: we should be stricter in only accepting text that matches the
      // stem of valid text.
      const results = await ctx.vectorSearch("embeddings", "embedding", {
        filter: (q) => q.eq("namespaceId", result.namespaceId),
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

/**
 * Returns the closest word to the given title.
 * Helpful for debugging, and future use cases like autocomplete.
 */
export const closestWords = internalAction({
  args: {
    title: v.string(),
    roundId: v.optional(v.id("rounds")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ title: string; score: number }[]> => {
    let roundId = args.roundId;
    if (!roundId) {
      const round = await ctx.runQuery(api.round.getActiveRound);
      if (!round.ok || !round.value) {
        throw new ConvexError("No active round found.");
      }
      roundId = round.value.roundId;
    }
    const namespaceId = await ctx.runQuery(internal.round.namespaceId, {
      roundId,
    });
    const results = await ctx.vectorSearch("embeddings", "embedding", {
      filter: (q) => q.eq("namespaceId", namespaceId),
      vector: await embedWithCache(ctx, args.title),
      limit: args.limit ?? 10,
    });
    if (results.length === 0) {
      throw new ConvexError(`No embedding found for ${args.title}.`);
    }
    const embeddingIds = results.map((r) => r._id);

    console.log("score", results[0]._score);
    const texts: Doc<"texts">[] = await ctx.runQuery(
      internal.round.textByEmbedding,
      {
        embeddingIds,
      },
    );
    return texts.map((t) => ({
      title: t.title,
      score: results.find((r) => r._id === t.embeddingId)!._score,
    }));
  },
});
export const namespaceId = internalQuery({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const round = await getOrThrow(ctx, args.roundId);
    return round.namespaceId;
  },
});
export const textByEmbedding = internalQuery({
  args: { embeddingIds: v.array(v.id("embeddings")) },
  handler: async (ctx, args) => {
    return pruneNull(
      await Promise.all(
        args.embeddingIds.map((embeddingId) =>
          ctx.db
            .query("texts")
            .withIndex("embeddingId", (q) => q.eq("embeddingId", embeddingId))
            .unique(),
        ),
      ),
    );
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
    if (args.title.trim().length === 0) {
      throw new ConvexError("Guess cannot be empty.");
    }
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

    const index = round.matches.indexOf(args.embeddingId);
    const rank = index === -1 ? undefined : index;
    let score = guess?.score ?? 0;
    const points =
      rank !== undefined && rank < NUM_MATCHES ? NUM_MATCHES - rank : 0;
    const attempt = { title: args.title, rank, points };
    if (rank !== undefined) {
      score += points;
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
      const matched = guess.attempts.filter((t) => (t.points ?? 0) > 0).length;
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

export const globalStats = query({
  args: {},
  handler: async (ctx) => {
    const results = await globalLeaderboard.paginate(
      ctx,
      undefined,
      undefined,
      "desc",
      10,
    );
    const leaders = await Promise.all(
      results.page.map(async (leader) => {
        const user = await getOrThrow(ctx, leader.id);
        if (user.isAnonymous) {
          return {
            score: leader.sumValue,
            name: "Anonymous",
            id: leader.id,
          };
        }
        return {
          score: leader.sumValue,
          id: leader.id,
          name: user.name,
        };
      }),
    );

    return {
      totalGuesses: await counter.count(ctx, "guesses:total"),
      leaders,
    };
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
