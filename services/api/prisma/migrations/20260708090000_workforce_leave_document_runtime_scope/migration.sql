-- Workforce structure runtime scope
CREATE TABLE "EmploymentType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "payrollEligible" BOOLEAN NOT NULL DEFAULT true,
    "leaveEligible" BOOLEAN NOT NULL DEFAULT true,
    "overtimeEligible" BOOLEAN NOT NULL DEFAULT false,
    "benefitsEligible" BOOLEAN NOT NULL DEFAULT true,
    "defaultProbationDays" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "EmploymentType_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Employee" ADD COLUMN "employmentTypeId" TEXT;
ALTER TABLE "EmployeeLevel" ADD COLUMN "parentEmployeeLevelId" TEXT;
ALTER TABLE "EmployeeLevel" ADD COLUMN "nextEmployeeLevelId" TEXT;

CREATE UNIQUE INDEX "EmploymentType_id_tenantId_key" ON "EmploymentType"("id", "tenantId");
CREATE UNIQUE INDEX "EmploymentType_tenantId_code_key" ON "EmploymentType"("tenantId", "code");
CREATE UNIQUE INDEX "EmploymentType_tenantId_name_key" ON "EmploymentType"("tenantId", "name");
CREATE INDEX "EmploymentType_tenantId_idx" ON "EmploymentType"("tenantId");
CREATE INDEX "EmploymentType_tenantId_isActive_idx" ON "EmploymentType"("tenantId", "isActive");
CREATE INDEX "EmploymentType_tenantId_payrollEligible_idx" ON "EmploymentType"("tenantId", "payrollEligible");
CREATE INDEX "EmploymentType_tenantId_leaveEligible_idx" ON "EmploymentType"("tenantId", "leaveEligible");
CREATE INDEX "Employee_tenantId_employmentTypeId_idx" ON "Employee"("tenantId", "employmentTypeId");
CREATE INDEX "EmployeeLevel_tenantId_parentEmployeeLevelId_idx" ON "EmployeeLevel"("tenantId", "parentEmployeeLevelId");
CREATE INDEX "EmployeeLevel_tenantId_nextEmployeeLevelId_idx" ON "EmployeeLevel"("tenantId", "nextEmployeeLevelId");

ALTER TABLE "EmploymentType" ADD CONSTRAINT "EmploymentType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_employmentTypeId_tenantId_fkey" FOREIGN KEY ("employmentTypeId", "tenantId") REFERENCES "EmploymentType"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeLevel" ADD CONSTRAINT "EmployeeLevel_parentEmployeeLevelId_tenantId_fkey" FOREIGN KEY ("parentEmployeeLevelId", "tenantId") REFERENCES "EmployeeLevel"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeLevel" ADD CONSTRAINT "EmployeeLevel_nextEmployeeLevelId_tenantId_fkey" FOREIGN KEY ("nextEmployeeLevelId", "tenantId") REFERENCES "EmployeeLevel"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Leave configuration runtime scope
ALTER TABLE "LeaveType" ADD COLUMN "description" TEXT;
ALTER TABLE "LeaveType" ADD COLUMN "affectsPayroll" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LeaveType" ADD COLUMN "consumesBalance" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LeaveType" ADD COLUMN "employeeRequestAllowed" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LeaveType" ADD COLUMN "requiresAttachment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LeaveType" ADD COLUMN "allowHalfDay" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LeaveType" ADD COLUMN "allowHourlyLeave" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "LeavePolicy" ADD COLUMN "description" TEXT;

ALTER TABLE "LeavePolicyAssignment" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "LeavePolicyAssignment" ADD COLUMN "businessUnitId" TEXT;
ALTER TABLE "LeavePolicyAssignment" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "LeavePolicyAssignment" ADD COLUMN "employeeLevelId" TEXT;
ALTER TABLE "LeavePolicyAssignment" ADD COLUMN "employeeId" TEXT;

