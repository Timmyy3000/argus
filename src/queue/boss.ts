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

export async function enqueueIssueFix(boss: PgBoss, payload: IssueFixJobPayload): Promise<string | null> {
  await boss.createQueue(ISSUE_FIX_QUEUE);
  return boss.send(ISSUE_FIX_QUEUE, payload, {
    singletonKey: `${payload.repositoryId}:${payload.issueId}`,
    retryLimit: 0,
    expireInSeconds: 60 * 60,
  });
}
