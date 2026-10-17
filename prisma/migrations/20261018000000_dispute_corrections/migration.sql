-- R-DEC-21: disputes left pending when their period closes expire.
ALTER TYPE "ReviewStatus" ADD VALUE 'EXPIRED';

-- What the submission was worth when the dispute was raised, so history shows "from → to".
-- No dispute has been written yet anywhere, so the default only satisfies NOT NULL while adding it.
ALTER TABLE "disputes" ADD COLUMN "previous_amount" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "disputes" ALTER COLUMN "previous_amount" DROP DEFAULT;
