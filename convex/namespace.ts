import { ConvexError, Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { ActionCtx, DatabaseReader } from "./_generated/server";
import {
  getOrThrow,
  getManyFrom,
  getOneFrom,
  getOneFromOrThrow,
} from "convex-helpers/server/relationships";
import { asyncMap, pick } from "convex-helpers";
import {
  internalMutation,
  internalQuery,
  namespaceAdminAction,
  namespaceAdminMutation,
  namespaceUserAction,
  namespaceUserMutation,
  namespaceUserQuery,
  userMutation,
  userQuery,
} from "./functions";
import schema from "./schema";
import { asyncMapChunked, chunk, embedBatch } from "./llm";
import { calculateMidpoint, dotProduct } from "./linearAlgebra";
import { partial } from "convex-helpers/validators";
import { FunctionArgs, paginationOptsValidator } from "convex/server";
import { omit } from "convex-helpers";
import { nullThrows } from "convex-helpers";
import { embedWithCache, getTextByTitle } from "./embed";
import { HOUR, RateLimiter, SECOND } from "@convex-dev/ratelimiter";
import { components } from "./_generated/api";
import { doesNotInclude } from "./round";

const rate = new RateLimiter(components.ratelimiter, {
  createNamespace: { kind: "token bucket", period: 10 * SECOND, rate: 1 },
  addText: {
    kind: "token bucket",
    period: 24 * HOUR,
    rate: 10_000,
    shards: 10,
  },
  basicSearch: { kind: "token bucket", period: SECOND, rate: 1, capacity: 5 },
  midSearch: {
    kind: "token bucket",
    period: SECOND,
    rate: 5,
    capacity: 20,
    shards: 3,
  },
});

export const listNamespaces = userQuery({
  args: {},
  handler: async (ctx) => {
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
        throw new Error("Category already exists");
      }
      return existing._id;
    }
    await rate.limit(ctx, "createNamespace", {
      key: ctx.user._id,
      throws: true,
    });
    return ctx.db.insert("namespaces", { ...args, createdBy: ctx.user._id });
  },
});

export const listRoundsByNamespace = namespaceUserQuery({
  args: {},
  handler: async (ctx) => {
    return (
      await ctx.db
        .query("rounds")
        .withIndex("namespaceId", (q) => q.eq("namespaceId", ctx.namespace._id))
        .order("desc")
        .take(20)
    ).map((r) => omit(r, ["matches"]));
  },
});

export const getRound = namespaceUserQuery({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (round?.namespaceId !== ctx.namespace._id) {
      throw new Error("Round not in authorized namespace");
    }
    return {
      ...round,
      matches: await Promise.all(
        round.matches.map(async (id) => {
          const text = await getOneFrom(ctx.db, "texts", "embeddingId", id);
          if (!text) throw new Error("Text not found");
          return text.title;
        }),
      ),
    };
  },
});

