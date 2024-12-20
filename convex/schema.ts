import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { pretendRequired } from "convex-helpers/validators";

// The schema is normally optional, but Convex Auth
// requires indexes defined on `authTables`.
// The schema provides more precise TypeScript types.
const schema = defineSchema({
  ...authTables,

  users: defineTable(
    v.union(
      v.object({
        isAnonymous: v.literal(true),
        score: pretendRequired(v.number()),
        capturedBy: v.optional(v.id("users")),
      }),
      v.object({
        isAnonymous: v.literal(false),
        name: v.string(),
        email: v.string(),
        image: v.string(),
        score: pretendRequired(v.number()),
        isAuthor: v.optional(v.boolean()),
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

  // this could all possibly be a cached action result.
  midpoints: defineTable({
    namespaceId: v.id("namespaces"),
    left: v.string(), // titles
    right: v.string(),
    leftEmbedding: v.array(v.number()),
    rightEmbedding: v.array(v.number()),
    midpointEmbedding: v.array(v.number()),
    plusEmbedding: v.array(v.number()),
    topMatches: v.array(
      v.object({
        title: v.string(),
        score: v.number(),
        leftScore: v.number(),
        rightScore: v.number(),
        plusScore: v.number(),
        // ranks
        leftRank: v.number(),
        rightRank: v.number(),
        plusRank: v.number(),
        rrfScore: v.number(),
        leftOverallRank: v.number(),
        rightOverallRank: v.number(),
        rrfOverallScore: v.number(),
        // or alongside topMatches?
        lxrScore: v.number(),
      }),
    ),
  }).index("namespaceId", ["namespaceId", "left", "right"]),

  rounds: defineTable({
    namespaceId: v.id("namespaces"),
    left: v.string(), // titles
    right: v.string(),
    matches: v.array(v.id("embeddings")),
    active: v.boolean(),
    nextRoundId: v.optional(v.id("rounds")),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),

    // can drop namespace, since it'll be global. maybe to be replaced by something else?
  })
    .index("active", ["active"])
    .index("namespaceId", ["namespaceId"]),
  guesses: defineTable({
    roundId: v.id("rounds"),
    userId: v.id("users"),
    score: v.number(),
    attempts: v.array(
      v.object({
        title: v.string(),
        rank: v.optional(v.number()),
        points: pretendRequired(v.number()),
      }),
    ),
    submittedAt: v.optional(v.number()),
  })
    // look up all the guesses in a round, top scores in each round.
    .index("roundId", ["roundId", "score"])
    // look up all the rounds I've been in, guesses in a round.
    .index("userId", ["userId", "roundId"]),
});

export default schema;
