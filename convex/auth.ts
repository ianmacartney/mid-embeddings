import GitHub from "@auth/core/providers/github";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [GitHub, Anonymous],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      if (args.existingUserId) {
        return args.existingUserId;
      }
      if (args.provider.id === "anonymous") {
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
