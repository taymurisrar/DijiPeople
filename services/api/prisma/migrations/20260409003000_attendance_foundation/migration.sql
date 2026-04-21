-- CreateEnum
CREATE TYPE "WorkWeekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "AttendanceEntryStatus" AS ENUM ('PRESENT', 'LATE', 'ABSENT', 'HALF_DAY', 'MISSED_CHECK_OUT');

-- CreateEnum
CREATE TYPE "AttendanceEntrySource" AS ENUM ('MANUAL', 'SYSTEM');

-- CreateTable
CREATE TABLE "WorkSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weeklyWorkDays" "WorkWeekday"[],
    "standardStartTime" TEXT NOT NULL,
    "standardEndTime" TEXT NOT NULL,
    "graceMinutes" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "WorkSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workScheduleId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "status" "AttendanceEntryStatus" NOT NULL DEFAULT 'PRESENT',
    "source" "AttendanceEntrySource" NOT NULL DEFAULT 'SYSTEM',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "AttendanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HolidayCalendar" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "HolidayCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkSchedule_tenantId_name_key" ON "WorkSchedule"("tenantId", "name");
CREATE INDEX "WorkSchedule_tenantId_idx" ON "WorkSchedule"("tenantId");
CREATE INDEX "WorkSchedule_tenantId_isActive_idx" ON "WorkSchedule"("tenantId", "isActive");
CREATE INDEX "WorkSchedule_tenantId_isDefault_isActive_idx" ON "WorkSchedule"("tenantId", "isDefault", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceEntry_tenantId_employeeId_date_key" ON "AttendanceEntry"("tenantId", "employeeId", "date");
CREATE INDEX "AttendanceEntry_tenantId_idx" ON "AttendanceEntry"("tenantId");
CREATE INDEX "AttendanceEntry_tenantId_employeeId_date_idx" ON "AttendanceEntry"("tenantId", "employeeId", "date");
CREATE INDEX "AttendanceEntry_tenantId_date_status_idx" ON "AttendanceEntry"("tenantId", "date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HolidayCalendar_tenantId_name_date_key" ON "HolidayCalendar"("tenantId", "name", "date");
CREATE INDEX "HolidayCalendar_tenantId_idx" ON "HolidayCalendar"("tenantId");
CREATE INDEX "HolidayCalendar_tenantId_date_idx" ON "HolidayCalendar"("tenantId", "date");

-- AddForeignKey
ALTER TABLE "WorkSchedule"
ADD CONSTRAINT "WorkSchedule_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AttendanceEntry"
ADD CONSTRAINT "AttendanceEntry_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AttendanceEntry"
ADD CONSTRAINT "AttendanceEntry_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AttendanceEntry"
ADD CONSTRAINT "AttendanceEntry_workScheduleId_fkey"
FOREIGN KEY ("workScheduleId") REFERENCES "WorkSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HolidayCalendar"
ADD CONSTRAINT "HolidayCalendar_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
