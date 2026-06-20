/**
 * Review stage: a real, gated Codex pass over the committed diff, steered by
 * the operator's review.md. Runs on the Codex subscription (no API key), unlike
 * the legacy OpenAI llm-review. Codex writes a verdict JSON; Argus folds it into
 * the publish decision. If the pass can't run or its output won't parse, the
 * outcome is "degraded" so publishing downgrades to a draft rather than shipping
 * an unreviewed change as a normal PR.
 */

export type CodexReviewOutcome = {
  passed: boolean;
  summary: string;
  blockers: string[];
  degraded: boolean;
  skipped: boolean;
};

export function codexReviewOutputPath(): string {
  return ".argus/review.json";
}

export function buildCodexReviewPrompt(input: {
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  diff: string;
  reviewMd: string | null;
  outPath: string;
}): string {
  const diff = input.diff.length > 60_000 ? `${input.diff.slice(0, 60_000)}\n... [diff truncated] ...` : input.diff;
  return [
    "You are the review gate of an automated bug-fixing agent. Decide whether the committed diff below is safe and plausible enough to open a pull request automatically.",
    "Do NOT modify files, run git, or push. Only review and report.",
    "",
    input.reviewMd?.trim()
      ? `Apply these review standards:\n\n${input.reviewMd.trim()}`
      : [
          "Reject the change when any of these hold:",
          "- It does not plausibly address the issue.",
          "- It touches unrelated files, or is far larger than the issue requires.",
          "- It weakens or deletes tests/assertions instead of fixing the defect.",
          "- It introduces dangerous behavior (shelling out, network, credentials) the issue did not call for.",
        ].join("\n"),
    "",
    `## Issue #${input.issueNumber}: ${input.issueTitle}`,
    input.issueBody || "(no body)",
    "",
    "## Diff",
    "```diff",
    diff,
    "```",
    "",
    `When done, write ONLY this JSON (no prose, no code fence) to the file ${input.outPath}:`,
    `{"verdict": "approve" | "reject", "summary": "<1-2 sentences>", "blockers": ["<reason per problem, empty when approving>"]}`,
  ].join("\n");
}

function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : null;
}

/** Parse Codex's review verdict. Returns degraded outcome when missing/invalid. */
export function parseCodexReview(raw: string): CodexReviewOutcome {
  const json = extractJsonObject(raw);
  if (json) {
    try {
      const parsed = JSON.parse(json) as { verdict?: unknown; summary?: unknown; blockers?: unknown };
      const blockers = Array.isArray(parsed.blockers)
        ? parsed.blockers.filter((b): b is string => typeof b === "string")
        : [];
      const summary = typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : "No summary provided";
      if (parsed.verdict === "approve" && blockers.length === 0) {
        return { passed: true, summary, blockers: [], degraded: false, skipped: false };
      }
      if (parsed.verdict === "reject") {
        return { passed: false, summary, blockers: blockers.length > 0 ? blockers : [summary], degraded: false, skipped: false };
      }
    } catch {
      // fall through to degraded
    }
  }
  return {
    passed: false,
    summary: "Codex review output could not be parsed; downgrading to draft",
    blockers: [],
    degraded: true,
    skipped: false,
  };
}
