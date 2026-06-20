import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { jobs } from "../db/schema";
import { discoverRepository } from "../discovery/discover";
import { shouldWriteDiscoveredFile } from "../discovery/types";
import {
  recordDiscoveryResult,
  recordPullRequest,
  recordReviewResult,
  recordTriageResult,
  recordValidationResult,
} from "../domain/results";
import { createInstallationToken } from "../github/app";
import { createPullRequest } from "../github/pull-request";
import { decidePublish } from "../publish/decision";
import { buildCodexReviewPrompt, codexReviewOutputPath, parseCodexReview, type CodexReviewOutcome } from "../review/codex-review";
import { parseNameStatus, runMechanicalChecks } from "../review/mechanical";
import { buildComposePrompt, composePrOutputPath, parseComposedPr } from "../publish/compose-pr";
import { createCommandExecutor, type CommandExecutor } from "../sandbox/executor";
import { loadStandardsBundle, materializeStandards, renderSkillIndex } from "../standards/standards";
import { runCommand } from "../system/command";
import { triageIssue } from "../triage/triage";
import type { TriageResult } from "../triage/types";
import { compareValidation } from "../validation/compare";
import { runValidationCommands, type ValidationRunResult } from "../validation/run-validation";
import { argusGitIdentity, fixCommitMessage, issueBranchName, prTitle } from "./branch";
import { JobLogger } from "./job-logger";
import { getGates } from "../settings/settings";
import type { WorkerJob, WorkerRunner, WorkerRunResult } from "./types";
import { loadConfig, type AppConfig } from "../config";

export class IssueFixRunner implements WorkerRunner {
  constructor(private readonly db: Db) {}

