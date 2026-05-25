CREATE TABLE "PlatformAuditLog" (
    "id" TEXT NOT NULL,
    "platformActorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "requestId" TEXT,
    "traceId" TEXT,
    "sourceModule" TEXT,
    "scope" JSONB,
    "beforeSnapshot" JSONB,
    "afterSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformAuditLog_createdAt_idx" ON "PlatformAuditLog"("createdAt");
CREATE INDEX "PlatformAuditLog_action_createdAt_idx" ON "PlatformAuditLog"("action", "createdAt");
CREATE INDEX "PlatformAuditLog_entityType_createdAt_idx" ON "PlatformAuditLog"("entityType", "createdAt");
CREATE INDEX "PlatformAuditLog_platformActorUserId_createdAt_idx" ON "PlatformAuditLog"("platformActorUserId", "createdAt");
CREATE INDEX "PlatformAuditLog_requestId_idx" ON "PlatformAuditLog"("requestId");
CREATE INDEX "PlatformAuditLog_sourceModule_createdAt_idx" ON "PlatformAuditLog"("sourceModule", "createdAt");

ALTER TABLE "PlatformAuditLog" ADD CONSTRAINT "PlatformAuditLog_platformActorUserId_fkey" FOREIGN KEY ("platformActorUserId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
