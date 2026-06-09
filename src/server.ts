import Fastify from "fastify";
import rawBody from "fastify-raw-body";
import { loadConfig } from "./config";
import { createDb } from "./db/client";
import { createBoss } from "./queue/boss";
import { registerGitHubRoutes } from "./http/github-routes";
import { registerStatusRoutes } from "./http/status-routes";

export async function buildServer() {
  const config = loadConfig();
  const { db, client } = createDb(config.DATABASE_URL);
  const boss = createBoss(config.DATABASE_URL);
  await boss.start();

  const app = Fastify({ logger: true });
  await app.register(rawBody, {
    field: "rawBody",
    global: false,
    encoding: false,
    runFirst: true,
    routes: ["/webhooks/github"],
  });

  await registerStatusRoutes(app, { db });
  await registerGitHubRoutes(app, { db, boss });

  app.addHook("onClose", async () => {
    await boss.stop();
    await client.end();
  });

  return app;
}

if (import.meta.main) {
  const config = loadConfig();
  const app = await buildServer();
  await app.listen({ host: config.HOST, port: config.PORT });
}
