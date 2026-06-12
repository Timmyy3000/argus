import { describe, expect, test } from "bun:test";
import { formatAccessUrl, isProtectedPath } from "../src/server";

describe("formatAccessUrl", () => {
  test("builds a hash-fragment magic link from the public URL", () => {
    const line = formatAccessUrl({
      ARGUS_PUBLIC_URL: "https://argus.example.com/",
      ARGUS_DASHBOARD_TOKEN: "s3cret token",
      PORT: 3000,
    });
    expect(line).toBe("Dashboard ready: https://argus.example.com/#token=s3cret%20token");
  });

  test("falls back to localhost when no public URL is configured", () => {
    const line = formatAccessUrl({ ARGUS_DASHBOARD_TOKEN: "abc", PORT: 3210 });
    expect(line).toBe("Dashboard ready: http://localhost:3210/#token=abc");
  });

  test("returns undefined without a dashboard token", () => {
    expect(formatAccessUrl({ ARGUS_PUBLIC_URL: "https://x.dev", PORT: 3000 })).toBeUndefined();
  });
});

describe("isProtectedPath", () => {
  test("keeps webhook and callback public", () => {
    expect(isProtectedPath("/webhooks/github")).toBe(false);
    expect(isProtectedPath("/setup/github/callback?code=x")).toBe(false);
  });

  test("protects job and api routes", () => {
    expect(isProtectedPath("/jobs")).toBe(true);
    expect(isProtectedPath("/api/connection")).toBe(true);
  });
});
