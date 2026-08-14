-- Attendance Engine (Phase 3): sessions, reconciled days, exceptions, jobs.
--
-- Purely additive. Four new tables, six new enums, a handful of nullable columns
-- on existing tables, and new indexes. AttendanceEntry keeps every column it
-- had: it remains the public daily record every existing consumer reads
-- (dashboard, reports, timesheets, payroll preparation, inbox, exports), and the
-- reconciler now writes into it rather than around it.
--
-- No existing migration is touched, no column is dropped or retyped, and no
-- historical attendance is rewritten by this migration.

-- ------------------------------------------------------------------ enums ---

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AttendanceSessionStatus') THEN
    CREATE TYPE "AttendanceSessionStatus" AS ENUM (
      'OPEN', 'CLOSED', 'INCOMPLETE', 'CONFLICT', 'CANCELLED', 'ADJUSTED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AttendanceDayStatus') THEN
    CREATE TYPE "AttendanceDayStatus" AS ENUM (
      'PENDING', 'PRESENT', 'PARTIAL', 'ABSENT', 'ON_LEAVE', 'HOLIDAY',
      'WEEKEND', 'OFF_DAY', 'NEEDS_REVIEW');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AttendanceExceptionType') THEN
    CREATE TYPE "AttendanceExceptionType" AS ENUM (
      'MISSING_CHECKIN',
      'MISSING_CHECKOUT',
      'OVERLAPPING_SESSION',
      'UNKNOWN_PUNCH_DIRECTION',
      'UNAUTHORIZED_WORK_SITE',
      'ATTENDANCE_DURING_LEAVE',
      'WORK_MODE_POLICY_CONFLICT',
      'GEOFENCE_FAILURE',
      'GPS_ACCURACY_FAILURE',
      'DEVICE_CLOCK_WARNING',
      'LATE_ARRIVING_EVENT',
      'LOCKED_PERIOD_EVENT',
      'CROSS_SITE_SESSION',
      'DUPLICATE_SEMANTIC_PUNCH',
      'ATTENDANCE_OUTSIDE_EMPLOYMENT',
      'HOLIDAY_WORK',
      'WEEKEND_WORK',
      'IMPOSSIBLE_TRAVEL');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AttendanceExceptionStatus') THEN
    CREATE TYPE "AttendanceExceptionStatus" AS ENUM (
      'OPEN', 'RESOLVED', 'IGNORED', 'APPROVED', 'REJECTED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AttendanceExceptionSeverity') THEN
    CREATE TYPE "AttendanceExceptionSeverity" AS ENUM ('INFO', 'WARNING', 'BLOCKING');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AttendanceReconciliationJobStatus') THEN
    CREATE TYPE "AttendanceReconciliationJobStatus" AS ENUM (
      'PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');
  END IF;
END
$$;

-- ------------------------------------------------------------ attendance day ---

CREATE TABLE IF NOT EXISTS "AttendanceDay" (
    "id"                     TEXT NOT NULL,
    "tenantId"               TEXT NOT NULL,
    "employeeId"             TEXT NOT NULL,
    -- The SHIFT workday, not necessarily the calendar date the punches carry.
    -- An overnight 21:00->06:00 shift produces one row whose punches straddle
    -- midnight; see the day resolver.
    "attendanceDate"         TIMESTAMP(3) NOT NULL,
    "workScheduleId"         TEXT,
    "shiftTemplateId"        TEXT,
    -- 1:1 projection target. AttendanceEntry stays the record every existing
    -- consumer reads; this link is the explicit boundary between the two.
    "attendanceEntryId"      TEXT,
    "status"                 "AttendanceDayStatus" NOT NULL DEFAULT 'PENDING',
    "timezone"               TEXT,
    "scheduledMinutes"       INTEGER NOT NULL DEFAULT 0,
    "workedMinutes"          INTEGER NOT NULL DEFAULT 0,
    "officeMinutes"          INTEGER NOT NULL DEFAULT 0,
    "remoteMinutes"          INTEGER NOT NULL DEFAULT 0,
    "fieldMinutes"           INTEGER NOT NULL DEFAULT 0,
    "breakMinutes"           INTEGER NOT NULL DEFAULT 0,
    "lateMinutes"            INTEGER NOT NULL DEFAULT 0,
    "earlyDepartureMinutes"  INTEGER NOT NULL DEFAULT 0,
    "earlyArrivalMinutes"    INTEGER NOT NULL DEFAULT 0,
    -- Time beyond schedule. NOT payable overtime: that needs its own approval,
    -- which is why the two are separate columns rather than one.
    "extraMinutes"           INTEGER NOT NULL DEFAULT 0,
    "approvedOvertimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "firstCheckInAt"         TIMESTAMP(3),
    "lastCheckOutAt"         TIMESTAMP(3),
    -- Derived from the sessions actually worked, never asserted by a client.
    "derivedWorkMode"        "EmployeeWorkMode",
    "sessionCount"           INTEGER NOT NULL DEFAULT 0,
    "openExceptionCount"     INTEGER NOT NULL DEFAULT 0,
    "isHoliday"              BOOLEAN NOT NULL DEFAULT false,
    "isWeekend"              BOOLEAN NOT NULL DEFAULT false,
    "isOffDay"               BOOLEAN NOT NULL DEFAULT false,
    "onLeave"                BOOLEAN NOT NULL DEFAULT false,
    "leaveMinutes"           INTEGER NOT NULL DEFAULT 0,
    -- Once locked, reconciliation refuses to change derived state. Late events
    -- still persist as raw evidence and raise an exception instead.
    "locked"                 BOOLEAN NOT NULL DEFAULT false,
    "lockedAt"               TIMESTAMP(3),
    "lockReason"             TEXT,
    "lockedById"             TEXT,
    -- Which build of the engine produced this row. Recalculating safely later
    -- means knowing what the numbers were computed by.
    "reconciliationVersion"  INTEGER NOT NULL DEFAULT 1,
    "lastReconciledAt"       TIMESTAMP(3),
    "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"              TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceDay_pkey" PRIMARY KEY ("id")
);

