import { Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  DatabaseReader,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import {
  getOrThrow,
  getManyFrom,
  getOneFrom,
  getOneFromOrThrow,
} from "convex-helpers/server/relationships";
import { asyncMap } from "convex-helpers";
import {
  namespaceAdminAction,
  namespaceAdminMutation,
  namespaceAdminQuery,
  namespaceUserAction,
  namespaceUserQuery,
  userMutation,
  userQuery,
} from "./functions";
import schema from "./schema";
import { asyncMapChunked, chunk, embed, embedBatch } from "./llm";
import { calculateMidpoint, dotProduct } from "./linearAlgebra";
import { partial } from "convex-helpers/validators";
import { FunctionArgs, paginationOptsValidator } from "convex/server";
import { omit } from "convex-helpers";
import { nullThrows } from "convex-helpers";
import { getTextByTitle } from "./embed";
import { defineRateLimits } from "convex-helpers/server/rateLimit";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const { rateLimit } = defineRateLimits({
  createNamespace: { kind: "token bucket", period: 10 * SECOND, rate: 1 },
  addText: { kind: "token bucket", period: DAY, rate: 10_000 },
  basicSearch: { kind: "token bucket", period: SECOND, rate: 1, capacity: 5 },
  midSearch: { kind: "token bucket", period: SECOND, rate: 1 },
});

export const listNamespaces = userQuery({
  args: {},
  handler: async (ctx, args) => {
    if (!ctx.user) {
      return [];
    }

    return getManyFrom(ctx.db, "namespaces", "createdBy", ctx.user?._id);
  },
});

export const upsertNamespace = userMutation({
  args: omit(schema.tables.namespaces.validator.fields, ["createdBy"]),
  handler: async (ctx, args) => {
    // TODO: check that the user is allowed to create a namespace
    if (!ctx.user) {
      throw new Error("Not authenticated");
    }
    const existing = await getOneFrom(ctx.db, "namespaces", "slug", args.name);
    if (existing) {
      if (existing.createdBy !== ctx.user._id) {
        throw new Error("Namespace already exists");
      }
      return existing._id;
    }
    await rateLimit(ctx, {
      name: "createNamespace",
      key: ctx.user._id,
      throws: true,
    });
    return ctx.db.insert("namespaces", { ...args, createdBy: ctx.user._id });
  },
});

export const listGamesByNamespace = namespaceAdminQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("games")
      .withIndex("namespaceId", (q) => q.eq("namespaceId", ctx.namespace._id))
      .order("desc")
      .take(20);
  },
});

export const update = namespaceAdminMutation({
  args: partial(schema.tables.namespaces.validator.fields),
  handler: async (ctx, args) => {
    return ctx.db.patch(ctx.namespace._id, args);
  },
});

export const getNamespace = namespaceUserQuery({
  args: {},
  handler: async (ctx, args) => {
    const isEmpty = !(await ctx.db
      .query("texts")
      .withIndex("namespaceId", (q) => q.eq("namespaceId", ctx.namespace._id))
      .first());
    return { ...ctx.namespace, isEmpty };
  },
});

export const rateLimitAdds = internalMutation({
  args: {
    userId: v.id("users"),
    count: v.number(),
  },
  handler: (ctx, { count, userId: key }) =>
    rateLimit(ctx, { name: "addText", count, key, throws: true }),
});

