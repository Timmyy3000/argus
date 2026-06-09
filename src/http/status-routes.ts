import type { FastifyInstance } from "fastify";
import { desc } from "drizzle-orm";
import type { Db } from "../db/client";
import { jobs } from "../db/schema";

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
      jobs: rows.map((job) => ({
        id: job.id,
        status: job.status,
        repository: job.repository.fullName,
        issueNumber: job.issue.number,
        triggerLabel: job.triggerLabel,
        requestedBy: job.requestedBy,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      })),
    };
  });
}

