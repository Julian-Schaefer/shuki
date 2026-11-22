import { and, asc, eq, file, note, paper } from "@shuki/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../init";

const unit = z.number().min(0).max(1);

const anchorSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("pdf"),
    fileId: z.uuid(),
    page: z.number().int().min(1),
    rects: z
      .array(z.object({ x: unit, y: unit, w: unit, h: unit }))
      .min(1)
      .max(200),
    quote: z.string().max(10_000),
  }),
  z.object({
    type: z.literal("text"),
    start: z.number().int().min(0),
    end: z.number().int().min(0),
    quote: z.string().max(10_000),
  }),
]);

const noteColumns = {
  id: true,
  paperId: true,
  body: true,
  anchor: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const noteRouter = router({
  listByPaper: protectedProcedure.input(z.object({ paperId: z.uuid() })).query(({ ctx, input }) =>
    ctx.db.query.note.findMany({
      where: and(eq(note.userId, ctx.user.id), eq(note.paperId, input.paperId)),
      columns: noteColumns,
      orderBy: asc(note.createdAt),
    }),
  ),

  create: protectedProcedure
    .input(
      z.object({
        paperId: z.uuid(),
        body: z.string().max(100_000).default(""),
        anchor: anchorSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const owned = await ctx.db.query.paper.findFirst({
        where: and(eq(paper.id, input.paperId), eq(paper.userId, ctx.user.id)),
        columns: { id: true },
      });
      if (!owned) throw new TRPCError({ code: "NOT_FOUND" });

      const anchor = input.anchor;
      if (anchor?.type === "pdf") {
        const pdf = await ctx.db.query.file.findFirst({
          where: and(eq(file.id, anchor.fileId), eq(file.paperId, input.paperId)),
          columns: { id: true },
        });
        if (!pdf) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown file" });
      }
      if (anchor?.type === "text" && anchor.end <= anchor.start) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Empty text anchor" });
      }

      const [created] = await ctx.db
        .insert(note)
        .values({ userId: ctx.user.id, paperId: input.paperId, body: input.body, anchor })
        .returning(noteColumnsSelection());
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return created;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.uuid(), body: z.string().max(100_000) }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(note)
        .set({ body: input.body })
        .where(and(eq(note.id, input.id), eq(note.userId, ctx.user.id)))
        .returning(noteColumnsSelection());
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),

  delete: protectedProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    const [deleted] = await ctx.db
      .delete(note)
      .where(and(eq(note.id, input.id), eq(note.userId, ctx.user.id)))
      .returning({ id: note.id });
    if (!deleted) throw new TRPCError({ code: "NOT_FOUND" });
  }),
});

function noteColumnsSelection() {
  return {
    id: note.id,
    paperId: note.paperId,
    body: note.body,
    anchor: note.anchor,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}
