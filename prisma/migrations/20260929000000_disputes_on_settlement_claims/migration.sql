-- Disputes can now be about a rejected settlement claim instead of a round payment.
ALTER TABLE "disputes" ALTER COLUMN "contribution_id" DROP NOT NULL;
ALTER TABLE "disputes" ADD COLUMN "settlement_claim_id" TEXT;

ALTER TABLE "disputes"
  ADD CONSTRAINT "disputes_settlement_claim_id_fkey"
  FOREIGN KEY ("settlement_claim_id") REFERENCES "settlement_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "disputes_settlement_claim_id_idx" ON "disputes"("settlement_claim_id");

-- Exactly one subject per dispute.
ALTER TABLE "disputes"
  ADD CONSTRAINT "disputes_one_subject_check"
  CHECK (num_nonnulls("contribution_id", "settlement_claim_id") = 1);
