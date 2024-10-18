import { userQuery } from "./functions";

export const viewer = userQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.user;
  },
});
