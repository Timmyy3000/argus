import type { Db } from "../db/client";
import { discoveryResults, pullRequests, reviewResults, validationResults } from "../db/schema";
import type { DiscoveryResult } from "../discovery/types";

export async function recordDiscoveryResult(db: Db, jobId: string, result: DiscoveryResult) {
  const [row] = await db
    .insert(discoveryResults)
    .values({
      jobId,
      confidence: result.confidence,
      commands: result.commands,
      evidence: result.evidence,
      source: result.source,
      shouldWriteDiscoveredFile: result.shouldWriteDiscoveredFile,
    })
    .returning();
  return row;
}

export async function recordValidationResult(
  db: Db,
  input: {
    jobId: string;
    passed: boolean;
    summary: string;
    details?: Record<string, unknown>;
  },
) {
  const [row] = await db
    .insert(validationResults)
    .values({
      jobId: input.jobId,
      passed: input.passed,
      summary: input.summary,
      details: input.details ?? {},
    })
    .returning();
  return row;
}

export async function recordReviewResult(
  db: Db,
  input: {
    jobId: string;
    passed: boolean;
    summary: string;
    blockers?: string[];
  },
) {
  const [row] = await db
    .insert(reviewResults)
    .values({
      jobId: input.jobId,
      passed: input.passed,
      summary: input.summary,
      blockers: input.blockers ?? [],
    })
    .returning();
  return row;
}

export async function recordPullRequest(
  db: Db,
  input: {
    jobId: string;
    githubId: number;
    number: number;
    url: string;
    draft: boolean;
  },
) {
  const [row] = await db.insert(pullRequests).values(input).returning();
  return row;
}

