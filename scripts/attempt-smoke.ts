import { createDb } from "../src/db/client";
import { appendRedactedLogChunk, finishAttempt, startJobAttempt } from "../src/domain/attempts";
import { createIssueFixJob, upsertInstallation, upsertIssue, upsertRepository } from "../src/domain/jobs";
import { ensureRepositoryPolicy } from "../src/domain/policies";

const { db, client } = createDb();

try {
  const suffix = Date.now();
  const installation = await upsertInstallation(db, {
    installationId: Math.floor(suffix % 1_000_000_000),
    accountLogin: "argus-smoke",
    accountType: "Organization",
  });

  const repository = await upsertRepository(db, installation.id, {
    githubId: Math.floor((suffix + 1) % 1_000_000_000),
    owner: "argus-smoke",
    name: `repo-${suffix}`,
    fullName: `argus-smoke/repo-${suffix}`,
    defaultBranch: "main",
    private: true,
  });

  const policy = await ensureRepositoryPolicy(db, repository.id);
  const issue = await upsertIssue(db, repository.id, {
    githubId: Math.floor((suffix + 2) % 1_000_000_000),
    number: 1,
    title: "Smoke issue",
    state: "open",
    authorLogin: "maintainer",
    body: "Smoke body",
  });

  const { job } = await createIssueFixJob(db, {
    repositoryId: repository.id,
    issueId: issue.id,
    policy,
    triggerLabel: policy.triggerLabel,
    requestedBy: "maintainer",
  });
  if (!job) throw new Error("Expected smoke job to be created");

  const attempt = await startJobAttempt(db, {
    jobId: job.id,
    workerId: "smoke-worker",
    maxRuntimeMinutes: 1,
  });

  await appendRedactedLogChunk(db, {
    jobId: job.id,
    attemptId: attempt.id,
    sequence: 1,
    stream: "system",
    content: "smoke log OPENAI_API_KEY=sk-smokesecret000000000000000",
  });

  const finished = await finishAttempt(db, {
    attemptToken: attempt.attemptToken,
    jobStatus: "needs_human",
    reason: "Smoke runner completed lifecycle",
  });
  if (!finished) throw new Error("Expected smoke attempt to finish");

  const completed = await db.query.jobs.findFirst({
    where: (jobs, { eq }) => eq(jobs.id, job.id),
    with: { attempts: true, logs: true },
  });

  if (!completed || completed.status !== "needs_human") {
    throw new Error(`Unexpected smoke job status: ${completed?.status}`);
  }

  const log = completed.logs[0]?.redactedContent;
  if (!log || log.includes("sk-smokesecret")) {
    throw new Error("Expected smoke log to be redacted");
  }

  console.log(`attempt smoke passed: ${job.id}`);
} finally {
  await client.end();
}
