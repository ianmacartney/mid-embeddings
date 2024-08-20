import { v, Validator } from "convex/values";
import { api, internal } from "./_generated/api";
import { DataModel, Doc, Id } from "./_generated/dataModel";
import {
  action,
  DatabaseReader,
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
import type {
  FieldPaths,
  NamedTableInfo,
  TableNamesInDataModel,
} from "convex/server";
import schema from "./schema";
import { getOneFrom } from "convex-helpers/server/relationships";

export const { runWithRetries, retry } = makeActionRetrier("functions:retry");
export const migration = makeMigration(internalMutation, {
  migrationTable: "migrations",
});

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

async function getUserAndNamespace(ctx: QueryCtx, args: { namespace: string }) {
  const user = await getUser(ctx);
  if (!user) {
    throw new Error("Not authenticated: " + (await auth.getSessionId(ctx)));
  }
  const namespace = await getOneFrom(
    ctx.db,
    "namespaces",
    "slug",
    args.namespace,
  );
  if (!namespace) {
    throw new Error("Namespace not found");
  }
  return { user, namespace };
}

function assertIsNamespaceCreator(
  user: Doc<"users">,
  namespace: Doc<"namespaces">,
) {
  if (namespace.createdBy !== user._id) {
    throw new Error("User is not the creator of this namespace");
  }
}

function assertIsCreatorOrPublic(
  user: Doc<"users">,
  namespace: Doc<"namespaces">,
) {
  if (namespace.createdBy !== user._id && !namespace.public) {
    throw new Error("User is not the creator of this namespace");
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
  | { value: T; error: undefined }
  | { value: undefined; error: string };

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
