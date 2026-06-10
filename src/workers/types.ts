export type WorkerJob = {
  jobId: string;
  repositoryId: string;
  issueId: string;
  attemptId: string;
  attemptToken: string;
};

export type WorkerRunResult = {
  status:
    | "completed"
    | "needs_human"
    | "discovery_failed"
    | "implementation_failed"
    | "validation_failed"
    | "review_failed"
    | "publish_failed";
  reason: string;
  /** Transient failures (network, clone, push) may be retried up to the job's maxAttempts. */
  retryable?: boolean;
};

export interface WorkerRunner {
  run(job: WorkerJob): Promise<WorkerRunResult>;
}
