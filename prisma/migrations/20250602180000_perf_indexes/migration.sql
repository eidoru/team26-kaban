-- Hot-path indexes for membership lookups, round status, contributions, and notifications.
CREATE INDEX IF NOT EXISTS "memberships_user_id_idx" ON "memberships"("user_id");
CREATE INDEX IF NOT EXISTS "memberships_group_id_idx" ON "memberships"("group_id");
CREATE INDEX IF NOT EXISTS "rounds_group_id_status_idx" ON "rounds"("group_id", "status");
CREATE INDEX IF NOT EXISTS "contributions_round_id_status_idx" ON "contributions"("round_id", "status");
CREATE INDEX IF NOT EXISTS "obligations_debtor_status_idx" ON "obligations"("debtor_membership_id", "status");
CREATE INDEX IF NOT EXISTS "obligations_source_round_id_idx" ON "obligations"("source_round_id");
CREATE INDEX IF NOT EXISTS "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "notifications_user_id_unread_idx" ON "notifications"("user_id") WHERE "read_at" IS NULL;
