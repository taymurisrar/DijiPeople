-- Tenant control plane: lifecycle states, provisioning runs, per-tenant app
-- policy, and the platform-level erasure receipt.
--
-- ADDITIVE ONLY. No existing column changes type, gains a NOT NULL constraint,
-- or is dropped, and no existing row is rewritten. The four new TenantStatus
-- members extend the enum; every tenant keeps the status it has today.

-- Lifecycle states that were missing. "Provisioning" and "Provisioning failed"
-- were previously both squashed into ONBOARDING, so operations could not tell a
-- tenant waiting on paperwork apart from one whose provisioning had broken.
-- "Decommissioning" separates a retirement in progress from ARCHIVED.
ALTER TYPE "TenantStatus" ADD VALUE IF NOT EXISTS 'PROVISIONING';
ALTER TYPE "TenantStatus" ADD VALUE IF NOT EXISTS 'PROVISIONING_FAILED';
ALTER TYPE "TenantStatus" ADD VALUE IF NOT EXISTS 'DECOMMISSIONING';
ALTER TYPE "TenantStatus" ADD VALUE IF NOT EXISTS 'DECOMMISSIONED';

-- Service accounts need to say what they are for. Nullable with no default, so
-- every existing user row is untouched and human accounts stay empty.
ALTER TABLE "User" ADD COLUMN "serviceAccountPurpose" TEXT;

CREATE TYPE "TenantProvisioningRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "TenantProvisioningStepStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');
CREATE TYPE "TenantAppUpdatePolicy" AS ENUM ('AUTOMATIC', 'MANUAL', 'PINNED');
CREATE TYPE "TenantErasureStatus" AS ENUM ('REQUESTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

CREATE TABLE "TenantProvisioningRun" (
  "id"            TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "trigger"       TEXT NOT NULL DEFAULT 'ONBOARDING',
  "attempt"       INTEGER NOT NULL DEFAULT 1,
  "status"        "TenantProvisioningRunStatus" NOT NULL DEFAULT 'RUNNING',
  "startedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"   TIMESTAMP(3),
  "durationMs"    INTEGER,
  "failedStepKey" TEXT,
  "message"       TEXT,
  "correlationId" TEXT,
  "requestedById" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantProvisioningRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TenantProvisioningStep" (
  "id"          TEXT NOT NULL,
  "tenantId"    TEXT NOT NULL,
  "runId"       TEXT NOT NULL,
  "key"         TEXT NOT NULL,
  "label"       TEXT NOT NULL,
  "sequence"    INTEGER NOT NULL,
  "status"      "TenantProvisioningStepStatus" NOT NULL DEFAULT 'PENDING',
  "isRetryable" BOOLEAN NOT NULL DEFAULT false,
  "startedAt"   TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "durationMs"  INTEGER,
  "message"     TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantProvisioningStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TenantAppAssignment" (
  "id"                TEXT NOT NULL,
  "tenantId"          TEXT NOT NULL,
  "appKey"            TEXT NOT NULL,
  "isEnabled"         BOOLEAN NOT NULL DEFAULT true,
  "channel"           "ApplicationReleaseChannel" NOT NULL DEFAULT 'STABLE',
  "updatePolicy"      "TenantAppUpdatePolicy" NOT NULL DEFAULT 'AUTOMATIC',
  "assignedReleaseId" TEXT,
  "minimumVersion"    TEXT,
  "notes"             TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  "createdById"       TEXT,
  "updatedById"       TEXT,
  CONSTRAINT "TenantAppAssignment_pkey" PRIMARY KEY ("id")
);

-- No tenantId foreign key on purpose: this row has to outlive the tenant whose
-- erasure it evidences.
CREATE TABLE "TenantErasureReceipt" (
  "id"                   TEXT NOT NULL,
  "tenantId"             TEXT NOT NULL,
  "tenantName"           TEXT NOT NULL,
  "tenantSlug"           TEXT NOT NULL,
  "tenantCode"           TEXT,
  "customerAccountId"    TEXT,
  "customerName"         TEXT,
  "reason"               TEXT NOT NULL,
  "status"               "TenantErasureStatus" NOT NULL DEFAULT 'REQUESTED',
  "requestedById"        TEXT,
  "requestedByName"      TEXT,
  "requestedByEmail"     TEXT,
  "executedById"         TEXT,
  "executedByName"       TEXT,
  "requestedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt"            TIMESTAMP(3),
  "completedAt"          TIMESTAMP(3),
  "durationMs"           INTEGER,
  "erasedRecordCounts"   JSONB,
  "retainedRecordCounts" JSONB,
  "failureMessage"       TEXT,
  "correlationId"        TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantErasureReceipt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TenantProvisioningRun_tenantId_idx" ON "TenantProvisioningRun"("tenantId");
CREATE INDEX "TenantProvisioningRun_tenantId_startedAt_idx" ON "TenantProvisioningRun"("tenantId", "startedAt");
CREATE INDEX "TenantProvisioningRun_status_idx" ON "TenantProvisioningRun"("status");

CREATE UNIQUE INDEX "TenantProvisioningStep_runId_key_key" ON "TenantProvisioningStep"("runId", "key");
CREATE INDEX "TenantProvisioningStep_tenantId_idx" ON "TenantProvisioningStep"("tenantId");
CREATE INDEX "TenantProvisioningStep_runId_sequence_idx" ON "TenantProvisioningStep"("runId", "sequence");

CREATE UNIQUE INDEX "TenantAppAssignment_tenantId_appKey_key" ON "TenantAppAssignment"("tenantId", "appKey");
CREATE INDEX "TenantAppAssignment_tenantId_idx" ON "TenantAppAssignment"("tenantId");
CREATE INDEX "TenantAppAssignment_appKey_idx" ON "TenantAppAssignment"("appKey");

CREATE INDEX "TenantErasureReceipt_tenantId_idx" ON "TenantErasureReceipt"("tenantId");
CREATE INDEX "TenantErasureReceipt_status_requestedAt_idx" ON "TenantErasureReceipt"("status", "requestedAt");
CREATE INDEX "TenantErasureReceipt_customerAccountId_idx" ON "TenantErasureReceipt"("customerAccountId");

ALTER TABLE "TenantProvisioningRun"
  ADD CONSTRAINT "TenantProvisioningRun_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TenantProvisioningStep"
  ADD CONSTRAINT "TenantProvisioningStep_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TenantProvisioningStep"
  ADD CONSTRAINT "TenantProvisioningStep_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "TenantProvisioningRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TenantAppAssignment"
  ADD CONSTRAINT "TenantAppAssignment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TenantAppAssignment"
  ADD CONSTRAINT "TenantAppAssignment_assignedReleaseId_fkey"
  FOREIGN KEY ("assignedReleaseId") REFERENCES "ApplicationRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;
