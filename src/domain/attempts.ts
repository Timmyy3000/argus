import { randomUUID } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import type { Db } from "../db/client";
import { jobAttempts, jobEvents, jobLogChunks, jobs, repositoryPolicies } from "../db/schema";
import { redactSecrets } from "./redaction";

export type StartedAttempt = typeof jobAttempts.$inferSelect;

export type TerminalJobStatus =
  | "discovery_failed"
  | "implementation_failed"
  | "validation_failed"
  | "review_failed"
  | "publish_failed"
  | "completed"
  | "cancelled"
  | "timed_out"
  | "needs_human";

/**
 * Leases are intentionally shorter than the job's max runtime: a healthy worker keeps
 * extending the lease via heartbeats, so a dead worker is detected within minutes
 * instead of after the full runtime budget.
 */
export const DEFAULT_LEASE_MINUTES = 10;

export function leaseExpiryFromNow(maxRuntimeMinutes: number, now = new Date()): Date {
  return new Date(now.getTime() + maxRuntimeMinutes * 60_000);
}

export async function startJobAttempt(
  db: Db,
  input: {
    jobId: string;
    workerId: string;
    maxRuntimeMinutes: number;
    leaseMinutes?: number;
  },
): Promise<StartedAttempt> {
  const job = await db.query.jobs.findFirst({
    where: eq(jobs.id, input.jobId),
  });
  if (!job) throw new Error(`Job ${input.jobId} not found`);
  if (job.status !== "queued") throw new Error(`Job ${input.jobId} is not queued`);

  const attemptNumber = job.currentAttempt + 1;
  const now = new Date();
  const leaseMinutes = Math.min(input.leaseMinutes ?? DEFAULT_LEASE_MINUTES, input.maxRuntimeMinutes);
  const leaseExpiresAt = leaseExpiryFromNow(leaseMinutes, now);
  const attemptToken = randomUUID();

  const [attempt] = await db
    .insert(jobAttempts)
    .values({
      jobId: input.jobId,
      attemptNumber,
      attemptToken,
      status: "running",
      workerId: input.workerId,
      leaseExpiresAt,
      heartbeatAt: now,
      startedAt: now,
    })
    .returning();

  if (!attempt) throw new Error(`Failed to create attempt for job ${input.jobId}`);

  await db
    .update(jobs)
    .set({
      status: "running",
      currentAttempt: attemptNumber,
      startedAt: job.startedAt ?? now,
      updatedAt: now,
      statusReason: "Worker attempt started",
    })
    .where(eq(jobs.id, input.jobId));

  await appendJobEvent(db, {
    jobId: input.jobId,
    type: "attempt.started",
    message: `Attempt ${attemptNumber} started by ${input.workerId}`,
    metadata: { attemptId: attempt.id, leaseExpiresAt: leaseExpiresAt.toISOString() },
  });

  return attempt;
}

export async function heartbeatAttempt(
  db: Db,
  input: {
    attemptToken: string;
    extendMinutes: number;
  },
): Promise<boolean> {
  const attempt = await db.query.jobAttempts.findFirst({
    where: eq(jobAttempts.attemptToken, input.attemptToken),
  });
  if (!attempt || attempt.status !== "running") return false;

  const now = new Date();
  const [updated] = await db
    .update(jobAttempts)
    .set({
      heartbeatAt: now,
      leaseExpiresAt: leaseExpiryFromNow(input.extendMinutes, now),
      updatedAt: now,
    })
    .where(and(eq(jobAttempts.id, attempt.id), eq(jobAttempts.attemptToken, input.attemptToken)))
    .returning();

  return Boolean(updated);
}

export async function finishAttempt(
  db: Db,
  input: {
    attemptToken: string;
    jobStatus: TerminalJobStatus;
    reason: string;
    attemptStatus?: "succeeded" | "failed" | "timed_out" | "cancelled";
  },
): Promise<boolean> {
  const attempt = await db.query.jobAttempts.findFirst({
    where: eq(jobAttempts.attemptToken, input.attemptToken),
  });
  if (!attempt || attempt.status !== "running") return false;

  const now = new Date();
  const attemptStatus = input.attemptStatus ?? (input.jobStatus === "completed" ? "succeeded" : "failed");

  const [updatedAttempt] = await db
    .update(jobAttempts)
    .set({
      status: attemptStatus,
      finishedAt: now,
      error: attemptStatus === "succeeded" ? null : input.reason,
      updatedAt: now,
    })
    .where(and(eq(jobAttempts.id, attempt.id), eq(jobAttempts.attemptToken, input.attemptToken)))
    .returning();

  if (!updatedAttempt) return false;

  await db
    .update(jobs)
    .set({
      status: input.jobStatus,
      statusReason: input.reason,
      finishedAt: now,
      updatedAt: now,
    })
    .where(eq(jobs.id, attempt.jobId));

  await appendJobEvent(db, {
    jobId: attempt.jobId,
    type: "attempt.finished",
    message: input.reason,
    metadata: { attemptId: attempt.id, attemptStatus, jobStatus: input.jobStatus },
  });

  return true;
}

