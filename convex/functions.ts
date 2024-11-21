import { v, Validator } from "convex/values";
import { components, internal } from "./_generated/api";
import { DataModel, Doc, Id } from "./_generated/dataModel";
/* eslint-disable no-restricted-imports */
import {
  action,
  internalAction,
  internalMutation as internalMutationRaw,
  internalQuery,
  mutation as mutationRaw,
  query,
  QueryCtx,
} from "./_generated/server";
/* eslint-enable no-restricted-imports */
import {
  customAction,
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server";
import { makeActionRetrier } from "convex-helpers/server/retries";
import { Migrations } from "@convex-dev/migrations";
import type {
  FieldPaths,
  NamedTableInfo,
  TableNamesInDataModel,
} from "convex/server";
import schema from "./schema";
import { getOneFrom, getOrThrow } from "convex-helpers/server/relationships";
import { Triggers } from "convex-helpers/server/triggers";
import { TableAggregate } from "@convex-dev/aggregate";

const triggers = new Triggers<DataModel>();

export const roundLeaderboard = new TableAggregate<
  [Id<"rounds">, number, number],
  DataModel,
  "guesses"
>(components.roundLeaderboard, {
  // Sort by score, then by submission time (newest first)
  // So we can find the first submission with the highest score for a given round.
  sortKey: (d) => [d.roundId, d.score, -(d.submittedAt ?? Infinity)],
  sumValue: (d) => d.score,
});
triggers.register("guesses", roundLeaderboard.idempotentTrigger());

export const globalLeaderboard = new TableAggregate<
  [number, number],
  DataModel,
  "users"
>(components.globalLeaderboard, {
  // Sort by score, then by creation time (newest first)
  // So we can find the earliest adopter with the highest score.
  sortKey: (d) => [
    d.isAnonymous ? (d.capturedBy ? 0 : (d.score ?? 0) / 1000) : d.score ?? 0,
    -d._creationTime,
  ],
  sumValue: (d) => d.score ?? 0,
});
triggers.register("users", globalLeaderboard.idempotentTrigger());

triggers.register("guesses", async (ctx, event) => {
  const { oldDoc, newDoc } = event;
  if (newDoc && (!oldDoc || newDoc.userId === oldDoc.userId)) {
    const delta = newDoc.score - (oldDoc?.score ?? 0);
    if (delta !== 0) {
      const user = await getOrThrow(ctx, newDoc.userId);
      await ctx.db.patch(newDoc.userId, { score: (user.score ?? 0) + delta });
    }
  }
  if (oldDoc && !newDoc) {
    const user = await getOrThrow(ctx, oldDoc.userId);
    await ctx.db.patch(oldDoc.userId, {
      score: Math.max(0, (user.score ?? 0) - oldDoc.score),
    });
  }
  if (oldDoc && newDoc && oldDoc.userId !== newDoc.userId) {
    const oldUser = await getOrThrow(ctx, oldDoc.userId);
    const newUser = await getOrThrow(ctx, newDoc.userId);
    await ctx.db.patch(oldDoc.userId, {
      score: Math.max(0, (oldUser.score ?? 0) - oldDoc.score),
    });
    await ctx.db.patch(newDoc.userId, {
      score: (newUser.score ?? 0) + newDoc.score,
    });
  }
});

export const mutation = customMutation(mutationRaw, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(
  internalMutationRaw,
  customCtx(triggers.wrapDB),
);
export { query, internalQuery, action, internalAction };

export const { runWithRetries, retry } = makeActionRetrier("functions:retry");
export const migrations = new Migrations(components.migrations, {
  internalMutation,
});

async function getUser(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
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
    const userId = await getAuthUserId(ctx);
    return { userId };
  }),
);

async function getUserAndNamespace(ctx: QueryCtx, args: { namespace: string }) {
  const user = await getUser(ctx);
  if (!user) {
    throw new Error("Not authenticated: " + (await getAuthSessionId(ctx)));
  }
  const namespace = await getOneFrom(
    ctx.db,
    "namespaces",
    "slug",
    args.namespace,
  );
  if (!namespace) {
    throw new Error("Category not found");
  }
  return { user, namespace };
}

