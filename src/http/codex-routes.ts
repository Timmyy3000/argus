import type { FastifyInstance } from "fastify";
import { DeviceAuthManager, readAuthStatus } from "../codex/device-auth";

export async function registerCodexRoutes(app: FastifyInstance, deps: { manager?: DeviceAuthManager } = {}) {
  const manager = deps.manager ?? new DeviceAuthManager();

  app.get("/api/codex/status", async () => ({
    auth: readAuthStatus(),
    login: manager.status(),
  }));

  app.post("/api/codex/connect", async () => ({
    auth: readAuthStatus(),
    login: manager.start(),
  }));

  app.post("/api/codex/cancel", async () => ({
    auth: readAuthStatus(),
    login: manager.cancel(),
  }));
}
