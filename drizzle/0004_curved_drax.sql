CREATE TYPE "public"."standards_kind" AS ENUM('agents', 'skill');--> statement-breakpoint
CREATE TABLE "standards_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "standards_kind" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"content" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "standards_files_kind_name_idx" ON "standards_files" USING btree ("kind","name");