import { describe, expect, test } from "bun:test";
import { redactSecrets } from "../src/domain/redaction";

describe("redactSecrets", () => {
  test("redacts known token shapes and explicit secrets", () => {
    const output = redactSecrets(
      "OPENAI_API_KEY=sk-testsecretvalue123456789 github ghp_abc123xyz and custom-secret",
      ["custom-secret"],
    );

    expect(output).not.toContain("sk-testsecretvalue123456789");
    expect(output).not.toContain("ghp_abc123xyz");
    expect(output).not.toContain("custom-secret");
    expect(output).toContain("[REDACTED]");
  });
});

