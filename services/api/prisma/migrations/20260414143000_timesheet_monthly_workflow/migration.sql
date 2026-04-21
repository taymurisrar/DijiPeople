-- CreateEnum
CREATE TYPE "TimesheetEntryType" AS ENUM ('ON_WORK', 'ON_LEAVE', 'WEEKEND', 'HOLIDAY');

-- DropIndex
DROP INDEX "Timesheet_tenantId_employeeId_periodStart_periodEnd_key";

-- AlterTable
ALTER TABLE "Timesheet"
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "month" INTEGER,
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "reviewNote" TEXT,
  ADD COLUMN "submittedNote" TEXT,
  ADD COLUMN "year" INTEGER;

-- AlterTable
ALTER TABLE "TimesheetEntry"
  ADD COLUMN "dayOfWeek" "WorkWeekday",
  ADD COLUMN "entryType" "TimesheetEntryType",
  ADD COLUMN "isHoliday" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isWeekend" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "leaveRequestId" TEXT,
  ADD COLUMN "note" TEXT;

-- Backfill month/year and copy legacy comments into new fields.
UPDATE "Timesheet"
SET
  "year" = EXTRACT(YEAR FROM "periodStart")::INTEGER,
  "month" = EXTRACT(MONTH FROM "periodStart")::INTEGER,
  "submittedNote" = NULL,
  "reviewNote" = "comments",
  "approvedAt" = CASE WHEN "status" = 'APPROVED' THEN COALESCE("reviewedAt", NOW()) ELSE NULL END,
  "rejectedAt" = CASE WHEN "status" = 'REJECTED' THEN COALESCE("reviewedAt", NOW()) ELSE NULL END;

-- Normalize legacy weekly sheets into one monthly sheet per employee.
WITH ranked_timesheets AS (
  SELECT
    "id",
    "tenantId",
    "employeeId",
    "year",
    "month",
    FIRST_VALUE("id") OVER (
      PARTITION BY "tenantId", "employeeId", "year", "month"
      ORDER BY "periodStart" ASC, "createdAt" ASC, "id" ASC
    ) AS keeper_id
  FROM "Timesheet"
)
UPDATE "TimesheetEntry" AS entry
SET "timesheetId" = ranked_timesheets.keeper_id
FROM ranked_timesheets
WHERE entry."timesheetId" = ranked_timesheets."id"
  AND ranked_timesheets."id" <> ranked_timesheets.keeper_id;

WITH ranked_timesheets AS (
  SELECT
    "id",
    "tenantId",
    "employeeId",
    "year",
    "month",
    FIRST_VALUE("id") OVER (
      PARTITION BY "tenantId", "employeeId", "year", "month"
      ORDER BY "periodStart" ASC, "createdAt" ASC, "id" ASC
    ) AS keeper_id
  FROM "Timesheet"
)
DELETE FROM "Timesheet" AS sheet
USING ranked_timesheets
WHERE sheet."id" = ranked_timesheets."id"
  AND ranked_timesheets."id" <> ranked_timesheets.keeper_id;

UPDATE "Timesheet"
SET
  "periodStart" = DATE_TRUNC('month', "periodStart"),
  "periodEnd" = (DATE_TRUNC('month', "periodStart") + INTERVAL '1 month - 1 day')::DATE;

-- Collapse any legacy duplicate project rows into a single daily row.
WITH duplicate_days AS (
  SELECT
    MIN("id") AS keeper_id,
    "tenantId",
    "timesheetId",
    "date",
    SUM("hours") AS total_hours
  FROM "TimesheetEntry"
  GROUP BY "tenantId", "timesheetId", "date"
  HAVING COUNT(*) > 1
)
UPDATE "TimesheetEntry" AS entry
SET
  "hours" = duplicate_days.total_hours,
  "projectId" = NULL,
  "description" = NULL
FROM duplicate_days
WHERE entry."id" = duplicate_days.keeper_id;

WITH duplicate_days AS (
  SELECT
    MIN("id") AS keeper_id,
    "tenantId",
    "timesheetId",
    "date"
  FROM "TimesheetEntry"
  GROUP BY "tenantId", "timesheetId", "date"
  HAVING COUNT(*) > 1
)
DELETE FROM "TimesheetEntry" AS entry
USING duplicate_days
WHERE entry."tenantId" = duplicate_days."tenantId"
  AND entry."timesheetId" = duplicate_days."timesheetId"
  AND entry."date" = duplicate_days."date"
  AND entry."id" <> duplicate_days.keeper_id;

-- Backfill daily fields.
UPDATE "TimesheetEntry"
SET
  "dayOfWeek" = CASE EXTRACT(DOW FROM "date")
    WHEN 0 THEN 'SUNDAY'::"WorkWeekday"
    WHEN 1 THEN 'MONDAY'::"WorkWeekday"
    WHEN 2 THEN 'TUESDAY'::"WorkWeekday"
    WHEN 3 THEN 'WEDNESDAY'::"WorkWeekday"
    WHEN 4 THEN 'THURSDAY'::"WorkWeekday"
    WHEN 5 THEN 'FRIDAY'::"WorkWeekday"
    WHEN 6 THEN 'SATURDAY'::"WorkWeekday"
  END,
  "entryType" = 'ON_WORK'::"TimesheetEntryType",
  "note" = "description",
  "projectId" = NULL;

ALTER TABLE "Timesheet"
  ALTER COLUMN "month" SET NOT NULL,
  ALTER COLUMN "year" SET NOT NULL;

ALTER TABLE "TimesheetEntry"
  ALTER COLUMN "dayOfWeek" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Timesheet_tenantId_employeeId_year_month_idx" ON "Timesheet"("tenantId", "employeeId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "Timesheet_tenantId_employeeId_year_month_key" ON "Timesheet"("tenantId", "employeeId", "year", "month");

-- CreateIndex
CREATE INDEX "TimesheetEntry_tenantId_timesheetId_date_idx" ON "TimesheetEntry"("tenantId", "timesheetId", "date");

-- AddForeignKey
ALTER TABLE "TimesheetEntry"
ADD CONSTRAINT "TimesheetEntry_leaveRequestId_fkey"
FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
