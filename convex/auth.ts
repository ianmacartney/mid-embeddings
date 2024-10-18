import GitHub from "@auth/core/providers/github";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { convexAuth } from "@convex-dev/auth/server";
import { RateLimiter, MINUTE } from "@convex-dev/ratelimiter";
import { components } from "./_generated/api";

const rate = new RateLimiter(components.ratelimiter, {
  anonymousSignIn: {
    kind: "token bucket",
    rate: 100,
    period: MINUTE,
    shards: 10,
  },
});

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [GitHub, Anonymous],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      if (args.existingUserId) {
        return args.existingUserId;
      }
      if (args.provider.id === "anonymous") {
        await rate.limit(ctx, "anonymousSignIn", { throws: true });

        return ctx.db.insert("users", { isAnonymous: true });
      }
      return ctx.db.insert("users", {
        isAnonymous: false,
        name: args.profile.name,
        email: args.profile.email,
        image: args.profile.image,
      });
    },
  },
});
