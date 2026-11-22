import { and, eq, exists, file, isNotNull, isNull, or, paper, paperContent } from "@shuki/db";
import { enqueue, type JobHandler } from "@shuki/jobs";
import type { WorkerContext } from "../context";
import { generateThumbnail } from "../lib/thumbnail";

/** `paper.thumbnail`: (re)creates a preview image on its own, e.g. for older papers. */
export const createThumbnailHandler =
  (ctx: WorkerContext): JobHandler<"paper.thumbnail"> =>
  async ({ paperId }) => {
    const created = await generateThumbnail(ctx, paperId);
    if (created) console.log(`[paper.thumbnail] paper ${paperId}: thumbnail created`);
  };

/**
 * Queues thumbnails for papers that are ready but have none yet – covers papers
 * saved before thumbnails existed. Runs on worker start; duplicates are avoided
 * with a singleton key per paper.
 */
export async function backfillThumbnails(ctx: WorkerContext): Promise<void> {
  const missing = await ctx.db
    .select({ id: paper.id })
    .from(paper)
    .where(
      and(
        eq(paper.status, "ready"),
        isNull(paper.thumbnailAt),
        // Only papers that can have a preview: a PDF or a website image.
        or(
          exists(
            ctx.db
              .select()
              .from(file)
              .where(and(eq(file.paperId, paper.id), eq(file.mimeType, "application/pdf"))),
          ),
          exists(
            ctx.db
              .select()
              .from(paperContent)
              .where(and(eq(paperContent.paperId, paper.id), isNotNull(paperContent.imageUrl))),
          ),
        ),
      ),
    )
    .limit(1000);
  for (const { id } of missing) {
    await enqueue(
      ctx.boss,
      "paper.thumbnail",
      { paperId: id },
      { singletonKey: `thumbnail:${id}`, singletonSeconds: 60 * 60 },
    );
  }
  if (missing.length)
    console.log(`[paper.thumbnail] queued ${missing.length} missing thumbnail(s)`);
}
