import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature } from "../src/github/webhook";

describe("verifyWebhookSignature", () => {
  test("accepts a valid GitHub sha256 signature", async () => {
    const secret = "webhook-secret";
    const body = JSON.stringify({ action: "labeled" });
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

    await expect(verifyWebhookSignature({ secret, body, signature })).resolves.toBe(true);
  });

  test("rejects an invalid signature", async () => {
    await expect(
      verifyWebhookSignature({
        secret: "webhook-secret",
        body: JSON.stringify({ action: "labeled" }),
        signature: "sha256=bad",
      }),
    ).resolves.toBe(false);
  });
});

