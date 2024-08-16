import { Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, query } from "./_generated/server";
import { getOneFrom, getOrThrow } from "convex-helpers/server/relationships";
import { pick, nullThrows } from "convex-helpers";
import {
  error,
  ok,
  resultValidator,
  userAction,
  userQuery,
  vv,
} from "./functions";
import schema from "./schema";
import { embed } from "./llm";
import { dotProduct } from "./linearAlgebra";
import { lookupMidpoint } from "./namespace";

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

export const makeGuess = userAction({
  args: { gameId: v.id("games"), text: v.string() },
  handler: async (ctx, args) => {
    const userId = ctx.userId;
    if (!userId) {
      console.error("Not authenticated");
      return;
    }
    const embedding = await embed(args.text);
    await ctx.runMutation(internal.game.insertGuess, {
      ...args,
      userId,
      embedding,
    });
  },
});

const EPSILON = 0.00001;

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
    const score = dotProduct(midpoint.midpointEmbedding, embedding);
    const leftDistance = dotProduct(midpoint.leftEmbedding, embedding);
    const rightDistance = dotProduct(midpoint.rightEmbedding, embedding);
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
