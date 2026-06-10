import type { ValidationRunResult } from "./run-validation";

export type ValidationVerdict = "passed" | "regressed" | "preexisting_failure" | "still_failing";

export type ValidationComparison = {
  verdict: ValidationVerdict;
  summary: string;
};

const COMMAND_ORDER = ["install", "typecheck", "lint", "test"] as const;

function failedStageIndex(result: ValidationRunResult): number {
  const failed = result.results.find((entry) => entry.exitCode !== 0);
  if (!failed) return COMMAND_ORDER.length;
  const index = COMMAND_ORDER.indexOf(failed.name as (typeof COMMAND_ORDER)[number]);
  return index === -1 ? 0 : index;
}

/**
 * Compares the validation run before any code change with the run after it, so a
 * repository that was already red is not blamed on the fix — and a fix that breaks
 * a previously green suite is clearly a regression.
 */
export function compareValidation(baseline: ValidationRunResult, post: ValidationRunResult): ValidationComparison {
  if (post.passed) {
    return {
      verdict: "passed",
      summary: baseline.passed
        ? "Validation passed before and after the change"
        : "Validation passed after the change (the baseline was already failing)",
    };
  }

  if (baseline.passed) {
    return {
      verdict: "regressed",
      summary: `The change broke validation: ${post.summary}`,
    };
  }

  const baselineStage = failedStageIndex(baseline);
  const postStage = failedStageIndex(post);

  if (postStage < baselineStage) {
    return {
      verdict: "regressed",
      summary: `The change made validation fail earlier than the baseline: ${post.summary}`,
    };
  }

  return {
    verdict: postStage > baselineStage ? "still_failing" : "preexisting_failure",
    summary: `Validation was already failing before the change (baseline: ${baseline.summary}; after: ${post.summary})`,
  };
}
