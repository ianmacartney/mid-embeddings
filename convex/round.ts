import { ShardedCounter } from "@convex-dev/sharded-counter";
import { asyncMap, nullThrows, pick } from "convex-helpers";
import { getManyFrom, getOrThrow } from "convex-helpers/server/relationships";
import { Infer } from "convex/values";
import { components, internal } from "./_generated/api";
import { embedWithCache } from "./embed";
import {
  error,
  internalMutation,
  leaderboard,
  migrations,
  ok,
  query,
  resultValidator,
  userAction,
  userQuery,
  vv as v,
} from "./functions";
import { computeGuess, lookupMidpoint } from "./namespace";

const counter = new ShardedCounter(components.shardedCounter);

const roundValidator = v.object({
  roundId: v.id("rounds"),
  left: v.string(),
  right: v.string(),
});
export type RoundInfo = Infer<typeof roundValidator>;

export const getDailyRound = query({
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
      ...pick(round, ["left", "right"]),
    });
  },
});

export const listGuesses = userQuery({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const userId = ctx.user?._id;
    if (!userId) {
      console.error("Not authenticated");
      return [];
    }
    return ctx.db
      .query("guesses")
      .withIndex("userId", (q) =>
        q.eq("userId", userId).eq("roundId", args.roundId),
      )
      .collect();
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
      [args.roundId, bestGuess.score],
      bestGuess._id,
      { prefix: [args.roundId] },
    );
  },
});

export const makeGuess = userAction({
  args: { roundId: v.id("rounds"), text: v.string() },
  handler: async (ctx, args) => {
    const userId = ctx.userId;
    if (!userId) {
      console.error("Not authenticated");
      return;
    }
    const embedding = await embedWithCache(ctx, args.text);
    await ctx.runMutation(internal.round.insertGuess, {
      ...args,
      userId,
      embedding,
    });
  },
});

export const insertGuess = internalMutation({
  args: {
    roundId: v.id("rounds"),
    text: v.string(),
    userId: v.id("users"),
    embedding: v.array(v.number()),
  },
  handler: async (ctx, { embedding, ...args }) => {
    const round = await getOrThrow(ctx, args.roundId);
    const midpoint = nullThrows(
      await lookupMidpoint(ctx, {
        namespaceId: round.namespaceId,
        left: round.left,
        right: round.right,
      }),
    );
    // TODO: hardcode "rank" for now
    const results = await computeGuess(ctx, midpoint, embedding, "rank");

    if (round.active) {
      // TODO: these counts should be more explicitly named guesses
      await counter.add(ctx, "total");
      await counter.add(ctx, args.roundId);
      await counter.add(ctx, round.namespaceId);
      await counter.add(ctx, args.userId);
    }
    return ctx.db.insert("guesses", { ...args, ...results });
  },
});

export const totalGuesses = query({
  args: {},
  handler: async (ctx) => {
    return counter.count(ctx, "total");
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
    if (!round?.active) {
      return;
    }
    await counter.add(ctx, "total");
    await counter.add(ctx, doc.roundId);
    await counter.add(ctx, round.namespaceId);
  },
});
export const backfill = migrations.runner(internal.round.addOldGuesses);

export const cleanUpRounds = migrations.define({
  table: "rounds",
  async migrateOne(ctx, doc) {
    const midpoint = await lookupMidpoint(ctx, {
      namespaceId: doc.namespaceId,
      left: doc.left,
      right: doc.right,
    });
    if (!midpoint) {
      await asyncMap(
        getManyFrom(ctx.db, "guesses", "roundId", doc._id),
        async (guess) => ctx.db.delete(guess._id),
      );
      return ctx.db.delete(doc._id);
    }
  },
});
export const runCleanUpRounds = migrations.runner(internal.round.cleanUpRounds);
