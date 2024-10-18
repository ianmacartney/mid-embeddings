import { Infer, v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation, query } from "./functions";
import {
  getManyFrom,
  getOneFrom,
  getOrThrow,
} from "convex-helpers/server/relationships";
import { pick, nullThrows } from "convex-helpers";
import {
  error,
  leaderboard,
  migrations,
  ok,
  resultValidator,
  userAction,
  userQuery,
  vv,
} from "./functions";
import schema from "./schema";
import { computeGuess, lookupMidpoint } from "./namespace";
import { asyncMap } from "convex-helpers";
import { ShardedCounter } from "@convex-dev/sharded-counter";
import { embedWithCache } from "./embed";

const counter = new ShardedCounter(components.shardedCounter);

const gameValidator = v.object({
  gameId: vv.id("games"),
  left: v.string(),
  right: v.string(),
  // TODO: doc validator
  ...schema.tables.namespaces.validator.fields,
  _id: v.id("namespaces"),
  _creationTime: v.number(),
});
export type GameInfo = Infer<typeof gameValidator>;

export const getDailyGame = query({
  args: { namespace: v.optional(v.string()) },
  returns: resultValidator(gameValidator),
  handler: async (ctx, args) => {
    const namespaceName = args.namespace ?? "feelings";
    const namespace = await getOneFrom(
      ctx.db,
      "namespaces",
      "slug",
      namespaceName,
    );
    if (!namespace) {
      console.error("Namespace not found: " + namespaceName);
      return error("Namespace not found");
    }
    const game = await ctx.db
      .query("games")
      .withIndex("namespaceId", (q) =>
        q.eq("namespaceId", namespace._id).eq("active", true),
      )
      .order("desc")
      .first();
    if (!game) {
      return error("No active games found");
    }
    // TODO: if future games are invite-only / not public, check access
    return ok({
      ...namespace,
      gameId: game._id,
      ...pick(game, ["left", "right"]),
    });
  },
});

export const getGame = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const game = await getOrThrow(ctx, args.gameId);
    return ok(pick(game, ["left", "right"]));
  },
});

export const listGuesses = userQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = ctx.user?._id;
    if (!userId) {
      console.error("Not authenticated");
      return [];
    }
    return ctx.db
      .query("guesses")
      .withIndex("userId", (q) =>
        q.eq("userId", userId).eq("gameId", args.gameId),
      )
      .collect();
  },
});

export const myRank = userQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = ctx.user?._id;
    if (!userId) {
      return -1;
    }
    const bestGuess = await ctx.db
      .query("guesses")
      .withIndex("userId", (q) =>
        q.eq("userId", userId).eq("gameId", args.gameId),
      )
      .first();
    if (!bestGuess) {
      return -1;
    }
    return leaderboard.offsetOf(
      ctx,
      [args.gameId, bestGuess.score],
      bestGuess._id,
      { prefix: [args.gameId] },
    );
  },
});

export const makeGuess = userAction({
  args: { gameId: v.id("games"), text: v.string() },
  handler: async (ctx, args) => {
    const userId = ctx.userId;
    if (!userId) {
      console.error("Not authenticated");
      return;
    }
    const embedding = await embedWithCache(ctx, args.text);
    await ctx.runMutation(internal.game.insertGuess, {
      ...args,
      userId,
      embedding,
    });
  },
});

export const insertGuess = internalMutation({
  args: {
    gameId: v.id("games"),
    text: v.string(),
    userId: v.id("users"),
    embedding: v.array(v.number()),
  },
  handler: async (ctx, { embedding, ...args }) => {
    const game = await getOrThrow(ctx, args.gameId);
    const midpoint = nullThrows(
      await lookupMidpoint(ctx, {
        namespaceId: game.namespaceId,
        left: game.left,
        right: game.right,
      }),
    );
    // TODO: hardcode "rank" for now
    const results = await computeGuess(ctx, midpoint, embedding, "rank");

    if (game.active) {
      await counter.add(ctx, "total");
      await counter.add(ctx, args.gameId);
      await counter.add(ctx, game.namespaceId);
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
    const game = await ctx.db.get(doc.gameId);
    if (!game?.active) {
      return;
    }
    await counter.add(ctx, "total");
    await counter.add(ctx, doc.gameId);
    await counter.add(ctx, game.namespaceId);
  },
});
export const backfill = migrations.runner(internal.game.addOldGuesses);

export const cleanUpGames = migrations.define({
  table: "games",
  async migrateOne(ctx, doc) {
    const midpoint = await lookupMidpoint(ctx, {
      namespaceId: doc.namespaceId,
      left: doc.left,
      right: doc.right,
    });
    if (!midpoint) {
      await asyncMap(
        getManyFrom(ctx.db, "guesses", "gameId", doc._id),
        async (guess) => ctx.db.delete(guess._id),
      );
      return ctx.db.delete(doc._id);
    }
  },
});
export const runCleanUpGames = migrations.runner(internal.game.cleanUpGames);
