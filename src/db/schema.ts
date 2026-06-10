import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const jobStatus = pgEnum("job_status", [
  "received",
  "rejected",
  "queued",
  "running",
  "discovery_failed",
  "implementation_failed",
  "validation_failed",
  "review_failed",
  "publish_failed",
  "completed",
  "cancelled",
  "timed_out",
  "needs_human",
]);

export const attemptStatus = pgEnum("attempt_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "timed_out",
  "cancelled",
  "stale",
]);

export const confidence = pgEnum("confidence", ["high", "medium", "low"]);
export const publishDecision = pgEnum("publish_decision", ["normal_pr", "draft_pr", "no_pr"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const githubAppConfig = pgTable("github_app_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  appId: text("app_id").notNull(),
  privateKey: text("private_key").notNull(),
  webhookSecret: text("webhook_secret").notNull(),
  slug: text("slug"),
  appName: text("app_name"),
  htmlUrl: text("html_url"),
  clientId: text("client_id"),
  clientSecret: text("client_secret"),
  ...timestamps,
});

export const githubInstallations = pgTable("github_installations", {
  id: uuid("id").primaryKey().defaultRandom(),
  installationId: bigint("installation_id", { mode: "number" }).notNull().unique(),
  accountLogin: text("account_login").notNull(),
  accountType: text("account_type").notNull(),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  ...timestamps,
});

export const repositories = pgTable(
  "repositories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    githubId: bigint("github_id", { mode: "number" }).notNull().unique(),
    installationId: uuid("installation_id")
      .notNull()
      .references(() => githubInstallations.id, { onDelete: "cascade" }),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    fullName: text("full_name").notNull().unique(),
    defaultBranch: text("default_branch").notNull().default("main"),
    private: boolean("private").notNull().default(false),
    ...timestamps,
  },
  (table) => [index("repositories_installation_idx").on(table.installationId)],
);

export const repositoryPolicies = pgTable("repository_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  repositoryId: uuid("repository_id")
    .notNull()
    .unique()
    .references(() => repositories.id, { onDelete: "cascade" }),
  triggerLabel: text("trigger_label").notNull().default("agent:fix"),
  allowedRoles: jsonb("allowed_roles").$type<string[]>().notNull().default(["admin", "maintain", "write"]),
  commentOnRejection: boolean("comment_on_rejection").notNull().default(false),
  allowDraftPr: boolean("allow_draft_pr").notNull().default(false),
  publishOnLowConfidence: boolean("publish_on_low_confidence").notNull().default(false),
  maxAttempts: integer("max_attempts").notNull().default(2),
  repoConcurrency: integer("repo_concurrency").notNull().default(1),
  maxRuntimeMinutes: integer("max_runtime_minutes").notNull().default(45),
  workerSandbox: jsonb("worker_sandbox")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({
      privileged: false,
      mountDockerSocket: false,
      workspaceMountOnly: true,
      runAsNonRoot: true,
      network: "enabled",
    }),
  ...timestamps,
});

