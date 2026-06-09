import { describe, expect, test } from "bun:test";
import { decidePublish } from "../src/publish/decision";

describe("decidePublish", () => {
  test("allows normal PR only after diff, validation, and review", () => {
    expect(
      decidePublish({
        hasDiff: true,
        validationPassed: true,
        reviewPassed: true,
        discoveryConfidence: "high",
        allowDraftPr: false,
        publishOnLowConfidence: false,
      }).decision,
    ).toBe("normal_pr");
  });

  test("blocks failed validation", () => {
    expect(
      decidePublish({
        hasDiff: true,
        validationPassed: false,
        reviewPassed: true,
        discoveryConfidence: "high",
        allowDraftPr: true,
        publishOnLowConfidence: true,
      }).decision,
    ).toBe("no_pr");
  });

  test("uses draft PR for low confidence only when policy allows it", () => {
    expect(
      decidePublish({
        hasDiff: true,
        validationPassed: true,
        reviewPassed: true,
        discoveryConfidence: "low",
        allowDraftPr: true,
        publishOnLowConfidence: false,
      }).decision,
    ).toBe("draft_pr");
  });
});

