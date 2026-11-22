CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "album_grant_grantee_idx" ON "album_grant" USING btree ("grantee_id");--> statement-breakpoint
CREATE INDEX "dm_sender_idx" ON "direct_message" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "favorite_favorite_idx" ON "favorite" USING btree ("favorite_id");--> statement-breakpoint
CREATE INDEX "gjr_resolved_by_idx" ON "group_join_request" USING btree ("resolved_by");--> statement-breakpoint
CREATE INDEX "gm_author_idx" ON "group_message" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "profile_grid_idx" ON "profile" USING btree ("last_seen_at" DESC NULLS LAST) WHERE "profile"."incognito" = false and "profile"."suspended_at" is null;--> statement-breakpoint
CREATE INDEX "reaction_user_idx" ON "reaction" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");