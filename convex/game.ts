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
  namespaceAdminMutation,
  namespaceAdminQuery,
  runWithRetries,
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
import { paginationOptsValidator } from "convex/server";
import { omit } from "convex-helpers";

export const listGamesByNamespace = query({
  args: { namespaceId: v.id("namespaces") },
  handler: async (ctx, args) => {
    return asyncMap(
      getManyFrom(ctx.db, "games", "namespaceId", args.namespaceId),
      async (game) => {
        const midpoint = await ctx.db.get(game.midpointId);
        if (!midpoint) return null;
        const left = await ctx.db.get(midpoint.leftId);
        const right = await ctx.db.get(midpoint.rightId);
        if (!left || !right) return null;
        return {
          _id: game._id,
          left: left.title,
          right: right.title,
        };
      },
    );
  },
});

export const paginateText = namespaceAdminQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return ctx.db
      .query("texts")
      .withIndex("namespaceId", (q) => q.eq("namespaceId", ctx.namespace._id))
      .paginate(args.paginationOpts);
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
    });
  },
});

export const makeMidpoint = namespaceAdminMutation({
  args: {
    leftId: v.id("texts"),
    rightId: v.id("texts"),
  },
  handler: async (ctx, args) => {
    // check that the texts are in the same namespace
    const [left, right] = await getAll(ctx.db, [args.leftId, args.rightId]);
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

    await runWithRetries(ctx, internal.game.findMidpointMatches, {
      ...args,
      midpointEmbedding,
      leftId: args.leftId,
      rightId: args.rightId,
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
        return { title: text.title, textId: text._id, score };
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
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    const midpoint = await ctx.db.get(game.midpointId);
    if (!midpoint) throw new Error("Midpoint not found");
    const score = dotProduct(midpoint.midpointEmbedding, args.embedding);
    const [leftDistance, rightDistance] = await Promise.all(
      [midpoint.leftId, midpoint.rightId].map(async (id) => {
        const text = await ctx.db.get(id);
        if (!text) throw new Error("Text not found: " + id);
        const leftEmbedding = await ctx.db.get(text.embeddingId);
        if (!leftEmbedding) throw new Error("Left embedding not found");
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
