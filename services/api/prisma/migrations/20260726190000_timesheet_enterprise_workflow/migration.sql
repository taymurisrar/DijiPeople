-- Enterprise Timesheet workflow, phase 1.
-- This migration is additive: legacy monthly records and entries remain the
-- source of record while week/day children are backfilled and validated.

CREATE TYPE "TimesheetWeekStatus" AS ENUM (
  'NOT_AVAILABLE', 'NOT_STARTED', 'OPEN', 'DRAFT', 'INCOMPLETE',
  'READY_TO_SUBMIT', 'SUBMITTED', 'PENDING_APPROVAL', 'PARTIALLY_APPROVED',
  'APPROVED', 'REJECTED', 'REOPENED', 'OVERDUE', 'PAYROLL_READY',
  'PAYROLL_PROCESSED', 'LOCKED', 'CANCELLED'
);

CREATE TYPE "TimesheetDayType" AS ENUM (
  'WORKING_DAY', 'WEEKEND', 'HOLIDAY', 'APPROVED_LEAVE', 'PARTIAL_LEAVE',
  'BUSINESS_TRAVEL', 'NOT_EMPLOYED', 'NOT_APPLICABLE', 'EXEMPT', 'SUSPENDED',
  'INACTIVE', 'MISSING_SCHEDULE', 'EXCEPTION'
);

CREATE TYPE "TimesheetDayTypeSource" AS ENUM (
  'WORK_SCHEDULE', 'SHIFT', 'HOLIDAY_CALENDAR', 'LEAVE_REQUEST', 'EMPLOYMENT',
  'POLICY', 'ATTENDANCE', 'MANUAL_ADJUSTMENT', 'SYSTEM'
);

CREATE TYPE "TimesheetCompletionStatus" AS ENUM (
  'NOT_REQUIRED', 'MISSING', 'PARTIAL', 'COMPLETE', 'EXCEPTION'
);

CREATE TYPE "TimesheetPayrollStatus" AS ENUM (
  'NOT_APPLICABLE', 'NOT_ELIGIBLE', 'BLOCKED', 'READY', 'EXPORT_PENDING',
  'EXPORTED', 'FAILED', 'REPROCESSING', 'PAYROLL_PROCESSED', 'ADJUSTMENT_REQUIRED'
);

CREATE TYPE "TimesheetLockStatus" AS ENUM (
  'UNLOCKED', 'SUBMISSION_LOCKED', 'APPROVAL_LOCKED', 'PAYROLL_LOCKED', 'CUTOFF_LOCKED'
);

CREATE TYPE "TimesheetPolicyScopeType" AS ENUM (
  'TENANT', 'ORGANIZATION', 'BUSINESS_UNIT', 'DEPARTMENT', 'TEAM', 'EMPLOYEE'
);

CREATE TYPE "TimesheetEntrySource" AS ENUM (
  'MANUAL', 'ATTENDANCE', 'IMPORT', 'INTEGRATION', 'SYSTEM', 'ADJUSTMENT'
);

CREATE TYPE "TimesheetEntryApprovalStatus" AS ENUM (
  'NOT_REQUIRED', 'DRAFT', 'PENDING', 'APPROVED', 'REJECTED'
);

CREATE TYPE "TimesheetReopeningStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "TimesheetExportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED');
CREATE TYPE "TimesheetExportFormat" AS ENUM ('XLSX', 'CSV', 'PDF');
CREATE TYPE "TimesheetRestrictionMode" AS ENUM ('WARNING_ONLY', 'LIMITED_ACCESS', 'TIMESHEET_ONLY');
CREATE TYPE "TimesheetJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');
CREATE TYPE "TimesheetJobType" AS ENUM (
  'NEXT_MONTH_GENERATION', 'CURRENT_MONTH_REPAIR', 'WEEK_OPENING',
  'SUBMISSION_REMINDER', 'OVERDUE_DETECTION', 'APPROVAL_ESCALATION',
  'ATTENDANCE_PREFILL', 'ATTENDANCE_RECONCILIATION', 'HOLIDAY_RECALCULATION',
  'LEAVE_RECALCULATION', 'PAYROLL_READINESS', 'PAYROLL_EXPORT',
  'EXPORT_GENERATION', 'ACCESS_RESTRICTION', 'RESTRICTION_REMOVAL',
  'CUTOFF_LOCKING', 'INTEGRATION_RETRY'
);

