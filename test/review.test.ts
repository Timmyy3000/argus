import { describe, expect, test } from "bun:test";
import { reviewDiffWithLlm } from "../src/review/llm-review";
import { parseNameStatus, runMechanicalChecks } from "../src/review/mechanical";

const SAFE_DIFF = [
  "diff --git a/src/config.ts b/src/config.ts",
  "--- a/src/config.ts",
  "+++ b/src/config.ts",
  "+  if (!file) throw new ConfigError('missing config file');",
].join("\n");

describe("runMechanicalChecks", () => {
  test("passes a small safe diff", () => {
    const result = runMechanicalChecks({
      diff: SAFE_DIFF,
      changedFiles: [{ status: "M", path: "src/config.ts" }],
    });
    expect(result.passed).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  test("blocks changes to protected paths", () => {
    const result = runMechanicalChecks({
      diff: SAFE_DIFF,
      changedFiles: [{ status: "M", path: ".github/workflows/ci.yml" }],
    });
    expect(result.passed).toBe(false);
    expect(result.blockers[0]).toContain("protected path");
  });

  test("blocks deleted test files", () => {
    const result = runMechanicalChecks({
      diff: SAFE_DIFF,
      changedFiles: [{ status: "D", path: "test/config.test.ts" }],
    });
    expect(result.passed).toBe(false);
    expect(result.blockers[0]).toContain("deletes test file");
  });

  test("blocks oversized diffs", () => {
    const result = runMechanicalChecks({
      diff: "x".repeat(1_000),
      changedFiles: [{ status: "M", path: "src/a.ts" }],
      maxDiffBytes: 500,
    });
    expect(result.passed).toBe(false);
    expect(result.blockers[0]).toContain("byte limit");
  });

  test("blocks added secrets", () => {
    const result = runMechanicalChecks({
      diff: `${SAFE_DIFF}\n+const key = "AKIAIOSFODNN7EXAMPLE";`,
      changedFiles: [{ status: "M", path: "src/config.ts" }],
    });
    expect(result.passed).toBe(false);
    expect(result.blockers[0]).toContain("AWS access key");
  });
});

describe("parseNameStatus", () => {
  test("parses statuses and rename targets", () => {
    const parsed = parseNameStatus("M\tsrc/a.ts\nD\ttest/b.test.ts\nR100\told.ts\tnew.ts\n");
    expect(parsed).toEqual([
      { status: "M", path: "src/a.ts" },
      { status: "D", path: "test/b.test.ts" },
      { status: "R100", path: "new.ts" },
    ]);
  });
});

describe("reviewDiffWithLlm", () => {
  const issue = { number: 3, title: "Crash on missing config", body: "details" };
  const config = {
    ARGUS_ENABLE_LLM_REVIEW: true,
    ARGUS_LLM_MODEL: "test-model",
    ARGUS_LLM_BASE_URL: "https://llm.example",
    OPENAI_API_KEY: "sk-test",
  };

  test("skips cleanly when disabled", async () => {
    const outcome = await reviewDiffWithLlm({
      issue,
      diff: SAFE_DIFF,
      config: { ...config, ARGUS_ENABLE_LLM_REVIEW: false },
    });
    expect(outcome.passed).toBe(true);
    expect(outcome.skipped).toBe(true);
    expect(outcome.degraded).toBe(false);
  });

  test("approves when the model approves", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"verdict": "approve", "summary": "Plausible fix.", "blockers": []}' } }],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;

    const outcome = await reviewDiffWithLlm({ issue, diff: SAFE_DIFF, config, fetchImpl });
    expect(outcome.passed).toBe(true);
    expect(outcome.summary).toBe("Plausible fix.");
  });

  test("rejects with blockers when the model rejects", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '{"verdict": "reject", "summary": "Unrelated changes.", "blockers": ["touches unrelated module"]}',
              },
            },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;

    const outcome = await reviewDiffWithLlm({ issue, diff: SAFE_DIFF, config, fetchImpl });
    expect(outcome.passed).toBe(false);
    expect(outcome.blockers).toEqual(["touches unrelated module"]);
  });

  test("degrades instead of failing when the model is unreachable", async () => {
    const fetchImpl = (async () => new Response("down", { status: 503 })) as unknown as typeof fetch;
    const outcome = await reviewDiffWithLlm({ issue, diff: SAFE_DIFF, config, fetchImpl });
    expect(outcome.passed).toBe(true);
    expect(outcome.degraded).toBe(true);
  });
});
