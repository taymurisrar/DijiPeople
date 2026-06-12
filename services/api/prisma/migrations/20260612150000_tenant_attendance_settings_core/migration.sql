ALTER TABLE "Location"
ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION,
ADD COLUMN "allowedRadiusMeters" INTEGER;

ALTER TABLE "WorkSchedule"
ADD COLUMN "holidayCalendarId" TEXT;

ALTER TABLE "WorkScheduleDay"
ADD COLUMN "shiftTemplateId" TEXT;

ALTER TABLE "ShiftTemplate"
ADD COLUMN "lateGraceMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "earlyExitGraceMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "isNightShift" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "AttendancePolicy"
ADD COLUMN "allowManualAdjustments" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "preventDuplicateAttendance" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "allowCheckInOnApprovedLeave" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "markMissingCheckout" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "EmployeeScheduleAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workScheduleId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "EmployeeScheduleAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkSchedule_tenantId_holidayCalendarId_idx"
ON "WorkSchedule"("tenantId", "holidayCalendarId");

CREATE INDEX "WorkScheduleDay_tenantId_shiftTemplateId_idx"
ON "WorkScheduleDay"("tenantId", "shiftTemplateId");

CREATE INDEX "ShiftTemplate_tenantId_isActive_idx"
ON "ShiftTemplate"("tenantId", "isActive");

CREATE UNIQUE INDEX "EmployeeScheduleAssignment_tenantId_employeeId_workScheduleId_effectiveFrom_key"
ON "EmployeeScheduleAssignment"("tenantId", "employeeId", "workScheduleId", "effectiveFrom");

CREATE INDEX "EmployeeScheduleAssignment_tenantId_employeeId_isActive_effectiveFrom_effectiveTo_idx"
ON "EmployeeScheduleAssignment"("tenantId", "employeeId", "isActive", "effectiveFrom", "effectiveTo");

CREATE INDEX "EmployeeScheduleAssignment_tenantId_workScheduleId_isActive_idx"
ON "EmployeeScheduleAssignment"("tenantId", "workScheduleId", "isActive");

ALTER TABLE "WorkSchedule"
ADD CONSTRAINT "WorkSchedule_holidayCalendarId_fkey"
FOREIGN KEY ("holidayCalendarId") REFERENCES "HolidayCalendar"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkScheduleDay"
ADD CONSTRAINT "WorkScheduleDay_shiftTemplateId_fkey"
FOREIGN KEY ("shiftTemplateId") REFERENCES "ShiftTemplate"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmployeeScheduleAssignment"
ADD CONSTRAINT "EmployeeScheduleAssignment_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeScheduleAssignment"
ADD CONSTRAINT "EmployeeScheduleAssignment_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeScheduleAssignment"
ADD CONSTRAINT "EmployeeScheduleAssignment_workScheduleId_fkey"
FOREIGN KEY ("workScheduleId") REFERENCES "WorkSchedule"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
