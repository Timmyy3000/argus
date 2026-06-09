import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { DiscoveryEvidence, DiscoveryResult, DiscoverySource } from "./types";

type PackageJson = {
  scripts?: Record<string, string>;
  packageManager?: string;
};

export async function discoverRepository(root: string): Promise<DiscoveryResult> {
  const guidance = await readAgentGuidance(root);
  if (guidance) return guidance;

  const evidence: DiscoveryEvidence[] = [];
  const packageResult = await discoverJavaScript(root, evidence);
  if (packageResult) return packageResult;

  const pythonResult = await discoverPython(root, evidence);
  if (pythonResult) return pythonResult;

  const makeResult = await discoverMakefile(root, evidence);
  if (makeResult) return makeResult;

  return {
    commands: {},
    confidence: "low",
    evidence: [{ source: "heuristic", detail: "No known project manifest or agent guidance found" }],
    source: "heuristic",
    shouldWriteDiscoveredFile: false,
  };
}

async function readAgentGuidance(root: string): Promise<DiscoveryResult | null> {
  const discoveredPath = join(root, ".agents", "bug-resolver", "discovered.yml");
  const instructionsPath = join(root, ".agents", "bug-resolver", "instructions.md");

  if (existsSync(discoveredPath)) {
    const text = await readFile(discoveredPath, "utf8");
    const commands = parseSimpleCommandsYaml(text);
    return {
      commands,
      confidence: "high",
      evidence: [{ source: discoveredPath, detail: "Existing bug-resolver discovered command cache" }],
      source: "discovered_cache",
      shouldWriteDiscoveredFile: false,
    };
  }

  if (existsSync(instructionsPath)) {
    const text = await readFile(instructionsPath, "utf8");
    const commands = parseCommandsFromInstructions(text);
    return {
      commands,
      confidence: Object.keys(commands).length > 0 ? "medium" : "low",
      evidence: [{ source: instructionsPath, detail: "Bug-resolver instructions were present" }],
      source: "agents_guidance",
      shouldWriteDiscoveredFile: false,
    };
  }

  return null;
}

async function discoverJavaScript(root: string, evidence: DiscoveryEvidence[]): Promise<DiscoveryResult | null> {
  const packagePath = join(root, "package.json");
  if (!existsSync(packagePath)) return null;

  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as PackageJson;
  evidence.push({ source: "package.json", detail: "Found JavaScript package manifest" });

  const packageManager = detectPackageManager(root, packageJson, evidence);
  const scripts = packageJson.scripts ?? {};

  return {
    commands: {
      install: installCommand(packageManager),
      test: scripts.test ? `${packageManager} run test` : null,
      typecheck: scripts.typecheck ? `${packageManager} run typecheck` : null,
      lint: scripts.lint ? `${packageManager} run lint` : null,
    },
    confidence: scripts.test || scripts.typecheck ? "high" : "medium",
    evidence,
    source: "manifest",
    shouldWriteDiscoveredFile: false,
  };
}

async function discoverPython(root: string, evidence: DiscoveryEvidence[]): Promise<DiscoveryResult | null> {
  const hasPyproject = existsSync(join(root, "pyproject.toml"));
  const hasUvLock = existsSync(join(root, "uv.lock"));
  const hasRequirements = existsSync(join(root, "requirements.txt"));
  const hasPytest = existsSync(join(root, "pytest.ini"));

  if (!hasPyproject && !hasUvLock && !hasRequirements && !hasPytest) return null;

  if (hasUvLock) evidence.push({ source: "uv.lock", detail: "Found uv lockfile" });
  if (hasPyproject) evidence.push({ source: "pyproject.toml", detail: "Found Python project manifest" });
  if (hasRequirements) evidence.push({ source: "requirements.txt", detail: "Found pip requirements file" });
  if (hasPytest) evidence.push({ source: "pytest.ini", detail: "Found pytest configuration" });

  const usesUv = hasUvLock || (hasPyproject && (await fileContains(join(root, "pyproject.toml"), "uv")));

  return {
    commands: {
      install: usesUv ? "uv sync" : hasRequirements ? "python -m pip install -r requirements.txt" : null,
      test: usesUv ? "uv run pytest" : "python -m pytest",
      typecheck: await pythonHasTool(root, "mypy") ? (usesUv ? "uv run mypy ." : "python -m mypy .") : null,
      lint: await pythonHasTool(root, "ruff") ? (usesUv ? "uv run ruff check ." : "python -m ruff check .") : null,
    },
    confidence: hasPytest || hasPyproject ? "high" : "medium",
    evidence,
    source: "manifest",
    shouldWriteDiscoveredFile: false,
  };
}

