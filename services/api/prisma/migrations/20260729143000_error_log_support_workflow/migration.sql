ALTER TABLE "ErrorLog"
  ADD COLUMN "sourceApp" TEXT NOT NULL DEFAULT 'api',
  ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "supportStatus" TEXT NOT NULL DEFAULT 'NEW',
  ADD COLUMN "assignedTo" TEXT,
  ADD COLUMN "internalNote" TEXT,
  ADD COLUMN "customerUpdate" TEXT,
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "ErrorLog"
SET "sourceApp" = CASE
  WHEN LEFT("traceId", 7) = 'client_' THEN 'web'
  WHEN LEFT("traceId", 6) = 'admin_' THEN 'admin'
  ELSE 'api'
END;

CREATE INDEX "ErrorLog_sourceApp_createdAt_idx"
  ON "ErrorLog"("sourceApp", "createdAt");
CREATE INDEX "ErrorLog_supportStatus_createdAt_idx"
  ON "ErrorLog"("supportStatus", "createdAt");
