import { describe, expect, test } from "bun:test";
import { compareValidation } from "../src/validation/compare";
import type { ValidationRunResult } from "../src/validation/run-validation";

function run(passed: boolean, failedAt?: "install" | "typecheck" | "lint" | "test"): ValidationRunResult {
  const names = ["install", "typecheck", "lint", "test"] as const;
  const results = [];
  for (const name of names) {
    const failed = name === failedAt;
    results.push({ name, command: name, exitCode: failed ? 1 : 0, stdout: "", stderr: "" });
    if (failed) break;
  }
  return { passed, summary: passed ? "Validation commands passed" : `${failedAt} failed with exit code 1`, results };
}

describe("compareValidation", () => {
  test("green before and after passes", () => {
    expect(compareValidation(run(true), run(true)).verdict).toBe("passed");
  });

  test("fix that repairs a failing baseline passes", () => {
    const comparison = compareValidation(run(false, "test"), run(true));
    expect(comparison.verdict).toBe("passed");
    expect(comparison.summary).toContain("baseline was already failing");
  });

  test("breaking a green baseline is a regression", () => {
    expect(compareValidation(run(true), run(false, "test")).verdict).toBe("regressed");
  });

  test("failing earlier than the baseline is a regression", () => {
    expect(compareValidation(run(false, "test"), run(false, "install")).verdict).toBe("regressed");
  });

  test("same failure as the baseline is preexisting", () => {
    expect(compareValidation(run(false, "test"), run(false, "test")).verdict).toBe("preexisting_failure");
  });

  test("getting further than the baseline but still failing is still_failing", () => {
    expect(compareValidation(run(false, "install"), run(false, "test")).verdict).toBe("still_failing");
  });
});
