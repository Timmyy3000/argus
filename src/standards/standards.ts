import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { asc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { standardsFiles } from "../db/schema";

export type StandardsBundle = {
  agentsMd: string | null;
  skills: Array<{ name: string; description: string | null; content: string }>;
};

export type MaterializedStandards = {
  /** Skill index lines for the agent prompt, empty when nothing applies. */
  skillIndex: Array<{ path: string; name: string; description: string | null }>;
  agentsMdWritten: boolean;
  /**
   * Tracked files we appended to (a repo-owned AGENTS.md). git exclude only
   * hides untracked files, so the runner must `git restore` these before
   * staging or the operator's standards would ship in the PR diff.
   */
  restoreBeforeStaging: string[];
};

const SKILLS_DIR = ".argus/skills";
const ARGUS_SECTION_MARKER = "<!-- argus:standards -->";

export function skillSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "skill"
  );
}

export async function loadStandardsBundle(db: Db): Promise<StandardsBundle> {
  const rows = await db
    .select()
    .from(standardsFiles)
    .where(eq(standardsFiles.enabled, true))
    .orderBy(asc(standardsFiles.name));
  return {
    agentsMd: rows.find((row) => row.kind === "agents")?.content ?? null,
    skills: rows
      .filter((row) => row.kind === "skill")
      .map((row) => ({ name: row.name, description: row.description, content: row.content })),
  };
}

/**
 * Writes the operator's standards into a freshly cloned workspace. The agent
 * sees them (Codex reads AGENTS.md natively; skills are indexed in the
 * prompt), but git never does: every injected path goes into
 * .git/info/exclude, which—unlike .gitignore—is not itself a working-tree
 * file, so nothing about the standards can leak into the PR diff.
 */
export async function materializeStandards(bundle: StandardsBundle, repoDir: string): Promise<MaterializedStandards> {
  const excluded: string[] = [];
  const restoreBeforeStaging: string[] = [];
  let agentsMdWritten = false;

  if (bundle.agentsMd?.trim()) {
    const agentsPath = join(repoDir, "AGENTS.md");
    const existing = await readFile(agentsPath, "utf8").catch(() => null);
    const section = `${ARGUS_SECTION_MARKER}\n\n${bundle.agentsMd.trim()}\n`;
    if (existing === null) {
      await writeFile(agentsPath, section);
      excluded.push("AGENTS.md");
    } else if (!existing.includes(ARGUS_SECTION_MARKER)) {
      // The repo owns its AGENTS.md; ours rides along as an appended section
      // and gets restored before staging.
      await writeFile(agentsPath, `${existing.trimEnd()}\n\n${section}`);
      restoreBeforeStaging.push("AGENTS.md");
    }
    agentsMdWritten = true;
  }

  for (const skill of bundle.skills) {
    const dir = join(repoDir, SKILLS_DIR, skillSlug(skill.name));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "SKILL.md"), skill.content);
  }
  if (bundle.skills.length > 0) excluded.push(".argus/");

  if (excluded.length > 0) {
    await mkdir(join(repoDir, ".git", "info"), { recursive: true });
    await appendFile(join(repoDir, ".git", "info", "exclude"), `\n${excluded.join("\n")}\n`);
  }

  return {
    agentsMdWritten,
    restoreBeforeStaging,
    skillIndex: bundle.skills.map((skill) => ({
      path: `${SKILLS_DIR}/${skillSlug(skill.name)}/SKILL.md`,
      name: skill.name,
      description: skill.description,
    })),
  };
}

/** Prompt section pointing the agent at materialized skills. */
export function renderSkillIndex(skills: MaterializedStandards["skillIndex"]): string {
  if (skills.length === 0) return "";
  const lines = skills.map(
    (skill) => `- ${skill.path} — ${skill.name}${skill.description ? `: ${skill.description}` : ""}`,
  );
  return [
    "Team skills are available in this workspace. Before doing the kind of work a skill covers, read its SKILL.md and follow it:",
    ...lines,
  ].join("\n");
}
