-- Shortfall interest rate set by manager at paluwagan creation (% per round period).
ALTER TABLE "groups" ADD COLUMN "shortfall_interest_rate_percent" DECIMAL(5,2) NOT NULL DEFAULT 0;
