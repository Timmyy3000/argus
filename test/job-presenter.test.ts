import { describe, expect, test } from "bun:test";
import { presentJobDetail } from "../src/http/job-presenter";

describe("presentJobDetail", () => {
  test("returns operator-readable job state", () => {
    const now = new Date("2026-06-09T10:00:00Z");
    const detail = presentJobDetail({
      job: {
        id: "job-1",
        status: "needs_human",
        repository: { fullName: "owner/repo" },
        issue: { number: 42, title: "Fix the thing" },
        triggerLabel: "agent:fix",
        requestedBy: "octocat",
        statusReason: "publish disabled",
        currentAttempt: 1,
        maxAttempts: 2,
        queuedAt: now,
        startedAt: now,
        finishedAt: now,
        publishDecision: "normal_pr",
        publishReason: "validation passed",
        createdAt: now,
        updatedAt: now,
      },
      attempts: [],
      events: [{ type: "worker.finished", message: "done", metadata: {}, createdAt: now }],
      logs: [],
      discovery: [],
      validations: [],
      reviews: [],
      pullRequest: null,
    });

    expect(detail).toMatchObject({
      id: "job-1",
      repository: "owner/repo",
      issueNumber: 42,
      currentAttempt: 1,
      publishDecision: "normal_pr",
      pullRequest: null,
      events: [{ type: "worker.finished", message: "done" }],
    });
  });
});
