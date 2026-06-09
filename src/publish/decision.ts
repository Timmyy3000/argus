export type PublishDecision = "normal_pr" | "draft_pr" | "no_pr";

export type PublishDecisionInput = {
  hasDiff: boolean;
  validationPassed: boolean;
  reviewPassed: boolean;
  discoveryConfidence: "high" | "medium" | "low";
  allowDraftPr: boolean;
  publishOnLowConfidence: boolean;
};

export function decidePublish(input: PublishDecisionInput): { decision: PublishDecision; reason: string } {
  if (!input.hasDiff) return { decision: "no_pr", reason: "No code changes were produced" };
  if (!input.validationPassed) return { decision: "no_pr", reason: "Validation did not pass" };
  if (!input.reviewPassed) return { decision: "no_pr", reason: "Review did not pass" };

  if (input.discoveryConfidence === "low" && !input.publishOnLowConfidence) {
    return input.allowDraftPr
      ? { decision: "draft_pr", reason: "Discovery confidence is low, publishing only as draft by policy" }
      : { decision: "no_pr", reason: "Discovery confidence is low" };
  }

  return { decision: "normal_pr", reason: "Validation and review passed" };
}

