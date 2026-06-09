import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { jobs } from "../db/schema";
import type { WorkerRunResult } from "../workers/types";
import { createIssueComment, outcomeComment } from "./comments";

export async function notifyJobOutcome(db: Db, jobId: string, result: WorkerRunResult): Promise<void> {
  const job = await db.query.jobs.findFirst({
    where: eq(jobs.id, jobId),
    with: {
      repository: {
        with: {
          installation: true,
        },
      },
      issue: true,
    },
  });
  if (!job) return;

  await createIssueComment({
    installationId: job.repository.installation.installationId,
    owner: job.repository.owner,
    repo: job.repository.name,
    issueNumber: job.issue.number,
    body: outcomeComment(result),
  });
}
