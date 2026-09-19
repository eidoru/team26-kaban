-- CreateEnum
CREATE TYPE "SettlementClaimStatus" AS ENUM ('pending', 'confirmed', 'rejected');

-- CreateTable
CREATE TABLE "settlement_claims" (
    "id" TEXT NOT NULL,
    "debtor_membership_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "proof_url" TEXT,
    "status" "SettlementClaimStatus" NOT NULL DEFAULT 'pending',
    "review_note" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlement_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "settlement_claims_debtor_membership_id_status_idx" ON "settlement_claims"("debtor_membership_id", "status");

-- AddForeignKey
ALTER TABLE "settlement_claims" ADD CONSTRAINT "settlement_claims_debtor_membership_id_fkey" FOREIGN KEY ("debtor_membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
