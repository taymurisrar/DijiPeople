ALTER TYPE "DocumentEntityType" ADD VALUE IF NOT EXISTS 'PROJECT';

CREATE TYPE "ProjectType" AS ENUM (
  'INTERNAL',
  'CLIENT',
  'IMPLEMENTATION',
  'SUPPORT',
  'MAINTENANCE',
  'RESEARCH',
  'TRAINING',
  'OTHER'
);

ALTER TYPE "ProjectApprovalMode" ADD VALUE IF NOT EXISTS 'ACCOUNT_MANAGER';
ALTER TYPE "ProjectApprovalMode" ADD VALUE IF NOT EXISTS 'DELIVERY_MANAGER';
ALTER TYPE "ProjectApprovalMode" ADD VALUE IF NOT EXISTS 'CUSTOM_MANAGER';

ALTER TABLE "Project"
  ADD COLUMN "accountManagerEmployeeId" TEXT,
  ADD COLUMN "approvalManagerEmployeeId" TEXT,
  ADD COLUMN "projectType" "ProjectType" NOT NULL DEFAULT 'CLIENT',
  ADD COLUMN "requiredResourceCount" INTEGER,
  ADD COLUMN "requiredSkills" TEXT,
  ADD COLUMN "billableHours" DECIMAL(10, 2),
  ADD COLUMN "nonBillableHours" DECIMAL(10, 2),
  ADD COLUMN "billingRateAmount" DECIMAL(14, 2),
  ADD COLUMN "costBudgetAmount" DECIMAL(14, 2);

CREATE INDEX "Project_tenantId_projectManagerEmployeeId_idx" ON "Project"("tenantId", "projectManagerEmployeeId");
CREATE INDEX "Project_tenantId_accountManagerEmployeeId_idx" ON "Project"("tenantId", "accountManagerEmployeeId");
CREATE INDEX "Project_tenantId_deliveryManagerEmployeeId_idx" ON "Project"("tenantId", "deliveryManagerEmployeeId");
