import { existsSync } from "node:fs";
import { join } from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import rawBody from "fastify-raw-body";
import { loadConfig } from "./config";
import { createDb } from "./db/client";
import { createBoss } from "./queue/boss";
import { registerGitHubRoutes } from "./http/github-routes";
import { registerSetupRoutes } from "./http/setup-routes";
import { registerStatusRoutes } from "./http/status-routes";

/** Paths that must stay reachable without the dashboard token. */
const PUBLIC_PATHS = ["/health", "/webhooks/github", "/setup/github/callback"];

export function isProtectedPath(url: string): boolean {
  const path = url.split("?")[0] ?? url;
  if (PUBLIC_PATHS.includes(path)) return false;
  return path.startsWith("/jobs") || path.startsWith("/api/") || path === "/setup/github/manifest";
}

/**
 * One-click dashboard access: the token rides in the hash fragment, which
 * browsers never send to the server, so it stays out of access logs. The web
 * app stores it and scrubs it from the address bar on load.
 */
export function formatAccessUrl(config: { ARGUS_PUBLIC_URL?: string; ARGUS_DASHBOARD_TOKEN?: string; PORT: number }): string | undefined {
  if (!config.ARGUS_DASHBOARD_TOKEN) return undefined;
  const base = (config.ARGUS_PUBLIC_URL ?? `http://localhost:${config.PORT}`).replace(/\/$/, "");
  return `Dashboard ready: ${base}/#token=${encodeURIComponent(config.ARGUS_DASHBOARD_TOKEN)}`;
}

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

  if (config.ARGUS_DASHBOARD_TOKEN) {
    app.addHook("onRequest", async (request, reply) => {
      if (!isProtectedPath(request.url)) return;
      const header = request.headers.authorization;
      if (header === `Bearer ${config.ARGUS_DASHBOARD_TOKEN}`) return;
      return reply.code(401).send({ error: "Dashboard token required" });
    });
  }

  const webDist = join(process.cwd(), "web", "dist");
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, index: ["index.html"] });
  }

  await registerStatusRoutes(app, { db });
  await registerGitHubRoutes(app, { db, boss });
  await registerSetupRoutes(app, { db });

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
  app.log.info(formatAccessUrl(config) ?? "Dashboard access URL unavailable (set ARGUS_DASHBOARD_TOKEN)");
}
