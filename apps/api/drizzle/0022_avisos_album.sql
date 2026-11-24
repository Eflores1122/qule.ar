-- Admite bases locales que alcanzaron a aplicar parte de las migraciones borrador.
ALTER TABLE "direct_message" ADD COLUMN IF NOT EXISTS "album_id" text;
--> statement-breakpoint
ALTER TABLE "direct_message" DROP CONSTRAINT IF EXISTS "direct_message_album_id_album_id_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dm_notice_album_idx" ON "direct_message" USING btree ("conversation_id","sender_id","album_id") WHERE "direct_message"."kind" in ('album', 'album_revoked', 'album_expired') and "direct_message"."album_id" is not null;
