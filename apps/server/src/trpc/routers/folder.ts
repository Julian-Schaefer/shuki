import { and, asc, type Database, eq, folder, sql } from "@shuki/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../init";

const folderName = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((name) => !name.includes("/"), "Folder names cannot contain '/'");

/** Throws NOT_FOUND unless the folder exists and belongs to the user. */
export async function assertFolderOwned(db: Database, userId: string, folderId: string) {
  const found = await db.query.folder.findFirst({
    where: and(eq(folder.id, folderId), eq(folder.userId, userId)),
    columns: { id: true },
  });
  if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Folder not found" });
}

/** Maps the unique (parent, name) violation to a readable error. */
async function withUniqueName<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    // Postgres unique_violation, possibly wrapped by Drizzle in `cause`.
    const cause = error instanceof Error && "cause" in error ? error.cause : error;
    if ((cause as { code?: string } | undefined)?.code === "23505") {
      throw new TRPCError({
        code: "CONFLICT",
        message: "A folder with this name already exists here",
      });
    }
    throw error;
  }
}

export const folderRouter = router({
  /** All folders of the user as a flat list – the client builds the tree. */
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db
      .select({ id: folder.id, parentId: folder.parentId, name: folder.name })
      .from(folder)
      .where(eq(folder.userId, ctx.user.id))
      .orderBy(asc(folder.name)),
  ),

  create: protectedProcedure
    .input(z.object({ name: folderName, parentId: z.uuid().nullable().default(null) }))
    .mutation(async ({ ctx, input }) => {
      if (input.parentId) await assertFolderOwned(ctx.db, ctx.user.id, input.parentId);
      const [created] = await withUniqueName(() =>
        ctx.db
          .insert(folder)
          .values({ userId: ctx.user.id, parentId: input.parentId, name: input.name })
          .returning({ id: folder.id, parentId: folder.parentId, name: folder.name }),
      );
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return created;
    }),

  rename: protectedProcedure
    .input(z.object({ id: z.uuid(), name: folderName }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await withUniqueName(() =>
        ctx.db
          .update(folder)
          .set({ name: input.name })
          .where(and(eq(folder.id, input.id), eq(folder.userId, ctx.user.id)))
          .returning({ id: folder.id }),
      );
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
    }),

  /** Moves a folder below another folder (or to the root with `parentId: null`). */
  move: protectedProcedure
    .input(z.object({ id: z.uuid(), parentId: z.uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      await assertFolderOwned(ctx.db, ctx.user.id, input.id);
      if (input.parentId) {
        await assertFolderOwned(ctx.db, ctx.user.id, input.parentId);
        // Reject moving a folder into itself or one of its descendants.
        const cycle = await ctx.db.execute(sql`
          with recursive ancestors as (
            select id, parent_id from ${folder} where id = ${input.parentId}
            union all
            select f.id, f.parent_id from ${folder} f join ancestors a on f.id = a.parent_id
          )
          select 1 from ancestors where id = ${input.id} limit 1
        `);
        if (cycle.rows.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A folder cannot be moved into itself or one of its subfolders",
          });
        }
      }
      await withUniqueName(() =>
        ctx.db
          .update(folder)
          .set({ parentId: input.parentId })
          .where(and(eq(folder.id, input.id), eq(folder.userId, ctx.user.id))),
      );
    }),

  /** Deletes a folder and its subfolders. Contained papers move to the library root. */
  delete: protectedProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    const [deleted] = await ctx.db
      .delete(folder)
      .where(and(eq(folder.id, input.id), eq(folder.userId, ctx.user.id)))
      .returning({ id: folder.id });
    if (!deleted) throw new TRPCError({ code: "NOT_FOUND" });
  }),
});
