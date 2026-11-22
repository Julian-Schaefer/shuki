import { loadEnv, type ServerEnv, serverEnvSchema } from "@shuki/config";
import { createDb, type Database } from "@shuki/db";
import { createBoss, type PgBoss } from "@shuki/jobs";
import { Storage } from "@shuki/storage";

export type Services = {
  env: ServerEnv;
  db: Database;
  boss: PgBoss;
  storage: Storage;
};

export function createServices(): Services {
  const env = loadEnv(serverEnvSchema);
  return {
    env,
    db: createDb(env.DATABASE_URL),
    boss: createBoss({
      databaseUrl: env.DATABASE_URL,
      applicationName: "shuki-server",
      maintenance: false,
      max: 3,
    }),
    storage: new Storage(env),
  };
}