async function discoverMakefile(root: string, evidence: DiscoveryEvidence[]): Promise<DiscoveryResult | null> {
  const makefilePath = join(root, "Makefile");
  if (!existsSync(makefilePath)) return null;

  const text = await readFile(makefilePath, "utf8");
  evidence.push({ source: "Makefile", detail: "Found Makefile" });

  return {
    commands: {
      install: targetExists(text, "install") ? "make install" : null,
      test: targetExists(text, "test") ? "make test" : null,
      typecheck: targetExists(text, "typecheck") ? "make typecheck" : null,
      lint: targetExists(text, "lint") ? "make lint" : null,
    },
    confidence: targetExists(text, "test") ? "medium" : "low",
    evidence,
    source: "manifest",
    shouldWriteDiscoveredFile: false,
  };
}

function detectPackageManager(root: string, packageJson: PackageJson, evidence: DiscoveryEvidence[]): string {
  if (existsSync(join(root, "bun.lock")) || existsSync(join(root, "bun.lockb"))) {
    evidence.push({ source: "bun.lock", detail: "Using Bun package manager" });
    return "bun";
  }
  if (existsSync(join(root, "pnpm-lock.yaml"))) {
    evidence.push({ source: "pnpm-lock.yaml", detail: "Using pnpm package manager" });
    return "pnpm";
  }
  if (existsSync(join(root, "yarn.lock"))) {
    evidence.push({ source: "yarn.lock", detail: "Using yarn package manager" });
    return "yarn";
  }
  if (packageJson.packageManager?.startsWith("pnpm")) return "pnpm";
  if (packageJson.packageManager?.startsWith("yarn")) return "yarn";
  if (packageJson.packageManager?.startsWith("bun")) return "bun";
  return "npm";
}

function installCommand(packageManager: string): string {
  switch (packageManager) {
    case "bun":
      return "bun install --frozen-lockfile";
    case "pnpm":
      return "pnpm install --frozen-lockfile";
    case "yarn":
      return "yarn install --frozen-lockfile";
    default:
      return "npm ci";
  }
}

function parseSimpleCommandsYaml(text: string): Record<string, string | null> {
  const commands: Record<string, string | null> = {};
  let inCommands = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^commands:\s*$/.test(line)) {
      inCommands = true;
      continue;
    }
    if (inCommands && /^\S/.test(line)) break;
    const match = inCommands ? line.match(/^\s{2}(install|test|typecheck|lint):\s*(.+)$/) : null;
    if (match?.[1] && match[2]) {
      commands[match[1] as keyof typeof commands] = match[2] === "null" ? null : stripQuotes(match[2]);
    }
  }
  return commands;
}

function parseCommandsFromInstructions(text: string): Record<string, string | null> {
  const commands: Record<string, string | null> = {};
  for (const key of ["install", "test", "typecheck", "lint"] as const) {
    const match = text.match(new RegExp(`${key}[^\\n\`]*\`([^\`]+)\``, "i"));
    if (match?.[1]) commands[key] = match[1];
  }
  return commands;
}

async function fileContains(path: string, pattern: string): Promise<boolean> {
  if (!existsSync(path)) return false;
  return (await readFile(path, "utf8")).includes(pattern);
}

async function pythonHasTool(root: string, tool: string): Promise<boolean> {
  const files = ["pyproject.toml", "requirements.txt"];
  for (const file of files) {
    if (await fileContains(join(root, file), tool)) return true;
  }
  return false;
}

function targetExists(makefile: string, target: string): boolean {
  return new RegExp(`^${target}:`, "m").test(makefile);
}

function stripQuotes(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

export async function listRepoFiles(root: string): Promise<string[]> {
  return readdir(root);
}
