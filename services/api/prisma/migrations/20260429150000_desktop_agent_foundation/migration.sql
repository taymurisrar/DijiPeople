-- CreateEnum
CREATE TYPE "AgentActivityState" AS ENUM ('ACTIVE', 'IDLE', 'AWAY');

-- CreateEnum
CREATE TYPE "WorkSessionStatus" AS ENUM ('ACTIVE', 'IDLE', 'AWAY', 'ENDED');

-- CreateTable
CREATE TABLE "EmployeeDevice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceFingerprint" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "os" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "agentVersion" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRefreshToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "status" "WorkSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "totalActiveSeconds" INTEGER NOT NULL DEFAULT 0,
    "totalIdleSeconds" INTEGER NOT NULL DEFAULT 0,
    "totalAwaySeconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "state" "AgentActivityState" NOT NULL,
    "idleSeconds" INTEGER NOT NULL,
    "activeApp" TEXT,
    "windowTitle" TEXT,
    "agentVersion" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyProductivitySummary" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "loggedInSeconds" INTEGER NOT NULL DEFAULT 0,
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "idleSeconds" INTEGER NOT NULL DEFAULT 0,
    "awaySeconds" INTEGER NOT NULL DEFAULT 0,
    "utilizationPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "lastCalculatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyProductivitySummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTrackingSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "heartbeatIntervalSeconds" INTEGER NOT NULL DEFAULT 60,
    "idleThresholdSeconds" INTEGER NOT NULL DEFAULT 120,
    "awayThresholdSeconds" INTEGER NOT NULL DEFAULT 600,
    "captureActiveApp" BOOLEAN NOT NULL DEFAULT true,
    "captureWindowTitle" BOOLEAN NOT NULL DEFAULT false,
    "offlineQueueEnabled" BOOLEAN NOT NULL DEFAULT true,
    "heartbeatBatchSize" INTEGER NOT NULL DEFAULT 10,
    "minimumSupportedVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "latestVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "forceUpdate" BOOLEAN NOT NULL DEFAULT false,
    "updateMessage" TEXT,
    "autoUpdateEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTrackingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeDevice_tenantId_deviceFingerprint_key" ON "EmployeeDevice"("tenantId", "deviceFingerprint");
CREATE INDEX "EmployeeDevice_tenantId_employeeId_idx" ON "EmployeeDevice"("tenantId", "employeeId");
CREATE INDEX "EmployeeDevice_tenantId_userId_idx" ON "EmployeeDevice"("tenantId", "userId");
CREATE INDEX "EmployeeDevice_tenantId_isActive_idx" ON "EmployeeDevice"("tenantId", "isActive");
CREATE INDEX "AgentRefreshToken_tenantId_userId_idx" ON "AgentRefreshToken"("tenantId", "userId");
CREATE INDEX "AgentRefreshToken_tenantId_employeeId_idx" ON "AgentRefreshToken"("tenantId", "employeeId");
CREATE INDEX "AgentRefreshToken_tenantId_deviceId_idx" ON "AgentRefreshToken"("tenantId", "deviceId");
CREATE INDEX "AgentRefreshToken_expiresAt_revokedAt_idx" ON "AgentRefreshToken"("expiresAt", "revokedAt");
CREATE INDEX "WorkSession_tenantId_employeeId_startedAt_idx" ON "WorkSession"("tenantId", "employeeId", "startedAt");
CREATE INDEX "WorkSession_tenantId_userId_idx" ON "WorkSession"("tenantId", "userId");
CREATE INDEX "WorkSession_tenantId_deviceId_idx" ON "WorkSession"("tenantId", "deviceId");
CREATE INDEX "WorkSession_tenantId_status_idx" ON "WorkSession"("tenantId", "status");
CREATE INDEX "WorkSession_tenantId_lastHeartbeatAt_idx" ON "WorkSession"("tenantId", "lastHeartbeatAt");
CREATE INDEX "ActivityEvent_tenantId_employeeId_occurredAt_idx" ON "ActivityEvent"("tenantId", "employeeId", "occurredAt");
CREATE INDEX "ActivityEvent_tenantId_sessionId_occurredAt_idx" ON "ActivityEvent"("tenantId", "sessionId", "occurredAt");
CREATE INDEX "ActivityEvent_tenantId_deviceId_occurredAt_idx" ON "ActivityEvent"("tenantId", "deviceId", "occurredAt");
CREATE UNIQUE INDEX "DailyProductivitySummary_tenantId_employeeId_date_key" ON "DailyProductivitySummary"("tenantId", "employeeId", "date");
CREATE INDEX "DailyProductivitySummary_tenantId_date_idx" ON "DailyProductivitySummary"("tenantId", "date");
CREATE INDEX "DailyProductivitySummary_tenantId_userId_date_idx" ON "DailyProductivitySummary"("tenantId", "userId", "date");
CREATE UNIQUE INDEX "AgentTrackingSettings_tenantId_key" ON "AgentTrackingSettings"("tenantId");
CREATE INDEX "AgentTrackingSettings_tenantId_enabled_idx" ON "AgentTrackingSettings"("tenantId", "enabled");

-- AddForeignKey
ALTER TABLE "EmployeeDevice" ADD CONSTRAINT "EmployeeDevice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeDevice" ADD CONSTRAINT "EmployeeDevice_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeDevice" ADD CONSTRAINT "EmployeeDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRefreshToken" ADD CONSTRAINT "AgentRefreshToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRefreshToken" ADD CONSTRAINT "AgentRefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRefreshToken" ADD CONSTRAINT "AgentRefreshToken_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRefreshToken" ADD CONSTRAINT "AgentRefreshToken_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "EmployeeDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "EmployeeDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "EmployeeDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyProductivitySummary" ADD CONSTRAINT "DailyProductivitySummary_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyProductivitySummary" ADD CONSTRAINT "DailyProductivitySummary_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyProductivitySummary" ADD CONSTRAINT "DailyProductivitySummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentTrackingSettings" ADD CONSTRAINT "AgentTrackingSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
