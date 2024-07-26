import { CONFIG, embed, embedBatch } from "./llm";
import { v } from "convex/values";
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
} from "./_generated/server";
import schema from "./schema";
import words from "./words.json";
import { getManyFrom, getOneFrom } from "convex-helpers/server/relationships";
import { migrate, userAction, userMutation } from "./functions";
import { dotProduct, getMidpoint } from "./linearAlgebra";

export const createNamespace = userMutation({
  args: schema.tables.namespaces.validator.fields,
  handler: async (ctx, args) => {
    // TODO: check that the user is allowed to create a namespace
    const existing = await getOneFrom(ctx.db, "namespaces", "name", args.name);
    if (existing) {
      throw new Error("Namespace already exists");
    }
    return ctx.db.insert("namespaces", args);
  },
});

export const addTextToNamespace = action({
  args: {},
  handler: async (ctx, args) => {},
});
// add text: embed missing ones in batch

// query within a namespace

// make a guess

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

export const addFeelings = internalAction({
  args: {},
  handler: async (ctx) => {
    // break into chunks of 100
    const chunks = [];
    for (let i = 0; i < words.length; i += 100) {
      chunks.push(words.slice(i, i + 100));
    }
    const missing = await Promise.all(
      chunks.map(async (feels) =>
        ctx.runQuery(internal.embed.filterMissing, { feels }),
      ),
    ).then((m) => m.flat());
    await Promise.all(
      chunks.map(async (chunk) => {
        const embeddings = await embedBatch(
          chunk.map((word) => `I feel ${word}`),
        );
        return ctx.runMutation(internal.embed.insertFeels, {
          feels: chunk.map((feel, i) => ({
            feel,
            [CONFIG.vectorIndexName]: embeddings[i],
            openAISmall256:
              CONFIG.vectorIndexName === "openAISmall1536"
                ? embeddings[i].slice(0, 256)
                : undefined,
          })),
        });
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
    const vector = getMidpoint(left, right);
    let score = undefined;
    if (args.guess) {
      const { embedding: guess } = await getEmbedding(ctx, args.guess);

      score = dotProduct(vector, guess);
    }
    const results = await ctx.vectorSearch("feels", CONFIG.vectorIndexName, {
      vector,
      limit: 10,
    });
    const feels: string[] = await ctx.runQuery(internal.embed.getAllFeels, {
      ids: results.map((r) => r._id),
    });
    const normal = results.map((r, i) => ({ feel: feels[i], score: r._score }));
    const results256 = await ctx.vectorSearch("feels", "openAISmall256", {
      vector: vector.slice(0, 256),
      limit: 5,
    });
    const words256: string[] = await ctx.runQuery(internal.embed.getAllFeels, {
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
  const cached = await ctx.runQuery(internal.embed.lookUpFeel, { feel });
  const embedding = cached || (await embed(`I feel ${feel}`));
  return { embedding, cached: !!cached };
}

async function getOrCreateFeelEmbedding(ctx: ActionCtx, feel: string) {
  const { embedding, cached } = await getEmbedding(ctx, feel);
  if (!cached) {
    await ctx.runMutation(internal.embed.insertFeels, {
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
    await ctx.runMutation(internal.embed.insertWords, {
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
    internal.embed.lookUpWord,
    { word },
  );
  const embedding: number[] = cached || (await embed(word));
  // if (!cached) {
  //   await ctx.runMutation(internal.embed.insertWords, {
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
    const words: string[] = await ctx.runQuery(internal.embed.getAllWords, {
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
    const words: string[] = await ctx.runQuery(internal.embed.getAllWords, {
      ids: results.map((r) => r._id),
    });
    const normal = results.map((r, i) => ({ word: words[i], score: r._score }));
    const results256 = await ctx.vectorSearch("words", "openAISmall256", {
      vector: vector.slice(0, 256),
      limit: 5,
    });
    const words256: string[] = await ctx.runQuery(internal.embed.getAllWords, {
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

// export const moveToTogether = migrate({
//   table: "words",
//   migrateOne: async (_ctx, doc) => {
//     return {
//       together: doc.embeddingTogether,
//       embeddingTogether: undefined,
//     };
//   },
// });

export const feelWord = migrate({
  table: "feels",
  migrateOne: async (_ctx, doc) => {
    return {
      feel: doc.feel.startsWith("I feel ")
        ? doc.feel.slice("I feel ".length)
        : doc.feel,
    };
  },
});
