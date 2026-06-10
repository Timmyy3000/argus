CREATE TYPE "public"."triage_decision" AS ENUM('attempt', 'needs_more_info', 'decline');--> statement-breakpoint
CREATE TABLE "triage_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"decision" "triage_decision" NOT NULL,
	"category" text NOT NULL,
	"reasoning" text NOT NULL,
	"suspect_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"plan" text,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "triage_results" ADD CONSTRAINT "triage_results_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;