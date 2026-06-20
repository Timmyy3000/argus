import { describe, expect, test } from "bun:test";
import { argusGitIdentity, fixCommitMessage, issueBranchName, prTitle } from "../src/workers/branch";

describe("branch helpers", () => {
  test("builds stable issue branch names and PR titles", () => {
    expect(issueBranchName(123)).toBe("argus/issue-123");
    expect(prTitle(123, "Login crash")).toBe("Fix #123: Login crash");
  });
});

describe("commit attribution", () => {
  test("authors commits as Argus so git blame reads Argus", () => {
    expect(argusGitIdentity).toEqual({ name: "Argus", email: "argus@users.noreply.github.com" });
  });

  test("commit message attributes Codex as co-author after a blank line", () => {
    expect(fixCommitMessage(123)).toBe("Fix issue #123\n\nCo-authored-by: Codex <codex@openai.com>");
  });
});
