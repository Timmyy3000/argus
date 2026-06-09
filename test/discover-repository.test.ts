import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverRepository } from "../src/discovery/discover";

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

async function tempRepo() {
  const root = await mkdtemp(join(tmpdir(), "resolver-discover-"));
  roots.push(root);
  return root;
}

describe("discoverRepository", () => {
  test("discovers Bun JavaScript commands from package scripts", async () => {
    const root = await tempRepo();
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ scripts: { test: "bun test", typecheck: "tsc --noEmit" } }),
    );
    await writeFile(join(root, "bun.lock"), "");

    const result = await discoverRepository(root);

    expect(result.confidence).toBe("high");
    expect(result.commands.install).toBe("bun install --frozen-lockfile");
    expect(result.commands.test).toBe("bun run test");
    expect(result.commands.typecheck).toBe("bun run typecheck");
  });

  test("uses .agents bug resolver discovered cache before heuristics", async () => {
    const root = await tempRepo();
    await mkdir(join(root, ".agents", "bug-resolver"), { recursive: true });
    await writeFile(
      join(root, ".agents", "bug-resolver", "discovered.yml"),
      "commands:\n  install: pnpm install --frozen-lockfile\n  test: pnpm test\n",
    );
    await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: "npm test" } }));

    const result = await discoverRepository(root);

    expect(result.source).toBe("discovered_cache");
    expect(result.commands.test).toBe("pnpm test");
  });

  test("discovers uv Python projects", async () => {
    const root = await tempRepo();
    await writeFile(join(root, "pyproject.toml"), "[project]\nname='x'\n[tool.pytest.ini_options]\n");
    await writeFile(join(root, "uv.lock"), "");

    const result = await discoverRepository(root);

    expect(result.confidence).toBe("high");
    expect(result.commands.install).toBe("uv sync");
    expect(result.commands.test).toBe("uv run pytest");
  });
});

