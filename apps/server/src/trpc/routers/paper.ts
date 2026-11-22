import {
  and,
  desc,
  eq,
  exists,
  file,
  inArray,
  isNull,
  paper,
  paperTag,
  processingStatus,
  type SQL,
  tag,
} from "@shuki/db";
import { enqueue } from "@shuki/jobs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../init";
import { assertFolderOwned } from "./folder";

const paperId = z.object({ id: z.uuid() });

export const paperRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          status: z.array(z.enum(processingStatus.enumValues)).optional(),
          tagId: z.uuid().optional(),
          /** Papers directly inside this folder; `null` = library root. Omit for all papers. */
          folderId: z.uuid().nullable().optional(),
        })
        .default({}),
    )
    .query(({ ctx, input }) => {
      const conditions: SQL[] = [eq(paper.userId, ctx.user.id)];
      if (input.status?.length) conditions.push(inArray(paper.status, input.status));
      if (input.folderId === null) conditions.push(isNull(paper.folderId));
      else if (input.folderId) conditions.push(eq(paper.folderId, input.folderId));
      if (input.tagId) {
        conditions.push(
          exists(
            ctx.db
              .select()
              .from(paperTag)
              .where(and(eq(paperTag.paperId, paper.id), eq(paperTag.tagId, input.tagId))),
          ),
        );
      }
      return ctx.db.query.paper.findMany({
        where: and(...conditions),
        orderBy: desc(paper.createdAt),
        columns: {
          id: true,
          title: true,
          authors: true,
          year: true,
          sourceType: true,
          status: true,
          folderId: true,
          createdAt: true,
        },
      });
    }),

  byId: protectedProcedure.input(paperId).query(async ({ ctx, input }) => {
    const result = await ctx.db.query.paper.findFirst({
      where: and(eq(paper.id, input.id), eq(paper.userId, ctx.user.id)),
    });
    if (!result) throw new TRPCError({ code: "NOT_FOUND" });
    const [files, tags] = await Promise.all([
      ctx.db.query.file.findMany({
        where: eq(file.paperId, result.id),
        columns: { id: true, fileName: true, mimeType: true, size: true, createdAt: true },
      }),
      ctx.db.select({ id: paperTag.tagId }).from(paperTag).where(eq(paperTag.paperId, result.id)),
    ]);
    return { ...result, files, tagIds: tags.map((t) => t.id) };
  }),

  /** Replaces the tags of a paper. */
  setTags: protectedProcedure
    .input(z.object({ id: z.uuid(), tagIds: z.array(z.uuid()).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const owned = await ctx.db.query.paper.findFirst({
        where: and(eq(paper.id, input.id), eq(paper.userId, ctx.user.id)),
        columns: { id: true },
      });
      if (!owned) throw new TRPCError({ code: "NOT_FOUND" });
      const validTags = input.tagIds.length
        ? await ctx.db
            .select({ id: tag.id })
            .from(tag)
            .where(and(eq(tag.userId, ctx.user.id), inArray(tag.id, input.tagIds)))
        : [];
      await ctx.db.transaction(async (tx) => {
        await tx.delete(paperTag).where(eq(paperTag.paperId, input.id));
        if (validTags.length) {
          await tx
            .insert(paperTag)
            .values(validTags.map((t) => ({ paperId: input.id, tagId: t.id })));
        }
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().trim().min(1).max(1000),
        /** When true the client uploads a file next and the upload enqueues processing. */
        withFile: z.boolean().default(false),
        folderId: z.uuid().nullable().default(null),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.folderId) await assertFolderOwned(ctx.db, ctx.user.id, input.folderId);
      const [created] = await ctx.db
        .insert(paper)
        .values({
          userId: ctx.user.id,
          title: input.title,
          folderId: input.folderId,
          sourceType: input.withFile ? "pdf" : "manual",
        })
        .returning({ id: paper.id });
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (!input.withFile) {
        await enqueue(ctx.boss, "paper.process", { paperId: created.id });
      }
      return created;
    }),

  /** Moves papers into a folder (or to the library root with `folderId: null`). */
  move: protectedProcedure
    .input(z.object({ ids: z.array(z.uuid()).min(1).max(500), folderId: z.uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      if (input.folderId) await assertFolderOwned(ctx.db, ctx.user.id, input.folderId);
      await ctx.db
        .update(paper)
        .set({ folderId: input.folderId })
        .where(and(eq(paper.userId, ctx.user.id), inArray(paper.id, input.ids)));
    }),

  /** Re-runs background processing, e.g. after a failure. */
  reprocess: protectedProcedure.input(paperId).mutation(async ({ ctx, input }) => {
    const [updated] = await ctx.db
      .update(paper)
      .set({ status: "pending", error: null })
      .where(and(eq(paper.id, input.id), eq(paper.userId, ctx.user.id)))
      .returning({ id: paper.id });
    if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
    await enqueue(ctx.boss, "paper.process", { paperId: updated.id });
    return updated;
  }),

  delete: protectedProcedure.input(paperId).mutation(async ({ ctx, input }) => {
    const files = await ctx.db
      .select({ storageKey: file.storageKey })
      .from(file)
      .where(and(eq(file.paperId, input.id), eq(file.userId, ctx.user.id)));
    const [deleted] = await ctx.db
      .delete(paper)
      .where(and(eq(paper.id, input.id), eq(paper.userId, ctx.user.id)))
      .returning({ id: paper.id });
    if (!deleted) throw new TRPCError({ code: "NOT_FOUND" });
    await Promise.allSettled(files.map((f) => ctx.storage.delete(f.storageKey)));
    return deleted;
  }),
});