function assertIsNamespaceCreator(
  user: Doc<"users">,
  namespace: Doc<"namespaces">,
) {
  if (namespace.createdBy !== user._id) {
    throw new Error("User is not the creator of this category");
  }
}

function assertIsCreatorOrPublic(
  user: Doc<"users">,
  namespace: Doc<"namespaces">,
) {
  if (namespace.createdBy !== user._id && !namespace.public) {
    throw new Error("User is not the creator of this category");
  }
}

export const namespaceUserQuery = customQuery(query, {
  args: { namespace: v.string() },
  input: async (ctx0, args) => {
    const ctx = await getUserAndNamespace(ctx0, args);
    assertIsCreatorOrPublic(ctx.user, ctx.namespace);
    return { args: {}, ctx };
  },
});

export const namespaceUserMutation = customMutation(mutation, {
  args: { namespace: v.string() },
  input: async (ctx0, args) => {
    const ctx = await getUserAndNamespace(ctx0, args);
    assertIsCreatorOrPublic(ctx.user, ctx.namespace);
    return { args: {}, ctx };
  },
});

export const namespaceUserAction = customAction(action, {
  args: { namespace: v.string() },
  async input(ctx, args) {
    // Need to cast here to avoid circular api types.
    const { user, namespace } = (await ctx.runQuery(
      internal.functions.fetchUserAndNamespace,
      args,
    )) as { user: Doc<"users">; namespace: Doc<"namespaces"> };
    assertIsCreatorOrPublic(user, namespace);
    return { args: {}, ctx: { user, namespace } };
  },
});

export const namespaceAdminQuery = customQuery(query, {
  args: { namespace: v.string() },
  input: async (ctx0, args) => {
    const ctx = await getUserAndNamespace(ctx0, args);
    assertIsNamespaceCreator(ctx.user, ctx.namespace);
    return { args: {}, ctx };
  },
});

export const namespaceAdminMutation = customMutation(mutation, {
  args: { namespace: v.string() },
  input: async (ctx0, args) => {
    const ctx = await getUserAndNamespace(ctx0, args);
    assertIsNamespaceCreator(ctx.user, ctx.namespace);
    return { args: {}, ctx };
  },
});

export const fetchUserAndNamespace = internalQuery(getUserAndNamespace);

export const namespaceAdminAction = customAction(action, {
  args: { namespace: v.string() },
  async input(ctx, args) {
    // Need to cast here to avoid circular api types.
    const { user, namespace } = (await ctx.runQuery(
      internal.functions.fetchUserAndNamespace,
      args,
    )) as { user: Doc<"users">; namespace: Doc<"namespaces"> };
    assertIsNamespaceCreator(user, namespace);
    return { args: {}, ctx: { user, namespace } };
  },
});

export type Result<T> =
  | { ok: true; value: T; error: undefined }
  | { ok: false; value: undefined; error: string };

export function error(message: string) {
  return { ok: false as const, value: undefined, error: message };
}

export function ok<T>(value: T) {
  return { ok: true as const, value, error: undefined };
}

export function resultValidator<T extends Validator<any, "required", any>>(
  value: T,
) {
  return v.union(
    v.object({ ok: v.literal(true), value, error: v.optional(v.null()) }),
    v.object({
      ok: v.literal(false),
      error: v.string(),
      value: v.optional(v.null()),
    }),
  );
}

function withSystemFields(validator: Validator<any, any, any>): any {
  switch (validator.kind) {
    case "union":
      return v.union(...validator.members.map(withSystemFields));
    case "object":
      return v.object({
        ...validator.fields,
        _id: v.id("namespaces"),
        _creationTime: v.number(),
      });
  }
}

export const vv = {
  ...v,
  id: <Table extends TableNamesInDataModel<DataModel>>(table: Table) =>
    v.id(table),
  doc: <Table extends TableNamesInDataModel<DataModel>>(
    table: Table,
  ): Validator<
    Doc<Table>,
    "required",
    FieldPaths<NamedTableInfo<DataModel, Table>>
  > => {
    return withSystemFields(schema.tables[table].validator);
  },
};
