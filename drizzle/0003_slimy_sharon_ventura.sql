ALTER TABLE "github_installations" ALTER COLUMN "installation_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "issues" ALTER COLUMN "github_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "pull_requests" ALTER COLUMN "github_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "repositories" ALTER COLUMN "github_id" SET DATA TYPE bigint;