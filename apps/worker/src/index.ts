import { loadEnv, workerEnvSchema } from "@shuki/config";
import { createDb } from "@shuki/db";
import { createBoss, ensureQueues, registerWorker } from "@shuki/jobs";
import { Storage } from "@shuki/storage";
import type { WorkerContext } from "./context";
import { createClipUrlHandler } from "./handlers/paper-clip-url";
import { createPaperProcessHandler } from "./handlers/paper-process";
import { backfillThumbnails, createThumbnailHandler } from "./handlers/paper-thumbnail";

const env = loadEnv(workerEnvSchema);

const context: WorkerContext = {
  env,
  db: createDb(env.DATABASE_URL, { max: env.WORKER_CONCURRENCY + 2 }),
  boss: createBoss({
    databaseUrl: env.DATABASE_URL,
    applicationName: "shuki-worker",
    maintenance: true,
  }),
  storage: new Storage(env),
};

context.boss.on("error", (error) => console.error("[pg-boss]", error));

await context.storage.ensureBucket();
await context.boss.start();
await ensureQueues(context.boss);

const concurrency = env.WORKER_CONCURRENCY;
await registerWorker(context.boss, "paper.process", createPaperProcessHandler(context), {
  concurrency,
});

await registerWorker(context.boss, "paper.clip-url", createClipUrlHandler(context), {
  concurrency,
});

await registerWorker(context.boss, "paper.thumbnail", createThumbnailHandler(context), {
  concurrency,
});
await backfillThumbnails(context);

console.log(`Shuki worker started (concurrency ${concurrency})`);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, finishing active jobs…`);
  await context.boss.stop({ graceful: true, timeout: 30_000 });
  await context.db.$client.end();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
