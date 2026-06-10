import { describe, expect, test } from "bun:test";
import { normalizePermission, resolveSenderPermission } from "../src/github/permissions";

describe("normalizePermission", () => {
  test("prefers role_name over the legacy permission field", () => {
    expect(normalizePermission({ permission: "write", roleName: "maintain" })).toBe("maintain");
    expect(normalizePermission({ permission: "admin", roleName: null })).toBe("admin");
  });

  test("treats none and missing as no permission", () => {
    expect(normalizePermission({ permission: "none" })).toBeUndefined();
    expect(normalizePermission(null)).toBeUndefined();
  });
});

describe("resolveSenderPermission", () => {
  test("trusts the repository owner without a lookup", async () => {
    const permission = await resolveSenderPermission({
      installationId: 1,
      owner: "octocat",
      repo: "hello",
      senderLogin: "octocat",
      fetcher: async () => {
        throw new Error("should not be called");
      },
    });
    expect(permission).toBe("admin");
  });

  test("checks everyone else against the collaborator API", async () => {
    const permission = await resolveSenderPermission({
      installationId: 1,
      owner: "octocat",
      repo: "hello",
      senderLogin: "contributor",
      fetcher: async () => ({ permission: "write", roleName: "write" }),
    });
    expect(permission).toBe("write");
  });

  test("resolves to undefined when the lookup fails", async () => {
    const permission = await resolveSenderPermission({
      installationId: 1,
      owner: "octocat",
      repo: "hello",
      senderLogin: "stranger",
      fetcher: async () => {
        throw new Error("404");
      },
    });
    expect(permission).toBeUndefined();
  });
});
