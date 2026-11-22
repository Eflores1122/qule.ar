CREATE TABLE "restricted_email" (
	"fingerprint" text PRIMARY KEY NOT NULL,
	"subject_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "album_grant" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "group" ADD COLUMN "community_country" text;--> statement-breakpoint
ALTER TABLE "group" ADD COLUMN "community_city" text;--> statement-breakpoint
ALTER TABLE "group" ADD COLUMN "community_municipality" text;--> statement-breakpoint
ALTER TABLE "group" ADD COLUMN "topic" text;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "orientation" text;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "show_identity" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "restricted_email_subject_idx" ON "restricted_email" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "group_community_idx" ON "group" USING btree ("community_country","community_city");--> statement-breakpoint
-- Antes de esta migración, compartir un álbum daba acceso inmediato.
UPDATE "album_grant" SET "accepted_at" = "created_at";--> statement-breakpoint
-- Distingue el texto anterior de un valor cifrado, incluso si empieza con «v1:».
UPDATE "direct_message" SET "body" = 'legacy:' || "body" WHERE "body" IS NOT NULL;--> statement-breakpoint
UPDATE "report" SET
  "target_name" = 'legacy:' || "target_name",
  "message_body" = 'legacy:' || "message_body",
  "details" = 'legacy:' || "details",
  "resolution" = 'legacy:' || "resolution"
WHERE coalesce("target_name", "message_body", "details", "resolution") IS NOT NULL;
