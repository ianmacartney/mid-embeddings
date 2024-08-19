import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { rateLimitTables } from "convex-helpers/server/rateLimit";
import { migrationsTable } from "convex-helpers/server/migrations";
import { deprecated, pretendRequired } from "convex-helpers/validators";

// The schema is normally optional, but Convex Auth
// requires indexes defined on `authTables`.
// The schema provides more precise TypeScript types.
const schema = defineSchema({
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

  namespaces: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.string(),
    public: v.boolean(),
    createdBy: v.id("users"),
  })
    .index("slug", ["slug"]) // for unique constraint
    .index("createdBy", ["createdBy"]),

  texts: defineTable({
    title: v.string(),
    text: v.string(),
    namespaceId: v.id("namespaces"),
    embeddingId: v.id("embeddings"),
  })
    .index("namespaceId", ["namespaceId", "title"])
    .index("embeddingId", ["embeddingId"])
    .index("text", ["text"]), // so we can use it as a cache

  embeddings: defineTable({
    namespaceId: v.id("namespaces"),
    embedding: v.array(v.number()),
  }).vectorIndex("embedding", {
    dimensions: 1536,
    filterFields: ["namespaceId"],
    vectorField: "embedding",
  }),

  midpoints: defineTable({
    namespaceId: v.id("namespaces"),
    left: v.string(), // titles
    right: v.string(),
    leftEmbedding: v.array(v.number()),
    rightEmbedding: v.array(v.number()),
    midpointEmbedding: v.array(v.number()),
    topMatches: v.array(
      v.object({
        title: v.string(),
        score: v.number(),
        leftScore: v.number(),
        rightScore: v.number(),
        // ranks
        leftRank: v.number(),
        rightRank: v.number(),
        rrfScore: v.number(),
        leftOverallRank: v.number(),
        rightOverallRank: v.number(),
        rrfOverallScore: v.number(),
        // or alongside topMatches?
        lxrScore: v.number(),
      }),
    ),
  }).index("namespaceId", ["namespaceId", "left", "right"]),

  games: defineTable({
    namespaceId: v.id("namespaces"),
    left: v.string(), // titles
    right: v.string(),
    active: v.boolean(),
    // scheduledStarterId: v.id("_scheduled_functions"),
    // endedAt: v.union(v.number(), v.null()),
  }).index("namespaceId", ["namespaceId", "active"]),
  // }).index("namespaceId", ["namespaceId"]),
  guesses: defineTable({
    gameId: v.id("games"),
    userId: v.id("users"),
    rank: v.number(),
    score: v.number(),
    leftScore: v.number(),
    rightScore: v.number(),
    text: v.string(),
  })
    // look up all the guesses in a game, top scores in each game.
    .index("gameId", ["gameId", "score"])
    // look up all the games I've been in, guesses in a game, top score in each.
    .index("userId", ["userId", "gameId", "rank"]),

  ...rateLimitTables,
  migrations: migrationsTable,
});

export default schema;
