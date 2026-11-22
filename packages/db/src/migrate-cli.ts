import { fileURLToPath } from "node:url";
import { loadEnv, migrateEnvSchema } from "@shuki/config";
import { runMigrations } from "./migrate";

const env = loadEnv(migrateEnvSchema);
const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

await runMigrations(env.DATABASE_URL, migrationsFolder);
console.log("Database migrations applied.");
