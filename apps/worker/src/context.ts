import type { WorkerEnv } from "@shuki/config";
import type { Database } from "@shuki/db";
import type { PgBoss } from "@shuki/jobs";
import type { Storage } from "@shuki/storage";

/** Dependencies handed to every job handler. */
export type WorkerContext = {
  env: WorkerEnv;
  db: Database;
  boss: PgBoss;
  storage: Storage;
};
