import { Crons } from "@convex-dev/crons";
import { pick } from "convex-helpers";
import { getOrThrow } from "convex-helpers/server/relationships";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./functions";

const crons = new Crons(components.crons);
const CRON_NAME = "round-starter";
export const initRoundCron = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cronspec = "0 9 * * *";
    const existing = await crons.get(ctx, { name: CRON_NAME });
    if (existing) {
      if (
        existing.schedule.kind === "cron" &&
        existing.schedule.cronspec === cronspec
      ) {
        return;
      }
      await crons.delete(ctx, { name: CRON_NAME });
    }
    await crons.register(
      ctx,
      { kind: "cron", cronspec },
      internal.daily.startNextRound,
      {},
      CRON_NAME,
    );
  },
});

export const startNextRound = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("active", (q) => q.eq("active", true))
      .collect();
    if (!rounds.length) {
      console.warn("No active rounds found.");
      return;
    }
    for (const round of rounds) {
      await ctx.db.patch(round._id, { active: false, endedAt: Date.now() });
    }
    const patch = { active: true, startedAt: Date.now() };
    for (const round of rounds) {
      if (!round.nextRoundId) continue;
      const nextRound = await getOrThrow(ctx, round.nextRoundId);
      // we're recycling this round, so we need to create a new one
      if (nextRound.endedAt) {
        const nextRoundId = await ctx.db.insert("rounds", {
          ...pick(nextRound, [
            "namespaceId",
            "left",
            "right",
            "matches",
            "nextRoundId",
          ]),
          ...patch,
        });
        await ctx.db.patch(round._id, { nextRoundId });
      } else {
        await ctx.db.patch(nextRound._id, {
          active: true,
          startedAt: Date.now(),
        });
      }
    }
  },
});
