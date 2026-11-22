import { eq, file, paper } from "@shuki/db";
import type { JobHandler } from "@shuki/jobs";
import type { WorkerContext } from "../context";
import { markProcessing, recordFailure } from "../lib/paper-status";
import { tryGenerateThumbnail } from "../lib/thumbnail";

/** Skeleton – later fans out to PDF ingest, metadata enrichment, indexing and embeddings. */
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
        await object.body.cancel();
      }

      await tryGenerateThumbnail(ctx, paperId);
      await db.update(paper).set({ status: "ready" }).where(eq(paper.id, paperId));
      console.log(`[paper.process] paper ${paperId} ready (${files.length} file(s))`);
    } catch (error) {
      const retry = await recordFailure(db, { paperId, queue: "paper.process", job, error });
      if (retry) throw error;
    }
  };
