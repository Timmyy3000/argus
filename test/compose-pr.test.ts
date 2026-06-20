import { describe, expect, test } from "bun:test";
import { buildComposePrompt, parseComposedPr } from "../src/publish/compose-pr";

describe("parseComposedPr", () => {
  test("parses a clean JSON object", () => {
    expect(parseComposedPr('{"title":"Fix login crash","body":"## Summary\\nFixes it."}')).toEqual({
      title: "Fix login crash",
      body: "## Summary\nFixes it.",
    });
  });

  test("extracts JSON even with surrounding prose or a code fence", () => {
    const raw = "Here is the PR:\n```json\n{\"title\":\"Add retry\",\"body\":\"Adds a retry.\"}\n```\n";
    expect(parseComposedPr(raw)).toEqual({ title: "Add retry", body: "Adds a retry." });
  });

  test("collapses whitespace in the title and trims the body", () => {
    expect(parseComposedPr('{"title":"  Fix   the\\n bug ","body":"  done  "}')).toEqual({
      title: "Fix the bug",
      body: "done",
    });
  });

  test("returns null for empty title, empty body, or wrong types", () => {
    expect(parseComposedPr('{"title":"","body":"x"}')).toBeNull();
    expect(parseComposedPr('{"title":"x","body":"   "}')).toBeNull();
    expect(parseComposedPr('{"title":1,"body":"x"}')).toBeNull();
    expect(parseComposedPr("not json")).toBeNull();
  });
});

describe("buildComposePrompt", () => {
  test("embeds publish.md conventions and the output path", () => {
    const prompt = buildComposePrompt({
      issueNumber: 7,
      issueTitle: "T",
      issueBody: "B",
      diff: "diff",
      validationSummary: "ok",
      reviewSummary: "approved",
      publishMd: "Always start the title with a ticket id.",
      outPath: ".argus/pr.json",
    });
    expect(prompt).toContain("Always start the title with a ticket id.");
    expect(prompt).toContain(".argus/pr.json");
    expect(prompt).toContain("Do NOT run git, gh, or push");
  });
});
