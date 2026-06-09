import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { repositoryPolicies, repositories } from "../db/schema";

export const DEFAULT_ALLOWED_ROLES = ["admin", "maintain", "write"] as const;

export type RepositoryPolicy = typeof repositoryPolicies.$inferSelect;

export async function ensureRepositoryPolicy(db: Db, repositoryId: string): Promise<RepositoryPolicy> {
  const existing = await db.query.repositoryPolicies.findFirst({
    where: eq(repositoryPolicies.repositoryId, repositoryId),
  });
  if (existing) return existing;

  const [policy] = await db
    .insert(repositoryPolicies)
    .values({ repositoryId })
    .onConflictDoNothing({ target: repositoryPolicies.repositoryId })
    .returning();

  if (policy) return policy;

  const created = await db.query.repositoryPolicies.findFirst({
    where: eq(repositoryPolicies.repositoryId, repositoryId),
  });
  if (!created) throw new Error(`Failed to create repository policy for ${repositoryId}`);
  return created;
}

export function labelTriggersPolicy(policy: Pick<RepositoryPolicy, "triggerLabel">, labelName: string): boolean {
  return policy.triggerLabel === labelName;
}

export function actorRoleIsAllowed(policy: Pick<RepositoryPolicy, "allowedRoles">, permission: string | undefined): boolean {
  if (!permission) return false;
  return policy.allowedRoles.includes(permission);
}

export async function repositoryHasRunningCapacity(db: Db, repositoryId: string, concurrency: number): Promise<boolean> {
  const rows = await db
    .select({ id: repositories.id })
    .from(repositories)
    .where(and(eq(repositories.id, repositoryId)));
  if (rows.length === 0) return false;

  const activeJobs = await db.query.jobs.findMany({
    where: (jobs, { and: andOp, eq: eqOp, inArray }) =>
      andOp(eqOp(jobs.repositoryId, repositoryId), inArray(jobs.status, ["queued", "running"])),
    columns: { id: true },
  });

  return activeJobs.length < concurrency;
}

