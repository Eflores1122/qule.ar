CREATE TABLE "album_grant" (
	"owner_id" text NOT NULL,
	"grantee_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "album_grant_owner_id_grantee_id_pk" PRIMARY KEY("owner_id","grantee_id")
);
--> statement-breakpoint
CREATE TABLE "favorite" (
	"user_id" text NOT NULL,
	"favorite_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorite_user_id_favorite_id_pk" PRIMARY KEY("user_id","favorite_id")
);
--> statement-breakpoint
CREATE TABLE "profile_view" (
	"viewer_id" text NOT NULL,
	"viewed_id" text NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_view_viewer_id_viewed_id_pk" PRIMARY KEY("viewer_id","viewed_id")
);
--> statement-breakpoint
ALTER TABLE "direct_message" ADD COLUMN "kind" text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "direct_message" ADD COLUMN "expiring" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "direct_message" ADD COLUMN "opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "incognito" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "album_grant" ADD CONSTRAINT "album_grant_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_grant" ADD CONSTRAINT "album_grant_grantee_id_user_id_fk" FOREIGN KEY ("grantee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_favorite_id_user_id_fk" FOREIGN KEY ("favorite_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_view" ADD CONSTRAINT "profile_view_viewer_id_user_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_view" ADD CONSTRAINT "profile_view_viewed_id_user_id_fk" FOREIGN KEY ("viewed_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pv_viewed_idx" ON "profile_view" USING btree ("viewed_id","viewed_at");