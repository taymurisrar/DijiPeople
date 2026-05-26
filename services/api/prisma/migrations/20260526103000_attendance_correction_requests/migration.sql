CREATE TYPE "AttendanceCorrectionType" AS ENUM (
  'MISSED_CHECK_IN',
  'MISSED_CHECK_OUT',
  'LATE_CHECK_IN',
  'EARLY_CHECK_OUT',
  'ABSENCE_CORRECTION',
  'TIME_ADJUSTMENT',
  'MANUAL_CORRECTION'
);

CREATE TYPE "AttendanceCorrectionStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'RETURNED',
  'CANCELLED'
);

CREATE TABLE "AttendanceCorrectionRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "attendanceEntryId" TEXT,
  "employeeId" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "requestNumber" TEXT NOT NULL,
  "correctionType" "AttendanceCorrectionType" NOT NULL,
  "originalCheckInAtUtc" TIMESTAMP(3),
  "originalCheckOutAtUtc" TIMESTAMP(3),
  "requestedCheckInAtUtc" TIMESTAMP(3),
  "requestedCheckOutAtUtc" TIMESTAMP(3),
  "reason" TEXT NOT NULL,
  "attachmentMetadata" JSONB,
  "status" "AttendanceCorrectionStatus" NOT NULL DEFAULT 'SUBMITTED',
  "submittedAtUtc" TIMESTAMP(3),
  "approvedAtUtc" TIMESTAMP(3),
  "rejectedAtUtc" TIMESTAMP(3),
  "actionedByUserId" TEXT,
  "actionComment" TEXT,
  "createdAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AttendanceCorrectionRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttendanceCorrectionRequest_tenantId_requestNumber_key"
  ON "AttendanceCorrectionRequest"("tenantId", "requestNumber");
CREATE INDEX "AttendanceCorrectionRequest_tenantId_idx"
  ON "AttendanceCorrectionRequest"("tenantId");
CREATE INDEX "AttendanceCorrectionRequest_tenantId_employeeId_idx"
  ON "AttendanceCorrectionRequest"("tenantId", "employeeId");
CREATE INDEX "AttendanceCorrectionRequest_tenantId_requestedByUserId_idx"
  ON "AttendanceCorrectionRequest"("tenantId", "requestedByUserId");
CREATE INDEX "AttendanceCorrectionRequest_tenantId_status_idx"
  ON "AttendanceCorrectionRequest"("tenantId", "status");
CREATE INDEX "AttendanceCorrectionRequest_tenantId_createdAtUtc_idx"
  ON "AttendanceCorrectionRequest"("tenantId", "createdAtUtc");
CREATE INDEX "AttendanceCorrectionRequest_tenantId_attendanceEntryId_idx"
  ON "AttendanceCorrectionRequest"("tenantId", "attendanceEntryId");

ALTER TABLE "AttendanceCorrectionRequest"
  ADD CONSTRAINT "AttendanceCorrectionRequest_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AttendanceCorrectionRequest"
  ADD CONSTRAINT "AttendanceCorrectionRequest_attendanceEntryId_fkey"
  FOREIGN KEY ("attendanceEntryId") REFERENCES "AttendanceEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AttendanceCorrectionRequest"
  ADD CONSTRAINT "AttendanceCorrectionRequest_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AttendanceCorrectionRequest"
  ADD CONSTRAINT "AttendanceCorrectionRequest_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AttendanceCorrectionRequest"
  ADD CONSTRAINT "AttendanceCorrectionRequest_actionedByUserId_fkey"
  FOREIGN KEY ("actionedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
