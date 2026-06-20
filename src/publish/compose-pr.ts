/**
 * Publish stage: Codex authors the PR title + body to the operator's
 * conventions (publish.md), then Argus opens the PR. Codex only ever writes a
 * JSON file here — it never runs `gh`/push, which stay with Argus and its App
 * token. Falls back to the built-in template when publish.md is absent or the
 * agent's output can't be parsed.
 */

export type ComposedPr = { title: string; body: string };

const MAX_TITLE = 256;

export function composePrOutputPath(): string {
  return ".argus/pr.json";
}

export function buildComposePrompt(input: {
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  diff: string;
  validationSummary: string;
  reviewSummary: string;
  publishMd: string | null;
  outPath: string;
}): string {
  const diff = input.diff.length > 60_000 ? `${input.diff.slice(0, 60_000)}\n... [diff truncated] ...` : input.diff;
  return [
    "You are the publish stage of an automated bug-fixing agent. The change below is committed and validated. Write the pull request title and body.",
    "Do NOT run git, gh, or push anything. Your only job is to author the PR text.",
    "",
    input.publishMd?.trim()
      ? `Follow these PR conventions exactly:\n\n${input.publishMd.trim()}`
      : "Write a clear, conventional PR title and a concise body explaining what changed and why.",
    "",
    `## Issue #${input.issueNumber}: ${input.issueTitle}`,
    input.issueBody || "(no body)",
    "",
    `## Validation\n${input.validationSummary}`,
    `## Review\n${input.reviewSummary}`,
    "",
    "## Diff",
    "```diff",
    diff,
    "```",
    "",
    `When done, write ONLY this JSON (no prose, no code fence) to the file ${input.outPath}:`,
    `{"title": "<pr title>", "body": "<pr body markdown>"}`,
  ].join("\n");
}

function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : null;
}

/** Parse Codex's PR JSON. Returns null when missing/invalid so the runner falls back. */
export function parseComposedPr(raw: string): ComposedPr | null {
  const json = extractJsonObject(raw);
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { title, body } = parsed as { title?: unknown; body?: unknown };
  if (typeof title !== "string" || typeof body !== "string") return null;
  const cleanTitle = title.trim().replace(/\s+/g, " ").slice(0, MAX_TITLE);
  if (!cleanTitle || !body.trim()) return null;
  return { title: cleanTitle, body: body.trim() };
}
