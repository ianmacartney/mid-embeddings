import { defineApp } from "convex/server";
import aggregate from "@convex-dev/aggregate/convex.config";
import crons from "@convex-dev/crons/convex.config";
import actionCache from "@convex-dev/action-cache/convex.config";
import ratelimiter from "@convex-dev/ratelimiter/convex.config";
import shardedCounter from "@convex-dev/sharded-counter/convex.config";
import migrations from "@convex-dev/migrations/convex.config";

const app = defineApp();

app.use(aggregate, { name: "leaderboard" });
app.use(crons);
app.use(actionCache);
app.use(ratelimiter);
app.use(shardedCounter);
app.use(migrations);

export default app;
