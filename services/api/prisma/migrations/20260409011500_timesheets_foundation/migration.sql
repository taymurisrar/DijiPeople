-- CreateEnum
CREATE TYPE "TimesheetStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Timesheet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "TimesheetStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "approverUserId" TEXT,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "Timesheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimesheetEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "timesheetId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "hours" DECIMAL(6,2) NOT NULL,
    "description" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "TimesheetEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Timesheet_tenantId_employeeId_periodStart_periodEnd_key" ON "Timesheet"("tenantId", "employeeId", "periodStart", "periodEnd");
CREATE INDEX "Timesheet_tenantId_idx" ON "Timesheet"("tenantId");
CREATE INDEX "Timesheet_tenantId_employeeId_periodStart_idx" ON "Timesheet"("tenantId", "employeeId", "periodStart");
CREATE INDEX "Timesheet_tenantId_status_periodStart_idx" ON "Timesheet"("tenantId", "status", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "TimesheetEntry_timesheetId_date_projectId_key" ON "TimesheetEntry"("timesheetId", "date", "projectId");
CREATE INDEX "TimesheetEntry_tenantId_idx" ON "TimesheetEntry"("tenantId");
CREATE INDEX "TimesheetEntry_tenantId_employeeId_date_idx" ON "TimesheetEntry"("tenantId", "employeeId", "date");
CREATE INDEX "TimesheetEntry_tenantId_timesheetId_idx" ON "TimesheetEntry"("tenantId", "timesheetId");

-- AddForeignKey
ALTER TABLE "Timesheet"
ADD CONSTRAINT "Timesheet_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Timesheet"
ADD CONSTRAINT "Timesheet_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Timesheet"
ADD CONSTRAINT "Timesheet_approverUserId_fkey"
FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TimesheetEntry"
ADD CONSTRAINT "TimesheetEntry_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TimesheetEntry"
ADD CONSTRAINT "TimesheetEntry_timesheetId_fkey"
FOREIGN KEY ("timesheetId") REFERENCES "Timesheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TimesheetEntry"
ADD CONSTRAINT "TimesheetEntry_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