ALTER TABLE "Timesheet"
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "departmentId" TEXT,
  ADD COLUMN "teamId" TEXT,
  ADD COLUMN "completionPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "requiredHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN "enteredHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN "approvedLeaveHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN "holidayHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN "weekendHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN "billableHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN "nonBillableHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN "overtimeHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN "payrollStatus" "TimesheetPayrollStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN "lockStatus" "TimesheetLockStatus" NOT NULL DEFAULT 'UNLOCKED',
  ADD COLUMN "generatedAt" TIMESTAMP(3),
  ADD COLUMN "finalizedAt" TIMESTAMP(3),
  ADD COLUMN "payrollProcessedAt" TIMESTAMP(3),
  ADD COLUMN "policyId" TEXT,
  ADD COLUMN "policyVersion" INTEGER,
  ADD COLUMN "policySnapshot" JSONB,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

UPDATE "Timesheet" sheet
SET
  "organizationId" = employee."organizationId",
  "businessUnitId" = COALESCE(sheet."businessUnitId", employee."businessUnitId"),
  "departmentId" = employee."departmentId",
  "teamId" = employee."teamId",
  "generatedAt" = COALESCE(sheet."generatedAt", sheet."createdAt")
FROM "Employee" employee
WHERE employee."id" = sheet."employeeId"
  AND employee."tenantId" = sheet."tenantId";

CREATE TABLE "TimesheetPolicy" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "scopeType" "TimesheetPolicyScopeType" NOT NULL DEFAULT 'TENANT',
  "scopeId" TEXT,
  "organizationId" TEXT,
  "businessUnitId" TEXT,
  "departmentId" TEXT,
  "teamId" TEXT,
  "employeeId" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "inheritUnspecified" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "settings" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "TimesheetPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TimesheetPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE,
  CONSTRAINT "TimesheetPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "TimesheetPolicy_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE,
  CONSTRAINT "TimesheetPolicy_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE,
  CONSTRAINT "TimesheetPolicy_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE,
  CONSTRAINT "TimesheetPolicy_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE,
  CONSTRAINT "TimesheetPolicy_dates_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom")
);

CREATE UNIQUE INDEX "TimesheetPolicy_tenantId_code_version_key" ON "TimesheetPolicy"("tenantId", "code", "version");
CREATE INDEX "TimesheetPolicy_tenant_enabled_dates_idx" ON "TimesheetPolicy"("tenantId", "enabled", "effectiveFrom", "effectiveTo");
CREATE INDEX "TimesheetPolicy_tenant_scope_priority_idx" ON "TimesheetPolicy"("tenantId", "scopeType", "scopeId", "priority");
CREATE INDEX "TimesheetPolicy_tenant_org_bu_idx" ON "TimesheetPolicy"("tenantId", "organizationId", "businessUnitId");
CREATE INDEX "TimesheetPolicy_tenant_dept_team_employee_idx" ON "TimesheetPolicy"("tenantId", "departmentId", "teamId", "employeeId");

CREATE TABLE "TimesheetWeek" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "timesheetId" TEXT NOT NULL,
  "weekNumber" INTEGER NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "status" "TimesheetWeekStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "submissionDeadline" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "submittedById" TEXT,
  "approvalRequestId" TEXT,
  "requiredHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "enteredHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "leaveHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "holidayHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "weekendHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "billableHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "nonBillableHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "overtimeHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "lockStatus" "TimesheetLockStatus" NOT NULL DEFAULT 'UNLOCKED',
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "reopenedAt" TIMESTAMP(3),
  "approvalVersion" INTEGER NOT NULL DEFAULT 1,
  "payrollEligibility" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "TimesheetWeek_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TimesheetWeek_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE,
  CONSTRAINT "TimesheetWeek_timesheetId_fkey" FOREIGN KEY ("timesheetId") REFERENCES "Timesheet"("id") ON DELETE CASCADE,
  CONSTRAINT "TimesheetWeek_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL,
  CONSTRAINT "TimesheetWeek_dates_check" CHECK ("endDate" >= "startDate")
);

