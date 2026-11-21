ALTER TABLE "album_grant" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
-- Los permisos anteriores a esta migración daban acceso desde el momento en que se compartían.
UPDATE "album_grant" SET "accepted_at" = "created_at";--> statement-breakpoint
ALTER TABLE "group" ADD COLUMN "community_country" text;--> statement-breakpoint
ALTER TABLE "group" ADD COLUMN "community_city" text;--> statement-breakpoint
CREATE INDEX "group_community_idx" ON "group" USING btree ("community_country","community_city");
