ALTER TABLE "CustomerOnboarding"
  ADD COLUMN IF NOT EXISTS "plannedTenantSlug" TEXT;

CREATE INDEX IF NOT EXISTS "CustomerOnboarding_plannedTenantSlug_idx"
  ON "CustomerOnboarding"("plannedTenantSlug");
