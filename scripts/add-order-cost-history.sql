-- Apply to an existing PostgreSQL workspace before deploying this version.
-- Existing rows remain NULL: their historical costs are not invented.
ALTER TABLE "OrderLine" ADD COLUMN IF NOT EXISTS "costAtOrderCents" INTEGER;
