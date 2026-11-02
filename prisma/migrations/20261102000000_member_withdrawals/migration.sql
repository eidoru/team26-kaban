-- §9.1, R-DEC-40: leaving a launched paluwagan by handing the slot to a replacement (R-WDR-01…12).
-- Problem reports that ask a payment back before leaving carry a proof photo (R-WDR-04).

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('AWAITING_REPLACEMENT', 'AWAITING_ORGANIZER', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "disputes" ADD COLUMN     "for_leaving" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "proof_path" TEXT;

-- CreateTable
CREATE TABLE "withdrawals" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "slot_id" TEXT NOT NULL,
    "leaver_user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "proof_path" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'AWAITING_REPLACEMENT',
    "left_ahead" BIGINT NOT NULL,
    "replacement_user_id" TEXT,
    "accepted_at" TIMESTAMP(3),
    "accepted_debt" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "withdrawals_token_key" ON "withdrawals"("token");

-- CreateIndex
CREATE INDEX "withdrawals_group_id_status_idx" ON "withdrawals"("group_id", "status");

-- CreateIndex
CREATE INDEX "withdrawals_slot_id_status_idx" ON "withdrawals"("slot_id", "status");

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_leaver_user_id_fkey" FOREIGN KEY ("leaver_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_replacement_user_id_fkey" FOREIGN KEY ("replacement_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- R-WDR-06: one open request per slot; R-WDR-07: one open request per replacement in a group. The
-- service checks both under the group lock; these keep it true whatever happens.
CREATE UNIQUE INDEX "withdrawals_one_open_per_slot" ON "withdrawals"("slot_id")
  WHERE "status" IN ('AWAITING_REPLACEMENT', 'AWAITING_ORGANIZER');
CREATE UNIQUE INDEX "withdrawals_one_open_per_replacement" ON "withdrawals"("group_id", "replacement_user_id")
  WHERE "status" IN ('AWAITING_REPLACEMENT', 'AWAITING_ORGANIZER') AND "replacement_user_id" IS NOT NULL;

-- Every table has RLS on; the server reaches it through Prisma, browsers never do.
ALTER TABLE "withdrawals" ENABLE ROW LEVEL SECURITY;
