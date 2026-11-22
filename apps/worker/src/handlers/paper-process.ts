import { eq, file, paper } from "@shuki/db";
import type { JobHandler } from "@shuki/jobs";
import type { WorkerContext } from "../context";
import { markProcessing, recordFailure } from "../lib/paper-status";
import { tryGenerateThumbnail } from "../lib/thumbnail";

/**
 * Skeleton handler for `paper.process`. It walks the paper through the status
 * lifecycle and verifies uploaded files are present in storage.
 *
 * Later this becomes the entry point that fans out to paper.ingest-pdf,
 * paper.enrich-metadata, paper.index and paper.embed.
 */
export const createPaperProcessHandler =
  (ctx: WorkerContext): JobHandler<"paper.process"> =>
  async ({ paperId }, job) => {
    const { db, storage } = ctx;
    if (!(await markProcessing(db, paperId))) {
      console.warn(`[paper.process] paper ${paperId} no longer exists, skipping`);
      return;
    }

    try {
      const files = await db.select().from(file).where(eq(file.paperId, paperId));
      for (const f of files) {
        const object = await storage.get(f.storageKey);
        await object.body.cancel(); // only checking existence for now
      }

      await tryGenerateThumbnail(ctx, paperId);
      await db.update(paper).set({ status: "ready" }).where(eq(paper.id, paperId));
      console.log(`[paper.process] paper ${paperId} ready (${files.length} file(s))`);
    } catch (error) {
      const retry = await recordFailure(db, { paperId, queue: "paper.process", job, error });
      if (retry) throw error; // let pg-boss retry according to the queue's retry policy
    }
  };
