ALTER TYPE "AttendanceEntryStatus" ADD VALUE IF NOT EXISTS 'CHECKED_IN';
ALTER TYPE "AttendanceEntryStatus" ADD VALUE IF NOT EXISTS 'CHECKED_OUT';
ALTER TYPE "AttendanceEntrySource" ADD VALUE IF NOT EXISTS 'WEB';

ALTER TABLE "AttendanceEntry"
  ADD COLUMN IF NOT EXISTS "shiftTemplateId" TEXT,
  ADD COLUMN IF NOT EXISTS "checkInSource" "AttendanceEntrySource",
  ADD COLUMN IF NOT EXISTS "checkOutSource" "AttendanceEntrySource",
  ADD COLUMN IF NOT EXISTS "checkInLatitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "checkInLongitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "checkInLocationAccuracy" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "checkInLocationCapturedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "checkOutLatitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "checkOutLongitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "checkOutLocationAccuracy" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "checkOutLocationCapturedAt" TIMESTAMP(3);

ALTER TABLE "AttendanceEntry"
  ADD CONSTRAINT "AttendanceEntry_shiftTemplateId_fkey"
  FOREIGN KEY ("shiftTemplateId") REFERENCES "ShiftTemplate"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

WITH ranked_attendance AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "tenantId", "employeeId", "date"
      ORDER BY
        ("checkOut" IS NOT NULL) DESC,
        ("checkIn" IS NOT NULL) DESC,
        "updatedAt" DESC,
        "createdAt" DESC,
        "id" DESC
    ) AS duplicate_rank
  FROM "AttendanceEntry"
)
DELETE FROM "AttendanceEntry"
WHERE "id" IN (
  SELECT "id"
  FROM ranked_attendance
  WHERE duplicate_rank > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceEntry_tenantId_employeeId_date_key"
  ON "AttendanceEntry"("tenantId", "employeeId", "date");

CREATE INDEX IF NOT EXISTS "AttendanceEntry_tenantId_shiftTemplateId_date_idx"
  ON "AttendanceEntry"("tenantId", "shiftTemplateId", "date");
