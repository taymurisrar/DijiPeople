-- Baseline Employee soft-delete columns that exist in the Prisma schema.
-- IF NOT EXISTS keeps this safe for development databases where these columns
-- were added manually before the migration history was updated.
ALTER TABLE "Employee"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletedById" TEXT,
  ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Employee"
SET "isDeleted" = false
WHERE "isDeleted" IS NULL;

ALTER TABLE "Employee"
  ALTER COLUMN "isDeleted" SET DEFAULT false,
  ALTER COLUMN "isDeleted" SET NOT NULL;
