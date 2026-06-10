type JobListInput = {
  id: string;
  status: string;
  repository: { fullName: string };
  issue: { number: number };
  triggerLabel: string;
  requestedBy: string;
  createdAt: Date;
  updatedAt: Date;
};

type JobDetailInput = {
  job: JobListInput & {
    statusReason: string | null;
    currentAttempt: number;
    maxAttempts: number;
    queuedAt: Date | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    publishDecision: string | null;
    publishReason: string | null;
  };
  attempts: Array<{
    id: string;
    attemptNumber: number;
    status: string;
    workerId: string | null;
    leaseExpiresAt: Date | null;
    heartbeatAt: Date | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    error: string | null;
  }>;
  events: Array<{ type: string; message: string; metadata: Record<string, unknown>; createdAt: Date }>;
  logs: Array<{
    attemptId: string | null;
    sequence: number;
    stream: string;
    redactedContent: string;
    createdAt: Date;
  }>;
  discovery: Array<Record<string, unknown>>;
  triage?: Array<Record<string, unknown>>;
  validations: Array<Record<string, unknown>>;
  reviews: Array<Record<string, unknown>>;
  pullRequest?: { number: number; url: string; draft: boolean } | null;
};

export function presentJobListItem(job: JobListInput) {
  return {
    id: job.id,
    status: job.status,
    repository: job.repository.fullName,
    issueNumber: job.issue.number,
    triggerLabel: job.triggerLabel,
    requestedBy: job.requestedBy,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export function presentJobDetail(input: JobDetailInput) {
  return {
    ...presentJobListItem(input.job),
    statusReason: input.job.statusReason,
    currentAttempt: input.job.currentAttempt,
    maxAttempts: input.job.maxAttempts,
    queuedAt: input.job.queuedAt,
    startedAt: input.job.startedAt,
    finishedAt: input.job.finishedAt,
    publishDecision: input.job.publishDecision,
    publishReason: input.job.publishReason,
    pullRequest: input.pullRequest
      ? {
          number: input.pullRequest.number,
          url: input.pullRequest.url,
          draft: input.pullRequest.draft,
        }
      : null,
    attempts: input.attempts,
    events: input.events,
    logs: input.logs,
    discovery: input.discovery,
    triage: input.triage ?? [],
    validations: input.validations,
    reviews: input.reviews,
  };
}
