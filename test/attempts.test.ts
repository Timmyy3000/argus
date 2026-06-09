import { describe, expect, test } from "bun:test";
import { leaseExpiryFromNow } from "../src/domain/attempts";

describe("attempt lifecycle helpers", () => {
  test("computes lease expiry from runtime policy", () => {
    const now = new Date("2026-06-09T10:00:00.000Z");
    expect(leaseExpiryFromNow(45, now).toISOString()).toBe("2026-06-09T10:45:00.000Z");
  });
});

