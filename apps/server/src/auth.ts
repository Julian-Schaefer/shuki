import { account, count, session, user, verification } from "@shuki/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import type { Services } from "./services";

export function createAuth({ env, db }: Pick<Services, "env" | "db">) {
  return betterAuth({
    appName: "Shuki",
    baseURL: env.APP_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_URL],
    telemetry: { enabled: false },
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "user", input: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // The first account becomes admin. Afterwards ALLOW_REGISTRATION decides.
          before: async (newUser) => {
            const [row] = await db.select({ value: count() }).from(user);
            const isFirstUser = (row?.value ?? 0) === 0;
            if (!isFirstUser && !env.ALLOW_REGISTRATION) {
              throw new APIError("FORBIDDEN", { message: "Registration is disabled." });
            }
            return { data: { ...newUser, role: isFirstUser ? "admin" : "user" } };
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;
