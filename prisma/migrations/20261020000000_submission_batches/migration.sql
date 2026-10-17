-- R-DEC-33: one payment split across rounds is stored as one submission per round, linked by batch_id.
ALTER TABLE "submissions" ADD COLUMN "batch_id" TEXT;

CREATE INDEX "submissions_batch_id_idx" ON "submissions"("batch_id");
