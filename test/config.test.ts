import { describe, expect, test } from "bun:test";
import { loadConfig } from "../src/config";

const base = { DATABASE_URL: "postgres://u:p@localhost:5432/db" };

describe("loadConfig stage gates", () => {
  test("the string 'false' keeps a gate closed", () => {
    const config = loadConfig({ ...base, ARGUS_ENABLE_CODEX: "false", ARGUS_ENABLE_GIT_PUSH: "FALSE" });
    expect(config.ARGUS_ENABLE_CODEX).toBe(false);
    expect(config.ARGUS_ENABLE_GIT_PUSH).toBe(false);
  });

  test("affirmative strings open a gate", () => {
    const config = loadConfig({
      ...base,
      ARGUS_ENABLE_CODEX: "true",
      ARGUS_ENABLE_TRIAGE: "1",
      ARGUS_ENABLE_LLM_REVIEW: "yes",
    });
    expect(config.ARGUS_ENABLE_CODEX).toBe(true);
    expect(config.ARGUS_ENABLE_TRIAGE).toBe(true);
    expect(config.ARGUS_ENABLE_LLM_REVIEW).toBe(true);
  });

  test("unset and empty values fall back to closed", () => {
    const config = loadConfig({ ...base, ARGUS_ENABLE_CODEX: "" });
    expect(config.ARGUS_ENABLE_CODEX).toBe(false);
    expect(config.ARGUS_ENABLE_TRIAGE).toBe(false);
  });

  test("garbage values fail closed rather than open", () => {
    const config = loadConfig({ ...base, ARGUS_ENABLE_GIT_PUSH: "banana" });
    expect(config.ARGUS_ENABLE_GIT_PUSH).toBe(false);
  });
});
