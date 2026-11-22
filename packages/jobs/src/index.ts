import { type Job, PgBoss, type QueueOptions, type SendOptions } from "pg-boss";
import { z } from "zod";

export type { Job } from "pg-boss";
export { PgBoss };

type QueueDefinition<S extends z.ZodType> = {
  schema: S;
  options: QueueOptions;
};

const defineQueue = <S extends z.ZodType>(definition: QueueDefinition<S>) => definition;

/** Shared by server (enqueue) and worker (consume) so payloads stay typed and validated. */
export const queues = {
  "paper.process": defineQueue({
    schema: z.object({ paperId: z.uuid() }),
    options: { retryLimit: 3, retryDelay: 10, retryBackoff: true, expireInSeconds: 15 * 60 },
  }),
  "paper.clip-url": defineQueue({
    schema: z.object({
      paperId: z.uuid(),
      replaceTitle: z.boolean().default(false),
    }),
    options: { retryLimit: 2, retryDelay: 30, retryBackoff: true, expireInSeconds: 5 * 60 },
  }),
  "paper.thumbnail": defineQueue({
    schema: z.object({ paperId: z.uuid() }),
    options: { retryLimit: 1, retryDelay: 60, expireInSeconds: 5 * 60 },
  }),
} satisfies Record<string, QueueDefinition<z.ZodType>>;

export type QueueName = keyof typeof queues;
export type JobPayload<Q extends QueueName> = z.output<(typeof queues)[Q]["schema"]>;
export type JobInput<Q extends QueueName> = z.input<(typeof queues)[Q]["schema"]>;
export const queueNames = Object.keys(queues) as QueueName[];

export type CreateBossOptions = {
  databaseUrl: string;
  applicationName: string;
  /** Only the worker runs maintenance and cron; the server just enqueues. */
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

export async function enqueue<Q extends QueueName>(
  boss: PgBoss,
  name: Q,
  payload: JobInput<Q>,
  options?: SendOptions,
): Promise<string | null> {
  const data = queues[name].schema.parse(payload) as object;
  return boss.send(name, data, options);
}

export type JobHandler<Q extends QueueName> = (
  payload: JobPayload<Q>,
  job: Job<unknown>,
) => Promise<void>;

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
