import { describe, expect, test } from "bun:test";
import { outcomeComment } from "../src/github/comments";

describe("outcomeComment", () => {
  test("formats needs-human outcomes clearly", () => {
    expect(outcomeComment({ status: "needs_human", reason: "validation failed" })).toContain(
      "Argus needs human attention",
    );
    expect(outcomeComment({ status: "needs_human", reason: "validation failed" })).toContain(
      "Status: `needs_human`",
    );
  });
});
