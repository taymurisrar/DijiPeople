ALTER TABLE "AuditLog"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT,
  ADD COLUMN IF NOT EXISTS "businessUnitId" TEXT,
  ADD COLUMN IF NOT EXISTS "requestId" TEXT,
  ADD COLUMN IF NOT EXISTS "traceId" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceModule" TEXT,
  ADD COLUMN IF NOT EXISTS "scope" JSONB;

CREATE INDEX IF NOT EXISTS "AuditLog_tenantId_requestId_idx" ON "AuditLog"("tenantId", "requestId");
CREATE INDEX IF NOT EXISTS "AuditLog_tenantId_sourceModule_createdAt_idx" ON "AuditLog"("tenantId", "sourceModule", "createdAt");
