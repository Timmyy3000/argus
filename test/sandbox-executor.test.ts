import { describe, expect, test } from "bun:test";
import { buildDockerRunArgs } from "../src/sandbox/executor";

describe("buildDockerRunArgs", () => {
  test("wraps commands in a no-network workspace container", () => {
    const args = buildDockerRunArgs({
      image: "resolver-sandbox:local",
      repoDir: "/tmp/repo",
      command: "bun",
      args: ["test"],
      env: { OPENAI_API_KEY: "test-key" },
    });

    expect(args).toEqual([
      "run",
      "--rm",
      "--network",
      "none",
      "-v",
      "/tmp/repo:/workspace",
      "-w",
      "/workspace",
      "-e",
      "OPENAI_API_KEY=test-key",
      "resolver-sandbox:local",
      "bun",
      "test",
    ]);
  });
});
