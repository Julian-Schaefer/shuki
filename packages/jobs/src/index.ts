import { type Job, PgBoss, type QueueOptions, type SendOptions } from "pg-boss";
import { z } from "zod";

export type { Job } from "pg-boss";
export { PgBoss };

type QueueDefinition<S extends z.ZodType> = {
  schema: S;
  options: QueueOptions;
};

const defineQueue = <S extends z.ZodType>(definition: QueueDefinition<S>) => definition;

/**
 * Every background job Shuki knows about. The server only enqueues, the
 * worker only consumes – both share these definitions so payloads stay typed
 * and validated on both ends.
 *
 * Planned queues (see roadmap): paper.ingest-pdf, paper.enrich-metadata,
 * paper.clip-url, paper.index, paper.embed, paper.summarize.
 */
export const queues = {
  /** Skeleton job: runs after a paper was created or a file was uploaded. */
  "paper.process": defineQueue({
    schema: z.object({ paperId: z.uuid() }),
    options: { retryLimit: 3, retryDelay: 10, retryBackoff: true, expireInSeconds: 15 * 60 },
  }),
} satisfies Record<string, QueueDefinition<z.ZodType>>;

export type QueueName = keyof typeof queues;
export type JobPayload<Q extends QueueName> = z.infer<(typeof queues)[Q]["schema"]>;
export const queueNames = Object.keys(queues) as QueueName[];

export type CreateBossOptions = {
  databaseUrl: string;
  /** Name reported to Postgres (`application_name`) and pg-boss's instance registry. */
  applicationName: string;
  /**
   * Only one kind of process should run maintenance and cron scheduling.
   * The worker does; the server is a pure producer.
   */
  maintenance: boolean;
  max?: number;
};

export function createBoss(options: CreateBossOptions): PgBoss {
  return new PgBoss({
    connectionString: options.databaseUrl,
    application_name: options.applicationName,
    instanceName: options.applicationName,
    schema: "pgboss",
    max: options.max ?? 5,
    supervise: options.maintenance,
    schedule: options.maintenance,
  });
}

/** Creates (or updates) every queue. Safe to call on each start. */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  const existing = new Set((await boss.getQueues(queueNames)).map((queue) => queue.name));
  for (const name of queueNames) {
    const { options } = queues[name];
    if (existing.has(name)) {
      await boss.updateQueue(name, options);
    } else {
      await boss.createQueue(name, options);
    }
  }
}

/** Typed, validated `boss.send`. */
export async function enqueue<Q extends QueueName>(
  boss: PgBoss,
  name: Q,
  payload: JobPayload<Q>,
  options?: SendOptions,
): Promise<string | null> {
  const data = queues[name].schema.parse(payload) as object;
  return boss.send(name, data, options);
}

export type JobHandler<Q extends QueueName> = (
  payload: JobPayload<Q>,
  job: Job<unknown>,
) => Promise<void>;

/**
 * Registers a handler for a queue. Payloads are validated before the handler
 * runs; invalid payloads fail the job without retry noise in the handler.
 */
export async function registerWorker<Q extends QueueName>(
  boss: PgBoss,
  name: Q,
  handler: JobHandler<Q>,
  options: { concurrency: number },
): Promise<string> {
  return boss.work<unknown>(
    name,
    { localConcurrency: options.concurrency, batchSize: 1 },
    async (jobs) => {
      for (const job of jobs) {
        const payload = queues[name].schema.parse(job.data) as JobPayload<Q>;
        await handler(payload, job);
      }
    },
  );
}
