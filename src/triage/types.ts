export type TriageDecision = "attempt" | "needs_more_info" | "decline";

export type TriageCategory = "bug" | "feature" | "question" | "task" | "unknown";

export type TriageResult = {
  decision: TriageDecision;
  category: TriageCategory;
  reasoning: string;
  suspectFiles: string[];
  plan: string | null;
  source: "llm" | "heuristic";
};

export type TriageIssueInput = {
  number: number;
  title: string;
  body: string;
};
