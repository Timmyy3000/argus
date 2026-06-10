import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { jobs } from "../db/schema";
import { discoverRepository } from "../discovery/discover";
import { shouldWriteDiscoveredFile } from "../discovery/types";
import { recordDiscoveryResult, recordPullRequest, recordReviewResult, recordValidationResult } from "../domain/results";
import { createInstallationToken } from "../github/app";
import { createPullRequest } from "../github/pull-request";
import { decidePublish } from "../publish/decision";
import { createCommandExecutor } from "../sandbox/executor";
import { runCommand } from "../system/command";
import { runValidationCommands } from "../validation/run-validation";
import { issueBranchName, prTitle } from "./branch";
import type { WorkerJob, WorkerRunner, WorkerRunResult } from "./types";
import { loadConfig } from "../config";

export class IssueFixRunner implements WorkerRunner {
  constructor(private readonly db: Db) {}

  async run(job: WorkerJob): Promise<WorkerRunResult> {
    const config = loadConfig();
    const loaded = await this.db.query.jobs.findFirst({
      where: eq(jobs.id, job.jobId),
      with: {
        repository: {
          with: {
            installation: true,
            policy: true,
          },
        },
        issue: true,
      },
    });
    if (!loaded) return { status: "implementation_failed", reason: `Job ${job.jobId} was not found` };
    const policy = loaded.repository.policy;
    if (!policy) return { status: "implementation_failed", reason: "Repository policy was not found" };

    const token = await createInstallationToken(loaded.repository.installation.installationId);
    const workspace = join(process.cwd(), config.ARGUS_WORKDIR, job.jobId);
    const repoDir = join(workspace, loaded.repository.name);
    const branch = issueBranchName(loaded.issue.number);

    await rm(workspace, { recursive: true, force: true });
    await mkdir(workspace, { recursive: true });

    const cloneUrl = `https://x-access-token:${token}@github.com/${loaded.repository.fullName}.git`;
    const clone = await runCommand("git", ["clone", "--depth", "1", cloneUrl], {
      cwd: workspace,
      timeoutMs: 10 * 60_000,
    });
    if (clone.exitCode !== 0) {
      return {
        status: "implementation_failed",
        reason: `git clone failed: ${clone.stderr || clone.stdout}`,
        retryable: true,
      };
    }

    const checkout = await runCommand("git", ["checkout", "-b", branch], { cwd: repoDir, timeoutMs: 60_000 });
    if (checkout.exitCode !== 0) {
      return { status: "implementation_failed", reason: `branch checkout failed: ${checkout.stderr || checkout.stdout}` };
    }

    const executor = createCommandExecutor({
      mode: config.ARGUS_SANDBOX_MODE,
      image: config.ARGUS_SANDBOX_IMAGE,
      repoDir,
    });
    const discovery = await discoverRepository(repoDir);
    const validation = await runValidationCommands(repoDir, discovery.commands, 10 * 60_000, executor);
    discovery.shouldWriteDiscoveredFile = shouldWriteDiscoveredFile(discovery, validation.passed);
    await recordDiscoveryResult(this.db, job.jobId, discovery);
    await recordValidationResult(this.db, {
      jobId: job.jobId,
      passed: validation.passed,
      summary: validation.summary,
      details: { results: validation.results },
    });

    if (!config.ARGUS_ENABLE_CODEX) {
      return {
        status: "needs_human",
        reason: "Repository was cloned and discovered, but ARGUS_ENABLE_CODEX=false so implementation was not attempted.",
      };
    }

    const prompt = buildCodexPrompt({
      issueNumber: loaded.issue.number,
      issueTitle: loaded.issue.title,
      issueBody: loaded.issue.body ?? "",
      discovery,
    });
    const codex = await executor.run("codex", ["exec", prompt, "--skip-git-repo-check"], {
      cwd: repoDir,
      timeoutMs: policy.maxRuntimeMinutes * 60_000,
      ...(config.OPENAI_API_KEY ? { env: { OPENAI_API_KEY: config.OPENAI_API_KEY } } : {}),
    });
    if (codex.exitCode !== 0) {
      return { status: "implementation_failed", reason: `Codex failed: ${codex.stderr || codex.stdout}` };
    }

    const status = await runCommand("git", ["status", "--porcelain"], { cwd: repoDir, timeoutMs: 60_000 });
    const hasDiff = status.stdout.trim().length > 0;
    if (hasDiff) {
      await runCommand("git", ["add", "."], { cwd: repoDir, timeoutMs: 60_000 });
      await runCommand("git", ["commit", "-m", `Fix issue #${loaded.issue.number}`], { cwd: repoDir, timeoutMs: 60_000 });
    }

    const postValidation = await runValidationCommands(repoDir, discovery.commands, 10 * 60_000, executor);
    await recordValidationResult(this.db, {
      jobId: job.jobId,
      passed: postValidation.passed,
      summary: postValidation.summary,
      details: { results: postValidation.results, afterCodex: true },
    });

    const reviewPassed = postValidation.passed && hasDiff;
    await recordReviewResult(this.db, {
      jobId: job.jobId,
      passed: reviewPassed,
      summary: reviewPassed ? "Review gate passed by MVP validation proxy" : "Review gate blocked by missing diff or validation failure",
      blockers: reviewPassed ? [] : ["MVP review proxy requires diff and passing validation"],
    });

    const publish = decidePublish({
      hasDiff,
      validationPassed: postValidation.passed,
      reviewPassed,
      discoveryConfidence: discovery.confidence,
      allowDraftPr: policy.allowDraftPr,
      publishOnLowConfidence: policy.publishOnLowConfidence,
    });

    await this.db
      .update(jobs)
      .set({ publishDecision: publish.decision, publishReason: publish.reason, updatedAt: new Date() })
      .where(eq(jobs.id, job.jobId));

    if (publish.decision === "no_pr") {
      return { status: "needs_human", reason: publish.reason };
    }

    if (!config.ARGUS_ENABLE_GIT_PUSH) {
      return {
        status: "needs_human",
        reason: `Publish decision was ${publish.decision}, but ARGUS_ENABLE_GIT_PUSH=false so no branch or PR was pushed.`,
      };
    }

    const push = await runCommand("git", ["push", "origin", branch], { cwd: repoDir, timeoutMs: 5 * 60_000 });
    if (push.exitCode !== 0) {
      return {
        status: "publish_failed",
        reason: `git push failed: ${push.stderr || push.stdout}`,
        retryable: true,
      };
    }

    const pr = await createPullRequest({
      installationId: loaded.repository.installation.installationId,
      owner: loaded.repository.owner,
      repo: loaded.repository.name,
      title: prTitle(loaded.issue.number, loaded.issue.title),
      head: branch,
      base: loaded.repository.defaultBranch,
      body: buildPrBody(loaded.issue.number, postValidation.summary, publish.reason),
      draft: publish.decision === "draft_pr",
    });
    await recordPullRequest(this.db, { jobId: job.jobId, ...pr, draft: publish.decision === "draft_pr" });

    return { status: "completed", reason: `Opened PR ${pr.url}` };
  }
}

function buildCodexPrompt(input: {
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  discovery: { commands: Record<string, string | null | undefined> };
}): string {
  return [
    `Fix GitHub issue #${input.issueNumber}: ${input.issueTitle}`,
    "",
    input.issueBody,
    "",
    "Repo validation commands discovered:",
    JSON.stringify(input.discovery.commands, null, 2),
    "",
    "Make the smallest correct code change. Do not expose secrets. Leave a concise summary of changes.",
  ].join("\n");
}

function buildPrBody(issueNumber: number, validationSummary: string, publishReason: string): string {
  return [
    `Fixes #${issueNumber}.`,
    "",
    "## Argus Summary",
    `- Validation: ${validationSummary}`,
    `- Publish decision: ${publishReason}`,
  ].join("\n");
}
