import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { sql } from "@shuki/db";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import type { Auth, AuthSession } from "./auth";
import { filesRoutes } from "./routes/files";
import type { Services } from "./services";
import { appRouter } from "./trpc/router";

export type AppEnv = {
  Variables: {
    services: Services;
    user: AuthSession["user"] | null;
    session: AuthSession | null;
  };
};

export function createApp(services: Services, auth: Auth) {
  const app = new Hono<AppEnv>();

  app.use(logger());

  app.onError((error, c) => {
    if (error instanceof HTTPException) return error.getResponse();
    console.error(error);
    return c.json({ error: "Internal Server Error" }, 500);
  });

  app.get("/health", async (c) => {
    const [database, storage] = await Promise.all([
      services.db
        .execute(sql`select 1`)
        .then(() => true)
        .catch(() => false),
      services.storage.ping(),
    ]);
    const ok = database && storage;
    return c.json({ status: ok ? "ok" : "degraded", database, storage }, ok ? 200 : 503);
  });

  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  // Resolve the session once for every API call.
  app.use("/api/*", async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set("services", services);
    c.set("session", session);
    c.set("user", session?.user ?? null);
    await next();
  });

  app.route("/api", filesRoutes);

  app.all("/api/trpc/*", (c) =>
    fetchRequestHandler({
      endpoint: "/api/trpc",
      req: c.req.raw,
      router: appRouter,
      createContext: () => ({ ...services, session: c.get("session") }),
      onError({ error, path }) {
        if (error.code === "INTERNAL_SERVER_ERROR") console.error(`tRPC error on ${path}:`, error);
      },
    }),
  );

  app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

  // Production: serve the built web app with SPA fallback.
  const webDist = services.env.WEB_DIST_DIR ? resolve(services.env.WEB_DIST_DIR) : null;
  if (webDist && existsSync(join(webDist, "index.html"))) {
    const indexHtml = readFileSync(join(webDist, "index.html"), "utf8");
    app.use("/assets/*", async (c, next) => {
      await next();
      c.header("Cache-Control", "public, max-age=31536000, immutable");
    });
    app.use("/*", serveStatic({ root: webDist }));
    app.get("*", (c) => c.html(indexHtml));
  }

  return app;
}
