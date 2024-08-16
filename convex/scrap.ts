import { CONFIG, embed, embedBatch } from "./llm";
import { v, Validator } from "convex/values";
import { api, internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  action,
  ActionCtx,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  QueryCtx,
} from "./_generated/server";
import schema from "./schema";
import {
  getOrThrow,
  getManyFrom,
  getOneFrom,
} from "convex-helpers/server/relationships";
import {
  migration,
  namespaceAdminQuery,
  userAction,
  userMutation,
} from "./functions";
import { dotProduct, calculateMidpoint } from "./linearAlgebra";
import { paginationOptsValidator } from "convex/server";
import { asyncMap } from "convex-helpers";
import { populateTextsFromCache } from "./embed";
import feels from "../feels.json";
import { chunk } from "./llm";

export const deleteFeels = internalMutation({
  handler: async (ctx) => {
    await Promise.all(
      chunk(feels as string[]).map((feels) =>
        ctx.scheduler.runAfter(0, internal.scrap.deleteFeelsBatch, {
          feels,
        }),
      ),
    );
  },
});

export const deleteFeelsBatch = internalMutation({
  handler: async (ctx, args: { feels: string[] }) => {
    await Promise.all(
      args.feels.map(async (feel) => {
        return asyncMap(
          ctx.db
            .query("texts")
            .withIndex("text", (q) => q.eq("text", feel))
            .collect(),
          (text) =>
            ctx.db.delete(text.embeddingId).then(() => ctx.db.delete(text._id)),
        );
      }),
    );
    console.debug(
      "Deleted",
      args.feels[0],
      "...",
      args.feels[args.feels.length - 1],
    );
  },
});

// import { Auth } from "convex/server";
// const TOKEN_SUB_CLAIM_DIVIDER = "|";
// async function getUserId(ctx: { auth: Auth }) {
//   const identity = await ctx.auth.getUserIdentity();
//   if (identity === null) {
//     return null;
//   }
//   const [userId] = identity.subject.split(TOKEN_SUB_CLAIM_DIVIDER);
//   return userId as Id<"users">;
// }

export const deleteTexts = migration({
  table: "texts",
  async migrateOne(ctx, doc) {
    const namespaceId = ctx.db.normalizeId(
      "namespaces",
      "kx7egte7np23j6v833tdfqxxb96yg02w",
    )!;
    if (doc.namespaceId !== namespaceId) return;
    await ctx.db.delete(doc._id);
    await ctx.db.delete(doc.embeddingId);
  },
});

export const abc = query({
  args: {},
  handler: async (ctx, args) => {
    // const w = await ctx.db
    //   .query("words")
    //   .filter((q) => q.neq(q.field("openAISmall1536"), undefined))
    //   .first();
    // return w?.word;
    const a = await ctx.db
      .query("words")
      .withIndex("word", (q) => q.eq("word", "forgiven"))
      .first();
    const b = await ctx.db
      .query("feels")
      .withIndex("feel", (q) => q.eq("feel", "forgiven"))
      .first();
    const ct = await ctx.db
      .query("texts")
      .withIndex("text", (q) => q.eq("text", "forgiven"))
      .first();
    const c = await ctx.db.get(ct!.embeddingId);

    // return a;
    return equalIsh(c?.embedding, a?.openAISmall1536);

    return { a, b };
  },
});

function equalIsh(a?: number[], b?: number[]) {
  if (!a || !b) throw new Error(`bad param: ${!a ? "a" : "b"}`);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] - b[i] > Number.EPSILON) return false;
    if (b[i] - a[i] > Number.EPSILON) return false;
  }
  return true;
}

export const copyFeels = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const namespaceId = ctx.db.normalizeId(
      "namespaces",
      "kx7egte7np23j6v833tdfqxxb96yg02w",
    )!;
    const result = await ctx.db
      .query("feels")
      .withIndex("feel")
      .paginate({ cursor: args.cursor ?? null, numItems: 100 });
    await populateTextsFromCache(ctx, {
      namespaceId,
      texts: result.page.map((f) => ({ text: f.feel, title: f.feel })),
    });
    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, internal.scrap.copyFeels, {
        cursor: result.continueCursor,
      });
    }
  },
});

