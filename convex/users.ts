import {
  error,
  globalLeaderboard,
  ok,
  userMutation,
  userQuery,
  vv as v,
} from "./functions";
import { api } from "./_generated/api";
export const viewer = userQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.user;
  },
});

export const getAnonymousId = userQuery({
  args: {},
  handler: async (ctx) => {
    const user = ctx.user;
    if (user?.isAnonymous && !user.capturedBy) {
      const account = await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) =>
          q.eq("userId", user._id).eq("provider", "anonymous"),
        )
        .first();
      return account?.providerAccountId;
    }
    return null;
  },
});

export const captureSession = userMutation({
  args: { anonymousId: v.string(), after: v.optional(v.id("rounds")) },
  handler: async (ctx, args) => {
    const userId = ctx.user?._id;
    if (!userId) return error("Not logged in");
    const oldAccount = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "anonymous").eq("providerAccountId", args.anonymousId),
      )
      .first();
    if (!oldAccount) return error("No anonymous account found");
    const oldUser = await ctx.db.get(oldAccount.userId);
    if (!oldUser) return error("No user found for anonymous account");
    if (!oldUser.isAnonymous) return error("User is not anonymous");
    if (oldUser.capturedBy && oldUser.capturedBy !== userId) {
      return error("User is already captured by another user");
    }
    await ctx.db.patch(oldUser._id, { capturedBy: userId });
    // Transfer namespaces
    const namespaces = await ctx.db
      .query("namespaces")
      .withIndex("createdBy", (q) => q.eq("createdBy", oldUser._id))
      .collect();
    for (const namespace of namespaces) {
      await ctx.db.patch(namespace._id, { createdBy: userId });
    }
    // Transfer guesses
    const guesses = await ctx.db
      .query("guesses")
      .withIndex("userId", (q) => {
        const qq = q.eq("userId", oldUser._id);
        if (args.after) {
          return qq.gte("roundId", args.after);
        }
        return qq;
      })
      .take(1000);
    for (const guess of guesses) {
      const existing = await ctx.db
        .query("guesses")
        .withIndex("userId", (q) =>
          q.eq("userId", userId).eq("roundId", guess.roundId),
        )
        .first();
      if (existing) {
        if (
          !existing.submittedAt &&
          guess.submittedAt &&
          guess.score >= existing.score
        ) {
          console.warn(
            "User has already guessed this round but not submitted so swapping guesses",
            userId,
            guess.roundId,
            { old: existing, new: guess },
          );
          await ctx.db.patch(existing._id, { userId: oldUser._id });
        } else {
          console.error(
            "User has already guessed this round: not capturing guesses",
            userId,
            guess.roundId,
          );
          continue;
        }
      }
      await ctx.db.patch(guess._id, { userId });
    }
    if (guesses.length === 1000) {
      await ctx.runMutation(api.users.captureSession, {
        anonymousId: args.anonymousId,
        after: guesses[guesses.length - 1].roundId,
      });
      return ok({ status: "partial" });
    }
    return ok({ status: "complete" });
  },
});

export const overallStats = userQuery({
  args: {},
  handler: async (ctx) => {
    const user = ctx.user;
    if (!user) {
      return null;
    }
    const score = user.score ?? 0;
    const rank =
      (await globalLeaderboard.indexOf(ctx, [score, -user._creationTime], {
        id: user._id,
        order: "desc",
      })) + 1;
    return {
      rank,
      score,
    };
  },
});
