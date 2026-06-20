import { describe, expect, test } from "bun:test";
import Fastify from "fastify";
import { buildAppManifest, defaultAppName, registerSetupRoutes } from "../src/http/setup-routes";
import { isProtectedPath } from "../src/server";

async function buildSetupTestServer() {
  const app = Fastify();
  await registerSetupRoutes(app, { db: {} as Parameters<typeof registerSetupRoutes>[1]["db"] });
  return app;
}

describe("buildAppManifest", () => {
  test("points webhook and redirect at the public URL", () => {
    const manifest = buildAppManifest("https://argus.example.com/") as {
      name: string;
      hook_attributes: { url: string };
      redirect_url: string;
      default_permissions: Record<string, string>;
      default_events: string[];
    };
    expect(manifest.hook_attributes.url).toBe("https://argus.example.com/webhooks/github");
    expect(manifest.redirect_url).toBe("https://argus.example.com/setup/github/callback");
    expect(manifest.default_permissions).toEqual({
      issues: "write",
      contents: "write",
      pull_requests: "write",
      metadata: "read",
    });
    expect(manifest.default_events).toEqual(["issues"]);
  });
});

describe("setup github manifest route", () => {
  test("uses the personal app form by default", async () => {
    const app = await buildSetupTestServer();
    const response = await app.inject({ method: "GET", url: "/setup/github/manifest" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().postUrl).toBe("https://github.com/settings/apps/new");
  });

  test("uses the organization app form when org is provided", async () => {
    const app = await buildSetupTestServer();
    const response = await app.inject({ method: "GET", url: "/setup/github/manifest?org=acme" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().postUrl).toBe("https://github.com/organizations/acme/settings/apps/new");
  });

  test("rejects invalid organization logins", async () => {
    const app = await buildSetupTestServer();
    const response = await app.inject({ method: "GET", url: "/setup/github/manifest?org=bad%2Fowner" });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("Invalid GitHub organization login");
  });
});

describe("defaultAppName", () => {
  test("derives a sanitized name within GitHub's 34-char limit", () => {
    expect(defaultAppName("https://argus.timi.click")).toBe("argus-argus-timi-click");
    expect(defaultAppName("https://a-very-long-subdomain.example-domain.com").length).toBeLessThanOrEqual(34);
  });
});

describe("isProtectedPath", () => {
  test("protects jobs, api, and the manifest endpoint", () => {
    expect(isProtectedPath("/jobs")).toBe(true);
    expect(isProtectedPath("/jobs/abc-123")).toBe(true);
    expect(isProtectedPath("/api/connection")).toBe(true);
    expect(isProtectedPath("/setup/github/manifest")).toBe(true);
  });

  test("leaves webhook, health, callback, and static assets public", () => {
    expect(isProtectedPath("/health")).toBe(false);
    expect(isProtectedPath("/webhooks/github")).toBe(false);
    expect(isProtectedPath("/setup/github/callback?code=abc")).toBe(false);
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/assets/index-abc123.js")).toBe(false);
  });
});
