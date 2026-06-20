import { describe, expect, test } from "bun:test";
import { GATE_KEYS, resolveGates, type Gates } from "../src/settings/settings";

const ALL_OFF: Gates = { triage: false, codex: false, llmReview: false, gitPush: false };

describe("resolveGates", () => {
  test("falls back to env defaults when nothing is stored", () => {
    const defaults: Gates = { triage: true, codex: true, llmReview: false, gitPush: true };
    expect(resolveGates([], defaults)).toEqual(defaults);
  });

  test("stored values override the env default per gate", () => {
    const rows = [
      { key: "gate.codex", value: "true" },
      { key: "gate.gitPush", value: "false" },
    ];
    expect(resolveGates(rows, ALL_OFF)).toEqual({
      triage: false,
      codex: true,
      llmReview: false,
      gitPush: false,
    });
  });

  test("only 'true' is truthy; any other stored string is off", () => {
    const rows = [
      { key: "gate.triage", value: "1" },
      { key: "gate.codex", value: "true" },
    ];
    const resolved = resolveGates(rows, ALL_OFF);
    expect(resolved.triage).toBe(false);
    expect(resolved.codex).toBe(true);
  });

  test("ignores unrelated setting keys", () => {
    const rows = [{ key: "something.else", value: "true" }];
    expect(resolveGates(rows, ALL_OFF)).toEqual(ALL_OFF);
  });

  test("covers exactly the four pipeline gates", () => {
    expect([...GATE_KEYS].sort()).toEqual(["codex", "gitPush", "llmReview", "triage"]);
  });
});
