-- Attendance operational completion (Phase 3.1).
--
-- Three additions, each closing a specific gap:
--
--   1. AttendanceLocationEvidence — the geofence DECISION is now durable.
--      Coordinates were already persisted on AttendanceEntry, but the numbers
--      that justified accepting or refusing a punch (which site matched, how far
--      away, what radius and accuracy limit applied) were computed and thrown
--      away. Those are policy values that change over time, so "why was this
--      accepted in August?" is unanswerable without recording them at the moment
--      of the decision.
--
--   2. OVERTIME_APPROVAL — approved overtime gets a source. There is no overtime
--      request model in this system: OvertimePolicy is calculation configuration
--      and TimePayrollInput is DOWNSTREAM of attendance, so feeding it back in
--      would be circular. AttendanceCorrectionRequest is the existing attendance
--      approval vehicle, so it carries this too rather than a second engine.
--
--   3. requestedOvertimeMinutes — what that approval is for.
--
-- Purely additive: one new table, one new enum value, one nullable column and
-- new indexes. No existing migration is touched and no data is rewritten.

-- ------------------------------------------------------------------ enum ---
-- Its own statement: PostgreSQL cannot use a newly added enum value in the same
-- transaction that adds it.
ALTER TYPE "AttendanceCorrectionType"
  ADD VALUE IF NOT EXISTS 'OVERTIME_APPROVAL' AFTER 'MANUAL_CORRECTION';

-- ------------------------------------------------- correction request extension ---

ALTER TABLE "AttendanceCorrectionRequest"
-- Minutes of overtime being approved for the day. Separate from the requested
-- check-in/out times because approving overtime does not change when someone
-- worked — it changes whether time already worked is payable.
ADD COLUMN IF NOT EXISTS "requestedOvertimeMinutes" INTEGER;

-- ----------------------------------------------------- location evidence ---

CREATE TABLE IF NOT EXISTS "AttendanceLocationEvidence" (
    "id"                    TEXT NOT NULL,
    "tenantId"              TEXT NOT NULL,
    "employeeId"            TEXT NOT NULL,
    -- The work day this decision belongs to, so evidence can be found from an
    -- attendance day without walking raw events.
    "attendanceDate"        TIMESTAMP(3) NOT NULL,
    "capturedAt"            TIMESTAMP(3) NOT NULL,
    "action"                TEXT NOT NULL,
    "captureSource"         TEXT NOT NULL,

    -- The reported position. RESTRICTED: this column is the reason the whole
    -- table exists as its own model with its own permission, rather than more
    -- columns on a record that is already widely read.
    "latitude"              DECIMAL(10,7),
    "longitude"             DECIMAL(10,7),
    "accuracyMeters"        INTEGER,

    -- The decision, and the policy values it was made against. Kept because the
    -- radius and the accuracy limit are configuration that can change: without
    -- them, a past decision cannot be explained, only re-guessed.
    "matchedWorkSiteId"     TEXT,
    "distanceMeters"        INTEGER,
    "insideGeofence"        BOOLEAN,
    "geofenceRadiusMeters"  INTEGER,
    "effectiveAccuracyLimitMeters" INTEGER,

    -- What the server concluded, and why.
    "outcome"               TEXT NOT NULL,
    "reasonCode"            TEXT NOT NULL,
    "resolvedWorkMode"      "EmployeeWorkMode",

    -- Risk signals, at the precision the application already records elsewhere.
    "ipAddress"             TEXT,
    "userAgent"             TEXT,

    "rawEventId"            TEXT,
    "attendanceDayId"       TEXT,
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceLocationEvidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AttendanceLocationEvidence_tenantId_employeeId_attendanceDate_idx"
    ON "AttendanceLocationEvidence"("tenantId", "employeeId", "attendanceDate");
CREATE INDEX IF NOT EXISTS "AttendanceLocationEvidence_tenantId_attendanceDayId_idx"
    ON "AttendanceLocationEvidence"("tenantId", "attendanceDayId");
CREATE INDEX IF NOT EXISTS "AttendanceLocationEvidence_tenantId_outcome_idx"
    ON "AttendanceLocationEvidence"("tenantId", "outcome");
-- Supports the impossible-travel scan: one employee's accepted positions in
-- time order.
CREATE INDEX IF NOT EXISTS "AttendanceLocationEvidence_tenantId_employeeId_capturedAt_idx"
    ON "AttendanceLocationEvidence"("tenantId", "employeeId", "capturedAt");

ALTER TABLE "AttendanceLocationEvidence"
  ADD CONSTRAINT "AttendanceLocationEvidence_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceLocationEvidence_employeeId_fkey" FOREIGN KEY ("employeeId")
    REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceLocationEvidence_matchedWorkSiteId_fkey" FOREIGN KEY ("matchedWorkSiteId")
    REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  -- SET NULL on both: evidence outlives the derived state it relates to. A day
  -- rebuilt by reconciliation must not destroy the record of why a punch was
  -- accepted in the first place.
  ADD CONSTRAINT "AttendanceLocationEvidence_rawEventId_fkey" FOREIGN KEY ("rawEventId")
    REFERENCES "RawAttendanceEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceLocationEvidence_attendanceDayId_fkey" FOREIGN KEY ("attendanceDayId")
    REFERENCES "AttendanceDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;
