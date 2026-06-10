import { describe, expect, test } from "bun:test";
import { decidePublish, type PublishDecisionInput } from "../src/publish/decision";

const base: PublishDecisionInput = {
  hasDiff: true,
  validationVerdict: "passed",
  reviewPassed: true,
  discoveryConfidence: "high",
  allowDraftPr: false,
  publishOnLowConfidence: false,
};

describe("decidePublish", () => {
  test("allows normal PR only after diff, validation, and review", () => {
    expect(decidePublish(base).decision).toBe("normal_pr");
  });

  test("blocks when there is no diff", () => {
    expect(decidePublish({ ...base, hasDiff: false }).decision).toBe("no_pr");
  });

  test("blocks failed review", () => {
    expect(decidePublish({ ...base, reviewPassed: false }).decision).toBe("no_pr");
  });

  test("blocks validation regressions even when drafts are allowed", () => {
    expect(decidePublish({ ...base, validationVerdict: "regressed", allowDraftPr: true }).decision).toBe("no_pr");
  });

  test("downgrades preexisting validation failures to draft when policy allows", () => {
    expect(decidePublish({ ...base, validationVerdict: "preexisting_failure", allowDraftPr: true }).decision).toBe(
      "draft_pr",
    );
    expect(decidePublish({ ...base, validationVerdict: "preexisting_failure" }).decision).toBe("no_pr");
  });

  test("uses draft PR for low confidence only when policy allows it", () => {
    expect(decidePublish({ ...base, discoveryConfidence: "low", allowDraftPr: true }).decision).toBe("draft_pr");
    expect(decidePublish({ ...base, discoveryConfidence: "low" }).decision).toBe("no_pr");
  });

  test("never publishes a normal PR when LLM review was degraded", () => {
    expect(decidePublish({ ...base, reviewDegraded: true, allowDraftPr: true }).decision).toBe("draft_pr");
    expect(decidePublish({ ...base, reviewDegraded: true }).decision).toBe("no_pr");
  });
});
