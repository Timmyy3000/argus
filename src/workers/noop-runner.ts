import type { WorkerJob, WorkerRunner, WorkerRunResult } from "./types";

export class NoopWorkerRunner implements WorkerRunner {
  async run(job: WorkerJob): Promise<WorkerRunResult> {
    return {
      status: "needs_human",
      reason: `Worker execution is not implemented yet for job ${job.jobId}; attempt ${job.attemptId} was fenced successfully.`,
    };
  }
}

