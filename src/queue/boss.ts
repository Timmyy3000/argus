import PgBoss from "pg-boss";
import { loadConfig } from "../config";

export const ISSUE_FIX_QUEUE = "issue.fix.requested";

export type IssueFixJobPayload = {
  jobId: string;
  repositoryId: string;
  issueId: string;
};

export function createBoss(databaseUrl = loadConfig().DATABASE_URL): PgBoss {
  return new PgBoss({
    connectionString: databaseUrl,
    application_name: "argus",
  });
}

export async function enqueueIssueFix(
  boss: PgBoss,
  payload: IssueFixJobPayload,
  options: {
    /**
     * Retries are sent while the original pg-boss job is still active, so they
     * must skip the singleton key — duplicate suppression for fresh intake is
     * also enforced at the database layer by the active-job unique constraint.
     */
    isRetry?: boolean;
    delaySeconds?: number;
  } = {},
): Promise<string | null> {
  await boss.createQueue(ISSUE_FIX_QUEUE);
  return boss.send(ISSUE_FIX_QUEUE, payload, {
    ...(options.isRetry ? {} : { singletonKey: `${payload.repositoryId}:${payload.issueId}` }),
    ...(options.delaySeconds ? { startAfter: options.delaySeconds } : {}),
    retryLimit: 0,
    expireInSeconds: 60 * 60,
  });
}