ALTER TABLE "LeavePolicyRule" ADD COLUMN "minimumServiceDays" INTEGER;
ALTER TABLE "LeavePolicyRule" ADD COLUMN "prorateOnJoining" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LeavePolicyRule" ADD COLUMN "prorateOnExit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LeavePolicyRule" ADD COLUMN "maximumNegativeBalance" DECIMAL(10,2);
ALTER TABLE "LeavePolicyRule" ADD COLUMN "accrualDay" INTEGER;
ALTER TABLE "LeavePolicyRule" ADD COLUMN "accrualAmount" DECIMAL(10,2);
ALTER TABLE "LeavePolicyRule" ADD COLUMN "accrueDuringProbation" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LeavePolicyRule" ADD COLUMN "creditOnJoining" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LeavePolicyRule" ADD COLUMN "carryForwardExpiryMonths" INTEGER;
ALTER TABLE "LeavePolicyRule" ADD COLUMN "encashUnusedBalance" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LeavePolicyRule" ADD COLUMN "maximumEncashmentDays" DECIMAL(10,2);
ALTER TABLE "LeavePolicyRule" ADD COLUMN "minimumNoticeDays" INTEGER;
ALTER TABLE "LeavePolicyRule" ADD COLUMN "minimumConsecutiveDays" DECIMAL(10,2);
ALTER TABLE "LeavePolicyRule" ADD COLUMN "allowDuringProbation" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LeavePolicyRule" ADD COLUMN "allowBackdatedRequests" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LeavePolicyRule" ADD COLUMN "maxBackdatedDays" INTEGER;
ALTER TABLE "LeavePolicyRule" ADD COLUMN "allowFutureRequests" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LeavePolicyRule" ADD COLUMN "maxFutureDays" INTEGER;
ALTER TABLE "LeavePolicyRule" ADD COLUMN "blockDuringNoticePeriod" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LeavePolicyRule" ADD COLUMN "approvalMatrixId" TEXT;
ALTER TABLE "LeavePolicyRule" ADD COLUMN "autoApproveUnderDays" DECIMAL(10,2);
ALTER TABLE "LeavePolicyRule" ADD COLUMN "requireHrApproval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LeavePolicyRule" ADD COLUMN "requirePayrollApproval" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "LeavePolicyAssignment_tenantId_organizationId_idx" ON "LeavePolicyAssignment"("tenantId", "organizationId");
CREATE INDEX "LeavePolicyAssignment_tenantId_businessUnitId_idx" ON "LeavePolicyAssignment"("tenantId", "businessUnitId");
CREATE INDEX "LeavePolicyAssignment_tenantId_departmentId_idx" ON "LeavePolicyAssignment"("tenantId", "departmentId");
CREATE INDEX "LeavePolicyAssignment_tenantId_employeeLevelId_idx" ON "LeavePolicyAssignment"("tenantId", "employeeLevelId");
CREATE INDEX "LeavePolicyAssignment_tenantId_employeeId_idx" ON "LeavePolicyAssignment"("tenantId", "employeeId");
CREATE INDEX "LeavePolicyRule_tenantId_approvalMatrixId_idx" ON "LeavePolicyRule"("tenantId", "approvalMatrixId");

-- Document category runtime scope
ALTER TABLE "DocumentCategory" ADD COLUMN "appliesTo" TEXT[] DEFAULT ARRAY['GENERAL']::TEXT[];
ALTER TABLE "DocumentCategory" ADD COLUMN "expirable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DocumentCategory" ADD COLUMN "requiresVerification" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DocumentCategory" ADD COLUMN "defaultRetentionMonths" INTEGER;
ALTER TABLE "DocumentCategory" ADD COLUMN "allowedExtensionsOverride" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "DocumentCategory" ADD COLUMN "maximumUploadSizeOverrideMb" INTEGER;

CREATE INDEX "DocumentCategory_tenantId_expirable_idx" ON "DocumentCategory"("tenantId", "expirable");
