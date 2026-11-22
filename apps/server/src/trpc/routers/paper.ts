import {
  and,
  desc,
  eq,
  exists,
  file,
  inArray,
  isNull,
  paper,
  paperContent,
  paperTag,
  processingStatus,
  type SQL,
  tag,
} from "@shuki/db";
import { enqueue } from "@shuki/jobs";
import { storageKeys } from "@shuki/storage";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../init";
import { assertFolderOwned } from "./folder";

const paperId = z.object({ id: z.uuid() });

const webUrl = z.url({ protocol: /^https?$/, message: "Enter a valid http(s) URL" }).max(2048);

function enqueueProcessing(
  boss: Parameters<typeof enqueue>[0],
  target: { id: string; sourceType: string },
  options: { replaceTitle?: boolean } = {},
) {
  return target.sourceType === "url"
    ? enqueue(boss, "paper.clip-url", { paperId: target.id, replaceTitle: options.replaceTitle })
    : enqueue(boss, "paper.process", { paperId: target.id });
}

export const paperRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          status: z.array(z.enum(processingStatus.enumValues)).optional(),
          tagId: z.uuid().optional(),
          /** `null` = library root, omit for all papers. */
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
          venue: true,
          url: true,
          thumbnailAt: true,
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

  preview: protectedProcedure.input(paperId).query(async ({ ctx, input }) => {
    const found = await ctx.db.query.paper.findFirst({
      where: and(eq(paper.id, input.id), eq(paper.userId, ctx.user.id)),
      columns: { id: true, title: true, url: true, sourceType: true, status: true, error: true },
    });
    if (!found) throw new TRPCError({ code: "NOT_FOUND" });
    const [pdf] = await ctx.db
      .select({ id: file.id, fileName: file.fileName })
      .from(file)
      .where(and(eq(file.paperId, found.id), eq(file.mimeType, "application/pdf")))
      .limit(1);
    const [content] = await ctx.db
      .select({
        html: paperContent.html,
        imageUrl: paperContent.imageUrl,
        embeddable: paperContent.embeddable,
      })
      .from(paperContent)
      .where(eq(paperContent.paperId, found.id));
    return { ...found, pdf: pdf ?? null, website: content?.html != null ? content : null };
  }),

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
      z
        .object({
          title: z.string().trim().max(1000).optional(),
          url: webUrl.optional(),
          /** The client uploads a file next; the upload enqueues processing. */
          withFile: z.boolean().default(false),
          folderId: z.uuid().nullable().default(null),
        })
        .refine((v) => Boolean(v.title || v.url), "Enter a title or a URL"),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.folderId) await assertFolderOwned(ctx.db, ctx.user.id, input.folderId);
      const sourceType = input.url ? "url" : input.withFile ? "pdf" : "manual";
      const [created] = await ctx.db
        .insert(paper)
        .values({
          userId: ctx.user.id,
          // Placeholder until the worker has the page title.
          title: input.title || new URL(input.url ?? "").hostname,
          url: input.url,
          folderId: input.folderId,
          sourceType,
        })
        .returning({ id: paper.id, sourceType: paper.sourceType });
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (!input.withFile) {
        await enqueueProcessing(ctx.boss, created, { replaceTitle: !input.title });
      }
      return created;
    }),

  move: protectedProcedure
    .input(z.object({ ids: z.array(z.uuid()).min(1).max(500), folderId: z.uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      if (input.folderId) await assertFolderOwned(ctx.db, ctx.user.id, input.folderId);
      await ctx.db
        .update(paper)
        .set({ folderId: input.folderId })
        .where(and(eq(paper.userId, ctx.user.id), inArray(paper.id, input.ids)));
    }),

  reprocess: protectedProcedure.input(paperId).mutation(async ({ ctx, input }) => {
    const [updated] = await ctx.db
      .update(paper)
      .set({ status: "pending", error: null })
      .where(and(eq(paper.id, input.id), eq(paper.userId, ctx.user.id)))
      .returning({ id: paper.id, sourceType: paper.sourceType });
    if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
    await enqueueProcessing(ctx.boss, updated);
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
    await Promise.allSettled([
      ...files.map((f) => ctx.storage.delete(f.storageKey)),
      ctx.storage.delete(storageKeys.paperThumbnail(ctx.user.id, deleted.id)),
    ]);
    return deleted;
  }),
});
