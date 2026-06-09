export type WorkerJob = {
  jobId: string;
  repositoryId: string;
  issueId: string;
  attemptId: string;
  attemptToken: string;
};

export type WorkerRunResult = {
  status: "completed" | "needs_human" | "implementation_failed";
  reason: string;
};

export interface WorkerRunner {
  run(job: WorkerJob): Promise<WorkerRunResult>;
}

