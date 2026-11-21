CREATE INDEX "block_blocked_idx" ON "block" USING btree ("blocked_id");--> statement-breakpoint
CREATE INDEX "conv_user_b_idx" ON "conversation" USING btree ("user_b");--> statement-breakpoint
CREATE INDEX "dm_photo_key_idx" ON "direct_message" USING btree ("photo_key");--> statement-breakpoint
CREATE INDEX "group_member_user_idx" ON "group_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "photo_key_idx" ON "photo" USING btree ("key");--> statement-breakpoint
CREATE INDEX "photo_poster_key_idx" ON "photo" USING btree ("poster_key");