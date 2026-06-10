import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { Webhooks } from "@octokit/webhooks";
import type { Db } from "../db/client";
import {
  createIssueFixJob,
  markWebhookDelivery,
  recordWebhookDelivery,
  rejectIssueFix,
  upsertInstallation,
  upsertIssue,
  upsertRepository,
} from "../domain/jobs";
import { actorRoleIsAllowed, ensureRepositoryPolicy, labelTriggersPolicy } from "../domain/policies";
import { enqueueIssueFix } from "../queue/boss";
import type PgBoss from "pg-boss";
import { acceptedComment, createIssueComment, rejectionComment } from "./comments";
import { resolveSenderPermission, type PermissionFetcher } from "./permissions";

export type WebhookResult = {
  status: "ignored" | "accepted" | "rejected" | "duplicate";
  reason: string;
  jobId?: string;
};

export function createWebhookVerifier(secret: string): Webhooks {
  return new Webhooks({ secret });
}

export async function verifyWebhookSignature(input: {
  secret: string;
  body: string;
  signature: string;
}): Promise<boolean> {
  const webhooks = createWebhookVerifier(input.secret);
  return webhooks.verify(input.body, input.signature);
}

export async function handleGitHubWebhook(input: {
  db: Db;
  boss?: PgBoss | undefined;
  deliveryId: string;
  eventName: string;
  payload: unknown;
  permissionFetcher?: PermissionFetcher;
}): Promise<WebhookResult> {
  const action = getAction(input.payload);
  const repositoryFullName = getRepositoryFullName(input.payload);
  const deliveryInput: {
    deliveryId: string;
    eventName: string;
    action?: string;
    repositoryFullName?: string;
  } = {
    deliveryId: input.deliveryId,
    eventName: input.eventName,
  };
  if (action) deliveryInput.action = action;
  if (repositoryFullName) deliveryInput.repositoryFullName = repositoryFullName;

  const { duplicate } = await recordWebhookDelivery(input.db, deliveryInput);

  if (duplicate) {
    return { status: "duplicate", reason: "Webhook delivery already processed" };
  }

  try {
    if (input.eventName !== "issues") {
      await markWebhookDelivery(input.db, input.deliveryId, "ignored:unsupported_event");
      return { status: "ignored", reason: "Unsupported event" };
    }

    const event = input.payload as EmitterWebhookEvent<"issues">["payload"];
    if (event.action !== "labeled") {
      await markWebhookDelivery(input.db, input.deliveryId, "ignored:unsupported_action");
      return { status: "ignored", reason: "Unsupported issues action" };
    }

    const labelName = event.label?.name;
    if (!labelName) {
      await markWebhookDelivery(input.db, input.deliveryId, "ignored:missing_label");
      return { status: "ignored", reason: "Missing label" };
    }

    if (!event.installation?.id) {
      await markWebhookDelivery(input.db, input.deliveryId, "rejected:missing_installation");
      return { status: "rejected", reason: "Missing GitHub App installation" };
    }

    const installation = await upsertInstallation(input.db, {
      installationId: event.installation.id,
      accountLogin: event.repository.owner.login,
      accountType: event.repository.owner.type ?? "unknown",
    });

    const repository = await upsertRepository(input.db, installation.id, {
      githubId: event.repository.id,
      owner: event.repository.owner.login,
      name: event.repository.name,
      fullName: event.repository.full_name,
      defaultBranch: event.repository.default_branch ?? "main",
      private: event.repository.private,
    });

    const issue = await upsertIssue(input.db, repository.id, {
      githubId: event.issue.id,
      number: event.issue.number,
      title: event.issue.title,
      state: event.issue.state ?? "unknown",
      authorLogin: event.issue.user?.login ?? "unknown",
      body: event.issue.body,
    });

    const policy = await ensureRepositoryPolicy(input.db, repository.id);
    if (!labelTriggersPolicy(policy, labelName)) {
      await markWebhookDelivery(input.db, input.deliveryId, "ignored:label_not_configured");
      return { status: "ignored", reason: "Label does not match repository trigger policy" };
    }

    const permission = await resolveSenderPermission({
      installationId: event.installation.id,
      owner: repository.owner,
      repo: repository.name,
      senderLogin: event.sender.login,
      ...(input.permissionFetcher ? { fetcher: input.permissionFetcher } : {}),
    });
    if (!actorRoleIsAllowed(policy, permission)) {
      const reason = `Sender permission '${permission ?? "unknown"}' is not allowed`;
      await rejectIssueFix(input.db, {
        repositoryId: repository.id,
        issueId: issue.id,
        triggerLabel: labelName,
        requestedBy: event.sender.login,
        reason,
      });
      await markWebhookDelivery(input.db, input.deliveryId, "rejected:actor_not_allowed");
      if (policy.commentOnRejection) {
        await createIssueComment({
          installationId: event.installation.id,
          owner: repository.owner,
          repo: repository.name,
          issueNumber: issue.number,
          body: rejectionComment(reason),
        });
      }
      return { status: "rejected", reason };
    }

    const { job, created } = await createIssueFixJob(input.db, {
      repositoryId: repository.id,
      issueId: issue.id,
      policy,
      triggerLabel: labelName,
      requestedBy: event.sender.login,
    });

    if (!job) {
      await markWebhookDelivery(input.db, input.deliveryId, "duplicate:active_job_exists");
      return { status: "duplicate", reason: "Active job already exists" };
    }

    if (created && input.boss) {
      await enqueueIssueFix(input.boss, {
        jobId: job.id,
        repositoryId: repository.id,
        issueId: issue.id,
      });
    }

    if (created) {
      await createIssueComment({
        installationId: event.installation.id,
        owner: repository.owner,
        repo: repository.name,
        issueNumber: issue.number,
        body: acceptedComment(job.id),
      });
    }

    await markWebhookDelivery(input.db, input.deliveryId, created ? "accepted" : "duplicate:active_job_exists");
    return {
      status: created ? "accepted" : "duplicate",
      reason: created ? "Job accepted" : "Active job already exists",
      jobId: job.id,
    };
  } catch (error) {
    await markWebhookDelivery(input.db, input.deliveryId, "error", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

function getAction(payload: unknown): string | undefined {
  if (payload && typeof payload === "object" && "action" in payload && typeof payload.action === "string") {
    return payload.action;
  }
  return undefined;
}

function getRepositoryFullName(payload: unknown): string | undefined {
  if (
    payload &&
    typeof payload === "object" &&
    "repository" in payload &&
    payload.repository &&
    typeof payload.repository === "object" &&
    "full_name" in payload.repository &&
    typeof payload.repository.full_name === "string"
  ) {
    return payload.repository.full_name;
  }
  return undefined;
}
