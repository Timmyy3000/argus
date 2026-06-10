export type JobSummary = {
  id: string;
  status: string;
  repository: string;
  issueNumber: number;
  triggerLabel: string;
  requestedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type JobDetail = JobSummary & {
  statusReason: string | null;
  currentAttempt: number;
  maxAttempts: number;
  queuedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  publishDecision: string | null;
  publishReason: string | null;
  pullRequest: { number: number; url: string; draft: boolean } | null;
  attempts: Array<{
    id: string;
    attemptNumber: number;
    status: string;
    workerId: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    error: string | null;
  }>;
  events: Array<{ type: string; message: string; createdAt: string }>;
  logs: Array<{ sequence: number; stream: string; redactedContent: string; createdAt: string }>;
  discovery: Array<Record<string, unknown>>;
  triage: Array<Record<string, unknown>>;
  validations: Array<Record<string, unknown>>;
  reviews: Array<Record<string, unknown>>;
};

export type Connection = {
  configured: boolean;
  source: string | null;
  slug: string | null;
  htmlUrl: string | null;
  installUrl: string | null;
  webhookUrl: string;
  gates: { triage: boolean; codex: boolean; llmReview: boolean; gitPush: boolean };
  installations: Array<{
    installationId: number;
    accountLogin: string;
    accountType: string;
    repositories: Array<{ fullName: string; private: boolean; triggerLabel: string }>;
  }>;
};

export type ManifestResponse = {
  postUrl: string;
  manifest: Record<string, unknown>;
  publicUrl: string;
};
