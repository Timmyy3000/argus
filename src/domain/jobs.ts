import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  githubInstallations,
  issues,
  jobEvents,
  jobs,
  repositories,
  webhookDeliveries,
} from "../db/schema";
import { ensureRepositoryPolicy, type RepositoryPolicy } from "./policies";

export type GitHubIssueInput = {
  githubId: number;
  number: number;
  title: string;
  state: string;
  authorLogin: string;
  body?: string | null;
};

export type GitHubRepositoryInput = {
  githubId: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch?: string;
  private?: boolean;
};

export type GitHubInstallationInput = {
  installationId: number;
  accountLogin: string;
  accountType: string;
};

export async function recordWebhookDelivery(
  db: Db,
  input: {
    deliveryId: string;
    eventName: string;
    action?: string;
    repositoryFullName?: string;
  },
) {
  const [delivery] = await db
    .insert(webhookDeliveries)
    .values(input)
    .onConflictDoNothing({ target: webhookDeliveries.deliveryId })
    .returning();

  if (delivery) return { delivery, duplicate: false };

  const existing = await db.query.webhookDeliveries.findFirst({
    where: eq(webhookDeliveries.deliveryId, input.deliveryId),
  });
  if (!existing) throw new Error(`Failed to record webhook delivery ${input.deliveryId}`);
  return { delivery: existing, duplicate: true };
}

export async function markWebhookDelivery(
  db: Db,
  deliveryId: string,
  result: string,
  error?: string,
): Promise<void> {
  await db
    .update(webhookDeliveries)
    .set({ processed: true, result, error })
    .where(eq(webhookDeliveries.deliveryId, deliveryId));
}

export async function upsertInstallation(db: Db, input: GitHubInstallationInput) {
  const [installation] = await db
    .insert(githubInstallations)
    .values(input)
    .onConflictDoUpdate({
      target: githubInstallations.installationId,
      set: {
        accountLogin: input.accountLogin,
        accountType: input.accountType,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!installation) throw new Error("Failed to upsert GitHub installation");
  return installation;
}

export async function upsertRepository(
  db: Db,
  installationDbId: string,
  input: GitHubRepositoryInput,
) {
  const [repository] = await db
    .insert(repositories)
    .values({
      githubId: input.githubId,
      installationId: installationDbId,
      owner: input.owner,
      name: input.name,
      fullName: input.fullName,
      defaultBranch: input.defaultBranch ?? "main",
      private: input.private ?? false,
    })
    .onConflictDoUpdate({
      target: repositories.githubId,
      set: {
        installationId: installationDbId,
        owner: input.owner,
        name: input.name,
        fullName: input.fullName,
        defaultBranch: input.defaultBranch ?? "main",
        private: input.private ?? false,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!repository) throw new Error("Failed to upsert repository");
  await ensureRepositoryPolicy(db, repository.id);
  return repository;
}

export async function upsertIssue(db: Db, repositoryId: string, input: GitHubIssueInput) {
  const [issue] = await db
    .insert(issues)
    .values({
      repositoryId,
      githubId: input.githubId,
      number: input.number,
      title: input.title,
      state: input.state,
      authorLogin: input.authorLogin,
      body: input.body,
    })
    .onConflictDoUpdate({
      target: issues.githubId,
      set: {
        title: input.title,
        state: input.state,
        authorLogin: input.authorLogin,
        body: input.body,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!issue) throw new Error("Failed to upsert issue");
  return issue;
}

export async function createIssueFixJob(
  db: Db,
  input: {
    repositoryId: string;
    issueId: string;
    policy: RepositoryPolicy;
    triggerLabel: string;
    requestedBy: string;
  },
) {
  const [job] = await db
    .insert(jobs)
    .values({
      repositoryId: input.repositoryId,
      issueId: input.issueId,
      status: "queued",
      triggerLabel: input.triggerLabel,
      requestedBy: input.requestedBy,
      maxAttempts: input.policy.maxAttempts,
      queuedAt: new Date(),
      statusReason: "Accepted from GitHub issue label",
    })
    .onConflictDoNothing()
    .returning();

  if (!job) {
    const existing = await db.query.jobs.findFirst({
      where: (table, { and, eq: eqOp, inArray }) =>
        and(
          eqOp(table.repositoryId, input.repositoryId),
          eqOp(table.issueId, input.issueId),
          eqOp(table.triggerLabel, input.triggerLabel),
          inArray(table.status, ["received", "queued", "running"]),
        ),
    });
    return { job: existing, created: false };
  }

  await db.insert(jobEvents).values({
    jobId: job.id,
    type: "job.accepted",
    message: `Job accepted for label ${input.triggerLabel}`,
  });

  return { job, created: true };
}

export async function rejectIssueFix(
  db: Db,
  input: {
    repositoryId: string;
    issueId: string;
    triggerLabel: string;
    requestedBy: string;
    reason: string;
  },
) {
  const [job] = await db
    .insert(jobs)
    .values({
      repositoryId: input.repositoryId,
      issueId: input.issueId,
      status: "rejected",
      triggerLabel: input.triggerLabel,
      requestedBy: input.requestedBy,
      statusReason: input.reason,
      finishedAt: new Date(),
    })
    .returning();
  return job;
}