CREATE UNIQUE INDEX "TimesheetWeek_timesheetId_weekNumber_key" ON "TimesheetWeek"("timesheetId", "weekNumber");
CREATE INDEX "TimesheetWeek_tenant_status_deadline_idx" ON "TimesheetWeek"("tenantId", "status", "submissionDeadline");
CREATE INDEX "TimesheetWeek_tenant_approval_idx" ON "TimesheetWeek"("tenantId", "approvalRequestId");
CREATE INDEX "TimesheetWeek_tenant_payroll_idx" ON "TimesheetWeek"("tenantId", "payrollEligibility", "status");

CREATE TABLE "TimesheetDay" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "timesheetWeekId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "dayOfWeek" "WorkWeekday" NOT NULL,
  "dayType" "TimesheetDayType" NOT NULL,
  "dayTypeSource" "TimesheetDayTypeSource" NOT NULL,
  "expectedHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "availableHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "enteredHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "attendanceHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "approvedLeaveHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "holidayId" TEXT,
  "holidayName" TEXT,
  "leaveRequestId" TEXT,
  "leaveTypeId" TEXT,
  "leaveTypeName" TEXT,
  "workScheduleId" TEXT,
  "shiftId" TEXT,
  "isWeekend" BOOLEAN NOT NULL DEFAULT false,
  "isHoliday" BOOLEAN NOT NULL DEFAULT false,
  "isApprovedLeave" BOOLEAN NOT NULL DEFAULT false,
  "isLocked" BOOLEAN NOT NULL DEFAULT false,
  "lockReason" TEXT,
  "completionStatus" "TimesheetCompletionStatus" NOT NULL DEFAULT 'MISSING',
  "varianceMinutes" INTEGER NOT NULL DEFAULT 0,
  "varianceStatus" TEXT NOT NULL DEFAULT 'MATCHED',
  "sourceReference" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "TimesheetDay_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TimesheetDay_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE,
  CONSTRAINT "TimesheetDay_weekId_fkey" FOREIGN KEY ("timesheetWeekId") REFERENCES "TimesheetWeek"("id") ON DELETE CASCADE,
  CONSTRAINT "TimesheetDay_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "TimesheetDay_week_date_key" ON "TimesheetDay"("timesheetWeekId", "date");
CREATE INDEX "TimesheetDay_tenant_employee_date_idx" ON "TimesheetDay"("tenantId", "employeeId", "date");
CREATE INDEX "TimesheetDay_tenant_type_completion_idx" ON "TimesheetDay"("tenantId", "dayType", "completionStatus");
CREATE INDEX "TimesheetDay_tenant_lock_date_idx" ON "TimesheetDay"("tenantId", "isLocked", "date");

ALTER TABLE "TimesheetEntry"
  ADD COLUMN "timesheetDayId" TEXT,
  ADD COLUMN "projectAssignmentId" TEXT,
  ADD COLUMN "taskId" TEXT,
  ADD COLUMN "activityTypeId" TEXT,
  ADD COLUMN "workLocationId" TEXT,
  ADD COLUMN "costCenterId" TEXT,
  ADD COLUMN "startTime" TIMESTAMP(3),
  ADD COLUMN "endTime" TIMESTAMP(3),
  ADD COLUMN "source" "TimesheetEntrySource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "approvalStatus" "TimesheetEntryApprovalStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "payrollCategory" TEXT,
  ADD COLUMN "integrationReference" TEXT;

DROP INDEX IF EXISTS "TimesheetEntry_timesheetId_date_projectId_key";

