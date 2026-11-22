import { eq, file, paper } from "@shuki/db";
import { type JobHandler, queues } from "@shuki/jobs";
import type { WorkerContext } from "../context";

/**
 * Skeleton handler for `paper.process`. It walks the paper through the status
 * lifecycle and verifies uploaded files are present in storage.
 *
 * Later this becomes the entry point that fans out to paper.ingest-pdf,
 * paper.enrich-metadata, paper.index and paper.embed.
 */
export const createPaperProcessHandler =
  ({ db, storage }: WorkerContext): JobHandler<"paper.process"> =>
  async ({ paperId }, job) => {
    const [current] = await db
      .update(paper)
      .set({ status: "processing", error: null })
      .where(eq(paper.id, paperId))
      .returning({ id: paper.id });
    if (!current) {
      console.warn(`[paper.process] paper ${paperId} no longer exists, skipping`);
      return;
    }

    try {
      const files = await db.select().from(file).where(eq(file.paperId, paperId));
      for (const f of files) {
        const object = await storage.get(f.storageKey);
        await object.body.cancel(); // only checking existence for now
      }

      await db.update(paper).set({ status: "ready" }).where(eq(paper.id, paperId));
      console.log(`[paper.process] paper ${paperId} ready (${files.length} file(s))`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Only the last attempt marks the paper as failed; before that it waits for a retry.
      const isLastAttempt = job.retryCount >= (queues["paper.process"].options.retryLimit ?? 0);
      await db
        .update(paper)
        .set({ status: isLastAttempt ? "failed" : "pending", error: message })
        .where(eq(paper.id, paperId));
      console.error(
        `[paper.process] paper ${paperId} failed (attempt ${job.retryCount + 1})`,
        error,
      );
      throw error; // let pg-boss retry according to the queue's retry policy
    }
  };
