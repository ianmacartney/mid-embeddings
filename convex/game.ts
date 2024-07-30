import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  QueryCtx,
} from "./_generated/server";
import {
  getAll,
  getAllOrThrow,
  getManyFrom,
  getOneFrom,
} from "convex-helpers/server/relationships";
import { asyncMap } from "convex-helpers";
import { pick } from "convex-helpers";
import {
  error,
  getOrThrow,
  namespaceAdminMutation,
  namespaceAdminQuery,
  ok,
  userAction,
  userMutation,
  userQuery,
} from "./functions";
import schema from "./schema";
import { embed } from "./llm";
import {
  deltaVector,
  dotProduct,
  getMidpoint,
  vectorLength,
} from "./linearAlgebra";
import { omit } from "convex-helpers";
import { getTextByTitle } from "./embed";
import { paginationOptsValidator } from "convex/server";

export const listGamesByNamespace = query({
  args: { namespaceId: v.id("namespaces") },
  handler: async (ctx, args) => {
    return asyncMap(
      getManyFrom(ctx.db, "games", "namespaceId", args.namespaceId),
      async (game) => {
        const midpoint = await ctx.db.get(game.midpointId);
        if (!midpoint) return null;
        const left = await getTextByTitle(ctx, game.namespaceId, midpoint.left);
        const right = await getTextByTitle(
          ctx,
          game.namespaceId,
          midpoint.right,
        );
        if (!left || !right) return null;
        return {
          _id: game._id,
          left: left.title,
          right: right.title,
        };
      },
    ).then((games) => games.flatMap((g) => (g === null ? [] : [g])));
  },
});

export const getDailyGame = query({
  args: { namespace: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const namespaceName = args.namespace ?? "feelings";
    const namespace = await ctx.db
      .query("namespaces")
      .withIndex("name", (q) => q.eq("name", namespaceName))
      .unique();
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
      console.error("No active games found");
      return error("No active games found");
    }
    // TODO: if future games are invite-only / not public, check access
    const midpoint = await getOrThrow(ctx, game.midpointId);
    return ok({
      ...namespace,
      gameId: game._id,
      ...pick(midpoint, ["left", "right"]),
    });
  },
});

export const getGame = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const game = await getOrThrow(ctx, args.gameId);
    const midpoint = await getOrThrow(ctx, game.midpointId);
    return ok(pick(midpoint, ["left", "right"]));
  },
});

export const makeGame = namespaceAdminMutation({
  args: {
    midpointId: v.id("midpoints"),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("games", {
      namespaceId: ctx.namespace._id,
      midpointId: args.midpointId,
      active: false,
    });
  },
});

export const listMidpoints = namespaceAdminQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return ctx.db
      .query("midpoints")
      .withIndex("namespaceId", (q) => q.eq("namespaceId", ctx.namespace._id))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const calculateMidpoint = namespaceAdminMutation({
  args: {
    left: v.string(),
    right: v.string(),
    skipCache: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (!args.skipCache) {
      const existing = await ctx.db
        .query("midpoints")
        .withIndex("namespaceId", (q) =>
          q
            .eq("namespaceId", ctx.namespace._id)
            .eq("left", args.left)
            .eq("right", args.right),
        )
        .order("desc")
        .first();
      if (existing) return existing;
    }
    // check that the texts are in the same namespace
    const left = await getTextByTitle(ctx, ctx.namespace._id, args.left);
    const right = await getTextByTitle(ctx, ctx.namespace._id, args.right);
    if (
      left?.namespaceId !== ctx.namespace._id ||
      right?.namespaceId !== ctx.namespace._id
    ) {
      throw new Error("Texts must be in the same namespace");
    }
    const [leftEmbedding, rightEmbedding] = await getAllOrThrow(ctx.db, [
      left.embeddingId,
      right.embeddingId,
    ]);
    const midpointEmbedding = getMidpoint(
      leftEmbedding.embedding,
      rightEmbedding.embedding,
    );

    await ctx.scheduler.runAfter(0, internal.game.findMidpointMatches, {
      ...args,
      midpointEmbedding,
    });
  },
});

export const findMidpointMatches = internalAction({
  args: omit(schema.tables.midpoints.validator.fields, ["topMatches"]),
  handler: async (ctx, args) => {
    const topMatches = await ctx
      .vectorSearch("embeddings", "embedding", {
        vector: args.midpointEmbedding,
        limit: 100,
        filter: (q) => q.eq("namespaceId", args.namespaceId),
      })
      .then((results) =>
        results.map(({ _id, _score }) => ({ embeddingId: _id, score: _score })),
      );
    await ctx.runMutation(internal.game.insertMidpoint, {
      ...args,
      topMatches,
    });
  },
});

export const insertMidpoint = internalMutation({
  args: {
    ...schema.tables.midpoints.validator.fields,
    topMatches: v.array(
      v.object({ embeddingId: v.id("embeddings"), score: v.number() }),
    ),
  },
  handler: async (ctx, args) => {
    const topMatches = await asyncMap(
      args.topMatches,
      async ({ embeddingId, score }) => {
        const text = await getOneFrom(
          ctx.db,
          "texts",
          "embeddingId",
          embeddingId,
        );
        if (!text) throw new Error("Text not found");
        return { title: text.title, score };
      },
    );
    await ctx.db.insert("midpoints", { ...args, topMatches });
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

export const makeGuess = userAction({
  args: { gameId: v.id("games"), text: v.string() },
  handler: async (ctx, args) => {
    const userId = ctx.userId;
    if (!userId) {
      console.error("Not authenticated");
      return;
    }
    const embedding = await embed(args.text);
    await ctx.runMutation(internal.game.addGuess, {
      ...args,
      userId,
      embedding,
    });
  },
});

const EPSILON = 0.00001;

export const addGuess = internalMutation({
  args: {
    gameId: v.id("games"),
    text: v.string(),
    userId: v.id("users"),
    embedding: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    const game = await getOrThrow(ctx, args.gameId);
    const midpoint = await getOrThrow(ctx, game.midpointId);
    const score = dotProduct(midpoint.midpointEmbedding, args.embedding);
    const [leftDistance, rightDistance] = await Promise.all(
      [midpoint.left, midpoint.right].map(async (title) => {
        const text = await getTextByTitle(ctx, game.namespaceId, title);
        if (!text) throw new Error("Midpoint text not found: " + title);
        const leftEmbedding = await getOrThrow(ctx, text.embeddingId);
        return vectorLength(
          deltaVector(args.embedding, leftEmbedding.embedding),
        );
      }),
    );
    const rank = midpoint.topMatches.findIndex(
      (m) => m.score <= score + EPSILON,
    );

    // TODO: score might be based on how it compares against topMatches instead of raw score
    return ctx.db.insert("guesses", {
      ...args,
      rank: rank === -1 ? Infinity : rank,
      score,
      leftDistance,
      rightDistance,
    });
  },
});
