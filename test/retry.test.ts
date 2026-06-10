import { describe, expect, test } from "bun:test";
import { decideAttemptOutcome } from "../src/workers/retry";

describe("decideAttemptOutcome", () => {
  test("completed jobs always finish", () => {
    const outcome = decideAttemptOutcome({
      result: { status: "completed", reason: "Opened PR", retryable: true },
      attemptNumber: 1,
      maxAttempts: 2,
    });
    expect(outcome).toEqual({ action: "finish", jobStatus: "completed" });
  });

  test("needs_human is never retried", () => {
    const outcome = decideAttemptOutcome({
      result: { status: "needs_human", reason: "Publish gate closed", retryable: true },
      attemptNumber: 1,
      maxAttempts: 3,
    });
    expect(outcome).toEqual({ action: "finish", jobStatus: "needs_human" });
  });

  test("retryable failure with attempts remaining is retried", () => {
    const outcome = decideAttemptOutcome({
      result: { status: "implementation_failed", reason: "git clone failed", retryable: true },
      attemptNumber: 1,
      maxAttempts: 2,
    });
    expect(outcome.action).toBe("retry");
    if (outcome.action === "retry") {
      expect(outcome.reason).toContain("git clone failed");
    }
  });

  test("retryable failure on the final attempt finishes", () => {
    const outcome = decideAttemptOutcome({
      result: { status: "implementation_failed", reason: "git clone failed", retryable: true },
      attemptNumber: 2,
      maxAttempts: 2,
    });
    expect(outcome).toEqual({ action: "finish", jobStatus: "implementation_failed" });
  });

  test("non-retryable failure finishes immediately", () => {
    const outcome = decideAttemptOutcome({
      result: { status: "validation_failed", reason: "tests failed" },
      attemptNumber: 1,
      maxAttempts: 3,
    });
    expect(outcome).toEqual({ action: "finish", jobStatus: "validation_failed" });
  });
});
