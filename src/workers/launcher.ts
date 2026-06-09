import { createDb } from "../db/client";
import {
  appendRedactedLogChunk,
  finishAttempt,
  getJobRuntimePolicy,
  markExpiredAttempts,
  startJobAttempt,
  type TerminalJobStatus,
} from "../domain/attempts";
import { createBoss, ISSUE_FIX_QUEUE, type IssueFixJobPayload } from "../queue/boss";
import { NoopWorkerRunner } from "./noop-runner";
import type { WorkerRunner } from "./types";

export async function startWorkerLauncher(runner: WorkerRunner = new NoopWorkerRunner()) {
  const { db, client } = createDb();
  const boss = createBoss();
  await boss.start();
  await boss.createQueue(ISSUE_FIX_QUEUE);

  await boss.work<IssueFixJobPayload>(ISSUE_FIX_QUEUE, async ([job]) => {
    if (!job) return;
    await markExpiredAttempts(db);

    const workerId = `worker-${process.pid}`;
    const policy = await getJobRuntimePolicy(db, job.data.jobId);
    const attempt = await startJobAttempt(db, {
      jobId: job.data.jobId,
      workerId,
      maxRuntimeMinutes: policy.maxRuntimeMinutes,
    });

    await appendRedactedLogChunk(db, {
      jobId: job.data.jobId,
      attemptId: attempt.id,
      sequence: 1,
      stream: "system",
      content: `Started attempt ${attempt.attemptNumber} with worker ${workerId}`,
    });

    const result = await runner.run({
      jobId: job.data.jobId,
      repositoryId: job.data.repositoryId,
      issueId: job.data.issueId,
      attemptId: attempt.id,
      attemptToken: attempt.attemptToken,
    });

    const jobStatus: TerminalJobStatus =
      result.status === "completed"
        ? "completed"
        : result.status === "needs_human"
          ? "needs_human"
          : "implementation_failed";

    await appendRedactedLogChunk(db, {
      jobId: job.data.jobId,
      attemptId: attempt.id,
      sequence: 2,
      stream: "system",
      content: result.reason,
    });

    await finishAttempt(db, {
      attemptToken: attempt.attemptToken,
      jobStatus,
      reason: result.reason,
    });
  });

  const shutdown = async () => {
    await boss.stop();
    await client.end();
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

if (import.meta.main) {
  await startWorkerLauncher();
}
