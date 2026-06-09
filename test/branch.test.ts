import { describe, expect, test } from "bun:test";
import { issueBranchName, prTitle } from "../src/workers/branch";

describe("branch helpers", () => {
  test("builds stable issue branch names and PR titles", () => {
    expect(issueBranchName(123)).toBe("resolver/issue-123");
    expect(prTitle(123, "Login crash")).toBe("Fix #123: Login crash");
  });
});

