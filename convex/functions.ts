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
  customAction,
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { auth } from "./auth";
import { makeActionRetrier } from "convex-helpers/server/retries";
import { makeMigration } from "convex-helpers/server/migrations";

export const { runWithRetries, retry } = makeActionRetrier("functions:retry");
export const migrate = makeMigration(internalMutation, {
  migrationTable: "migrations",
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

async function getUser(ctx: QueryCtx) {
  const userId = await auth.getUserId(ctx);
  if (!userId) return null;
  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error("User not found");
  }
  return user;
}

export const userQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    const user = await getUser(ctx);
    return { user };
  }),
);

export const userMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const user = await getUser(ctx);
    return { user };
  }),
);

export const userAction = customAction(
  action,
  customCtx(async (ctx) => {
    const userId = await auth.getUserId(ctx);
    return { userId };
  }),
);

async function getUserAndNamespace(
  ctx: QueryCtx,
  { namespaceId }: { namespaceId: Id<"namespaces"> },
) {
  const user = await getUser(ctx);
  if (!user) {
    throw new Error("Not authenticated");
  }
  const namespace = await ctx.db.get(namespaceId);
  if (!namespace) {
    throw new Error("Namespace not found");
  }
  if (namespace.createdBy !== user._id) {
    throw new Error("User is not the creator of this namespace");
  }
  return { user, namespace };
}

export const namespaceAdminQuery = customQuery(query, {
  args: { namespaceId: v.id("namespaces") },
  input: async (ctx, args) => ({
    args: { namespaceId: args.namespaceId },
    ctx: await getUserAndNamespace(ctx, args),
  }),
});

export const namespaceAdminMutation = customMutation(mutation, {
  args: { namespaceId: v.id("namespaces") },
  input: async (ctx, args) => ({
    args: { namespaceId: args.namespaceId },
    ctx: await getUserAndNamespace(ctx, args),
  }),
});

export const fetchUserAndNamespace = internalQuery(getUserAndNamespace);

export const namespaceAdminAction = customAction(action, {
  args: { namespaceId: v.id("namespaces") },
  async input(ctx, args) {
    // Need to cast here to avoid circular api types.
    const { user, namespace } = (await ctx.runQuery(
      internal.functions.fetchUserAndNamespace,
      args,
    )) as { user: Doc<"users">; namespace: Doc<"namespaces"> };
    return {
      ctx: { user, namespace },
      args: { namespaceId: args.namespaceId },
    };
  },
});
