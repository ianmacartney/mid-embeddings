import { globalLeaderboard, userQuery } from "./functions";

export const viewer = userQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.user;
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