ALTER TABLE "TimesheetEntry"
  ADD CONSTRAINT "TimesheetEntry_timesheetDayId_fkey" FOREIGN KEY ("timesheetDayId") REFERENCES "TimesheetDay"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "TimesheetEntry_projectAssignmentId_fkey" FOREIGN KEY ("projectAssignmentId") REFERENCES "ProjectAssignment"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "TimesheetEntry_time_range_check" CHECK ("endTime" IS NULL OR "startTime" IS NULL OR "endTime" > "startTime"),
  ADD CONSTRAINT "TimesheetEntry_hours_check" CHECK ("hours" >= 0 AND "hours" <= 24);

CREATE INDEX "TimesheetEntry_tenant_day_idx" ON "TimesheetEntry"("tenantId", "timesheetDayId");
CREATE INDEX "TimesheetEntry_tenant_assignment_date_idx" ON "TimesheetEntry"("tenantId", "projectAssignmentId", "date");
CREATE INDEX "TimesheetEntry_tenant_approval_payroll_idx" ON "TimesheetEntry"("tenantId", "approvalStatus", "payrollCategory");

CREATE TABLE "TimesheetReopeningRequest" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "timesheetId" TEXT NOT NULL,
  "weekId" TEXT,
  "requestedById" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason" TEXT NOT NULL,
  "status" "TimesheetReopeningStatus" NOT NULL DEFAULT 'PENDING',
  "approverUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "decisionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimesheetReopeningRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TimesheetReopening_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE,
  CONSTRAINT "TimesheetReopening_timesheetId_fkey" FOREIGN KEY ("timesheetId") REFERENCES "Timesheet"("id") ON DELETE CASCADE,
  CONSTRAINT "TimesheetReopening_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "TimesheetWeek"("id") ON DELETE CASCADE,
  CONSTRAINT "TimesheetReopening_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "TimesheetReopening_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE SET NULL
);
CREATE INDEX "TimesheetReopening_tenant_status_idx" ON "TimesheetReopeningRequest"("tenantId", "status", "requestedAt");
CREATE INDEX "TimesheetReopening_tenant_record_idx" ON "TimesheetReopeningRequest"("tenantId", "timesheetId", "weekId");

CREATE TABLE "TimesheetExportRequest" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "exportType" TEXT NOT NULL,
  "filters" JSONB NOT NULL,
  "format" "TimesheetExportFormat" NOT NULL,
  "status" "TimesheetExportStatus" NOT NULL DEFAULT 'QUEUED',
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "fileReference" TEXT,
  "fileName" TEXT,
  "contentType" TEXT,
  "expiresAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimesheetExportRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TimesheetExport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE,
  CONSTRAINT "TimesheetExport_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT
);
CREATE INDEX "TimesheetExport_tenant_requester_idx" ON "TimesheetExportRequest"("tenantId", "requestedById", "requestedAt");
CREATE INDEX "TimesheetExport_tenant_status_idx" ON "TimesheetExportRequest"("tenantId", "status", "createdAt");

CREATE TABLE "TimesheetAccessRestriction" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "sourceTimesheetIds" JSONB NOT NULL,
  "restrictionMode" "TimesheetRestrictionMode" NOT NULL,
  "startAt" TIMESTAMP(3) NOT NULL,
  "expiryAt" TIMESTAMP(3),
  "overriddenById" TEXT,
  "overrideReason" TEXT,
  "overriddenAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimesheetAccessRestriction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TimesheetRestriction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE,
  CONSTRAINT "TimesheetRestriction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE,
  CONSTRAINT "TimesheetRestriction_overriddenById_fkey" FOREIGN KEY ("overriddenById") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "TimesheetRestriction_dates_check" CHECK ("expiryAt" IS NULL OR "expiryAt" >= "startAt")
);
CREATE INDEX "TimesheetRestriction_tenant_employee_idx" ON "TimesheetAccessRestriction"("tenantId", "employeeId", "isActive");
CREATE INDEX "TimesheetRestriction_tenant_expiry_idx" ON "TimesheetAccessRestriction"("tenantId", "expiryAt", "isActive");

