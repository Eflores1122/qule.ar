ALTER TABLE "report" DROP CONSTRAINT "report_reporter_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "report" DROP CONSTRAINT "report_target_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "report" ALTER COLUMN "reporter_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "report" ALTER COLUMN "target_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "target_name" text;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "message_body" text;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "evidence_keys" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Reportes que ya existían: copia del nombre, del texto y de la foto del mensaje reportado
UPDATE "report" SET "target_name" = p."display_name" FROM "profile" p WHERE p."user_id" = "report"."target_user_id";--> statement-breakpoint
UPDATE "report" SET "message_body" = gm."body" FROM "group_message" gm WHERE "report"."message_kind" = 'group' AND gm."id" = "report"."message_id";--> statement-breakpoint
UPDATE "report" SET "message_body" = dm."body", "evidence_keys" = CASE WHEN dm."photo_key" IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(dm."photo_key") END FROM "direct_message" dm WHERE "report"."message_kind" = 'dm' AND dm."id" = "report"."message_id";--> statement-breakpoint
-- Con la copia a salvo, los mensajes de grupo borrados o cancelados se vacían de verdad
UPDATE "group_message" SET "body" = '' WHERE "status" IN ('deleted', 'cancelled');
