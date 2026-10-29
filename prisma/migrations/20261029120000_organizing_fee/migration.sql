-- R-SET-08, R-DEC-39: optional organizing fee, paid on top of payments and outside the pot.
ALTER TABLE "groups" ADD COLUMN "organizer_fee_rate_bp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "submissions" ADD COLUMN "fee" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "submissions" ADD COLUMN "effective_fee" BIGINT;
ALTER TABLE "refunds" ADD COLUMN "fee" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "payouts" ADD COLUMN "fee_deducted" BIGINT NOT NULL DEFAULT 0;