//   x: defineTable({
//     e: v.array(v.number()),
//   })
//     .vectorIndex("four", {
//       vectorField: "e",
//       dimensions: 4,
//     })
//     .vectorIndex("two", {
//       vectorField: "e",
//       dimensions: 2,
//     }),
// export const addX = mutation({
//   args: {},
//   handler: async (ctx, args) => {
//     ctx.db.insert("x", { e: [0, -1] });
//     ctx.db.insert("x", { e: [1, 0] });
//     ctx.db.insert("x", { e: [0, 1] });
//     ctx.db.insert("x", { e: [-1, 0] });
//     ctx.db.insert("x", { e: [0, 0, 0, 0] });
//     ctx.db.insert("x", { e: [1, 0, 0, 0] });
//     ctx.db.insert("x", { e: [0, 1, 0, 0] });
//     ctx.db.insert("x", { e: [0, 0, 1, 0] });
//     ctx.db.insert("x", { e: [0, 0, 0, 1] });
//   },
// });
// export const getX = query({
//   args: { ids: v.array(v.id("x")) },
//   handler: async (ctx, args) => {
//     return asyncMap(args.ids, (id) => getOrThrow(ctx, id));
//   },
// });
// export const findX = action({
//   args: {},
//   handler: async (ctx, args) => {
//     const r = await ctx.vectorSearch("x", "four", {
//       vector: [1, 0, 0, 0],
//     });
//     const docs: Doc<"x">[] = await ctx.runQuery(api.scrap.getX, {
//       ids: r.map((r) => r._id),
//     });
//     return docs.map((doc, i) => ({ doc, score: r[i]._score }));
//   },
// });

/**
 *
 *
 * OLD
 *
 *
 */

export const filterMissing = internalQuery({
  args: { feels: v.array(v.string()) },
  handler: async (ctx, args) => {
    return Promise.all(
      args.feels.map(async (feel) => {
        const existing = await ctx.db
          .query("feels")
          .withIndex("feel", (q) => q.eq("feel", feel))
          .first();
        if (!existing?.[CONFIG.vectorIndexName]) {
          return feel;
        }
      }),
    );
  },
});

export const insertFeels = internalMutation({
  args: {
    feels: v.array(schema.tables.feels.validator),
  },
  handler: async (ctx, args) => {
    for (let i = 0; i < args.feels.length; i++) {
      const existing = await ctx.db
        .query("feels")
        .withIndex("feel", (q) => q.eq("feel", args.feels[i].feel))
        .first();
      if (!existing) {
        await ctx.db.insert("feels", args.feels[i]);
      }
    }
  },
});

export const findMixedFeels = internalAction({
  args: { left: v.string(), right: v.string(), guess: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const left = await getOrCreateFeelEmbedding(ctx, args.left);
    const right = await getOrCreateFeelEmbedding(ctx, args.right);
    const vector = calculateMidpoint(left, right);
    let score = undefined;
    if (args.guess) {
      const { embedding: guess } = await getEmbedding(ctx, args.guess);

      score = dotProduct(vector, guess);
    }
    const results = await ctx.vectorSearch("feels", CONFIG.vectorIndexName, {
      vector,
      limit: 10,
    });
    const feels: string[] = await ctx.runQuery(internal.scrap.getAllFeels, {
      ids: results.map((r) => r._id),
    });
    const normal = results.map((r, i) => ({ feel: feels[i], score: r._score }));
    const results256 = await ctx.vectorSearch("feels", "openAISmall256", {
      vector: vector.slice(0, 256),
      limit: 5,
    });
    const words256: string[] = await ctx.runQuery(internal.scrap.getAllFeels, {
      ids: results256.map((r) => r._id),
    });
    return {
      score,
      normal,
      short: results.map((r, i) => ({ feel: words256[i], score: r._score })),
    };
  },
});

export const lookUpFeel = internalQuery({
  args: { feel: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("feels")
      .withIndex("feel", (q) => q.eq("feel", args.feel))
      .first()
      .then((d) => d?.[CONFIG.vectorIndexName]);
  },
});

async function getEmbedding(ctx: ActionCtx, feel: string) {
  const cached = await ctx.runQuery(internal.scrap.lookUpFeel, { feel });
  const embedding = cached || (await embed(`I feel ${feel}`));
  return { embedding, cached: !!cached };
}

async function getOrCreateFeelEmbedding(ctx: ActionCtx, feel: string) {
  const { embedding, cached } = await getEmbedding(ctx, feel);
  if (!cached) {
    await ctx.runMutation(internal.scrap.insertFeels, {
      feels: [
        {
          feel,
          [CONFIG.vectorIndexName]: embedding,
          openAISmall256:
            CONFIG.vectorIndexName === "openAISmall1536"
              ? embedding.slice(0, 256)
              : undefined,
        },
      ],
    });
  }
  return embedding;
}

