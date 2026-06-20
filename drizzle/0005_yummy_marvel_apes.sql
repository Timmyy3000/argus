ALTER TYPE "public"."standards_kind" ADD VALUE 'review';--> statement-breakpoint
ALTER TYPE "public"."standards_kind" ADD VALUE 'publish';--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