-- One reconciled day per employee per attendance date. This is what makes
-- reconciliation idempotent: a rerun upserts rather than appends.
CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceDay_tenantId_employeeId_attendanceDate_key"
    ON "AttendanceDay"("tenantId", "employeeId", "attendanceDate");
CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceDay_attendanceEntryId_key"
    ON "AttendanceDay"("attendanceEntryId");
CREATE INDEX IF NOT EXISTS "AttendanceDay_tenantId_attendanceDate_idx"
    ON "AttendanceDay"("tenantId", "attendanceDate");
CREATE INDEX IF NOT EXISTS "AttendanceDay_tenantId_status_idx"
    ON "AttendanceDay"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "AttendanceDay_tenantId_locked_idx"
    ON "AttendanceDay"("tenantId", "locked");
CREATE INDEX IF NOT EXISTS "AttendanceDay_tenantId_openExceptionCount_idx"
    ON "AttendanceDay"("tenantId", "openExceptionCount");

-- -------------------------------------------------------- attendance session ---

CREATE TABLE IF NOT EXISTS "AttendanceSession" (
    "id"                TEXT NOT NULL,
    "tenantId"          TEXT NOT NULL,
    "employeeId"        TEXT NOT NULL,
    "attendanceDayId"   TEXT NOT NULL,
    -- Ordinal within the day, so a rerun produces stable identities rather than
    -- new rows. Combined with attendanceDayId this is the natural key.
    "sequence"          INTEGER NOT NULL,
    "startedAt"         TIMESTAMP(3) NOT NULL,
    "endedAt"           TIMESTAMP(3),
    "startSource"       "RawAttendanceCaptureSource" NOT NULL,
    "endSource"         "RawAttendanceCaptureSource",
    "startRawEventId"   TEXT,
    "endRawEventId"     TEXT,
    -- OFFICE / REMOTE / FIELD. Never HYBRID: hybrid is a property of the DAY,
    -- derived from sessions of differing modes, and cannot describe one period.
    "workMode"          "EmployeeWorkMode" NOT NULL DEFAULT 'OFFICE',
    "workSiteId"        TEXT,
    "startDeviceId"     TEXT,
    "endDeviceId"       TEXT,
    "status"            "AttendanceSessionStatus" NOT NULL DEFAULT 'CLOSED',
    "durationMinutes"   INTEGER,
    "isAdjusted"        BOOLEAN NOT NULL DEFAULT false,
    "adjustmentSource"  TEXT,
    "adjustmentRequestId" TEXT,
    "isBreak"           BOOLEAN NOT NULL DEFAULT false,
    "notes"             TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceSession_attendanceDayId_sequence_key"
    ON "AttendanceSession"("attendanceDayId", "sequence");
CREATE INDEX IF NOT EXISTS "AttendanceSession_tenantId_employeeId_startedAt_idx"
    ON "AttendanceSession"("tenantId", "employeeId", "startedAt");
CREATE INDEX IF NOT EXISTS "AttendanceSession_tenantId_workSiteId_idx"
    ON "AttendanceSession"("tenantId", "workSiteId");
CREATE INDEX IF NOT EXISTS "AttendanceSession_tenantId_status_idx"
    ON "AttendanceSession"("tenantId", "status");

-- ------------------------------------------------------ attendance exception ---

CREATE TABLE IF NOT EXISTS "AttendanceException" (
    "id"               TEXT NOT NULL,
    "tenantId"         TEXT NOT NULL,
    "employeeId"       TEXT NOT NULL,
    "attendanceDayId"  TEXT,
    "attendanceDate"   TIMESTAMP(3) NOT NULL,
    "type"             "AttendanceExceptionType" NOT NULL,
    "status"           "AttendanceExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "severity"         "AttendanceExceptionSeverity" NOT NULL DEFAULT 'WARNING',
    -- Stable hash of (type + the thing it is about), so re-running reconciliation
    -- updates the same exception instead of stacking duplicates every cycle.
    "dedupeKey"        TEXT NOT NULL,
    "message"          TEXT NOT NULL,
    -- Structured, never free text alone: the workspace filters and the
    -- resolution actions both need to know what the exception is about.
    "detail"           JSONB,
    "rawEventId"       TEXT,
    "sessionId"        TEXT,
    "workSiteId"       TEXT,
    "deviceId"         TEXT,
    "detectedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt"       TIMESTAMP(3),
    "resolvedById"     TEXT,
    "resolutionNote"   TEXT,
    -- How it was resolved: by a human decision, or by reconciliation finding the
    -- condition no longer held. Kept rather than deleted, because an exception
    -- that existed is part of the audit trail.
    "resolutionSource" TEXT,
    "correctionRequestId" TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceException_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceException_tenantId_dedupeKey_key"
    ON "AttendanceException"("tenantId", "dedupeKey");
CREATE INDEX IF NOT EXISTS "AttendanceException_tenantId_status_type_idx"
    ON "AttendanceException"("tenantId", "status", "type");
CREATE INDEX IF NOT EXISTS "AttendanceException_tenantId_employeeId_attendanceDate_idx"
    ON "AttendanceException"("tenantId", "employeeId", "attendanceDate");
CREATE INDEX IF NOT EXISTS "AttendanceException_tenantId_attendanceDayId_idx"
    ON "AttendanceException"("tenantId", "attendanceDayId");
CREATE INDEX IF NOT EXISTS "AttendanceException_tenantId_attendanceDate_status_idx"
    ON "AttendanceException"("tenantId", "attendanceDate", "status");

-- ----------------------------------------------- attendance reconciliation job ---

CREATE TABLE IF NOT EXISTS "AttendanceReconciliationJob" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "employeeId"     TEXT NOT NULL,
    "attendanceDate" TIMESTAMP(3) NOT NULL,
    "reason"         TEXT NOT NULL,
    "status"         "AttendanceReconciliationJobStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount"   INTEGER NOT NULL DEFAULT 0,
    "maxAttempts"    INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt"  TIMESTAMP(3),
    "startedAt"      TIMESTAMP(3),
    "completedAt"    TIMESTAMP(3),
    "lastError"      TEXT,
    "requestedById"  TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceReconciliationJob_pkey" PRIMARY KEY ("id")
);

-- At most one OUTSTANDING job per employee/day. A partial unique index rather
-- than a plain one so completed history accumulates while the queue itself
-- cannot grow a thousand duplicate rows for a device that punched a thousand
-- times.
CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceReconciliationJob_active_key"
    ON "AttendanceReconciliationJob"("tenantId", "employeeId", "attendanceDate")
    WHERE "status" IN ('PENDING', 'RUNNING');

CREATE INDEX IF NOT EXISTS "AttendanceReconciliationJob_status_nextAttemptAt_idx"
    ON "AttendanceReconciliationJob"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "AttendanceReconciliationJob_tenantId_status_idx"
    ON "AttendanceReconciliationJob"("tenantId", "status");

-- ------------------------------------------------------------ foreign keys ---

ALTER TABLE "AttendanceDay"
  ADD CONSTRAINT "AttendanceDay_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceDay_employeeId_fkey" FOREIGN KEY ("employeeId")
    REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceDay_workScheduleId_fkey" FOREIGN KEY ("workScheduleId")
    REFERENCES "WorkSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceDay_shiftTemplateId_fkey" FOREIGN KEY ("shiftTemplateId")
    REFERENCES "ShiftTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  -- SET NULL, not CASCADE: deleting the legacy projection must never destroy the
  -- reconciled record and its session evidence.
  ADD CONSTRAINT "AttendanceDay_attendanceEntryId_fkey" FOREIGN KEY ("attendanceEntryId")
    REFERENCES "AttendanceEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AttendanceSession"
  ADD CONSTRAINT "AttendanceSession_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceSession_employeeId_fkey" FOREIGN KEY ("employeeId")
    REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceSession_attendanceDayId_fkey" FOREIGN KEY ("attendanceDayId")
    REFERENCES "AttendanceDay"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceSession_workSiteId_fkey" FOREIGN KEY ("workSiteId")
    REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  -- Raw events are immutable evidence and outlive derived state, so a session
  -- losing its source pointer must not delete the evidence or vice versa.
  ADD CONSTRAINT "AttendanceSession_startRawEventId_fkey" FOREIGN KEY ("startRawEventId")
    REFERENCES "RawAttendanceEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceSession_endRawEventId_fkey" FOREIGN KEY ("endRawEventId")
    REFERENCES "RawAttendanceEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AttendanceException"
  ADD CONSTRAINT "AttendanceException_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceException_employeeId_fkey" FOREIGN KEY ("employeeId")
    REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- SET NULL: an exception survives a day being rebuilt, which is what keeps the
  -- audit trail intact across reconciliation runs.
  ADD CONSTRAINT "AttendanceException_attendanceDayId_fkey" FOREIGN KEY ("attendanceDayId")
    REFERENCES "AttendanceDay"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceException_rawEventId_fkey" FOREIGN KEY ("rawEventId")
    REFERENCES "RawAttendanceEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceException_workSiteId_fkey" FOREIGN KEY ("workSiteId")
    REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceException_correctionRequestId_fkey" FOREIGN KEY ("correctionRequestId")
    REFERENCES "AttendanceCorrectionRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AttendanceReconciliationJob"
  ADD CONSTRAINT "AttendanceReconciliationJob_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceReconciliationJob_employeeId_fkey" FOREIGN KEY ("employeeId")
    REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------- AttendanceEntry projection ---
--
-- AttendanceEntry stays the public daily record. These columns let the reconciler
-- tell the truth through it for days the single checkIn/checkOut pair cannot
-- describe: a hybrid day worked 08:05-12:30 and 14:00-18:05 is 8h30m of work,
-- not the 10h a naive checkOut-minus-checkIn would report to payroll.

ALTER TABLE "AttendanceEntry"
ADD COLUMN IF NOT EXISTS "workedMinutes" INTEGER,
ADD COLUMN IF NOT EXISTS "sessionCount" INTEGER,
ADD COLUMN IF NOT EXISTS "derivedWorkMode" "EmployeeWorkMode",
-- True once the engine owns this row, so legacy self-service and import rows
-- for tenants that have not adopted the engine are left alone.
ADD COLUMN IF NOT EXISTS "reconciled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "lastReconciledAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "AttendanceEntry_tenantId_reconciled_date_idx"
    ON "AttendanceEntry"("tenantId", "reconciled", "date");

-- ------------------------------------- AttendanceCorrectionRequest extension ---
--
-- The existing correction request IS the attendance adjustment model: it already
-- carries original vs requested times, a reason, a requester, an approver and a
-- status, and it already has an approval flow and a UI. Extending it beats adding
-- a second, competing adjustment entity.

ALTER TABLE "AttendanceCorrectionRequest"
-- A correction for a day with no AttendanceEntry yet (a wholly missing day)
-- previously had nowhere to record which day it was about.
ADD COLUMN IF NOT EXISTS "attendanceDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "requestedWorkMode" "EmployeeWorkMode",
ADD COLUMN IF NOT EXISTS "requestedWorkSiteId" TEXT,
-- Set when the request was raised to clear a specific detected exception.
ADD COLUMN IF NOT EXISTS "attendanceExceptionId" TEXT,
-- An in-office web punch accepted under the fallback policy, rather than an
-- ordinary unrestricted web punch.
ADD COLUMN IF NOT EXISTS "isWebFallback" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "fallbackReason" TEXT;

CREATE INDEX IF NOT EXISTS "AttendanceCorrectionRequest_tenantId_attendanceDate_idx"
    ON "AttendanceCorrectionRequest"("tenantId", "attendanceDate");

-- ------------------------------------------------- RawAttendanceEvent index ---
--
-- Reconciliation loads one employee's events for one day window. Without this it
-- would fall back to the (tenantId, employeeId, occurredAtLocal) index and sort,
-- which is the wrong shape once a tenant has years of device history.

CREATE INDEX IF NOT EXISTS "RawAttendanceEvent_tenantId_employeeId_occurredAtUtc_idx"
    ON "RawAttendanceEvent"("tenantId", "employeeId", "occurredAtUtc");
CREATE INDEX IF NOT EXISTS "RawAttendanceEvent_tenantId_processingStatus_mappingStatus_idx"
    ON "RawAttendanceEvent"("tenantId", "processingStatus", "mappingStatus");