export const addText = namespaceAdminAction({
  args: {
    titled: v.optional(
      v.array(v.object({ title: v.string(), text: v.string() })),
    ),
    texts: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<number> => {
    const texts = (args.titled || []).concat(
      (args.texts || []).map((text) => ({ text, title: text })),
    );
    console.debug(
      `Adding ${texts.length} texts to namespace ${ctx.namespace.name}`,
    );
    const textsToEmbed = await asyncMapChunked(texts, async (chunk) =>
      ctx.runMutation(internal.embed.populateTextsFromCache, {
        namespaceId: ctx.namespace._id,
        texts: chunk,
      }),
    );
    await ctx.runMutation(internal.namespace.rateLimitAdds, {
      userId: ctx.user._id,
      count: textsToEmbed.length,
    });
    console.debug(`Embedding ${textsToEmbed.length} texts`);
    await Promise.all(
      chunk(textsToEmbed).map(async (chunk, i) => {
        console.debug(`Starting chunk ${i} (${chunk.length})`);
        const embeddings = await embedBatch(chunk.map((t) => t.text));
        const toInsert = embeddings.map((embedding, i) => {
          const { title, text } = chunk[i];
          return { title, text, embedding };
        });
        console.debug(`Finished chunk ${i} (${chunk.length})`);
        await ctx.runMutation(internal.embed.insertTexts, {
          namespaceId: ctx.namespace._id,
          texts: toInsert,
        });
        console.debug(`Added chunk ${i} (${chunk.length})`);
      }),
    );
    console.debug(`Finished adding ${texts.length} texts`);
    return textsToEmbed.length;
  },
});

export const paginateText = namespaceUserQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return ctx.db
      .query("texts")
      .withIndex("namespaceId", (q) => q.eq("namespaceId", ctx.namespace._id))
      .paginate(args.paginationOpts);
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

export const rateLimitBasicSearch = internalMutation({
  args: { userId: v.id("users") },
  handler: (ctx, args) =>
    rateLimit(ctx, { name: "basicSearch", key: args.userId, throws: true }),
});

export const basicVectorSearch = namespaceUserAction({
  args: { text: v.string() },
  returns: v.array(v.object({ title: v.string(), score: v.number() })),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.namespace.rateLimitBasicSearch, {
      userId: ctx.user?._id,
    });
    const embedding = await embed(args.text);
    const results = await ctx.vectorSearch("embeddings", "embedding", {
      vector: embedding,
      limit: 10,
      filter: (q) => q.eq("namespaceId", ctx.namespace._id),
    });
    const texts: { title: string; score: number }[] = await ctx.runQuery(
      internal.namespace.getResults,
      {
        results,
      },
    );
    return texts;
  },
});

export const getResults = internalQuery({
  args: {
    results: v.array(v.object({ _id: v.id("embeddings"), _score: v.number() })),
  },
  returns: v.array(v.object({ title: v.string(), score: v.number() })),
  handler: async (ctx, args) => {
    return asyncMap(args.results, async ({ _id, _score }) => {
      const text = await getOneFrom(ctx.db, "texts", "embeddingId", _id);
      if (!text) throw new Error("Text not found");
      return { title: text.title, score: _score };
    });
  },
});

export const rateLimitMidSearch = internalMutation({
  args: { userId: v.id("users") },
  handler: (ctx, args) =>
    rateLimit(ctx, { name: "midSearch", key: args.userId, throws: true }),
});

function reciprocalRankFusion(aIndex: number, bIndex: number, k?: number) {
  const a = aIndex + 1;
  const b = bIndex + 1;
  return (a + b) / (a * b);
}

