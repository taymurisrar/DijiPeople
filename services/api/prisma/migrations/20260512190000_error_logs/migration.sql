CREATE TABLE "ErrorLog" (
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "errorCode" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "stack" TEXT,
    "cause" JSONB,
    "details" JSONB,
    "method" TEXT,
    "path" TEXT,
    "params" JSONB,
    "query" JSONB,
    "requestBody" JSONB,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "userId" TEXT,
    "tenantId" TEXT,
    "organizationId" TEXT,
    "businessUnitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ErrorLog_traceId_key" ON "ErrorLog"("traceId");
CREATE INDEX "ErrorLog_traceId_idx" ON "ErrorLog"("traceId");
CREATE INDEX "ErrorLog_tenantId_createdAt_idx" ON "ErrorLog"("tenantId", "createdAt");
CREATE INDEX "ErrorLog_errorCode_createdAt_idx" ON "ErrorLog"("errorCode", "createdAt");
CREATE INDEX "ErrorLog_severity_createdAt_idx" ON "ErrorLog"("severity", "createdAt");
CREATE INDEX "ErrorLog_createdAt_idx" ON "ErrorLog"("createdAt");
