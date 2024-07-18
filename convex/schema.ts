import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { rateLimitTables } from "convex-helpers/server/rateLimit";

// The schema is normally optional, but Convex Auth
// requires indexes defined on `authTables`.
// The schema provides more precise TypeScript types.
export default defineSchema({
  ...authTables,
  users: defineTable(
    v.union(
      v.object({
        isAnonymous: v.literal(true),
      }),
      v.object({
        isAnonymous: v.literal(false),
        name: v.string(),
        email: v.string(),
        image: v.string(),
      }),
    ),
  ),
  messages: defineTable({
    userId: v.id("users"),
    body: v.string(),
  }),
  ...rateLimitTables,
});
