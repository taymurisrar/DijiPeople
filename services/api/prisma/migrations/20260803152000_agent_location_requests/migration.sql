CREATE TABLE "AgentLocationRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "requestedById" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "promptedAt" TIMESTAMP(3),
  "respondedAt" TIMESTAMP(3),
  "capturedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "accuracyMeters" DOUBLE PRECISION,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgentLocationRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentLocationRequest_tenantId_employeeId_requestedAt_idx"
  ON "AgentLocationRequest"("tenantId", "employeeId", "requestedAt");

CREATE INDEX "AgentLocationRequest_tenantId_deviceId_status_expiresAt_idx"
  ON "AgentLocationRequest"("tenantId", "deviceId", "status", "expiresAt");

CREATE INDEX "AgentLocationRequest_tenantId_userId_idx"
  ON "AgentLocationRequest"("tenantId", "userId");

CREATE INDEX "AgentLocationRequest_tenantId_requestedById_idx"
  ON "AgentLocationRequest"("tenantId", "requestedById");

ALTER TABLE "AgentLocationRequest"
  ADD CONSTRAINT "AgentLocationRequest_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentLocationRequest"
  ADD CONSTRAINT "AgentLocationRequest_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentLocationRequest"
  ADD CONSTRAINT "AgentLocationRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentLocationRequest"
  ADD CONSTRAINT "AgentLocationRequest_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AgentLocationRequest"
  ADD CONSTRAINT "AgentLocationRequest_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "EmployeeDevice"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
