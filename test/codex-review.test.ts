import { describe, expect, test } from "bun:test";
import { buildCodexReviewPrompt, parseCodexReview } from "../src/review/codex-review";

describe("parseCodexReview", () => {
  test("approve with no blockers passes", () => {
    const out = parseCodexReview('{"verdict":"approve","summary":"Looks correct.","blockers":[]}');
    expect(out).toMatchObject({ passed: true, degraded: false, blockers: [], summary: "Looks correct." });
  });

  test("reject fails and surfaces blockers", () => {
    const out = parseCodexReview('{"verdict":"reject","summary":"Deletes a test.","blockers":["Removes assertion"]}');
    expect(out.passed).toBe(false);
    expect(out.degraded).toBe(false);
    expect(out.blockers).toEqual(["Removes assertion"]);
  });

  test("approve but with blockers is treated as not passing", () => {
    const out = parseCodexReview('{"verdict":"approve","summary":"ok","blockers":["but risky"]}');
    expect(out.passed).toBe(false);
  });

  test("unparseable output degrades (draft, not silent pass)", () => {
    const out = parseCodexReview("the model rambled without json");
    expect(out).toMatchObject({ passed: false, degraded: true });
  });
});

describe("buildCodexReviewPrompt", () => {
  test("uses review.md when provided and points at the output file", () => {
    const prompt = buildCodexReviewPrompt({
      issueNumber: 1,
      issueTitle: "t",
      issueBody: "b",
      diff: "d",
      reviewMd: "No console.log in production code.",
      outPath: ".argus/review.json",
    });
    expect(prompt).toContain("No console.log in production code.");
    expect(prompt).toContain(".argus/review.json");
  });

  test("falls back to default rejection criteria without review.md", () => {
    const prompt = buildCodexReviewPrompt({
      issueNumber: 1,
      issueTitle: "t",
      issueBody: "b",
      diff: "d",
      reviewMd: null,
      outPath: ".argus/review.json",
    });
    expect(prompt).toContain("weakens or deletes tests");
  });
});