export const getAllFeels = internalQuery({
  args: { ids: v.array(v.id("feels")) },
  handler: async (ctx, args) => {
    const feels = await Promise.all(
      args.ids.map(async (id) => ctx.db.get(id).then((d) => d?.feel)),
    );
    args.ids.forEach((id, i) => {
      if (feels[i] === undefined) {
        throw new Error("Word not found: " + id);
      }
    });
    return feels.flatMap((w) => (w === undefined ? [] : [w]));
  },
});

/**
 * WORDS
 */

export const addWords = internalAction({
  args: { words: v.array(v.string()) },
  handler: async (ctx, args) => {
    const embeddings = await embedBatch(args.words);
    await ctx.runMutation(internal.scrap.insertWords, {
      words: args.words.map((word, i) => ({
        word,
        [CONFIG.vectorIndexName]: embeddings[i],
        openAISmall256:
          CONFIG.vectorIndexName === "openAISmall1536"
            ? embeddings[i].slice(0, 256)
            : undefined,
      })),
    });
  },
});

export const insertWords = internalMutation({
  args: {
    words: v.array(schema.tables.words.validator),
  },
  handler: async (ctx, args) => {
    for (let i = 0; i < args.words.length; i++) {
      const existing = await ctx.db
        .query("words")
        .withIndex("word", (q) => q.eq("word", args.words[i].word))
        .first();
      if (!existing) {
        await ctx.db.insert("words", args.words[i]);
      }
    }
  },
});

export const lookUpWord = internalQuery({
  args: { word: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("words")
      .withIndex("word", (q) => q.eq("word", args.word))
      .first()
      .then((d) => d?.[CONFIG.vectorIndexName]);
  },
});

async function getOrCreateWordEmbedding(ctx: ActionCtx, word: string) {
  const cached: number[] | null = await ctx.runQuery(
    internal.scrap.lookUpWord,
    { word },
  );
  const embedding: number[] = cached || (await embed(word));
  // if (!cached) {
  //   await ctx.runMutation(internal.scrap.insertWords, {
  //     words: [
  //       {
  //         word,
  //         [CONFIG.vectorIndexName]: embedding,
  //         openAISmall256:
  //           CONFIG.vectorIndexName === "openAISmall1536"
  //             ? embedding.slice(0, 256)
  //             : undefined,
  //       },
  //     ],
  //   });
  // }
  return embedding;
}

export const findSimilar = internalAction({
  args: { word: v.string() },
  handler: async (ctx, args): Promise<{ word: string; score: number }[]> => {
    const vector = await getOrCreateWordEmbedding(ctx, args.word);
    const results = await ctx.vectorSearch("words", CONFIG.vectorIndexName, {
      vector,
      limit: 5,
    });
    const words: string[] = await ctx.runQuery(internal.scrap.getAllWords, {
      ids: results.map((r) => r._id),
    });
    return results.map((r, i) => ({ word: words[i], score: r._score }));
  },
});

export const findMix = internalAction({
  args: { left: v.string(), right: v.string() },
  handler: async (ctx, args) => {
    const left = await getOrCreateWordEmbedding(ctx, args.left);
    const right = await getOrCreateWordEmbedding(ctx, args.right);
    const mix = left.map((l, i) => (l + right[i]) / 2);
    const magnitude = Math.sqrt(mix.reduce((sum, n) => sum + n * n, 0));
    const vector = mix.map((n) => n / magnitude);
    const results = await ctx.vectorSearch("words", CONFIG.vectorIndexName, {
      vector,
      limit: 5,
    });
    const words: string[] = await ctx.runQuery(internal.scrap.getAllWords, {
      ids: results.map((r) => r._id),
    });
    const normal = results.map((r, i) => ({ word: words[i], score: r._score }));
    const results256 = await ctx.vectorSearch("words", "openAISmall256", {
      vector: vector.slice(0, 256),
      limit: 5,
    });
    const words256: string[] = await ctx.runQuery(internal.scrap.getAllWords, {
      ids: results256.map((r) => r._id),
    });
    return {
      normal,
      short: results.map((r, i) => ({ word: words256[i], score: r._score })),
    };
  },
});

export const getAllWords = internalQuery({
  args: { ids: v.array(v.id("words")) },
  handler: async (ctx, args) => {
    const words = await Promise.all(
      args.ids.map(async (id) => ctx.db.get(id).then((d) => d?.word)),
    );
    args.ids.forEach((id, i) => {
      if (words[i] === undefined) {
        throw new Error("Word not found: " + id);
      }
    });
    return words.flatMap((w) => (w === undefined ? [] : [w]));
  },
});
