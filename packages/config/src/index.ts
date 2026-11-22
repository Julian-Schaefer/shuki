import { z } from "zod";

const booleanString = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

const databaseSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

const storageSchema = z.object({
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: booleanString.default(true),
});

const aiSchema = z.object({
  AI_BASE_URL: z.url().optional(),
  AI_API_KEY: z.string().optional(),
  AI_EMBEDDING_MODEL: z.string().optional(),
  AI_CHAT_MODEL: z.string().optional(),
});

const commonSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export const serverEnvSchema = commonSchema
  .extend(databaseSchema.shape)
  .extend(storageSchema.shape)
  .extend(aiSchema.shape)
  .extend({
    PORT: z.coerce.number().int().positive().default(3000),
    APP_URL: z.url().default("http://localhost:3000"),
    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    ALLOW_REGISTRATION: booleanString.default(true),
    /** Served statically when set. */
    WEB_DIST_DIR: z.string().optional(),
    MAX_UPLOAD_MB: z.coerce.number().int().positive().default(100),
  });

export const workerEnvSchema = commonSchema
  .extend(databaseSchema.shape)
  .extend(storageSchema.shape)
  .extend(aiSchema.shape)
  .extend({
    WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
    /** Off by default so users can't make the worker reach internal services. */
    CLIPPER_ALLOW_PRIVATE_NETWORKS: booleanString.default(false),
  });

export const migrateEnvSchema = commonSchema.extend(databaseSchema.shape);

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;
export type MigrateEnv = z.infer<typeof migrateEnvSchema>;
export type StorageEnv = z.infer<typeof storageSchema>;

export function loadEnv<T extends z.ZodType>(
  schema: T,
  source: Record<string, string | undefined> = process.env,
): z.infer<T> {
  // Blank values in `.env` count as unset.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ""),
  );
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

export function isAiEnabled(env: z.infer<typeof aiSchema>): boolean {
  return Boolean(env.AI_BASE_URL);
}
