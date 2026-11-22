import { type Database, eq, paper } from "@shuki/db";
import { type Job, type QueueName, queues } from "@shuki/jobs";

/** Marks a paper as processing. Returns false when it no longer exists. */
export async function markProcessing(db: Database, paperId: string): Promise<boolean> {
  const [current] = await db
    .update(paper)
    .set({ status: "processing", error: null })
    .where(eq(paper.id, paperId))
    .returning({ id: paper.id });
  return Boolean(current);
}

/**
 * Records a failed attempt. Only the last attempt (or a permanent error) marks
 * the paper as failed – before that it stays pending until pg-boss retries.
 * Returns whether the job should be retried.
 */
export async function recordFailure(
  db: Database,
  options: {
    paperId: string;
    queue: QueueName;
    job: Job<unknown>;
    error: unknown;
    permanent?: boolean;
  },
): Promise<boolean> {
  const { paperId, queue, job, error, permanent = false } = options;
  const message = error instanceof Error ? error.message : String(error);
  const retryLimit = queues[queue].options.retryLimit ?? 0;
  const willRetry = !permanent && job.retryCount < retryLimit;
  await db
    .update(paper)
    .set({ status: willRetry ? "pending" : "failed", error: message })
    .where(eq(paper.id, paperId));
  console.error(
    `[${queue}] paper ${paperId} failed (attempt ${job.retryCount + 1}${willRetry ? ", will retry" : ""}):`,
    message,
  );
  return willRetry;
}
