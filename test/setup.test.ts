import { describe, expect, test } from "bun:test";
import { buildAppManifest, defaultAppName } from "../src/http/setup-routes";
import { isProtectedPath } from "../src/server";

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
