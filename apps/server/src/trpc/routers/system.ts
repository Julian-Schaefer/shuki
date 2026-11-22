import { isAiEnabled } from "@shuki/config";
import { count, user } from "@shuki/db";
import pkg from "../../../package.json" with { type: "json" };
import { publicProcedure, router } from "../init";

export const systemRouter = router({
  info: publicProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db.select({ value: count() }).from(user);
    const hasUsers = (row?.value ?? 0) > 0;
    return {
      version: pkg.version,
      /** No account exists yet – the next sign-up becomes admin. */
      needsSetup: !hasUsers,
      registrationOpen: !hasUsers || ctx.env.ALLOW_REGISTRATION,
      features: {
        ai: isAiEnabled(ctx.env),
      },
    };
  }),
});
