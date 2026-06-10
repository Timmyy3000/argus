import { describe, expect, test } from "bun:test";
import { buildDockerRunArgs } from "../src/sandbox/executor";

describe("buildDockerRunArgs", () => {
  test("wraps commands in a hardened workspace container", () => {
    const args = buildDockerRunArgs({
      image: "argus-sandbox:local",
      repoDir: "/tmp/repo",
      command: "bun",
      args: ["test"],
      env: { OPENAI_API_KEY: "test-key" },
      network: "bridge",
      limits: { memory: "2g", cpus: "2", pids: 512 },
    });

    expect(args).toEqual([
      "run",
      "--rm",
      "--network",
      "bridge",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--memory",
      "2g",
      "--cpus",
      "2",
      "--pids-limit",
      "512",
      "-v",
      "/tmp/repo:/workspace",
      "-w",
      "/workspace",
      "-e",
      "OPENAI_API_KEY=test-key",
      "argus-sandbox:local",
      "bun",
      "test",
    ]);
  });

  test("supports fully offline execution", () => {
    const args = buildDockerRunArgs({
      image: "argus-sandbox:local",
      repoDir: "/tmp/repo",
      command: "bun",
      args: ["test"],
      network: "none",
    });
    const networkIndex = args.indexOf("--network");
    expect(args[networkIndex + 1]).toBe("none");
  });
});
