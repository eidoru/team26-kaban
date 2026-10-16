-- Paluwagan process rewrite (docs/paluwagan-user-journey.md). R-DEC-09: start from an empty
-- database, so every old table, type and realtime helper is dropped, user accounts included.

DROP TABLE IF EXISTS
  "catch_up_agreements", "settlements", "settlement_claims", "disputes", "obligations",
  "contributions", "rounds", "invite_tokens", "memberships", "audit_logs", "notifications",
  "groups", "refresh_tokens", "users"
CASCADE;

DROP TYPE IF EXISTS
  "SettlementClaimStatus", "GroupStatus", "GroupFrequency", "RoundStatus", "ContributionStatus",
  "ContributionSource", "ObligationStatus", "InviteTokenType", "DisputeStatus", "NotificationType";

-- After the tables: their realtime policies depended on it.
DROP FUNCTION IF EXISTS public.is_group_member(text);

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "GroupState" AS ENUM ('LOBBY', 'LAUNCHED', 'ACTIVE', 'COMPLETED', 'COMPLETED_WITH_OUTSTANDING_DEBT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('WEEKLY', 'BI_WEEKLY', 'TWICE_MONTHLY', 'MONTHLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AmountMode" AS ENUM ('CONTRIBUTION', 'POT');

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('UPCOMING', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "SubmissionType" AS ENUM ('CONTRIBUTION', 'DEBT_PAYMENT');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('AWAITING_HANDOVER', 'HANDED_OVER', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "DebtEntryKind" AS ENUM ('SHORTFALL_COVERED', 'INTEREST_CHARGED', 'REPAYMENT', 'PAYOUT_DEDUCTION');

-- CreateEnum
CREATE TYPE "SwapStatus" AS ENUM ('AWAITING_TARGET', 'AWAITING_ORGANIZER', 'APPROVED', 'DECLINED', 'DENIED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "contact" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "organizer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" "GroupState" NOT NULL DEFAULT 'LOBBY',
    "slot_count" INTEGER NOT NULL,
    "amount_mode" "AmountMode" NOT NULL,
    "contribution" BIGINT NOT NULL,
    "pot" BIGINT NOT NULL,
    "entered_pot" BIGINT,
    "frequency" "Frequency" NOT NULL,
    "interval_days" INTEGER,
    "start_date" DATE NOT NULL,
    "interest_rate_bp" INTEGER NOT NULL DEFAULT 0,
    "order_locked" BOOLEAN NOT NULL DEFAULT false,
    "launched_at" TIMESTAMP(3),
    "activated_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slots" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "user_id" TEXT,
    "is_organizer" BOOLEAN NOT NULL DEFAULT false,
    "placeholder_name" TEXT,
    "placeholder_contact" TEXT,
    "position" INTEGER,
    "claimed_at" TIMESTAMP(3),
    "debt_principal" BIGINT NOT NULL DEFAULT 0,
    "debt_interest" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite_links" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "invite_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_links" (
    "id" TEXT NOT NULL,
    "slot_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "claimed_at" TIMESTAMP(3),
    "claimed_by_user_id" TEXT,

    CONSTRAINT "claim_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rounds" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "period_start" DATE NOT NULL,
    "payout_date" DATE NOT NULL,
    "recipient_slot_id" TEXT NOT NULL,
    "status" "RoundStatus" NOT NULL DEFAULT 'UPCOMING',
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "round_slot_results" (
    "id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "slot_id" TEXT NOT NULL,
    "due" BIGINT NOT NULL,
    "approved" BIGINT NOT NULL,
    "shortfall" BIGINT NOT NULL,
    "covered_by_organizer" BIGINT NOT NULL,

    CONSTRAINT "round_slot_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "gross" BIGINT NOT NULL,
    "own_shortfall" BIGINT NOT NULL,
    "interest_deducted" BIGINT NOT NULL,
    "principal_deducted" BIGINT NOT NULL,
    "net" BIGINT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'AWAITING_HANDOVER',
    "handed_over_at" TIMESTAMP(3),
    "handed_over_by_id" TEXT,
    "proof_path" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by_id" TEXT,
    "auto_confirmed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "slot_id" TEXT NOT NULL,
    "round_id" TEXT,
    "type" "SubmissionType" NOT NULL,
    "amount" BIGINT NOT NULL,
    "applied_as" "SubmissionType",
    "effective_amount" BIGINT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "proof_path" TEXT,
    "note" TEXT,
    "submitted_by_id" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "denial_reason" TEXT,
    "self_approved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "slot_id" TEXT NOT NULL,
    "raised_by_id" TEXT NOT NULL,
    "proposed_amount" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "slot_id" TEXT NOT NULL,
    "dispute_id" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt_entries" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "slot_id" TEXT NOT NULL,
    "kind" "DebtEntryKind" NOT NULL,
    "principal_delta" BIGINT NOT NULL,
    "interest_delta" BIGINT NOT NULL,
    "round_id" TEXT,
    "submission_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debt_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "swaps" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "requester_slot_id" TEXT NOT NULL,
    "target_slot_id" TEXT NOT NULL,
    "status" "SwapStatus" NOT NULL DEFAULT 'AWAITING_TARGET',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "target_responded_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,

    CONSTRAINT "swaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_entries" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "target_slot_id" TEXT,
    "target_name" TEXT,
    "amounts" JSONB,
    "before" JSONB,
    "after" JSONB,
    "proof_attached" BOOLEAN,
    "self_approved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "group_id" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "data" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders_sent" (
    "id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "slot_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminders_sent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "groups_organizer_id_idx" ON "groups"("organizer_id");

-- CreateIndex
CREATE INDEX "groups_state_idx" ON "groups"("state");

-- CreateIndex
CREATE UNIQUE INDEX "slots_group_id_user_id_key" ON "slots"("group_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "slots_group_id_position_key" ON "slots"("group_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "invite_links_token_key" ON "invite_links"("token");

-- CreateIndex
CREATE INDEX "invite_links_group_id_idx" ON "invite_links"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "claim_links_token_key" ON "claim_links"("token");

-- CreateIndex
CREATE INDEX "claim_links_slot_id_idx" ON "claim_links"("slot_id");

-- CreateIndex
CREATE INDEX "rounds_status_payout_date_idx" ON "rounds"("status", "payout_date");

-- CreateIndex
CREATE UNIQUE INDEX "rounds_group_id_number_key" ON "rounds"("group_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "round_slot_results_round_id_slot_id_key" ON "round_slot_results"("round_id", "slot_id");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_round_id_key" ON "payouts"("round_id");

-- CreateIndex
CREATE INDEX "submissions_group_id_status_submitted_at_idx" ON "submissions"("group_id", "status", "submitted_at");

-- CreateIndex
CREATE INDEX "submissions_slot_id_round_id_idx" ON "submissions"("slot_id", "round_id");

-- CreateIndex
CREATE INDEX "disputes_group_id_status_idx" ON "disputes"("group_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_dispute_id_key" ON "refunds"("dispute_id");

-- CreateIndex
CREATE INDEX "debt_entries_slot_id_created_at_idx" ON "debt_entries"("slot_id", "created_at");

-- CreateIndex
CREATE INDEX "swaps_group_id_status_idx" ON "swaps"("group_id", "status");

-- CreateIndex
CREATE INDEX "audit_entries_group_id_created_at_idx" ON "audit_entries"("group_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "reminders_sent_round_id_slot_id_kind_idx" ON "reminders_sent"("round_id", "slot_id", "kind");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slots" ADD CONSTRAINT "slots_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slots" ADD CONSTRAINT "slots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_links" ADD CONSTRAINT "claim_links_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_recipient_slot_id_fkey" FOREIGN KEY ("recipient_slot_id") REFERENCES "slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_slot_results" ADD CONSTRAINT "round_slot_results_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_slot_results" ADD CONSTRAINT "round_slot_results_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_entries" ADD CONSTRAINT "debt_entries_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_entries" ADD CONSTRAINT "debt_entries_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_entries" ADD CONSTRAINT "debt_entries_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swaps" ADD CONSTRAINT "swaps_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swaps" ADD CONSTRAINT "swaps_requester_slot_id_fkey" FOREIGN KEY ("requester_slot_id") REFERENCES "slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swaps" ADD CONSTRAINT "swaps_target_slot_id_fkey" FOREIGN KEY ("target_slot_id") REFERENCES "slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders_sent" ADD CONSTRAINT "reminders_sent_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders_sent" ADD CONSTRAINT "reminders_sent_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- R-AUD-02: audit entries are immutable. Corrections are new entries.
CREATE OR REPLACE FUNCTION public.reject_audit_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_entries is append-only';
END;
$$;

CREATE TRIGGER audit_entries_immutable
BEFORE UPDATE OR DELETE ON "audit_entries"
FOR EACH ROW EXECUTE FUNCTION public.reject_audit_change();

-- The server connects as the table owner, which bypasses RLS. Enabling it with no policies closes
-- every table to the Supabase API roles, in case the public schema is ever exposed.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refresh_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "slots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invite_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "claim_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rounds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "round_slot_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payouts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "disputes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refunds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "debt_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "swaps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reminders_sent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- Group updates reach browsers as server broadcasts. Only a user's own notifications stream
-- through postgres_changes, so that is the one policy.
CREATE POLICY "realtime_notifications_select"
ON "notifications" FOR SELECT
TO authenticated
USING (user_id = auth.uid()::text);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN duplicate_object OR undefined_object THEN NULL;
END $$;