  async run(job: WorkerJob): Promise<WorkerRunResult> {
    const config = loadConfig();
    const loaded = await this.loadJob(job.jobId);
    if (!loaded) return { status: "implementation_failed", reason: `Job ${job.jobId} was not found` };
    const policy = loaded.repository.policy;
    if (!policy) return { status: "implementation_failed", reason: "Repository policy was not found" };

    const token = await createInstallationToken(loaded.repository.installation.installationId);
    const logger = new JobLogger(this.db, job.jobId, job.attemptId, [token]);
    const workspace = join(process.cwd(), config.ARGUS_WORKDIR, job.jobId);

    try {
      return await this.execute({ job, config, loaded, policy, token, logger, workspace });
    } finally {
      if (!config.ARGUS_KEEP_WORKSPACE) {
        await rm(workspace, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  private async execute(input: {
    job: WorkerJob;
    config: AppConfig;
    loaded: NonNullable<Awaited<ReturnType<IssueFixRunner["loadJob"]>>>;
    policy: NonNullable<NonNullable<Awaited<ReturnType<IssueFixRunner["loadJob"]>>>["repository"]["policy"]>;
    token: string;
    logger: JobLogger;
    workspace: string;
  }): Promise<WorkerRunResult> {
    const { job, config, loaded, policy, token, logger, workspace } = input;
    const gates = await getGates(this.db, config);
    const repoDir = join(workspace, loaded.repository.name);
    const branch = issueBranchName(loaded.issue.number);

    await rm(workspace, { recursive: true, force: true });
    await mkdir(workspace, { recursive: true });

    const cloneUrl = `https://x-access-token:${token}@github.com/${loaded.repository.fullName}.git`;
    const clone = await runCommand("git", ["clone", "--depth", "1", cloneUrl], {
      cwd: workspace,
      timeoutMs: 10 * 60_000,
    });
    await logger.logCommand(`git clone ${loaded.repository.fullName}`, clone);
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

    // Fresh clones have no committer identity; without one, git commit fails
    // and an empty branch gets pushed.
    await runCommand("git", ["config", "user.name", argusGitIdentity.name], { cwd: repoDir, timeoutMs: 30_000 });
    await runCommand("git", ["config", "user.email", argusGitIdentity.email], {
      cwd: repoDir,
      timeoutMs: 30_000,
    });

    const executor = createCommandExecutor({
      mode: config.ARGUS_SANDBOX_MODE,
      image: config.ARGUS_SANDBOX_IMAGE,
      repoDir,
      network: config.ARGUS_SANDBOX_NETWORK,
      limits: {
        memory: config.ARGUS_SANDBOX_MEMORY,
        cpus: config.ARGUS_SANDBOX_CPUS,
        pids: config.ARGUS_SANDBOX_PIDS,
      },
    });
    const triage = await triageIssue({
      issue: {
        number: loaded.issue.number,
        title: loaded.issue.title,
        body: loaded.issue.body ?? "",
      },
      repoDir,
      config,
    });
    await recordTriageResult(this.db, job.jobId, triage);
    await logger.log(
      "system",
      `Triage (${triage.source}): ${triage.decision} as ${triage.category}. ${triage.reasoning}`,
    );

    if (triage.decision === "needs_more_info") {
      return {
        status: "needs_human",
        reason: `Triage requested more information before attempting a fix: ${triage.reasoning}`,
      };
    }
    if (triage.decision === "decline") {
      return {
        status: "needs_human",
        reason: `Triage declined an automated fix attempt: ${triage.reasoning}`,
      };
    }

    const discovery = await discoverRepository(repoDir);
    await logger.log("system", `Discovery (${discovery.confidence} confidence, ${discovery.source}): ${JSON.stringify(discovery.commands)}`);
    const validation = await runValidationCommands(repoDir, discovery.commands, 10 * 60_000, executor);
    await this.logValidation(logger, "baseline validation", validation);
    discovery.shouldWriteDiscoveredFile = shouldWriteDiscoveredFile(discovery, validation.passed);
    await recordDiscoveryResult(this.db, job.jobId, discovery);
    await recordValidationResult(this.db, {
      jobId: job.jobId,
      passed: validation.passed,
      summary: validation.summary,
      details: { results: validation.results },
    });

    if (!gates.codex) {
      return {
        status: "needs_human",
        reason: "Repository was cloned and discovered, but the Codex gate is off so implementation was not attempted.",
      };
    }

    // Operator standards (dashboard-managed AGENTS.md + skills) land in the
    // workspace right before the agent runs, git-excluded so they never ship.
    const bundle = await loadStandardsBundle(this.db);
    const standards = await materializeStandards(bundle, repoDir);
    if (standards.agentsMdWritten || standards.skillIndex.length > 0) {
      await logger.log(
        "system",
        `Standards applied: AGENTS.md ${standards.agentsMdWritten ? "yes" : "no"}, skills: ${standards.skillIndex.map((s) => s.name).join(", ") || "none"}`,
      );
    }

    const prompt = buildCodexPrompt({
      issueNumber: loaded.issue.number,
      issueTitle: loaded.issue.title,
      issueBody: loaded.issue.body ?? "",
      discovery,
      triage,
      skillIndex: standards.skillIndex,
    });
    // The worker container (or docker sandbox) is the isolation boundary, and
    // the review/publish gates guard the output. Codex's built-in bubblewrap
    // sandbox cannot create user namespaces inside a container, so disable it.
    const codex = await executor.run(
      "codex",
      ["exec", "--sandbox", "danger-full-access", "--skip-git-repo-check", prompt],
      {
      cwd: repoDir,
      timeoutMs: policy.maxRuntimeMinutes * 60_000,
      ...(config.OPENAI_API_KEY ? { env: { OPENAI_API_KEY: config.OPENAI_API_KEY } } : {}),
      },
    );
    await logger.logCommand("codex exec", codex);
    if (codex.exitCode !== 0) {
      return { status: "implementation_failed", reason: `Codex failed: ${codex.stderr || codex.stdout}` };
    }

    for (const file of standards.restoreBeforeStaging) {
      await runCommand("git", ["restore", "--", file], { cwd: repoDir, timeoutMs: 30_000 });
    }
    await runCommand("git", ["add", "."], { cwd: repoDir, timeoutMs: 60_000 });
    const stagedDiff = await runCommand("git", ["diff", "--cached"], { cwd: repoDir, timeoutMs: 60_000 });
    const stagedNameStatus = await runCommand("git", ["diff", "--cached", "--name-status"], {
      cwd: repoDir,
      timeoutMs: 60_000,
    });
    const hasDiff = stagedDiff.stdout.trim().length > 0;
    if (hasDiff) {
      const commit = await runCommand("git", ["commit", "-m", fixCommitMessage(loaded.issue.number)], {
        cwd: repoDir,
        timeoutMs: 60_000,
      });
      if (commit.exitCode !== 0) {
        return {
          status: "implementation_failed",
          reason: `git commit failed: ${commit.stderr || commit.stdout}`,
        };
      }
    }

    const postValidation = await runValidationCommands(repoDir, discovery.commands, 10 * 60_000, executor);
    await this.logValidation(logger, "post-implementation validation", postValidation);
    await recordValidationResult(this.db, {
      jobId: job.jobId,
      passed: postValidation.passed,
      summary: postValidation.summary,
      details: { results: postValidation.results, afterCodex: true },
    });

    const comparison = compareValidation(validation, postValidation);
    await logger.log("system", `Validation comparison: ${comparison.verdict}. ${comparison.summary}`);

    const mechanical = runMechanicalChecks({
      diff: stagedDiff.stdout,
      changedFiles: parseNameStatus(stagedNameStatus.stdout),
      maxDiffBytes: config.ARGUS_MAX_DIFF_BYTES,
    });
    const codexReview: CodexReviewOutcome =
      gates.llmReview && hasDiff && mechanical.passed
        ? await this.runCodexReview({
            executor,
            repoDir,
            issue: { number: loaded.issue.number, title: loaded.issue.title, body: loaded.issue.body ?? "" },
            diff: stagedDiff.stdout,
            reviewMd: bundle.reviewMd,
            timeoutMs: policy.maxRuntimeMinutes * 60_000,
            openaiApiKey: config.OPENAI_API_KEY,
            logger,
          })
        : {
            passed: true,
            summary: gates.llmReview ? "Codex review skipped" : "Codex review gate is off; mechanical checks only",
            blockers: [],
            degraded: false,
            skipped: true,
          };

    const reviewPassed = hasDiff && mechanical.passed && codexReview.passed;
    const blockers = [
      ...(hasDiff ? [] : ["No code changes were produced"]),
      ...mechanical.blockers,
      ...codexReview.blockers,
    ];
    const reviewSummary = !hasDiff
      ? "Review gate blocked: no code changes were produced"
      : !mechanical.passed
        ? `Mechanical checks blocked the change: ${mechanical.blockers.join("; ")}`
        : codexReview.summary;
    await recordReviewResult(this.db, {
      jobId: job.jobId,
      passed: reviewPassed,
      summary: reviewSummary,
      blockers,
    });
    await logger.log("system", `Review gate: ${reviewPassed ? "passed" : "blocked"}. ${reviewSummary}`);

    const publish = decidePublish({
      hasDiff,
      validationVerdict: comparison.verdict,
      reviewPassed,
      reviewDegraded: codexReview.degraded,
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

    if (!gates.gitPush) {
      return {
        status: "needs_human",
        reason: `Publish decision was ${publish.decision}, but the Push gate is off so no branch or PR was pushed.`,
      };
    }

    const push = await runCommand("git", ["push", "origin", branch], { cwd: repoDir, timeoutMs: 5 * 60_000 });
    await logger.logCommand(`git push origin ${branch}`, push);
    if (push.exitCode !== 0) {
      return {
        status: "publish_failed",
        reason: `git push failed: ${push.stderr || push.stdout}`,
        retryable: true,
      };
    }

    // Publish stage: when publish.md is set, Codex authors the PR title+body to
    // the operator's conventions; otherwise fall back to the built-in template.
    const composed = bundle.publishMd?.trim()
      ? await this.composePr({
          executor,
          repoDir,
          issue: { number: loaded.issue.number, title: loaded.issue.title, body: loaded.issue.body ?? "" },
          diff: stagedDiff.stdout,
          validationSummary: comparison.summary,
          reviewSummary,
          publishMd: bundle.publishMd,
          timeoutMs: policy.maxRuntimeMinutes * 60_000,
          openaiApiKey: config.OPENAI_API_KEY,
          logger,
        })
      : null;
    if (composed) await logger.log("system", "PR text authored from publish.md");

    const pr = await createPullRequest({
      installationId: loaded.repository.installation.installationId,
      owner: loaded.repository.owner,
      repo: loaded.repository.name,
      title: composed?.title ?? prTitle(loaded.issue.number, loaded.issue.title),
      head: branch,
      base: loaded.repository.defaultBranch,
      body:
        composed?.body ??
        buildPrBody({
          issueNumber: loaded.issue.number,
          validationSummary: comparison.summary,
          reviewSummary,
          publishReason: publish.reason,
          triage,
        }),
      draft: publish.decision === "draft_pr",
    });
    await recordPullRequest(this.db, { jobId: job.jobId, ...pr, draft: publish.decision === "draft_pr" });

    return { status: "completed", reason: `Opened PR ${pr.url}` };
  }

  /**
   * Runs a Codex pass that must write a JSON file at outPath. Returns the file
   * contents (falling back to stdout if the agent printed instead of writing),
   * or null when the process failed. Codex never touches git/gh in these passes.
   */
  private async runCodexJsonPass(input: {
    executor: CommandExecutor;
    repoDir: string;
    prompt: string;
    outPath: string;
    timeoutMs: number;
    openaiApiKey?: string | undefined;
    logger: JobLogger;
    label: string;
  }): Promise<string | null> {
    const codex = await input.executor.run(
      "codex",
      ["exec", "--sandbox", "danger-full-access", "--skip-git-repo-check", input.prompt],
      {
        cwd: input.repoDir,
        timeoutMs: input.timeoutMs,
        ...(input.openaiApiKey ? { env: { OPENAI_API_KEY: input.openaiApiKey } } : {}),
      },
    );
    await input.logger.logCommand(input.label, codex);
    if (codex.exitCode !== 0) return null;
    const file = join(input.repoDir, input.outPath);
    const content = await readFile(file, "utf8").catch(() => null);
    await rm(file, { force: true }).catch(() => {});
    return content ?? codex.stdout ?? null;
  }

  private async runCodexReview(input: {
    executor: CommandExecutor;
    repoDir: string;
    issue: { number: number; title: string; body: string };
    diff: string;
    reviewMd: string | null;
    timeoutMs: number;
    openaiApiKey?: string | undefined;
    logger: JobLogger;
  }): Promise<CodexReviewOutcome> {
    const outPath = codexReviewOutputPath();
    const raw = await this.runCodexJsonPass({
      executor: input.executor,
      repoDir: input.repoDir,
      outPath,
      timeoutMs: input.timeoutMs,
      openaiApiKey: input.openaiApiKey,
      logger: input.logger,
      label: "codex review",
      prompt: buildCodexReviewPrompt({
        issueNumber: input.issue.number,
        issueTitle: input.issue.title,
        issueBody: input.issue.body,
        diff: input.diff,
        reviewMd: input.reviewMd,
        outPath,
      }),
    });
    if (raw === null) {
      return {
        passed: false,
        summary: "Codex review could not run; downgrading to draft",
        blockers: [],
        degraded: true,
        skipped: false,
      };
    }
    return parseCodexReview(raw);
  }

  private async composePr(input: {
    executor: CommandExecutor;
    repoDir: string;
    issue: { number: number; title: string; body: string };
    diff: string;
    validationSummary: string;
    reviewSummary: string;
    publishMd: string;
    timeoutMs: number;
    openaiApiKey?: string | undefined;
    logger: JobLogger;
  }): Promise<{ title: string; body: string } | null> {
    const outPath = composePrOutputPath();
    const raw = await this.runCodexJsonPass({
      executor: input.executor,
      repoDir: input.repoDir,
      outPath,
      timeoutMs: input.timeoutMs,
      openaiApiKey: input.openaiApiKey,
      logger: input.logger,
      label: "codex compose-pr",
      prompt: buildComposePrompt({
        issueNumber: input.issue.number,
        issueTitle: input.issue.title,
        issueBody: input.issue.body,
        diff: input.diff,
        validationSummary: input.validationSummary,
        reviewSummary: input.reviewSummary,
        publishMd: input.publishMd,
        outPath,
      }),
    });
    return raw === null ? null : parseComposedPr(raw);
  }

  private async logValidation(logger: JobLogger, label: string, validation: ValidationRunResult): Promise<void> {
    await logger.log("system", `${label}: ${validation.summary}`);
    for (const result of validation.results) {
      await logger.logCommand(result.command, result);
    }
  }

  private loadJob(jobId: string) {
    return this.db.query.jobs.findFirst({
      where: eq(jobs.id, jobId),
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
  }
}

export function buildCodexPrompt(input: {
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  discovery: { commands: Record<string, string | null | undefined> };
  triage?: Pick<TriageResult, "suspectFiles" | "plan" | "reasoning">;
  skillIndex?: Array<{ path: string; name: string; description: string | null }>;
}): string {
  const sections = [
    `Fix GitHub issue #${input.issueNumber}: ${input.issueTitle}`,
    "",
    input.issueBody,
  ];

  if (input.triage?.plan) {
    sections.push("", "Suggested fix plan from triage:", input.triage.plan);
  }
  if (input.triage && input.triage.suspectFiles.length > 0) {
    sections.push("", "Files most likely involved:", input.triage.suspectFiles.map((file) => `- ${file}`).join("\n"));
  }

  const skillSection = renderSkillIndex(input.skillIndex ?? []);
  if (skillSection) {
    sections.push("", skillSection);
  }

  sections.push(
    "",
    "Repo validation commands discovered:",
    JSON.stringify(input.discovery.commands, null, 2),
    "",
    "Make the smallest correct code change. When the repository has a test suite, add or extend a test that reproduces the issue and passes with your fix. Do not expose secrets. Leave a concise summary of changes.",
  );

  return sections.join("\n");
}

function buildPrBody(input: {
  issueNumber: number;
  validationSummary: string;
  reviewSummary: string;
  publishReason: string;
  triage: TriageResult;
}): string {
  return [
    `Fixes #${input.issueNumber}.`,
    "",
    "## Argus Summary",
    `- Triage: ${input.triage.category} (${input.triage.source}) — ${input.triage.reasoning}`,
    `- Validation: ${input.validationSummary}`,
    `- Review: ${input.reviewSummary}`,
    `- Publish decision: ${input.publishReason}`,
  ].join("\n");
}
