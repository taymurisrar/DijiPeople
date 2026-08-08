-- Email templates can be limited to a single module. NULL keeps the existing
-- behaviour of applying to every module, so no backfill is needed.
ALTER TABLE "EmailTemplate" ADD COLUMN "moduleKey" TEXT;

CREATE INDEX "EmailTemplate_tenantId_moduleKey_idx" ON "EmailTemplate"("tenantId", "moduleKey");
