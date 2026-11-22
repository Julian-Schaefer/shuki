/** Run by the `migrate` service before server and worker start. */
import { resolve } from "node:path";
import { loadEnv, migrateEnvSchema } from "@shuki/config";
import { runMigrations } from "@shuki/db";

const env = loadEnv(migrateEnvSchema);
const migrationsFolder =
  process.env.MIGRATIONS_DIR ?? resolve(import.meta.dirname, "../../../packages/db/drizzle");

await runMigrations(env.DATABASE_URL, migrationsFolder);
console.log("Database migrations applied.");
