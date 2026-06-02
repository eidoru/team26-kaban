-- Track cumulative shortfall interest paid so interest-only payments reduce future interest due.
ALTER TABLE "obligations" ADD COLUMN "interest_settled_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