CREATE TABLE "TimesheetPayrollHandoff" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "timesheetId" TEXT NOT NULL,
  "executionKey" TEXT NOT NULL,
  "payrollPeriodId" TEXT,
  "includedWeekIds" JSONB NOT NULL,
  "includedEntryIds" JSONB NOT NULL,
  "status" "TimesheetPayrollStatus" NOT NULL DEFAULT 'EXPORT_PENDING',
  "exportedAt" TIMESTAMP(3),
  "payrollReference" TEXT,
  "result" JSONB,
  "failureReason" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "adjustmentForId" TEXT,
  "authorizedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimesheetPayrollHandoff_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TimesheetHandoff_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE,
  CONSTRAINT "TimesheetHandoff_timesheetId_fkey" FOREIGN KEY ("timesheetId") REFERENCES "Timesheet"("id") ON DELETE RESTRICT,
  CONSTRAINT "TimesheetHandoff_periodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE SET NULL,
  CONSTRAINT "TimesheetHandoff_adjustmentForId_fkey" FOREIGN KEY ("adjustmentForId") REFERENCES "TimesheetPayrollHandoff"("id") ON DELETE SET NULL,
  CONSTRAINT "TimesheetHandoff_authorizedById_fkey" FOREIGN KEY ("authorizedById") REFERENCES "User"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "TimesheetHandoff_tenant_execution_key" ON "TimesheetPayrollHandoff"("tenantId", "executionKey");
CREATE INDEX "TimesheetHandoff_tenant_timesheet_status_idx" ON "TimesheetPayrollHandoff"("tenantId", "timesheetId", "status");
CREATE INDEX "TimesheetHandoff_tenant_period_status_idx" ON "TimesheetPayrollHandoff"("tenantId", "payrollPeriodId", "status");

CREATE TABLE "TimesheetJobExecution" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "jobType" "TimesheetJobType" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "TimesheetJobStatus" NOT NULL DEFAULT 'QUEUED',
  "input" JSONB,
  "result" JSONB,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimesheetJobExecution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TimesheetJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "TimesheetJob_tenant_type_key" ON "TimesheetJobExecution"("tenantId", "jobType", "idempotencyKey");
CREATE INDEX "TimesheetJob_tenant_status_idx" ON "TimesheetJobExecution"("tenantId", "status", "createdAt");
CREATE INDEX "TimesheetJob_tenant_type_completed_idx" ON "TimesheetJobExecution"("tenantId", "jobType", "completedAt");

CREATE TABLE "TimesheetMigrationResult" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "migrationKey" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "processedCount" INTEGER NOT NULL DEFAULT 0,
  "succeededCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "details" JSONB,
  "failureReason" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimesheetMigrationResult_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TimesheetMigration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "TimesheetMigration_tenant_key" ON "TimesheetMigrationResult"("tenantId", "migrationKey");
CREATE INDEX "TimesheetMigration_tenant_status_idx" ON "TimesheetMigrationResult"("tenantId", "status", "startedAt");

ALTER TABLE "Timesheet"
  ADD CONSTRAINT "Timesheet_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "Timesheet_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "Timesheet_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "Timesheet_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "TimesheetPolicy"("id") ON DELETE SET NULL;

CREATE INDEX "Timesheet_tenant_scope_idx" ON "Timesheet"("tenantId", "organizationId", "departmentId", "teamId");
CREATE INDEX "Timesheet_tenant_payroll_period_idx" ON "Timesheet"("tenantId", "payrollStatus", "periodStart");

