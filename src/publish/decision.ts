import type { ValidationVerdict } from "../validation/compare";

export type PublishDecision = "normal_pr" | "draft_pr" | "no_pr";

export type PublishDecisionInput = {
  hasDiff: boolean;
  validationVerdict: ValidationVerdict;
  reviewPassed: boolean;
  /** LLM review was enabled but unreachable: never publish a normal PR unreviewed. */
  reviewDegraded?: boolean;
  discoveryConfidence: "high" | "medium" | "low";
  allowDraftPr: boolean;
  publishOnLowConfidence: boolean;
};

export function decidePublish(input: PublishDecisionInput): { decision: PublishDecision; reason: string } {
  if (!input.hasDiff) return { decision: "no_pr", reason: "No code changes were produced" };
  if (!input.reviewPassed) return { decision: "no_pr", reason: "Review did not pass" };
  if (input.validationVerdict === "regressed") {
    return { decision: "no_pr", reason: "The change made validation worse than the baseline" };
  }

  if (input.validationVerdict === "preexisting_failure" || input.validationVerdict === "still_failing") {
    return input.allowDraftPr
      ? {
          decision: "draft_pr",
          reason: "Validation was already failing before the change, publishing only as draft by policy",
        }
      : { decision: "no_pr", reason: "Validation was already failing before the change" };
  }

  if (input.discoveryConfidence === "low" && !input.publishOnLowConfidence) {
    return input.allowDraftPr
      ? { decision: "draft_pr", reason: "Discovery confidence is low, publishing only as draft by policy" }
      : { decision: "no_pr", reason: "Discovery confidence is low" };
  }

  if (input.reviewDegraded) {
    return input.allowDraftPr
      ? { decision: "draft_pr", reason: "LLM review was unavailable, publishing only as draft by policy" }
      : { decision: "no_pr", reason: "LLM review was unavailable and draft PRs are not allowed" };
  }

  return { decision: "normal_pr", reason: "Validation and review passed" };
}
