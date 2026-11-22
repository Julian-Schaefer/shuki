import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/** Created before any migration runs. */
const EXTENSIONS = ["pg_trgm", "vector"] as const;

export async function runMigrations(databaseUrl: string, migrationsFolder: string): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    for (const extension of EXTENSIONS) {
      await client.query(`CREATE EXTENSION IF NOT EXISTS "${extension}"`);
    }
    await migrate(drizzle({ client }), { migrationsFolder });
  } finally {
    await client.end();
  }
}
