import { describe, expect, test } from "bun:test";
import { NoopWorkerRunner } from "../src/workers/noop-runner";

describe("NoopWorkerRunner", () => {
  test("returns needs_human with a fenced attempt message", async () => {
    const result = await new NoopWorkerRunner().run({
      jobId: "job-1",
      repositoryId: "repo-1",
      issueId: "issue-1",
      attemptId: "attempt-1",
      attemptToken: "token-1",
    });

    expect(result.status).toBe("needs_human");
    expect(result.reason).toContain("attempt-1");
  });
});

