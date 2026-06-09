import { describe, expect, test } from "bun:test";
import { shouldWriteDiscoveredFile } from "../src/discovery/types";

describe("discovery policy", () => {
  test("writes discovered file only for high confidence successful validation", () => {
    expect(shouldWriteDiscoveredFile({ confidence: "high" }, true)).toBe(true);
    expect(shouldWriteDiscoveredFile({ confidence: "medium" }, true)).toBe(false);
    expect(shouldWriteDiscoveredFile({ confidence: "high" }, false)).toBe(false);
  });
});

