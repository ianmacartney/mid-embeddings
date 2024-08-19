import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { rateLimitTables } from "convex-helpers/server/rateLimit";
import { migrationsTable } from "convex-helpers/server/migrations";

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
        // leftRank: v.number(),
        // rightRank: v.number(),
        leftScore: v.number(),
        rightScore: v.number(),
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
    leftDistance: v.number(),
    rightDistance: v.number(),
    text: v.string(),
  })
    // look up all the guesses in a game, top scores in each game.
    .index("gameId", ["gameId", "score"])
    // look up all the games I've been in, guesses in a game, top score in each.
    .index("userId", ["userId", "gameId", "rank"]),

  /*

    */
  feels: defineTable({
    feel: v.string(),
    together: v.optional(v.array(v.number())),
    openAISmall1536: v.optional(v.array(v.number())),
    openAISmall256: v.optional(v.array(v.number())),
  })
    .vectorIndex("together", {
      dimensions: 768,
      vectorField: "together",
    })
    .vectorIndex("openAISmall1536", {
      dimensions: 1536,
      vectorField: "openAISmall1536",
    })
    .vectorIndex("openAISmall256", {
      dimensions: 256,
      vectorField: "openAISmall256",
    })
    .index("feel", ["feel"]),
  words: defineTable({
    word: v.string(),
    together: v.optional(v.array(v.number())),
    openAISmall1536: v.optional(v.array(v.number())),
    openAISmall256: v.optional(v.array(v.number())),
  })
    .vectorIndex("together", {
      dimensions: 768,
      vectorField: "together",
    })
    .vectorIndex("openAISmall1536", {
      dimensions: 1536,
      vectorField: "openAISmall1536",
    })
    .vectorIndex("openAISmall256", {
      dimensions: 256,
      vectorField: "openAISmall256",
    })
    .index("word", ["word"]),
  ...rateLimitTables,
  migrations: migrationsTable,
});
