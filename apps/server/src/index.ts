import { serve } from "@hono/node-server";
import { ensureQueues } from "@shuki/jobs";
import { createApp } from "./app";
import { createAuth } from "./auth";
import { createServices } from "./services";

const services = createServices();
const auth = createAuth(services);

console.log("Checking object storage…");
await services.storage.ensureBucket();
console.log("Starting job queue…");
await services.boss.start();
await ensureQueues(services.boss);

const app = createApp(services, auth);

const server = serve({ fetch: app.fetch, port: services.env.PORT }, (info) => {
  console.log(`Shuki server listening on http://localhost:${info.port}`);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down…`);
  server.close();
  await services.boss.stop({ graceful: true, timeout: 10_000 });
  await services.db.$client.end();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
