-- Gateway runtime (Phase 2): live device verification, queue telemetry, manual
-- sync requests and provisioning leases.
--
-- Purely additive: one new enum, new nullable columns with defaults, and new
-- indexes. No existing migration is touched, no column is dropped or retyped,
-- and no data is rewritten.

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AttendanceDeviceVerificationStatus') THEN
    CREATE TYPE "AttendanceDeviceVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'FAILED', 'SERIAL_MISMATCH');
  END IF;
END
$$;

-- ---------------------------------------------------------------- devices ---
-- Phase 1 could not populate any of this: nothing had ever contacted a device.
-- The gateway runtime now reports a real verification outcome, so the platform
-- records what the terminal actually answered rather than assuming.
ALTER TABLE "AttendanceDevice"
ADD COLUMN IF NOT EXISTS "verificationStatus" "AttendanceDeviceVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN IF NOT EXISTS "lastVerifiedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lastVerificationError" TEXT,
-- Kept separate from `serialNumber`, which is what the administrator configured.
-- A mismatch between the two is exactly the condition worth surfacing, so the
-- observed value must not overwrite the expected one.
ADD COLUMN IF NOT EXISTS "actualSerialNumber" TEXT,
-- Device wall clock as the terminal reported it: "YYYY-MM-DDTHH:mm:ss", no
-- offset. Stored as text for the same reason RawAttendanceEvent.occurredAtLocal
-- is: appending a timezone the device never stated would be a fabrication.
ADD COLUMN IF NOT EXISTS "lastDeviceTimeLocal" TEXT,
ADD COLUMN IF NOT EXISTS "lastClockDriftSeconds" INTEGER,
ADD COLUMN IF NOT EXISTS "lastVerificationLatencyMs" INTEGER,
-- Manual "sync now". A request is a timestamp the gateway compares against what
-- it has already acknowledged, so a missed poll cannot lose the request and a
-- repeated click cannot queue two syncs.
ADD COLUMN IF NOT EXISTS "syncRequestedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "syncRequestedById" TEXT,
ADD COLUMN IF NOT EXISTS "syncRequestAcknowledgedAt" TIMESTAMP(3);

-- --------------------------------------------------------------- gateways ---
-- Queue telemetry reported by the gateway on each heartbeat. Counts and ages
-- only: the queued payloads themselves never leave the customer machine until
-- they are ingested through the normal attendance endpoint.
ALTER TABLE "IntegrationGateway"
ADD COLUMN IF NOT EXISTS "pendingQueueCount" INTEGER,
ADD COLUMN IF NOT EXISTS "oldestPendingEventAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lastSuccessfulUploadAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "deviceCountOnline" INTEGER,
ADD COLUMN IF NOT EXISTS "deviceCountUnreachable" INTEGER,
ADD COLUMN IF NOT EXISTS "installationId" TEXT;

-- ----------------------------------------------------------- provisioning ---
-- Server-side claim/lease. A gateway claims a job by winning a conditional
-- UPDATE; the lease is what allows recovery when a gateway crashes after
-- claiming but before reporting, without letting two gateways execute the same
-- write against one terminal.
ALTER TABLE "DeviceProvisioningJob"
ADD COLUMN IF NOT EXISTS "claimedByGatewayId" TEXT,
ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "leaseExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AttendanceDevice_tenantId_verificationStatus_idx"
  ON "AttendanceDevice"("tenantId", "verificationStatus");

CREATE INDEX IF NOT EXISTS "AttendanceDevice_tenantId_gatewayId_syncRequestedAt_idx"
  ON "AttendanceDevice"("tenantId", "gatewayId", "syncRequestedAt");

CREATE INDEX IF NOT EXISTS "DeviceProvisioningJob_tenantId_claimedByGatewayId_idx"
  ON "DeviceProvisioningJob"("tenantId", "claimedByGatewayId");

CREATE INDEX IF NOT EXISTS "DeviceProvisioningJob_status_leaseExpiresAt_idx"
  ON "DeviceProvisioningJob"("status", "leaseExpiresAt");
