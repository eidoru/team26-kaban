-- The organizing fee (R-SET-08, R-DEC-39) was removed, but production had already run its migration. The fee
-- columns go with it, along with any fees recorded on them.
ALTER TABLE "groups" DROP COLUMN "organizer_fee_rate_bp";
ALTER TABLE "submissions" DROP COLUMN "fee";
ALTER TABLE "submissions" DROP COLUMN "effective_fee";
ALTER TABLE "refunds" DROP COLUMN "fee";
ALTER TABLE "payouts" DROP COLUMN "fee_deducted";
