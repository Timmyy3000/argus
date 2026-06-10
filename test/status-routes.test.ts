import { describe, expect, test } from "bun:test";
import Fastify from "fastify";
import packageJson from "../package.json" with { type: "json" };
import type { Db } from "../src/db/client";
import { registerStatusRoutes } from "../src/http/status-routes";

describe("status routes", () => {
  test("includes the running version on the health endpoint", async () => {
    const app = Fastify();
    await registerStatusRoutes(app, { db: {} as Db });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ ok: true, version: packageJson.version });

    await app.close();
  });
});
