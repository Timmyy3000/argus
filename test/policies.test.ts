import { describe, expect, test } from "bun:test";
import { actorRoleIsAllowed, labelTriggersPolicy } from "../src/domain/policies";

describe("repository policy helpers", () => {
  test("matches configured trigger label exactly", () => {
    expect(labelTriggersPolicy({ triggerLabel: "agent:fix" }, "agent:fix")).toBe(true);
    expect(labelTriggersPolicy({ triggerLabel: "agent:fix" }, "bug")).toBe(false);
  });

  test("allows only configured actor roles", () => {
    expect(actorRoleIsAllowed({ allowedRoles: ["admin", "write"] }, "write")).toBe(true);
    expect(actorRoleIsAllowed({ allowedRoles: ["admin", "write"] }, "read")).toBe(false);
    expect(actorRoleIsAllowed({ allowedRoles: ["admin", "write"] }, undefined)).toBe(false);
  });
});

