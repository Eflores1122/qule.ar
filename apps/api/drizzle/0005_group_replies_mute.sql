ALTER TABLE "group_member" ADD COLUMN "muted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "group_message" ADD COLUMN "reply_to_id" text;