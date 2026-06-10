import { createDb } from "../db/client";
import {
  appendRedactedLogChunk,
  finishAttempt,
  getJobRuntimePolicy,
  heartbeatAttempt,
  markExpiredAttempts,
  requeueJobForRetry,
  startJobAttempt,
  DEFAULT_LEASE_MINUTES,
} from "../domain/attempts";
import { notifyJobOutcome } from "../github/outcome";
import { createBoss, enqueueIssueFix, ISSUE_FIX_QUEUE, type IssueFixJobPayload } from "../queue/boss";
import { IssueFixRunner } from "./issue-fix-runner";
import { decideAttemptOutcome } from "./retry";
import type { WorkerRunner, WorkerRunResult } from "./types";

const HEARTBEAT_INTERVAL_MS = 60_000;

export async function startWorkerLauncher(runner?: WorkerRunner) {
  const { db, client } = createDb();
  const activeRunner = runner ?? new IssueFixRunner(db);
  const boss = createBoss();
  await boss.start();
  await boss.createQueue(ISSUE_FIX_QUEUE);

  await boss.work<IssueFixJobPayload>(ISSUE_FIX_QUEUE, async ([job]) => {
    if (!job) return;

    const expired = await markExpiredAttempts(db);
    for (const outcome of expired) {
      if (outcome.requeued) {
        await enqueueIssueFix(boss, {
          jobId: outcome.jobId,
          repositoryId: outcome.repositoryId,
          issueId: outcome.issueId,
        });
      }
    }

    const workerId = `worker-${process.pid}`;
    const policy = await getJobRuntimePolicy(db, job.data.jobId);

    let attempt: Awaited<ReturnType<typeof startJobAttempt>>;
    try {
      attempt = await startJobAttempt(db, {
        jobId: job.data.jobId,
        workerId,
        maxRuntimeMinutes: policy.maxRuntimeMinutes,
      });
    } catch (error) {
      // The job was cancelled, completed, or claimed elsewhere between enqueue and lease.
      console.warn(`Skipping job ${job.data.jobId}: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    await appendRedactedLogChunk(db, {
      jobId: job.data.jobId,
      attemptId: attempt.id,
      sequence: 1,
      stream: "system",
      content: `Started attempt ${attempt.attemptNumber} with worker ${workerId}`,
    });

    const heartbeat = setInterval(() => {
      void heartbeatAttempt(db, {
        attemptToken: attempt.attemptToken,
        extendMinutes: DEFAULT_LEASE_MINUTES,
      }).catch(() => {});
    }, HEARTBEAT_INTERVAL_MS);

    let result: WorkerRunResult;
    try {
      result = await activeRunner.run({
        jobId: job.data.jobId,
        repositoryId: job.data.repositoryId,
        issueId: job.data.issueId,
        attemptId: attempt.id,
        attemptToken: attempt.attemptToken,
      });
    } catch (error) {
      result = {
        status: "implementation_failed",
        reason: `Worker crashed: ${error instanceof Error ? error.message : String(error)}`,
        retryable: true,
      };
    } finally {
      clearInterval(heartbeat);
    }

    await appendRedactedLogChunk(db, {
      jobId: job.data.jobId,
      attemptId: attempt.id,
      sequence: 1_000_000,
      stream: "system",
      content: result.reason,
    });

    const outcome = decideAttemptOutcome({
      result,
      attemptNumber: attempt.attemptNumber,
      maxAttempts: policy.maxAttempts,
    });

    if (outcome.action === "retry") {
      await requeueJobForRetry(db, { attemptToken: attempt.attemptToken, reason: outcome.reason });
      await enqueueIssueFix(boss, job.data);
      return;
    }

    await finishAttempt(db, {
      attemptToken: attempt.attemptToken,
      jobStatus: outcome.jobStatus,
      reason: result.reason,
    });

    try {
      await notifyJobOutcome(db, job.data.jobId, result);
    } catch (error) {
      await appendRedactedLogChunk(db, {
        jobId: job.data.jobId,
        attemptId: attempt.id,
        sequence: 1_000_001,
        stream: "system",
        content: `GitHub outcome comment failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
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
