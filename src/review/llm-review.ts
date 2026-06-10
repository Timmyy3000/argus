import type { AppConfig } from "../config";
import { completeJson, type LlmClientConfig } from "../llm/client";

export type LlmReviewOutcome = {
  passed: boolean;
  summary: string;
  blockers: string[];
  /**
   * True when LLM review was enabled but the model could not be reached.
   * The publish gate downgrades to a draft PR in that case rather than
   * publishing unreviewed code as a normal PR.
   */
  degraded: boolean;
  skipped: boolean;
};

const MAX_DIFF_PROMPT_CHARS = 60_000;

export function buildReviewPrompt(input: {
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  diff: string;
}): string {
  const diff =
    input.diff.length > MAX_DIFF_PROMPT_CHARS
      ? `${input.diff.slice(0, MAX_DIFF_PROMPT_CHARS)}\n... [diff truncated] ...`
      : input.diff;

  return [
    "You are the review gate of an automated bug-fixing agent. A code-generation step produced the diff below in response to the GitHub issue. Decide whether this change is safe and plausible enough to open a pull request automatically.",
    "",
    `## Issue #${input.issueNumber}: ${input.issueTitle}`,
    input.issueBody || "(no body)",
    "",
    "## Diff",
    "```diff",
    diff,
    "```",
    "",
    "Reject the change when any of these hold:",
    "- It does not plausibly address the issue.",
    "- It touches files unrelated to the issue, or is far larger than the issue requires.",
    "- It weakens or deletes tests or assertions instead of fixing the defect.",
    "- It introduces dangerous behavior (shelling out, network calls, credential handling) the issue did not call for.",
    "",
    'Respond with JSON only: {"verdict": "approve" | "reject", "summary": "<1-2 sentences>", "blockers": ["<reason for each problem found, empty when approving>"]}',
  ].join("\n");
}

type RawReviewResponse = {
  verdict?: string;
  summary?: string;
  blockers?: unknown;
};

export async function reviewDiffWithLlm(input: {
  issue: { number: number; title: string; body: string };
  diff: string;
  config: Pick<AppConfig, "ARGUS_ENABLE_LLM_REVIEW" | "ARGUS_LLM_MODEL" | "ARGUS_LLM_BASE_URL" | "OPENAI_API_KEY">;
  fetchImpl?: typeof fetch;
}): Promise<LlmReviewOutcome> {
  if (!input.config.ARGUS_ENABLE_LLM_REVIEW || !input.config.OPENAI_API_KEY) {
    return {
      passed: true,
      summary: "LLM review is disabled; mechanical checks only",
      blockers: [],
      degraded: false,
      skipped: true,
    };
  }

  const llmConfig: LlmClientConfig = {
    apiKey: input.config.OPENAI_API_KEY,
    baseUrl: input.config.ARGUS_LLM_BASE_URL,
    model: input.config.ARGUS_LLM_MODEL,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
  };

  try {
    const raw = await completeJson<RawReviewResponse>({
      config: llmConfig,
      messages: [
        {
          role: "user",
          content: buildReviewPrompt({
            issueNumber: input.issue.number,
            issueTitle: input.issue.title,
            issueBody: input.issue.body,
            diff: input.diff,
          }),
        },
      ],
    });

    const blockers = Array.isArray(raw.blockers)
      ? raw.blockers.filter((blocker): blocker is string => typeof blocker === "string")
      : [];
    const approved = raw.verdict === "approve" && blockers.length === 0;

    return {
      passed: approved,
      summary: typeof raw.summary === "string" && raw.summary.trim() ? raw.summary.trim() : "No summary provided",
      blockers,
      degraded: false,
      skipped: false,
    };
  } catch (error) {
    return {
      passed: true,
      summary: `LLM review was unavailable (${error instanceof Error ? error.message : String(error)}); publishing is downgraded to draft`,
      blockers: [],
      degraded: true,
      skipped: false,
    };
  }
}
