import type { AppConfig } from "../config";
import { completeJson, type LlmClientConfig } from "../llm/client";
import { buildRepoContext, type RepoContext } from "./context";
import type { TriageCategory, TriageDecision, TriageIssueInput, TriageResult } from "./types";

const MIN_ACTIONABLE_BODY_CHARS = 40;

/**
 * Deterministic fallback used when LLM triage is disabled or unavailable. It is
 * deliberately permissive: the review and publish gates downstream are the real
 * quality filters, triage only screens out clearly unactionable issues.
 */
export function heuristicTriage(issue: TriageIssueInput, context?: RepoContext): TriageResult {
  const body = issue.body.trim();
  const suspectFiles = context?.matchedFiles ?? [];

  if (body.length < MIN_ACTIONABLE_BODY_CHARS && suspectFiles.length === 0) {
    return {
      decision: "needs_more_info",
      category: guessCategory(issue),
      reasoning:
        "The issue body is too short to act on. Please describe the expected behavior, the actual behavior, and steps to reproduce.",
      suspectFiles: [],
      plan: null,
      source: "heuristic",
    };
  }

  return {
    decision: "attempt",
    category: guessCategory(issue),
    reasoning: "Heuristic triage: the issue has enough detail to attempt an automated fix.",
    suspectFiles,
    plan: null,
    source: "heuristic",
  };
}

export function guessCategory(issue: TriageIssueInput): TriageCategory {
  const text = `${issue.title}\n${issue.body}`.toLowerCase();
  if (/\b(bug|error|crash|exception|broken|fails?|failure|regression|traceback|stack trace)\b/.test(text)) return "bug";
  if (/\b(feature|enhancement|proposal|add support|would be nice)\b/.test(text)) return "feature";
  if (/^(how|why|what|can i|is it possible)\b/.test(issue.title.toLowerCase()) || text.includes("question")) {
    return "question";
  }
  return "unknown";
}

export function buildTriagePrompt(issue: TriageIssueInput, context: RepoContext): string {
  const treeSample = context.fileTree.slice(0, 400).join("\n");
  return [
    `You are the triage stage of an automated bug-fixing agent. Decide whether the GitHub issue below is actionable for an automated code-change attempt in this repository.`,
    "",
    `## Issue #${issue.number}: ${issue.title}`,
    issue.body || "(no body)",
    "",
    "## Repository files (sample)",
    treeSample,
    "",
    context.matchedFiles.length > 0 ? `## Files matching terms in the issue\n${context.matchedFiles.join("\n")}` : "",
    "",
    "Respond with JSON only, using exactly these keys:",
    `{"decision": "attempt" | "needs_more_info" | "decline", "category": "bug" | "feature" | "question" | "task" | "unknown", "reasoning": "<1-3 sentences, shown to the issue author>", "suspect_files": ["<repo-relative paths most likely involved>"], "plan": "<short step-by-step fix plan, or null>"}`,
    "",
    "Guidance:",
    "- 'attempt' only when the issue describes a concrete defect or small, well-scoped change.",
    "- 'needs_more_info' when reproduction steps or expected behavior are missing; the reasoning should say exactly what is needed.",
    "- 'decline' for questions, large features, or anything unsafe to attempt automatically.",
  ]
    .filter(Boolean)
    .join("\n");
}

const VALID_DECISIONS: TriageDecision[] = ["attempt", "needs_more_info", "decline"];
const VALID_CATEGORIES: TriageCategory[] = ["bug", "feature", "question", "task", "unknown"];

type RawTriageResponse = {
  decision?: string;
  category?: string;
  reasoning?: string;
  suspect_files?: unknown;
  plan?: string | null;
};

export function parseTriageResponse(raw: RawTriageResponse): Omit<TriageResult, "source"> {
  const decision = VALID_DECISIONS.includes(raw.decision as TriageDecision)
    ? (raw.decision as TriageDecision)
    : "needs_more_info";
  const category = VALID_CATEGORIES.includes(raw.category as TriageCategory)
    ? (raw.category as TriageCategory)
    : "unknown";
  const suspectFiles = Array.isArray(raw.suspect_files)
    ? raw.suspect_files.filter((file): file is string => typeof file === "string").slice(0, 20)
    : [];

  return {
    decision,
    category,
    reasoning: typeof raw.reasoning === "string" && raw.reasoning.trim() ? raw.reasoning.trim() : "No reasoning provided",
    suspectFiles,
    plan: typeof raw.plan === "string" && raw.plan.trim() ? raw.plan.trim() : null,
  };
}

export async function triageIssue(input: {
  issue: TriageIssueInput;
  repoDir: string;
  config: Pick<AppConfig, "ARGUS_ENABLE_TRIAGE" | "ARGUS_LLM_MODEL" | "ARGUS_LLM_BASE_URL" | "OPENAI_API_KEY">;
  fetchImpl?: typeof fetch;
}): Promise<TriageResult> {
  const context = await buildRepoContext(input.repoDir, `${input.issue.title}\n${input.issue.body}`);

  if (!input.config.ARGUS_ENABLE_TRIAGE || !input.config.OPENAI_API_KEY) {
    return heuristicTriage(input.issue, context);
  }

  const llmConfig: LlmClientConfig = {
    apiKey: input.config.OPENAI_API_KEY,
    baseUrl: input.config.ARGUS_LLM_BASE_URL,
    model: input.config.ARGUS_LLM_MODEL,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
  };

  try {
    const raw = await completeJson<RawTriageResponse>({
      config: llmConfig,
      messages: [{ role: "user", content: buildTriagePrompt(input.issue, context) }],
    });
    const parsed = parseTriageResponse(raw);
    return {
      ...parsed,
      suspectFiles: parsed.suspectFiles.length > 0 ? parsed.suspectFiles : context.matchedFiles,
      source: "llm",
    };
  } catch {
    // Never fail the whole job because the triage model was unavailable.
    return heuristicTriage(input.issue, context);
  }
}
