import { readdir } from "node:fs/promises";
import { join } from "node:path";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  "target",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
  ".next",
  ".turbo",
]);

const MAX_TREE_ENTRIES = 2_000;
const MAX_TREE_DEPTH = 6;

export type RepoContext = {
  /** Relative paths, capped at MAX_TREE_ENTRIES, for orientation in prompts. */
  fileTree: string[];
  /** Files whose path matches a token mentioned in the issue. */
  matchedFiles: string[];
  /** Code-ish tokens extracted from the issue text. */
  issueTokens: string[];
};

export async function buildRepoContext(repoDir: string, issueText: string): Promise<RepoContext> {
  const fileTree = await listFilesRecursive(repoDir);
  const issueTokens = extractIssueTokens(issueText);
  const matchedFiles = matchFiles(fileTree, issueTokens);
  return { fileTree, matchedFiles, issueTokens };
}

/**
 * Pulls out things that look like code references: explicit paths, backticked
 * identifiers, stack-frame file names, and CamelCase/snake_case symbols.
 */
export function extractIssueTokens(issueText: string): string[] {
  const tokens = new Set<string>();

  for (const match of issueText.matchAll(/[\w./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|cs|php|c|cc|cpp|h|hpp|css|scss|html|vue|svelte|sql|yml|yaml|toml|json|md)\b/gi)) {
    tokens.add(match[0].replace(/^[./]+/, ""));
  }

  for (const match of issueText.matchAll(/`([^`\n]{2,80})`/g)) {
    const inner = match[1];
    if (inner && /^[\w.$/-]+(?:\(\))?$/.test(inner)) tokens.add(inner.replace(/\(\)$/, ""));
  }

  for (const match of issueText.matchAll(/\b([a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*|[a-z][a-z0-9]+(?:_[a-z0-9]+)+)\b/g)) {
    if (match[1] && match[1].length >= 6) tokens.add(match[1]);
  }

  return [...tokens].slice(0, 50);
}

export function matchFiles(fileTree: string[], tokens: string[]): string[] {
  if (tokens.length === 0) return [];
  const lowered = tokens.map((token) => token.toLowerCase());
  const matched = new Set<string>();

  for (const file of fileTree) {
    const fileLower = file.toLowerCase();
    const baseName = fileLower.split("/").pop() ?? fileLower;
    const baseNoExt = baseName.replace(/\.[^.]+$/, "");
    for (const token of lowered) {
      const tokenBase = token.split("/").pop() ?? token;
      if (fileLower.endsWith(token) || baseName === tokenBase || (tokenBase.length >= 6 && baseNoExt.includes(tokenBase))) {
        matched.add(file);
        break;
      }
    }
  }

  return [...matched].slice(0, 20);
}

async function listFilesRecursive(root: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string, prefix: string, depth: number): Promise<void> {
    if (depth > MAX_TREE_DEPTH || files.length >= MAX_TREE_ENTRIES) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= MAX_TREE_ENTRIES) return;
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name) || entry.name.startsWith(".")) continue;
        await walk(join(dir, entry.name), `${prefix}${entry.name}/`, depth + 1);
      } else {
        files.push(`${prefix}${entry.name}`);
      }
    }
  }

  await walk(root, "", 0);
  return files;
}
