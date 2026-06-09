import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  discoveryResults,
  jobAttempts,
  jobEvents,
  jobLogChunks,
  jobs,
  pullRequests,
  reviewResults,
  validationResults,
} from "../db/schema";
import { presentJobDetail, presentJobListItem } from "./job-presenter";

export async function registerStatusRoutes(app: FastifyInstance, deps: { db: Db }) {
  app.get("/health", async () => ({ ok: true }));

  app.get("/jobs", async () => {
    const rows = await deps.db.query.jobs.findMany({
      orderBy: [desc(jobs.createdAt)],
      limit: 50,
      with: {
        repository: true,
        issue: true,
      },
    });

    return {
      jobs: rows.map(presentJobListItem),
    };
  });

  app.get<{ Params: { id: string } }>("/jobs/:id", async (request, reply) => {
    const job = await deps.db.query.jobs.findFirst({
      where: eq(jobs.id, request.params.id),
      with: {
        repository: true,
        issue: true,
      },
    });

    if (!job) return reply.code(404).send({ error: "Job not found" });

    const [attempts, events, logs, discovery, validations, reviews, pullRequest] = await Promise.all([
      deps.db.query.jobAttempts.findMany({
        where: eq(jobAttempts.jobId, job.id),
        orderBy: [desc(jobAttempts.attemptNumber)],
      }),
      deps.db.select().from(jobEvents).where(eq(jobEvents.jobId, job.id)).orderBy(desc(jobEvents.createdAt)).limit(50),
      deps.db
        .select()
        .from(jobLogChunks)
        .where(eq(jobLogChunks.jobId, job.id))
        .orderBy(desc(jobLogChunks.sequence))
        .limit(100),
      deps.db
        .select()
        .from(discoveryResults)
        .where(eq(discoveryResults.jobId, job.id))
        .orderBy(desc(discoveryResults.createdAt))
        .limit(5),
      deps.db
        .select()
        .from(validationResults)
        .where(eq(validationResults.jobId, job.id))
        .orderBy(desc(validationResults.createdAt))
        .limit(10),
      deps.db
        .select()
        .from(reviewResults)
        .where(eq(reviewResults.jobId, job.id))
        .orderBy(desc(reviewResults.createdAt))
        .limit(5),
      deps.db.query.pullRequests.findFirst({ where: eq(pullRequests.jobId, job.id) }),
    ]);

    return presentJobDetail({ job, attempts, events, logs, discovery, validations, reviews, pullRequest: pullRequest ?? null });
  });
}
