import { describe, expect, test } from "bun:test";
import { splitCommand } from "../src/system/command";

describe("splitCommand", () => {
  test("splits simple commands and quoted args", () => {
    expect(splitCommand("bun run typecheck")).toEqual({ executable: "bun", args: ["run", "typecheck"] });
    expect(splitCommand('python -m pytest "tests/unit tests"')).toEqual({
      executable: "python",
      args: ["-m", "pytest", "tests/unit tests"],
    });
  });
});

