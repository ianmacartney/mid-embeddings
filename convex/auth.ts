import GitHub from "@auth/core/providers/github";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { convexAuth } from "@convex-dev/auth/server";
import { rateLimit } from "convex-helpers/server/rateLimit";

const MINUTE = 60 * 1000;

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [GitHub, Anonymous],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      if (args.existingUserId) {
        return args.existingUserId;
      }
      if (args.provider.id === "anonymous") {
        await rateLimit(ctx, {
          name: "anonymous-sign-in",
          config: { kind: "token bucket", rate: 100, period: MINUTE },
          throws: true,
        });

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