export const issues = pgTable(
  "issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    githubId: bigint("github_id", { mode: "number" }).notNull(),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    state: text("state").notNull(),
    authorLogin: text("author_login").notNull(),
    body: text("body"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("issues_repo_number_idx").on(table.repositoryId, table.number),
    uniqueIndex("issues_github_id_idx").on(table.githubId),
  ],
);

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  deliveryId: text("delivery_id").notNull().unique(),
  eventName: text("event_name").notNull(),
  action: text("action"),
  repositoryFullName: text("repository_full_name"),
  processed: boolean("processed").notNull().default(false),
  result: text("result"),
  error: text("error"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    status: jobStatus("status").notNull().default("received"),
    triggerLabel: text("trigger_label").notNull(),
    requestedBy: text("requested_by").notNull(),
    statusReason: text("status_reason"),
    currentAttempt: integer("current_attempt").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(2),
    queuedAt: timestamp("queued_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    publishDecision: publishDecision("publish_decision"),
    publishReason: text("publish_reason"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("jobs_active_issue_label_idx")
      .on(table.repositoryId, table.issueId, table.triggerLabel)
      .where(sql`${table.status} in ('received', 'queued', 'running')`),
    index("jobs_status_idx").on(table.status),
  ],
);

export const jobAttempts = pgTable(
  "job_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    attemptToken: text("attempt_token").notNull().unique(),
    status: attemptStatus("status").notNull().default("queued"),
    workerId: text("worker_id"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    error: text("error"),
    ...timestamps,
  },
  (table) => [uniqueIndex("job_attempts_job_number_idx").on(table.jobId, table.attemptNumber)],
);

export const jobEvents = pgTable("job_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  message: text("message").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobLogChunks = pgTable(
  "job_log_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    attemptId: uuid("attempt_id").references(() => jobAttempts.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    stream: text("stream").notNull(),
    redactedContent: text("redacted_content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("job_log_chunks_seq_idx").on(table.jobId, table.attemptId, table.sequence)],
);

export const discoveryResults = pgTable("discovery_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  confidence: confidence("confidence").notNull(),
  commands: jsonb("commands").$type<Record<string, string | null>>().notNull(),
  evidence: jsonb("evidence").$type<Array<{ source: string; detail: string }>>().notNull().default([]),
  source: text("source").notNull(),
  shouldWriteDiscoveredFile: boolean("should_write_discovered_file").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const triageDecision = pgEnum("triage_decision", ["attempt", "needs_more_info", "decline"]);

export const triageResults = pgTable("triage_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  decision: triageDecision("decision").notNull(),
  category: text("category").notNull(),
  reasoning: text("reasoning").notNull(),
  suspectFiles: jsonb("suspect_files").$type<string[]>().notNull().default([]),
  plan: text("plan"),
  source: text("source").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const validationResults = pgTable("validation_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  passed: boolean("passed").notNull(),
  summary: text("summary").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reviewResults = pgTable("review_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  passed: boolean("passed").notNull(),
  summary: text("summary").notNull(),
  blockers: jsonb("blockers").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pullRequests = pgTable("pull_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .unique()
    .references(() => jobs.id, { onDelete: "cascade" }),
  githubId: bigint("github_id", { mode: "number" }).notNull().unique(),
  number: integer("number").notNull(),
  url: text("url").notNull(),
  draft: boolean("draft").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const repositoriesRelations = relations(repositories, ({ one, many }) => ({
  installation: one(githubInstallations, {
    fields: [repositories.installationId],
    references: [githubInstallations.id],
  }),
  policy: one(repositoryPolicies),
  issues: many(issues),
  jobs: many(jobs),
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  repository: one(repositories, { fields: [jobs.repositoryId], references: [repositories.id] }),
  issue: one(issues, { fields: [jobs.issueId], references: [issues.id] }),
  attempts: many(jobAttempts),
  events: many(jobEvents),
  logs: many(jobLogChunks),
  discoveryResults: many(discoveryResults),
}));

export const jobAttemptsRelations = relations(jobAttempts, ({ one, many }) => ({
  job: one(jobs, { fields: [jobAttempts.jobId], references: [jobs.id] }),
  logs: many(jobLogChunks),
}));

export const jobLogChunksRelations = relations(jobLogChunks, ({ one }) => ({
  job: one(jobs, { fields: [jobLogChunks.jobId], references: [jobs.id] }),
  attempt: one(jobAttempts, { fields: [jobLogChunks.attemptId], references: [jobAttempts.id] }),
}));

export const issuesRelations = relations(issues, ({ one, many }) => ({
  repository: one(repositories, { fields: [issues.repositoryId], references: [repositories.id] }),
  jobs: many(jobs),
}));

export const repositoryPoliciesRelations = relations(repositoryPolicies, ({ one }) => ({
  repository: one(repositories, { fields: [repositoryPolicies.repositoryId], references: [repositories.id] }),
}));
