import { and, asc, eq, tag } from "@shuki/db";
import { z } from "zod";
import { protectedProcedure, router } from "../init";

export const tagRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.query.tag.findMany({
      where: eq(tag.userId, ctx.user.id),
      orderBy: asc(tag.name),
    }),
  ),

  create: protectedProcedure
    .input(
      z.object({ name: z.string().trim().min(1).max(100), color: z.string().max(32).optional() }),
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(tag)
        .values({ userId: ctx.user.id, name: input.name, color: input.color })
        .onConflictDoNothing()
        .returning();
      return created ?? null;
    }),

  delete: protectedProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(tag).where(and(eq(tag.id, input.id), eq(tag.userId, ctx.user.id)));
  }),
});
