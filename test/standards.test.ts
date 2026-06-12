import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materializeStandards, renderSkillIndex, skillSlug } from "../src/standards/standards";

async function makeRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "argus-standards-"));
  await mkdir(join(dir, ".git", "info"), { recursive: true });
  return dir;
}

describe("skillSlug", () => {
  test("normalizes names to directory-safe slugs", () => {
    expect(skillSlug("Code Review")).toBe("code-review");
    expect(skillSlug("  Writing PRs!! ")).toBe("writing-prs");
    expect(skillSlug("***")).toBe("skill");
  });
});

describe("materializeStandards", () => {
  test("writes AGENTS.md and skills, excluding them from git", async () => {
    const repo = await makeRepo();
    const result = await materializeStandards(
      {
        agentsMd: "Always open PRs against dev.",
        skills: [{ name: "Code Review", description: "house review style", content: "# Review\nBe kind." }],
      },
      repo,
    );

    expect(result.agentsMdWritten).toBe(true);
    expect(result.restoreBeforeStaging).toEqual([]);
    expect(await readFile(join(repo, "AGENTS.md"), "utf8")).toContain("Always open PRs against dev.");
    expect(await readFile(join(repo, ".argus", "skills", "code-review", "SKILL.md"), "utf8")).toBe(
      "# Review\nBe kind.",
    );

    const exclude = await readFile(join(repo, ".git", "info", "exclude"), "utf8");
    expect(exclude).toContain("AGENTS.md");
    expect(exclude).toContain(".argus/");
  });

  test("appends to a repo-owned AGENTS.md and flags it for restore", async () => {
    const repo = await makeRepo();
    await writeFile(join(repo, "AGENTS.md"), "# Repo rules\nUse tabs.\n");

    const result = await materializeStandards({ agentsMd: "Company PR rules.", skills: [] }, repo);

    expect(result.restoreBeforeStaging).toEqual(["AGENTS.md"]);
    const merged = await readFile(join(repo, "AGENTS.md"), "utf8");
    expect(merged).toContain("Use tabs.");
    expect(merged).toContain("Company PR rules.");
  });

  test("does nothing for an empty bundle", async () => {
    const repo = await makeRepo();
    const result = await materializeStandards({ agentsMd: null, skills: [] }, repo);
    expect(result.agentsMdWritten).toBe(false);
    expect(result.skillIndex).toEqual([]);
    await expect(readFile(join(repo, "AGENTS.md"), "utf8")).rejects.toThrow();
  });
});

describe("renderSkillIndex", () => {
  test("returns an empty string with no skills", () => {
    expect(renderSkillIndex([])).toBe("");
  });

  test("lists each skill with its path and description", () => {
    const section = renderSkillIndex([
      { path: ".argus/skills/code-review/SKILL.md", name: "Code Review", description: "house style" },
      { path: ".argus/skills/testing/SKILL.md", name: "Testing", description: null },
    ]);
    expect(section).toContain(".argus/skills/code-review/SKILL.md — Code Review: house style");
    expect(section).toContain(".argus/skills/testing/SKILL.md — Testing");
  });
});