-- Backfill week rows from every preserved monthly record. Weeks use the
-- employee-facing calendar month and Monday boundaries, clipped to the month.
WITH week_ranges AS (
  SELECT DISTINCT
    sheet."id" AS "timesheetId",
    sheet."tenantId",
    GREATEST(sheet."periodStart"::date, date_trunc('week', day)::date) AS "startDate",
    LEAST(sheet."periodEnd"::date, (date_trunc('week', day) + interval '6 days')::date) AS "endDate"
  FROM "Timesheet" sheet
  CROSS JOIN LATERAL generate_series(sheet."periodStart"::date, sheet."periodEnd"::date, interval '1 day') AS day
), numbered AS (
  SELECT *, dense_rank() OVER (PARTITION BY "timesheetId" ORDER BY "startDate") AS "weekNumber"
  FROM week_ranges
)
INSERT INTO "TimesheetWeek" (
  "tenantId", "timesheetId", "weekNumber", "startDate", "endDate", "status",
  "submittedAt", "requiredHours", "enteredHours", "lockStatus", "createdAt", "updatedAt"
)
SELECT
  numbered."tenantId", numbered."timesheetId", numbered."weekNumber",
  numbered."startDate", numbered."endDate",
  CASE sheet."status"
    WHEN 'SUBMITTED' THEN 'PENDING_APPROVAL'::"TimesheetWeekStatus"
    WHEN 'APPROVED' THEN 'APPROVED'::"TimesheetWeekStatus"
    WHEN 'REJECTED' THEN 'REJECTED'::"TimesheetWeekStatus"
    WHEN 'LOCKED' THEN 'LOCKED'::"TimesheetWeekStatus"
    ELSE 'DRAFT'::"TimesheetWeekStatus"
  END,
  sheet."submittedAt", 0, 0,
  CASE sheet."status"
    WHEN 'SUBMITTED' THEN 'SUBMISSION_LOCKED'::"TimesheetLockStatus"
    WHEN 'APPROVED' THEN 'APPROVAL_LOCKED'::"TimesheetLockStatus"
    WHEN 'LOCKED' THEN 'APPROVAL_LOCKED'::"TimesheetLockStatus"
    ELSE 'UNLOCKED'::"TimesheetLockStatus"
  END,
  sheet."createdAt", sheet."updatedAt"
FROM numbered
JOIN "Timesheet" sheet ON sheet."id" = numbered."timesheetId"
ON CONFLICT ("timesheetId", "weekNumber") DO NOTHING;

