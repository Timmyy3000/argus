export type ChangedFile = {
  /** git name-status letter: A, M, D, R, etc. */
  status: string;
  path: string;
};

export type MechanicalCheckResult = {
  passed: boolean;
  blockers: string[];
};

export const DEFAULT_MAX_DIFF_BYTES = 200_000;

const FORBIDDEN_PATH_PREFIXES = [".github/workflows/", ".agents/", ".argus/", ".git/"];

const SECRET_ADDITION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /AKIA[0-9A-Z]{16}/, label: "AWS access key id" },
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, label: "private key material" },
  { pattern: /ghp_[A-Za-z0-9_]{20,}/, label: "GitHub personal access token" },
  { pattern: /github_pat_[A-Za-z0-9_]{20,}/, label: "GitHub fine-grained token" },
  { pattern: /sk-[A-Za-z0-9_-]{20,}/, label: "API secret key" },
];

const TEST_FILE_PATTERN = /(^|\/)(tests?|spec|__tests__)(\/|\.)|\.(test|spec)\.[a-z]+$/i;

/**
 * Deterministic safety floor for every generated change, applied regardless of
 * whether LLM review is enabled. These checks defend against prompt injection in
 * issue bodies steering the agent toward CI workflows, agent config, deleted
 * tests, or embedded credentials.
 */
export function runMechanicalChecks(input: {
  diff: string;
  changedFiles: ChangedFile[];
  maxDiffBytes?: number;
}): MechanicalCheckResult {
  const blockers: string[] = [];
  const maxBytes = input.maxDiffBytes ?? DEFAULT_MAX_DIFF_BYTES;

  if (input.diff.length > maxBytes) {
    blockers.push(`Diff is ${input.diff.length} bytes, above the ${maxBytes} byte limit for automated publishing`);
  }

  for (const file of input.changedFiles) {
    const normalized = file.path.replace(/\\/g, "/");
    for (const prefix of FORBIDDEN_PATH_PREFIXES) {
      if (normalized.startsWith(prefix)) {
        blockers.push(`Change touches protected path ${file.path}`);
      }
    }
    if (file.status.startsWith("D") && TEST_FILE_PATTERN.test(normalized)) {
      blockers.push(`Change deletes test file ${file.path}`);
    }
  }

  const addedLines = input.diff
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"));
  for (const { pattern, label } of SECRET_ADDITION_PATTERNS) {
    if (addedLines.some((line) => pattern.test(line))) {
      blockers.push(`Change adds what looks like ${label}`);
    }
  }

  return { passed: blockers.length === 0, blockers: [...new Set(blockers)] };
}

export function parseNameStatus(output: string): ChangedFile[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split(/\t/);
      // Renames are "R100\told\tnew"; the new path is the one that matters.
      const path = rest[rest.length - 1] ?? "";
      return { status: status ?? "M", path };
    })
    .filter((file) => file.path.length > 0);
}
