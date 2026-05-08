/*
  Warnings:

  - You are about to drop the column `accrualType` on the `LeavePolicy` table. All the data in the column will be lost.
  - You are about to drop the column `annualEntitlement` on the `LeavePolicy` table. All the data in the column will be lost.
  - You are about to drop the column `carryForwardAllowed` on the `LeavePolicy` table. All the data in the column will be lost.
  - You are about to drop the column `carryForwardLimit` on the `LeavePolicy` table. All the data in the column will be lost.
  - You are about to drop the column `genderRestriction` on the `LeavePolicy` table. All the data in the column will be lost.
  - You are about to drop the column `negativeBalanceAllowed` on the `LeavePolicy` table. All the data in the column will be lost.
  - You are about to drop the column `probationRestriction` on the `LeavePolicy` table. All the data in the column will be lost.
  - You are about to drop the column `requiresDocumentAfterDays` on the `LeavePolicy` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "LeaveRuleAccrualType" AS ENUM ('FIXED_ANNUAL', 'MONTHLY_ACCRUAL', 'PER_PAY_PERIOD', 'PER_WORKED_HOUR', 'NONE');

-- CreateEnum
CREATE TYPE "LeaveAccrualFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUALLY', 'PAY_PERIOD');

-- DropIndex
DROP INDEX "Candidate_tenantId_email_key";

-- DropIndex
DROP INDEX "LeavePolicy_tenantId_accrualType_idx";

-- DropIndex
DROP INDEX "PayrollCycle_tenantId_periodStart_periodEnd_key";

-- DropIndex
DROP INDEX "Role_tenantId_accessLevel_idx";

-- DropIndex
DROP INDEX "Tenant_customerAccountId_key";

-- AlterTable
ALTER TABLE "ActivityEvent" ADD COLUMN     "activeAppPath" TEXT,
ADD COLUMN     "activeProcessId" INTEGER,
ADD COLUMN     "browserTabTitle" TEXT;

-- AlterTable
ALTER TABLE "CustomizationForm" ALTER COLUMN "type" SET DEFAULT 'main';

-- AlterTable
ALTER TABLE "LeavePolicy" DROP COLUMN "accrualType",
DROP COLUMN "annualEntitlement",
DROP COLUMN "carryForwardAllowed",
DROP COLUMN "carryForwardLimit",
DROP COLUMN "genderRestriction",
DROP COLUMN "negativeBalanceAllowed",
DROP COLUMN "probationRestriction",
DROP COLUMN "requiresDocumentAfterDays";

-- CreateTable
CREATE TABLE "LeavePolicyRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leavePolicyId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "entitlementDays" DECIMAL(10,2),
    "accrualType" "LeaveRuleAccrualType" NOT NULL,
    "accrualFrequency" "LeaveAccrualFrequency",
    "carryForwardAllowed" BOOLEAN NOT NULL DEFAULT false,
    "carryForwardLimit" DECIMAL(10,2),
    "negativeBalanceAllowed" BOOLEAN NOT NULL DEFAULT false,
    "requiresDocumentAfterDays" INTEGER,
    "probationRestriction" BOOLEAN NOT NULL DEFAULT false,
    "genderRestriction" TEXT,
    "minServiceMonths" INTEGER,
    "createdById" TEXT,
    "updatedById" TEXT,
    "maxConsecutiveDays" DECIMAL(10,2),
    "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeavePolicyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleView" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "ModuleViewType" NOT NULL DEFAULT 'custom',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "visibilityScope" "ModuleViewVisibilityScope" NOT NULL DEFAULT 'tenant',
    "allowedRoleKeys" JSONB,
    "allowedUserIds" JSONB,
    "configJson" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModuleView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeavePolicyRule_tenantId_leavePolicyId_idx" ON "LeavePolicyRule"("tenantId", "leavePolicyId");

-- CreateIndex
CREATE INDEX "LeavePolicyRule_tenantId_leaveTypeId_idx" ON "LeavePolicyRule"("tenantId", "leaveTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "LeavePolicyRule_tenantId_leavePolicyId_leaveTypeId_key" ON "LeavePolicyRule"("tenantId", "leavePolicyId", "leaveTypeId");

-- CreateIndex
CREATE INDEX "ModuleView_tenantId_moduleKey_idx" ON "ModuleView"("tenantId", "moduleKey");

-- CreateIndex
CREATE INDEX "ModuleView_tenantId_moduleKey_isActive_idx" ON "ModuleView"("tenantId", "moduleKey", "isActive");

-- CreateIndex
CREATE INDEX "ModuleView_tenantId_moduleKey_isDefault_idx" ON "ModuleView"("tenantId", "moduleKey", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleView_tenantId_moduleKey_slug_key" ON "ModuleView"("tenantId", "moduleKey", "slug");

-- RenameForeignKey
ALTER TABLE "EmployeeCompensationComponent" RENAME CONSTRAINT "EmployeeCompensationComponent_compensationHistoryId_tenantId_fk" TO "EmployeeCompensationComponent_compensationHistoryId_tenant_fkey";

-- AddForeignKey
ALTER TABLE "LeavePolicyRule" ADD CONSTRAINT "LeavePolicyRule_leavePolicyId_fkey" FOREIGN KEY ("leavePolicyId") REFERENCES "LeavePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeavePolicyRule" ADD CONSTRAINT "LeavePolicyRule_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeavePolicyRule" ADD CONSTRAINT "LeavePolicyRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "EmployeeCompensationComponent_compensationHistoryId_payComponen" RENAME TO "EmployeeCompensationComponent_compensationHistoryId_payComp_key";

-- RenameIndex
ALTER INDEX "EmployeeCompensationComponent_tenantId_compensationHistoryId_id" RENAME TO "EmployeeCompensationComponent_tenantId_compensationHistoryI_idx";

-- RenameIndex
ALTER INDEX "EmployeeCompensationHistory_tenantId_employeeId_effectiveFrom_i" RENAME TO "EmployeeCompensationHistory_tenantId_employeeId_effectiveFr_idx";

-- RenameIndex
ALTER INDEX "ProcessingCycle_tenantId_businessUnitId_startDate_endDate_cycle" RENAME TO "ProcessingCycle_tenantId_businessUnitId_startDate_endDate_c_key";