-- Backfill a day record for every calendar date. Existing classifications,
-- leave references and hours are retained; missing legacy rows remain visible.
WITH all_days AS (
  SELECT sheet."id" AS "timesheetId", sheet."tenantId", sheet."employeeId",
         day::date AS "date"
  FROM "Timesheet" sheet
  CROSS JOIN LATERAL generate_series(sheet."periodStart"::date, sheet."periodEnd"::date, interval '1 day') AS day
), source_rows AS (
  SELECT DISTINCT ON (entry."timesheetId", entry."date"::date)
    entry.*
  FROM "TimesheetEntry" entry
  ORDER BY entry."timesheetId", entry."date"::date, entry."updatedAt" DESC
)
INSERT INTO "TimesheetDay" (
  "tenantId", "timesheetWeekId", "employeeId", "date", "dayOfWeek",
  "dayType", "dayTypeSource", "expectedHours", "availableHours", "enteredHours",
  "approvedLeaveHours", "holidayId", "holidayName", "leaveRequestId",
  "isWeekend", "isHoliday", "isApprovedLeave", "isLocked", "lockReason",
  "completionStatus", "createdAt", "updatedAt"
)
SELECT
  days."tenantId", week."id", days."employeeId", days."date",
  CASE EXTRACT(ISODOW FROM days."date")
    WHEN 1 THEN 'MONDAY'::"WorkWeekday" WHEN 2 THEN 'TUESDAY'::"WorkWeekday"
    WHEN 3 THEN 'WEDNESDAY'::"WorkWeekday" WHEN 4 THEN 'THURSDAY'::"WorkWeekday"
    WHEN 5 THEN 'FRIDAY'::"WorkWeekday" WHEN 6 THEN 'SATURDAY'::"WorkWeekday"
    ELSE 'SUNDAY'::"WorkWeekday" END,
  CASE
    WHEN source."leaveRequestId" IS NOT NULL THEN 'APPROVED_LEAVE'::"TimesheetDayType"
    WHEN COALESCE(source."isHoliday", false) THEN 'HOLIDAY'::"TimesheetDayType"
    WHEN COALESCE(source."isWeekend", false) THEN 'WEEKEND'::"TimesheetDayType"
    ELSE 'WORKING_DAY'::"TimesheetDayType" END,
  CASE
    WHEN source."leaveRequestId" IS NOT NULL THEN 'LEAVE_REQUEST'::"TimesheetDayTypeSource"
    WHEN COALESCE(source."isHoliday", false) THEN 'HOLIDAY_CALENDAR'::"TimesheetDayTypeSource"
    WHEN source."id" IS NOT NULL THEN 'WORK_SCHEDULE'::"TimesheetDayTypeSource"
    ELSE 'SYSTEM'::"TimesheetDayTypeSource" END,
  CASE WHEN COALESCE(source."isWeekend", false) OR COALESCE(source."isHoliday", false) THEN 0 ELSE COALESCE(source."hours", 0) END,
  CASE WHEN COALESCE(source."isWeekend", false) OR COALESCE(source."isHoliday", false) THEN 0 ELSE COALESCE(source."hours", 0) END,
  COALESCE(source."hours", 0),
  CASE WHEN source."leaveRequestId" IS NOT NULL THEN COALESCE(source."hours", 0) ELSE 0 END,
  NULL, NULL, source."leaveRequestId",
  COALESCE(source."isWeekend", false), COALESCE(source."isHoliday", false),
  source."leaveRequestId" IS NOT NULL,
  sheet."status" IN ('SUBMITTED', 'APPROVED', 'LOCKED'),
  CASE WHEN sheet."status" IN ('SUBMITTED', 'APPROVED', 'LOCKED') THEN 'Legacy workflow lock' ELSE NULL END,
  CASE
    WHEN COALESCE(source."isWeekend", false) OR COALESCE(source."isHoliday", false) OR source."leaveRequestId" IS NOT NULL THEN 'NOT_REQUIRED'::"TimesheetCompletionStatus"
    WHEN source."entryType" IN ('ON_WORK', 'ON_LEAVE') THEN 'COMPLETE'::"TimesheetCompletionStatus"
    ELSE 'MISSING'::"TimesheetCompletionStatus" END,
  COALESCE(source."createdAt", sheet."createdAt"), COALESCE(source."updatedAt", sheet."updatedAt")
FROM all_days days
JOIN "Timesheet" sheet ON sheet."id" = days."timesheetId"
JOIN "TimesheetWeek" week ON week."timesheetId" = days."timesheetId"
  AND days."date" BETWEEN week."startDate"::date AND week."endDate"::date
LEFT JOIN source_rows source ON source."timesheetId" = days."timesheetId" AND source."date"::date = days."date"
ON CONFLICT ("timesheetWeekId", "date") DO NOTHING;

UPDATE "TimesheetEntry" entry
SET "timesheetDayId" = day."id"
FROM "TimesheetDay" day
JOIN "TimesheetWeek" week ON week."id" = day."timesheetWeekId"
WHERE week."timesheetId" = entry."timesheetId"
  AND day."date"::date = entry."date"::date
  AND day."tenantId" = entry."tenantId";

UPDATE "TimesheetDay" day
SET "enteredHours" = totals.hours,
    "completionStatus" = CASE
      WHEN day."completionStatus" = 'NOT_REQUIRED' THEN day."completionStatus"
      WHEN totals.hours > 0 THEN 'COMPLETE'::"TimesheetCompletionStatus"
      ELSE day."completionStatus" END
FROM (
  SELECT "timesheetDayId", COALESCE(SUM("hours"), 0) AS hours
  FROM "TimesheetEntry"
  WHERE "timesheetDayId" IS NOT NULL
  GROUP BY "timesheetDayId"
) totals
WHERE totals."timesheetDayId" = day."id";

UPDATE "TimesheetWeek" week
SET "requiredHours" = totals.required_hours,
    "enteredHours" = totals.entered_hours,
    "leaveHours" = totals.leave_hours,
    "holidayHours" = totals.holiday_hours,
    "weekendHours" = totals.weekend_hours,
    "billableHours" = totals.billable_hours,
    "nonBillableHours" = totals.non_billable_hours
