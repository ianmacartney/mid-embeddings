import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { ActionCtx, DatabaseReader } from "./_generated/server";
import { getOrThrow } from "convex-helpers/server/relationships";
import { asyncMap } from "convex-helpers";
import { internalAction, internalMutation } from "./functions";
import { ActionCache } from "@convex-dev/action-cache";
import { components, internal } from "./_generated/api";
import { CONFIG, embeddings } from "./llm";

const embedCache = new ActionCache(components.actionCache, {
  action: internal.embed.generateEmbedding,
});

export const generateEmbedding = internalAction({
  args: { input: v.string(), model: v.string() },
  returns: v.array(v.number()),
  handler: async (ctx, args) => {
    const result = await embeddings.create(args);
    return result.data[0].embedding;
  },
});

export async function embedWithCache(ctx: ActionCtx, text: string) {
  return embedCache.fetch(ctx, { model: CONFIG.embeddingModel, input: text });
}

export async function getTextByTitle(
  ctx: { db: DatabaseReader },
  namespaceId: Id<"namespaces">,
  title: string,
) {
  return ctx.db
    .query("texts")
    .withIndex("namespaceId", (q) =>
      q.eq("namespaceId", namespaceId).eq("title", title),
    )
    .unique();
}

export const populateTextsFromCache = internalMutation({
  args: {
    namespaceId: v.id("namespaces"),
    texts: v.array(v.object({ title: v.string(), text: v.string() })),
  },
  handler: async (ctx, args) => {
    const missingTexts = await Promise.all(
      args.texts.map(async ({ title, text }) => {
        const existing = await getTextByTitle(ctx, args.namespaceId, title);
        if (existing && existing.text === text) return null;
        const matching = await ctx.db
          .query("texts")
          .withIndex("text", (q) => q.eq("text", text))
          .first();
        if (!matching) return { title, text }; // we need to embed this text
        const { embedding } = await getOrThrow(ctx, matching.embeddingId);
        // We can copy over from a matching text
        if (existing) {
          await ctx.db.patch(existing._id, { text });
          await ctx.db.patch(existing.embeddingId, { embedding });
        } else {
          const embeddingId = await ctx.db.insert("embeddings", {
            namespaceId: args.namespaceId,
            embedding,
          });
          await ctx.db.insert("texts", {
            namespaceId: args.namespaceId,
            title,
            text,
            embeddingId,
          });
        }
        return null;
      }),
    );
    return missingTexts.flatMap((m) => (m === null ? [] : [m]));
  },
});

export const insertTexts = internalMutation({
  args: {
    namespaceId: v.id("namespaces"),
    texts: v.array(
      v.object({
        title: v.string(),
        text: v.string(),
        embedding: v.array(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const namespaceId = args.namespaceId;
    await asyncMap(args.texts, async ({ title, text, embedding }) => {
      const existing = await getTextByTitle(ctx, namespaceId, title);
      if (existing) {
        await ctx.db.patch(existing._id, { text });
        await ctx.db.patch(existing.embeddingId, { embedding });
      } else {
        const embeddingId = await ctx.db.insert("embeddings", {
          namespaceId,
          embedding,
        });
        await ctx.db.insert("texts", {
          namespaceId,
          title,
          text,
          embeddingId,
        });
      }
    });
  },
});
