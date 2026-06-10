import { describe, expect, test } from "bun:test";
import { extractIssueTokens, matchFiles } from "../src/triage/context";
import { buildTriagePrompt, guessCategory, heuristicTriage, parseTriageResponse, triageIssue } from "../src/triage/triage";

describe("extractIssueTokens", () => {
  test("finds file paths, backticked identifiers, and code-style symbols", () => {
    const tokens = extractIssueTokens(
      "Calling `parseConfig()` in src/config/loader.ts throws a TypeError when max_retries is unset.",
    );
    expect(tokens).toContain("src/config/loader.ts");
    expect(tokens).toContain("parseConfig");
    expect(tokens).toContain("max_retries");
  });

  test("returns nothing for plain prose", () => {
    expect(extractIssueTokens("the app is broken please fix")).toEqual([]);
  });
});

describe("matchFiles", () => {
  const tree = ["src/config/loader.ts", "src/server.ts", "test/loader.test.ts", "README.md"];

  test("matches exact path suffixes and base names", () => {
    const matched = matchFiles(tree, ["src/config/loader.ts", "server.ts"]);
    expect(matched).toContain("src/config/loader.ts");
    expect(matched).toContain("src/server.ts");
  });

  test("matches identifiers of 6+ chars against file base names", () => {
    expect(matchFiles(tree, ["loader"])).toEqual(["src/config/loader.ts", "test/loader.test.ts"]);
    expect(matchFiles(tree, ["doesnotexistanywhere"])).toEqual([]);
  });
});

describe("heuristicTriage", () => {
  test("asks for more info on an empty issue", () => {
    const result = heuristicTriage({ number: 1, title: "broken", body: "" });
    expect(result.decision).toBe("needs_more_info");
    expect(result.source).toBe("heuristic");
  });

  test("attempts a detailed issue", () => {
    const result = heuristicTriage({
      number: 2,
      title: "Crash when config file is missing",
      body: "Running `argus start` without a config file throws an unhandled exception instead of a clear error message.",
    });
    expect(result.decision).toBe("attempt");
    expect(result.category).toBe("bug");
  });
});

describe("guessCategory", () => {
  test("classifies bugs, features, and questions", () => {
    expect(guessCategory({ number: 1, title: "Crash on startup", body: "stack trace below" })).toBe("bug");
    expect(guessCategory({ number: 2, title: "Add support for Jira", body: "feature request" })).toBe("feature");
    expect(guessCategory({ number: 3, title: "How do I configure the webhook?", body: "" })).toBe("question");
  });
});

describe("parseTriageResponse", () => {
  test("accepts a well-formed response", () => {
    const parsed = parseTriageResponse({
      decision: "attempt",
      category: "bug",
      reasoning: "Clear defect with reproduction steps.",
      suspect_files: ["src/config.ts"],
      plan: "Add a null check.",
    });
    expect(parsed.decision).toBe("attempt");
    expect(parsed.suspectFiles).toEqual(["src/config.ts"]);
    expect(parsed.plan).toBe("Add a null check.");
  });

  test("falls back to safe defaults on malformed fields", () => {
    const parsed = parseTriageResponse({ decision: "yolo", category: "weird", suspect_files: "nope" });
    expect(parsed.decision).toBe("needs_more_info");
    expect(parsed.category).toBe("unknown");
    expect(parsed.suspectFiles).toEqual([]);
    expect(parsed.plan).toBeNull();
  });
});

describe("triageIssue", () => {
  const issue = {
    number: 7,
    title: "Crash when config file is missing",
    body: "Running the CLI without a config file throws an unhandled TypeError in `loadConfig` instead of a clear error.",
  };

  test("uses the LLM when enabled and falls back to its parsed answer", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  decision: "attempt",
                  category: "bug",
                  reasoning: "Reproducible crash.",
                  suspect_files: ["src/config.ts"],
                  plan: "Guard the missing file case.",
                }),
              },
            },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;

    const result = await triageIssue({
      issue,
      repoDir: process.cwd(),
      config: {
        ARGUS_ENABLE_TRIAGE: true,
        ARGUS_LLM_MODEL: "test-model",
        ARGUS_LLM_BASE_URL: "https://llm.example",
        OPENAI_API_KEY: "sk-test",
      },
      fetchImpl,
    });

    expect(result.source).toBe("llm");
    expect(result.decision).toBe("attempt");
    expect(result.plan).toBe("Guard the missing file case.");
  });

  test("falls back to heuristic triage when the LLM errors", async () => {
    const fetchImpl = (async () => new Response("upstream down", { status: 503 })) as unknown as typeof fetch;

    const result = await triageIssue({
      issue,
      repoDir: process.cwd(),
      config: {
        ARGUS_ENABLE_TRIAGE: true,
        ARGUS_LLM_MODEL: "test-model",
        ARGUS_LLM_BASE_URL: "https://llm.example",
        OPENAI_API_KEY: "sk-test",
      },
      fetchImpl,
    });

    expect(result.source).toBe("heuristic");
    expect(result.decision).toBe("attempt");
  });

  test("uses heuristics when triage is disabled", async () => {
    const result = await triageIssue({
      issue,
      repoDir: process.cwd(),
      config: {
        ARGUS_ENABLE_TRIAGE: false,
        ARGUS_LLM_MODEL: "test-model",
        ARGUS_LLM_BASE_URL: "https://llm.example",
        OPENAI_API_KEY: "sk-test",
      },
    });
    expect(result.source).toBe("heuristic");
  });
});

describe("buildTriagePrompt", () => {
  test("includes the issue and matched files", () => {
    const prompt = buildTriagePrompt(
      { number: 9, title: "Crash in loader", body: "see src/config/loader.ts" },
      { fileTree: ["src/config/loader.ts"], matchedFiles: ["src/config/loader.ts"], issueTokens: ["src/config/loader.ts"] },
    );
    expect(prompt).toContain("Issue #9");
    expect(prompt).toContain("Files matching terms in the issue");
    expect(prompt).toContain('"decision"');
  });
});
