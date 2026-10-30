-- The terms-and-conditions feature was reverted (#74), but production had already run its migration, leaving a
-- NOT NULL "terms" column that no code fills. IF EXISTS: databases created after the revert never had it.
ALTER TABLE "groups" DROP COLUMN IF EXISTS "terms";
