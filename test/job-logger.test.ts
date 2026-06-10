import { describe, expect, test } from "bun:test";
import { truncateForLog, MAX_LOG_CHUNK_CHARS } from "../src/workers/job-logger";

describe("truncateForLog", () => {
  test("returns short content unchanged", () => {
    expect(truncateForLog("hello world")).toBe("hello world");
  });

  test("keeps head and tail of oversized content", () => {
    const content = `START${"x".repeat(MAX_LOG_CHUNK_CHARS * 2)}END`;
    const truncated = truncateForLog(content);
    expect(truncated.length).toBeLessThanOrEqual(MAX_LOG_CHUNK_CHARS);
    expect(truncated.startsWith("START")).toBe(true);
    expect(truncated.endsWith("END")).toBe(true);
    expect(truncated).toContain("characters truncated");
  });
});