FROM (
  SELECT day."timesheetWeekId",
    COALESCE(SUM(day."expectedHours"), 0) AS required_hours,
    COALESCE(SUM(day."enteredHours"), 0) AS entered_hours,
    COALESCE(SUM(day."approvedLeaveHours"), 0) AS leave_hours,
    COALESCE(SUM(CASE WHEN day."isHoliday" THEN day."enteredHours" ELSE 0 END), 0) AS holiday_hours,
    COALESCE(SUM(CASE WHEN day."isWeekend" THEN day."enteredHours" ELSE 0 END), 0) AS weekend_hours,
    COALESCE(SUM(CASE WHEN entry."billableFlag" THEN entry."hours" ELSE 0 END), 0) AS billable_hours,
    COALESCE(SUM(CASE WHEN NOT entry."billableFlag" THEN entry."hours" ELSE 0 END), 0) AS non_billable_hours
  FROM "TimesheetDay" day
  LEFT JOIN "TimesheetEntry" entry ON entry."timesheetDayId" = day."id"
  GROUP BY day."timesheetWeekId"
) totals
WHERE totals."timesheetWeekId" = week."id";

UPDATE "Timesheet" sheet
SET "requiredHours" = totals.required_hours,
    "enteredHours" = totals.entered_hours,
    "approvedLeaveHours" = totals.leave_hours,
    "holidayHours" = totals.holiday_hours,
    "weekendHours" = totals.weekend_hours,
    "billableHours" = totals.billable_hours,
    "nonBillableHours" = totals.non_billable_hours,
    "completionPercentage" = CASE WHEN totals.required_hours <= 0 THEN 100 ELSE LEAST(100, ROUND((totals.entered_hours / totals.required_hours) * 100, 2)) END
FROM (
  SELECT "timesheetId",
    COALESCE(SUM("requiredHours"), 0) AS required_hours,
    COALESCE(SUM("enteredHours"), 0) AS entered_hours,
    COALESCE(SUM("leaveHours"), 0) AS leave_hours,
    COALESCE(SUM("holidayHours"), 0) AS holiday_hours,
    COALESCE(SUM("weekendHours"), 0) AS weekend_hours,
    COALESCE(SUM("billableHours"), 0) AS billable_hours,
    COALESCE(SUM("nonBillableHours"), 0) AS non_billable_hours
  FROM "TimesheetWeek"
  GROUP BY "timesheetId"
) totals
WHERE totals."timesheetId" = sheet."id";

INSERT INTO "TimesheetMigrationResult" (
  "tenantId", "migrationKey", "status", "processedCount", "succeededCount",
  "failedCount", "details", "completedAt"
)
SELECT tenant."id", '20260726190000_timesheet_enterprise_workflow', 'COMPLETED',
  COUNT(DISTINCT sheet."id")::integer,
  COUNT(DISTINCT day."id")::integer,
  0,
  jsonb_build_object(
    'monthlyRecordsPreserved', COUNT(DISTINCT sheet."id"),
    'weeklyRowsCreated', COUNT(DISTINCT week."id"),
    'dayRowsCreated', COUNT(DISTINCT day."id"),
    'legacySettingsPreserved', true,
    'readWritePhase', 'dual-compatible'
  ),
  CURRENT_TIMESTAMP
FROM "Tenant" tenant
LEFT JOIN "Timesheet" sheet ON sheet."tenantId" = tenant."id"
LEFT JOIN "TimesheetWeek" week ON week."timesheetId" = sheet."id"
LEFT JOIN "TimesheetDay" day ON day."timesheetWeekId" = week."id"
GROUP BY tenant."id"
ON CONFLICT ("tenantId", "migrationKey") DO UPDATE SET
  "status" = EXCLUDED."status",
  "processedCount" = EXCLUDED."processedCount",
  "succeededCount" = EXCLUDED."succeededCount",
  "failedCount" = EXCLUDED."failedCount",
  "details" = EXCLUDED."details",
  "completedAt" = EXCLUDED."completedAt";