export async function requeueJobForRetry(
  db: Db,
  input: {
    attemptToken: string;
    reason: string;
  },
): Promise<boolean> {
  const attempt = await db.query.jobAttempts.findFirst({
    where: eq(jobAttempts.attemptToken, input.attemptToken),
  });
  if (!attempt || attempt.status !== "running") return false;

  const now = new Date();
  const [updatedAttempt] = await db
    .update(jobAttempts)
    .set({
      status: "failed",
      finishedAt: now,
      error: input.reason,
      updatedAt: now,
    })
    .where(and(eq(jobAttempts.id, attempt.id), eq(jobAttempts.attemptToken, input.attemptToken)))
    .returning();
  if (!updatedAttempt) return false;

  await db
    .update(jobs)
    .set({
      status: "queued",
      statusReason: input.reason,
      updatedAt: now,
    })
    .where(eq(jobs.id, attempt.jobId));

  await appendJobEvent(db, {
    jobId: attempt.jobId,
    type: "attempt.requeued",
    message: input.reason,
    metadata: { attemptId: attempt.id },
  });

  return true;
}

export type ExpiredAttemptOutcome = {
  jobId: string;
  repositoryId: string;
  issueId: string;
  requeued: boolean;
};

export async function markExpiredAttempts(db: Db, now = new Date()): Promise<ExpiredAttemptOutcome[]> {
  const expired = await db
    .update(jobAttempts)
    .set({
      status: "stale",
      finishedAt: now,
      error: "Attempt lease expired",
      updatedAt: now,
    })
    .where(and(eq(jobAttempts.status, "running"), lt(jobAttempts.leaseExpiresAt, now)))
    .returning();

  const outcomes: ExpiredAttemptOutcome[] = [];
  for (const attempt of expired) {
    const job = await db.query.jobs.findFirst({ where: eq(jobs.id, attempt.jobId) });
    if (!job) continue;

    const requeued = job.currentAttempt < job.maxAttempts;
    await db
      .update(jobs)
      .set(
        requeued
          ? {
              status: "queued",
              statusReason: "Attempt lease expired; job requeued for another attempt",
              updatedAt: now,
            }
          : {
              status: "timed_out",
              statusReason: "Attempt lease expired",
              finishedAt: now,
              updatedAt: now,
            },
      )
      .where(eq(jobs.id, attempt.jobId));

    await appendJobEvent(db, {
      jobId: attempt.jobId,
      type: "attempt.stale",
      message: requeued ? "Attempt lease expired; job requeued" : "Attempt lease expired",
      metadata: { attemptId: attempt.id, requeued },
    });

    outcomes.push({ jobId: job.id, repositoryId: job.repositoryId, issueId: job.issueId, requeued });
  }

  return outcomes;
}

export async function appendJobEvent(
  db: Db,
  input: {
    jobId: string;
    type: string;
    message: string;
    metadata?: Record<string, unknown>;
  },
) {
  await db.insert(jobEvents).values({
    jobId: input.jobId,
    type: input.type,
    message: input.message,
    metadata: input.metadata ?? {},
  });
}

export async function appendRedactedLogChunk(
  db: Db,
  input: {
    jobId: string;
    attemptId?: string;
    sequence: number;
    stream: "stdout" | "stderr" | "system";
    content: string;
    additionalSecrets?: string[];
  },
) {
  await db.insert(jobLogChunks).values({
    jobId: input.jobId,
    attemptId: input.attemptId,
    sequence: input.sequence,
    stream: input.stream,
    redactedContent: redactSecrets(input.content, input.additionalSecrets),
  });
}

export async function getJobRuntimePolicy(
  db: Db,
  jobId: string,
): Promise<{ maxRuntimeMinutes: number; maxAttempts: number }> {
  const job = await db.query.jobs.findFirst({
    where: eq(jobs.id, jobId),
    with: { repository: true },
  });
  if (!job) throw new Error(`Job ${jobId} not found`);

  const policy = await db.query.repositoryPolicies.findFirst({
    where: eq(repositoryPolicies.repositoryId, job.repositoryId),
  });

  return {
    maxRuntimeMinutes: policy?.maxRuntimeMinutes ?? 45,
    maxAttempts: job.maxAttempts,
  };
}

