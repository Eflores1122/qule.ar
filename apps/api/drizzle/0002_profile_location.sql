ALTER TABLE "profile" ADD COLUMN "cell_lat" double precision;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "cell_lng" double precision;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "location_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "show_distance" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "profile_cell_idx" ON "profile" USING btree ("cell_lat","cell_lng");