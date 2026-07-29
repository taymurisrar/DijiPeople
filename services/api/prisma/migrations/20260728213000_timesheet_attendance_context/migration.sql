ALTER TABLE "TimesheetDay"
  ADD COLUMN "attendanceEntryId" TEXT,
  ADD COLUMN "attendanceCheckIn" TIMESTAMP(3),
  ADD COLUMN "attendanceCheckOut" TIMESTAMP(3),
  ADD COLUMN "attendanceMode" "AttendanceMode",
  ADD COLUMN "attendanceStatus" "AttendanceEntryStatus";

CREATE INDEX "TimesheetDay_tenantId_attendanceEntryId_idx"
  ON "TimesheetDay"("tenantId", "attendanceEntryId");
