CREATE TYPE "HolidayScopeType" AS ENUM ('TENANT', 'DEPARTMENT', 'WORK_SITE');

ALTER TABLE "Employee"
ADD COLUMN "defaultWorkScheduleId" TEXT;

ALTER TABLE "Department"
ADD COLUMN "defaultWorkScheduleId" TEXT;

ALTER TABLE "Location"
ADD COLUMN "defaultWorkScheduleId" TEXT,
ADD COLUMN "holidayCalendarId" TEXT;

ALTER TABLE "EmployeeScheduleAssignment"
ADD COLUMN "reason" TEXT;

ALTER TABLE "AttendancePolicy"
ADD COLUMN "allowOffDayCheckIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allowHolidayCheckIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allowHrAdminOverride" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "HolidayCalendar"
ADD COLUMN "weekendDays" "WorkWeekday"[] NOT NULL DEFAULT ARRAY['FRIDAY', 'SATURDAY']::"WorkWeekday"[];

ALTER TABLE "Holiday"
ADD COLUMN "scopeType" "HolidayScopeType" NOT NULL DEFAULT 'TENANT',
ADD COLUMN "departmentId" TEXT,
ADD COLUMN "locationId" TEXT,
ADD COLUMN "isPaid" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "Employee_tenantId_defaultWorkScheduleId_idx"
ON "Employee"("tenantId", "defaultWorkScheduleId");

CREATE INDEX "Department_tenantId_defaultWorkScheduleId_idx"
ON "Department"("tenantId", "defaultWorkScheduleId");

CREATE INDEX "Location_tenantId_defaultWorkScheduleId_idx"
ON "Location"("tenantId", "defaultWorkScheduleId");

CREATE INDEX "Location_tenantId_holidayCalendarId_idx"
ON "Location"("tenantId", "holidayCalendarId");

CREATE INDEX "Holiday_tenantId_scopeType_departmentId_locationId_idx"
ON "Holiday"("tenantId", "scopeType", "departmentId", "locationId");

CREATE INDEX "Holiday_tenantId_isActive_holidayDate_idx"
ON "Holiday"("tenantId", "isActive", "holidayDate");

ALTER TABLE "Employee"
ADD CONSTRAINT "Employee_defaultWorkScheduleId_fkey"
FOREIGN KEY ("defaultWorkScheduleId") REFERENCES "WorkSchedule"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Department"
ADD CONSTRAINT "Department_defaultWorkScheduleId_fkey"
FOREIGN KEY ("defaultWorkScheduleId") REFERENCES "WorkSchedule"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Location"
ADD CONSTRAINT "Location_defaultWorkScheduleId_fkey"
FOREIGN KEY ("defaultWorkScheduleId") REFERENCES "WorkSchedule"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Location"
ADD CONSTRAINT "Location_holidayCalendarId_fkey"
FOREIGN KEY ("holidayCalendarId") REFERENCES "HolidayCalendar"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Holiday"
ADD CONSTRAINT "Holiday_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Holiday"
ADD CONSTRAINT "Holiday_locationId_fkey"
FOREIGN KEY ("locationId") REFERENCES "Location"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