export const midpointSearch = namespaceUserAction({
  args: {
    left: v.string(),
    right: v.string(),
    skipCache: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<Doc<"midpoints">> => {
    const midpoint = await ctx.runQuery(internal.namespace.getMidpoint, {
      namespaceId: ctx.namespace._id,
      left: args.left,
      right: args.right,
    });
    if (!args.skipCache && midpoint) {
      console.debug("Found midpoint in cache");
      return midpoint;
    }
    await ctx.runMutation(internal.namespace.rateLimitMidSearch, {
      userId: ctx.user?._id,
    });
    const [[leftEmbedding, leftResults], [rightEmbedding, rightResults]] =
      await Promise.all(
        [
          [midpoint?.leftEmbedding, args.left] as const,
          [midpoint?.rightEmbedding, args.right] as const,
        ].map(async ([existingEmbedding, text]) => {
          const embedding = existingEmbedding || (await embed(text));
          const results = await ctx.vectorSearch("embeddings", "embedding", {
            vector: embedding,
            limit: 100,
            filter: (q) => q.eq("namespaceId", ctx.namespace._id),
          });
          return [embedding, results] as const;
        }),
      );
    const midpointEmbedding = calculateMidpoint(leftEmbedding, rightEmbedding);

    const midpointMatchScoresById = new Map(
      await ctx
        .vectorSearch("embeddings", "embedding", {
          vector: midpointEmbedding,
          limit: 102, // extra two to account for the left and right embeddings
          filter: (q) => q.eq("namespaceId", ctx.namespace._id),
        })
        .then((results) => results.map((r) => [r._id, r._score])),
    );

    const leftOverallRankById = new Map(
      leftResults.map(({ _id }, i) => [_id, i]),
    );
    const rightOverallRankById = new Map(
      rightResults.map(({ _id }, i) => [_id, i]),
    );
    const rightRankById = new Map(
      rightResults
        .filter(({ _id }) => leftOverallRankById.has(_id))
        .map(({ _id, _score }, i) => [_id, { _score, i }]),
    );

    const topMatches = leftResults
      .filter(({ _id }) => rightRankById.has(_id))
      .map(({ _id, _score: leftScore }, leftRank) => {
        const { _score: rightScore, i: rightRank } = rightRankById.get(_id)!;
        const leftOverallRank = leftOverallRankById.get(_id)!;
        const rightOverallRank = rightOverallRankById.get(_id)!;
        return {
          embeddingId: _id,
          leftRank,
          rightRank,
          rrfScore: reciprocalRankFusion(leftRank, rightRank),
          leftOverallRank,
          rightOverallRank,
          rrfOverallScore: reciprocalRankFusion(
            leftOverallRank,
            rightOverallRank,
          ),
          score: midpointMatchScoresById.get(_id) ?? -Infinity,
        } as FunctionArgs<
          typeof internal.namespace.upsertMidpoint
        >["topMatches"][0];
      })
      .sort((a, b) => b.rrfScore - a.rrfScore);

    for (const [id, score] of midpointMatchScoresById.entries()) {
      if (!rightRankById.has(id)) {
        topMatches.push({
          embeddingId: id,
          leftRank: -Infinity,
          rightRank: -Infinity,
          leftOverallRank: leftOverallRankById.get(id) ?? -Infinity,
          rightOverallRank: rightOverallRankById.get(id) ?? -Infinity,
          rrfOverallScore: -Infinity,
          rrfScore: -Infinity,
          score,
        });
      }
    }

    return ctx.runMutation(internal.namespace.upsertMidpoint, {
      left: args.left,
      right: args.right,
      namespaceId: ctx.namespace._id,
      leftEmbedding,
      rightEmbedding,
      topMatches,
      midpointEmbedding,
    }) as Promise<Doc<"midpoints">>;
  },
});

export function findRank(scores: number[], score: number) {
  const rank = scores.findIndex((m) => m <= score + 0.00001);
  if (rank === -1) {
    return Infinity;
  }
  return rank;
}

const midpointFields = schema.tables.midpoints.validator.fields;

export const upsertMidpoint = internalMutation({
  args: {
    ...midpointFields,
    topMatches: v.array(
      v.object({
        embeddingId: v.id("embeddings"),
        ...omit(midpointFields.topMatches.element.fields, [
          "title",
          "leftScore",
          "rightScore",
          "lxrScore",
        ]),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const topMatches: Doc<"midpoints">["topMatches"] = await asyncMap(
      args.topMatches,
      async ({ embeddingId, ...rest }) => {
        const text = await getOneFromOrThrow(
          ctx.db,
          "texts",
          "embeddingId",
          embeddingId,
        );
        const embedding = await getOrThrow(ctx, embeddingId);
        const leftScore = dotProduct(args.leftEmbedding, embedding.embedding);
        const rightScore = dotProduct(args.rightEmbedding, embedding.embedding);
        return {
          title: text.title,
          ...rest,
          leftScore,
          rightScore,
          lxrScore: leftScore * rightScore,
        };
      },
    );
    const midpoint = await ctx.db
      .query("midpoints")
      .withIndex("namespaceId", (q) =>
        q
          .eq("namespaceId", args.namespaceId)
          .eq("left", args.left)
          .eq("right", args.right),
      )
      .first();
    if (midpoint) {
      await ctx.db.patch(midpoint._id, {
        midpointEmbedding: args.midpointEmbedding,
        topMatches,
      });
    }
    const midpointId =
      midpoint?._id ||
      (await ctx.db.insert("midpoints", {
        ...args,
        topMatches,
      }));
    return ctx.db.get(midpointId);
  },
});

export const deleteMidpoint = namespaceAdminMutation({
  args: { midpointId: v.id("midpoints") },
  handler: async (ctx, args) => {
    const midpoint = await ctx.db.get(args.midpointId);
    if (midpoint && midpoint.namespaceId !== ctx.namespace._id) {
      throw new Error("Midpoint not in authorized namespace");
    }
    if (midpoint) {
      const game = await ctx.db
        .query("games")
        .withIndex("namespaceId", (q) => q.eq("namespaceId", ctx.namespace._id))
        .filter((q) => q.eq(q.field("left"), midpoint.left))
        .filter((q) => q.eq(q.field("right"), midpoint.right))
        .first();
      if (game) {
        throw new Error("Cannot delete midpoint with active game");
      }
      await ctx.db.delete(args.midpointId);
    }
  },
});

export async function lookupMidpoint(
  ctx: { db: DatabaseReader },
  args: { namespaceId: Id<"namespaces">; left: string; right: string },
) {
  return ctx.db
    .query("midpoints")
    .withIndex("namespaceId", (q) =>
      q
        .eq("namespaceId", args.namespaceId)
        .eq("left", args.left)
        .eq("right", args.right),
    )
    .unique();
}

export const getMidpoint = internalQuery({
  args: {
    namespaceId: v.id("namespaces"),
    left: v.string(),
    right: v.string(),
  },
  handler: lookupMidpoint,
});

const strategy = v.union(
  v.literal("rank"),
  v.literal("rankOverall"),
  v.literal("midpoint"),
  v.literal("lxr"),
);
export type Strategy = Infer<typeof strategy>;
export const Strategies = strategy.members.map((m) => m.value);

export const makeGuess = namespaceUserAction({
  args: { guess: v.string(), left: v.string(), right: v.string(), strategy },
  handler: async (ctx, args) => {
    const embedding = await embed(args.guess);
    const results: {
      rank: number;
      score: number;
      leftScore: number;
      rightScore: number;
      lxrScore: number;
    } = await ctx.runQuery(internal.namespace.calculateGuess, {
      namespaceId: ctx.namespace._id,
      embedding,
      ...omit(args, ["guess"]),
    });
    return { ...results, guess: args.guess };
  },
});

export const calculateGuess = internalQuery({
  args: {
    namespaceId: v.id("namespaces"),
    left: v.string(),
    right: v.string(),
    embedding: v.array(v.number()),
    strategy,
  },
  handler: async (ctx, { embedding, ...args }) => {
    const midpoint = nullThrows(await lookupMidpoint(ctx, args));
    return computeGuess(ctx, midpoint, embedding, args.strategy);
  },
});

export async function computeGuess(
  ctx: { db: DatabaseReader },
  midpoint: Doc<"midpoints">,
  embedding: number[],
  strategy: Strategy,
) {
  if (strategy === "midpoint" || strategy === "lxr") {
    const score = dotProduct(midpoint.midpointEmbedding!, embedding);
    const leftScore = dotProduct(midpoint.leftEmbedding, embedding);
    const rightScore = dotProduct(midpoint.rightEmbedding, embedding);
    const lxrScore = leftScore * rightScore;
    const sortedMatches = midpoint.topMatches
      .slice()
      .sort(
        strategy === "lxr"
          ? (a, b) => b.lxrScore - a.lxrScore
          : (a, b) => b.score - a.score,
      );
    const rank = findRank(
      sortedMatches.map((m) => m.score),
      score,
    );
    return {
      rank,
      score,
      leftScore,
      rightScore,
      lxrScore,
    };
  } else {
    const leftScore = dotProduct(midpoint.leftEmbedding, embedding);
    const rightScore = dotProduct(midpoint.rightEmbedding, embedding);
    const sortedMatches = midpoint.topMatches
      .slice()
      .sort(
        strategy === "rankOverall"
          ? (a, b) => b.rrfOverallScore - a.rrfOverallScore
          : (a, b) => b.rrfScore - a.rrfScore,
      );
    const scores = await asyncMap(sortedMatches, async (match, i) => {
      const text = await getTextByTitle(ctx, midpoint.namespaceId, match.title);
      const rankedEmbedding = await getOrThrow(ctx, text!.embeddingId);
      const score = dotProduct(rankedEmbedding.embedding, embedding);
      return score;
    });
    const [topScore, rank] = scores.reduce(
      ([max], score, i) => [Math.max(max, score), i],
      [-Infinity, Infinity],
    );
    return {
      rank,
      score: topScore,
      leftScore,
      rightScore,
      lxrScore: midpoint.topMatches[rank].lxrScore,
    };
  }
}

export const makeGame = namespaceAdminMutation({
  args: {
    left: v.string(),
    right: v.string(),
  },
  handler: async (ctx, args) => {
    const midpoint = await lookupMidpoint(ctx, {
      ...args,
      namespaceId: ctx.namespace._id,
    });
    if (!midpoint) {
      throw new Error("Midpoint not found");
    } else if (midpoint.namespaceId !== ctx.namespace._id) {
      throw new Error("Midpoint not in authorized namespace");
    }
    return ctx.db.insert("games", {
      ...args,
      namespaceId: ctx.namespace._id,
      active: false,
    });
  },
});

export const setGameActive = namespaceAdminMutation({
  args: { gameId: v.id("games"), active: v.boolean() },
  handler: async (ctx, args) => {
    const game = await getOrThrow(ctx, args.gameId);
    if (game.namespaceId !== ctx.namespace._id) {
      throw new Error("Game not in authorized namespace");
    }
    await ctx.db.patch(args.gameId, { active: args.active });
  },
});
