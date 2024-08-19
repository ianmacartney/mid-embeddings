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

function equalIsh(a?: number[], b?: number[]) {
  if (!a || !b) throw new Error(`bad param: ${!a ? "a" : "b"}`);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] - b[i] > Number.EPSILON) return false;
    if (b[i] - a[i] > Number.EPSILON) return false;
  }
  return true;
}