export const randomTitle = namespaceUserMutation({
  args: {},
  handler: async (ctx) => {
    // generate a string with four random a-z characters
    const randomString = Array.from({ length: 4 }, () =>
      String.fromCharCode(97 + (Math.floor(Date.now()) % 26)),
    ).join("");
    const results = await ctx.db
      .query("texts")
      .withIndex("namespaceId", (q) =>
        q.eq("namespaceId", ctx.namespace._id).gte("title", randomString),
      )
      .first();
    return results?.title ?? "";
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
  handler: async (ctx) => {
    const isEmpty = !(await ctx.db
      .query("texts")
      .withIndex("namespaceId", (q) => q.eq("namespaceId", ctx.namespace._id))
      .first());
    return { ...ctx.namespace, isEmpty };
  },
});

export const addText = namespaceAdminAction({
  args: {
    titled: v.optional(
      v.array(v.object({ title: v.string(), text: v.string() })),
    ),
    texts: v.optional(v.array(v.string())),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<number> => {
    if (!args.titled && !args.texts && !args.url) {
      throw new Error("Must provide texts, titled texts, or a URL");
    }
    const titled = args.titled || [];
    if (args.url) {
      const text = await fetch(args.url).then((r) => r.json());
      if (!Array.isArray(text)) {
        throw new Error("Expected an array of strings");
      }
      if (text.length === 0) {
        throw new Error("No texts found");
      }
      if (typeof text[0] === "string") {
        titled.push(...text.map((text) => ({ text, title: text })));
      } else {
        if (!text[0].title || !text[0].text) {
          throw new Error(
            "Expected an array of objects with a text and title field",
          );
        }
        titled.push(...text.map(({ title, text }) => ({ text, title })));
      }
    }
    const texts = titled.concat(
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
    await rate.limit(ctx, "addText", {
      key: ctx.user._id,
      count: textsToEmbed.length,
      throws: true,
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

export const listMidpoints = namespaceUserQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("midpoints")
      .withIndex("namespaceId", (q) => q.eq("namespaceId", ctx.namespace._id))
      .paginate(args.paginationOpts);
    return {
      ...results,
      page: results.page.map((m) => pick(m, ["_id", "left", "right"])),
    };
  },
});

export const rateLimitBasicSearch = internalMutation({
  args: { userId: v.id("users") },
  handler: (ctx, args) =>
    rate.limit(ctx, "basicSearch", { key: args.userId, throws: true }),
});

export const basicVectorSearch = namespaceUserAction({
  args: { text: v.string() },
  returns: v.array(v.object({ title: v.string(), score: v.number() })),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.namespace.rateLimitBasicSearch, {
      userId: ctx.user?._id,
    });
    const embedding = await embedWithCache(ctx, args.text);
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

function reciprocalRankFusion(aIndex: number, bIndex: number) {
  const k = 10;
  const a = aIndex + k;
  const b = bIndex + k;
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
    await rate.limit(ctx, "midSearch", { key: ctx.user._id, throws: true });
    const [[leftEmbedding, leftResults], [rightEmbedding, rightResults]] =
      await Promise.all(
        [
          [midpoint?.leftEmbedding, args.left] as const,
          [midpoint?.rightEmbedding, args.right] as const,
        ].map(async ([existingEmbedding, text]) => {
          const embedding =
            existingEmbedding || (await embedWithCache(ctx, text));
          const results = await ctx.vectorSearch("embeddings", "embedding", {
            vector: embedding,
            limit: 102, // extra two to account for the left and right embeddings
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
    const plusEmbedding = await embedWithCache(
      ctx,
      `${args.left} + ${args.right}`,
    );
    const plusMatches = await getPlusMatches(
      ctx,
      args.left,
      args.right,
      ctx.namespace._id,
    );
    const plusById = new Map(
      plusMatches.map(({ _id, _score }, i) => [_id, { _score, i }]),
    );

    const topMatches = leftResults
      .filter(({ _id }) => rightRankById.has(_id))
      .map(({ _id, _score: _leftScore }, leftRank) => {
        const { _score: _rightScore, i: rightRank } = rightRankById.get(_id)!;
        const leftOverallRank = leftOverallRankById.get(_id)!;
        const rightOverallRank = rightOverallRankById.get(_id)!;
        return {
          embeddingId: _id,
          leftRank,
          rightRank,
          plusRank: plusById.get(_id)?.i ?? -Infinity,
          plusScore: plusById.get(_id)?._score ?? -Infinity,
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
          plusRank: plusById.get(id)?.i ?? -Infinity,
          plusScore: plusById.get(id)?._score ?? -Infinity,
          leftOverallRank: leftOverallRankById.get(id) ?? -Infinity,
          rightOverallRank: rightOverallRankById.get(id) ?? -Infinity,
          rrfOverallScore: -Infinity,
          rrfScore: -Infinity,
          score,
        });
      }
    }
    for (const [id, { _score, i }] of plusById.entries()) {
      if (!rightRankById.has(id) && !midpointMatchScoresById.has(id)) {
        topMatches.push({
          embeddingId: id,
          plusRank: i,
          plusScore: _score,
          leftRank: -Infinity,
          rightRank: -Infinity,
          leftOverallRank: -Infinity,
          rightOverallRank: -Infinity,
          rrfScore: -Infinity,
          rrfOverallScore: -Infinity,
          score: midpointMatchScoresById.get(id) ?? -Infinity,
        });
      }
    }

    return ctx.runMutation(internal.namespace.upsertMidpoint, {
      left: args.left,
      right: args.right,
      namespaceId: ctx.namespace._id,
      leftEmbedding,
      rightEmbedding,
      plusEmbedding,
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
    const topMatches: Doc<"midpoints">["topMatches"] = (
      await asyncMap(args.topMatches, async ({ embeddingId, ...rest }) => {
        const text = await getOneFromOrThrow(
          ctx.db,
          "texts",
          "embeddingId",
          embeddingId,
        );
        if (
          text.text === args.left ||
          text.text === args.right ||
          text.title === args.left ||
          text.title === args.right
        ) {
          return null;
        }
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
      })
    ).flatMap((m) => (m === null ? [] : [m]));
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
      const round = await ctx.db
        .query("rounds")
        .withIndex("namespaceId", (q) => q.eq("namespaceId", ctx.namespace._id))
        .filter((q) => q.eq(q.field("left"), midpoint.left))
        .filter((q) => q.eq(q.field("right"), midpoint.right))
        .first();
      if (round) {
        throw new Error("Cannot delete midpoint with active round");
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
  v.literal("plus"),
);
export type Strategy = Infer<typeof strategy>;
export const Strategies = strategy.members.map((m) => m.value);

export const makeGuess = namespaceUserAction({
  args: { guess: v.string(), left: v.string(), right: v.string(), strategy },
  handler: async (ctx, args) => {
    const embedding = await embedWithCache(ctx, args.guess);
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
  if (strategy === "plus") {
    const leftScore = dotProduct(midpoint.leftEmbedding, embedding);
    const rightScore = dotProduct(midpoint.rightEmbedding, embedding);
    const score = dotProduct(midpoint.plusEmbedding, embedding);
    const rank = findRank(
      midpoint.topMatches.map((m) => m.plusScore).sort((a, b) => b - a),
      score,
    );
    return {
      rank,
      score,
      leftScore,
      rightScore,
      lxrScore: leftScore * rightScore,
    };
  }
  if (strategy === "midpoint" || strategy === "lxr") {
    const score = dotProduct(midpoint.midpointEmbedding, embedding);
    const leftScore = dotProduct(midpoint.leftEmbedding, embedding);
    const rightScore = dotProduct(midpoint.rightEmbedding, embedding);
    const lxrScore = leftScore * rightScore;
    const rank = findRank(
      midpoint.topMatches
        .map((m) => (strategy === "lxr" ? m.lxrScore : m.score))
        .sort((a, b) => b - a),
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
    const scores = await asyncMap(sortedMatches, async (match) => {
      const text = await getTextByTitle(ctx, midpoint.namespaceId, match.title);
      const rankedEmbedding = await getOrThrow(ctx, text!.embeddingId);
      const score = dotProduct(rankedEmbedding.embedding, embedding);
      return score;
    });
    const [topScore, rank] = scores.reduce(
      ([max, rank], score, i) => [Math.max(max, score), score > max ? i : rank],
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

export const lookupNamespaceTextEmbedding = internalQuery({
  args: { namespaceId: v.id("namespaces"), title: v.string() },
  handler: async (ctx, args) => {
    const text = await getTextByTitle(ctx, args.namespaceId, args.title);
    return text?.embeddingId;
  },
});

async function getPlusMatches(
  ctx: ActionCtx,
  left: string,
  right: string,
  namespaceId: Id<"namespaces">,
): Promise<{ _id: Id<"embeddings">; _score: number }[]> {
  const target = await embedWithCache(ctx, `${left} + ${right}`);
  let leftEmbedding = await ctx.runQuery(
    internal.namespace.lookupNamespaceTextEmbedding,
    {
      namespaceId,
      title: left,
    },
  );
  if (!leftEmbedding) {
    const firstResult = await ctx.vectorSearch("embeddings", "embedding", {
      vector: await embedWithCache(ctx, left),
      limit: 1,
      filter: (q) => q.eq("namespaceId", namespaceId),
    });
    if (firstResult.length > 0 && firstResult[0]?._score > 0.9) {
      leftEmbedding = firstResult[0]?._id;
    }
  }
  let rightEmbedding = await ctx.runQuery(
    internal.namespace.lookupNamespaceTextEmbedding,
    {
      namespaceId,
      title: right,
    },
  );
  if (!rightEmbedding) {
    const firstResult = await ctx.vectorSearch("embeddings", "embedding", {
      vector: await embedWithCache(ctx, right),
      limit: 1,
      filter: (q) => q.eq("namespaceId", namespaceId),
    });
    if (firstResult.length > 0 && firstResult[0]?._score > 0.9) {
      rightEmbedding = firstResult[0]?._id;
    }
  }
  const results = await ctx.vectorSearch("embeddings", "embedding", {
    vector: target,
    limit: 102, // extra two to account for the left and right embeddings
    filter: (q) => q.eq("namespaceId", namespaceId),
  });
  return results.filter(
    ({ _id }) => _id != leftEmbedding && _id != rightEmbedding,
  );
}

export const makeRound = namespaceUserMutation({
  args: {
    left: v.string(),
    right: v.string(),
    titles: v.array(v.string()),
    previousRoundId: v.optional(v.id("rounds")),
  },
  handler: async (ctx, args): Promise<Id<"rounds">> => {
    if (!ctx.user || ctx.user.isAnonymous) {
      throw new ConvexError("Not logged in.");
    }
    if (!ctx.user.isAuthor) {
      throw new ConvexError("Only authors can create rounds.");
    }
    const matches = await Promise.all(
      args.titles
        .filter((title) => doesNotInclude(title, [args.left, args.right]))
        .map(async (title) => {
          const text = await getTextByTitle(ctx, ctx.namespace._id, title);
          return nullThrows(text).embeddingId;
        }),
    );
    let previousRound: Doc<"rounds"> | undefined = undefined;
    if (args.previousRoundId) {
      previousRound = await getOrThrow(ctx, args.previousRoundId);
    } else {
      const activeRound = await ctx.db
        .query("rounds")
        .withIndex("active", (q) => q.eq("active", true))
        .first();
      if (activeRound) {
        // insert ourselves at the end of the chain, after existing ones that haven't been done.
        previousRound = activeRound;
        while (previousRound && previousRound.nextRoundId) {
          if (previousRound.nextRoundId === activeRound._id) {
            // the full chain hasn't been done yet, add at the end
            break;
          }
          const candidate: Doc<"rounds"> = await getOrThrow(
            ctx,
            previousRound.nextRoundId,
          );
          if (candidate.endedAt) {
            // The next one has been done, let's add ourselves before it.
            break;
          }
          previousRound = candidate;
        }
      }
    }
    if (!ctx.namespace.public) {
      console.warn(
        `This category is not public, but user ${ctx.user?._id} ` +
          `is trying to create a round for it. Not scheduling it.`,
      );
      previousRound = undefined;
    }

    const nextRoundId = await ctx.db.insert("rounds", {
      left: args.left,
      right: args.right,
      namespaceId: ctx.namespace._id,
      active: false,
      matches,
      nextRoundId: previousRound?.nextRoundId ?? undefined,
    });
    if (previousRound) {
      await ctx.db.patch(previousRound._id, { nextRoundId });
    }
    return nextRoundId;
  },
});

export const makeNamespacePublic = internalMutation({
  args: { namespace: v.string() },
  handler: async (ctx, args) => {
    const namespace = await ctx.db
      .query("namespaces")
      .withIndex("slug", (q) => q.eq("slug", args.namespace))
      .unique();
    if (!namespace) {
      throw new Error("Category not found");
    }
    await ctx.db.patch(namespace._id, { public: true });
  },
});

export const setRoundActive = namespaceAdminMutation({
  args: { roundId: v.id("rounds"), active: v.boolean() },
  handler: async (ctx, args) => {
    const round = await getOrThrow(ctx, args.roundId);
    if (round.namespaceId !== ctx.namespace._id) {
      throw new Error("Round not in authorized namespace");
    }
    if (args.active && !ctx.namespace.public) {
      throw new Error("Cannot activate round for private namespace");
    }
    await ctx.db.patch(args.roundId, { active: args.active });
  },
});
