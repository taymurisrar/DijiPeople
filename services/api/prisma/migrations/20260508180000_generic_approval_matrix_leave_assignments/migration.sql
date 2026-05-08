-- Approval matrix becomes module-aware and reusable while preserving existing leave rows.
ALTER TYPE "ApprovalActorType" ADD VALUE IF NOT EXISTS 'LINE_MANAGER';
ALTER TYPE "ApprovalActorType" ADD VALUE IF NOT EXISTS 'ROLE';
ALTER TYPE "ApprovalActorType" ADD VALUE IF NOT EXISTS 'USER';
ALTER TYPE "ApprovalActorType" ADD VALUE IF NOT EXISTS 'DEPARTMENT_HEAD';
ALTER TYPE "ApprovalActorType" ADD VALUE IF NOT EXISTS 'BUSINESS_UNIT_HEAD';
ALTER TYPE "ApprovalActorType" ADD VALUE IF NOT EXISTS 'POLICY_OWNER';
ALTER TYPE "ApprovalActorType" ADD VALUE IF NOT EXISTS 'REQUEST_OWNER_MANAGER';

CREATE TYPE "ApprovalMode" AS ENUM ('ANY_ONE', 'ALL');
CREATE TYPE "ApprovalModuleKey" AS ENUM (
  'LEAVE_REQUEST',
  'TIMESHEET',
  'CLAIM_REQUEST',
  'BUSINESS_TRIP',
  'RESOURCE_REQUEST',
  'PAYROLL_RUN'
);
CREATE TYPE "ApprovalScopeType" AS ENUM (
  'TENANT',
  'ORGANIZATION',
  'BUSINESS_UNIT',
  'DEPARTMENT',
  'EMPLOYEE_LEVEL',
  'EMPLOYEE'
);

ALTER TABLE "ApprovalMatrix"
  ADD COLUMN "moduleKey" "ApprovalModuleKey" NOT NULL DEFAULT 'LEAVE_REQUEST',
  ADD COLUMN "approverRoleId" TEXT,
  ADD COLUMN "approverUserId" TEXT,
  ADD COLUMN "approvalMode" "ApprovalMode" NOT NULL DEFAULT 'ANY_ONE',
  ADD COLUMN "scopeType" "ApprovalScopeType",
  ADD COLUMN "scopeId" TEXT;

CREATE INDEX "ApprovalMatrix_tenantId_moduleKey_isActive_idx"
  ON "ApprovalMatrix"("tenantId", "moduleKey", "isActive");
CREATE INDEX "ApprovalMatrix_tenantId_scopeType_scopeId_isActive_idx"
  ON "ApprovalMatrix"("tenantId", "scopeType", "scopeId", "isActive");

ALTER TABLE "ApprovalMatrix"
  ADD CONSTRAINT "ApprovalMatrix_approverRoleId_fkey"
  FOREIGN KEY ("approverRoleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApprovalMatrix"
  ADD CONSTRAINT "ApprovalMatrix_approverUserId_fkey"
  FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "LeavePolicyAssignment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "leavePolicyId" TEXT NOT NULL,
  "scopeType" "ApprovalScopeType" NOT NULL,
  "scopeId" TEXT,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "priority" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "LeavePolicyAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeavePolicyAssignment_tenantId_idx" ON "LeavePolicyAssignment"("tenantId");
CREATE INDEX "LeavePolicyAssignment_tenantId_isActive_idx" ON "LeavePolicyAssignment"("tenantId", "isActive");
CREATE INDEX "LeavePolicyAssignment_tenantId_leavePolicyId_idx" ON "LeavePolicyAssignment"("tenantId", "leavePolicyId");
CREATE INDEX "LeavePolicyAssignment_tenantId_scopeType_scopeId_isActive_idx"
  ON "LeavePolicyAssignment"("tenantId", "scopeType", "scopeId", "isActive");

ALTER TABLE "LeavePolicyAssignment"
  ADD CONSTRAINT "LeavePolicyAssignment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeavePolicyAssignment"
  ADD CONSTRAINT "LeavePolicyAssignment_leavePolicyId_fkey"
  FOREIGN KEY ("leavePolicyId") REFERENCES "LeavePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaveApprovalStep"
  ADD COLUMN "approverRoleId" TEXT,
  ADD COLUMN "approvalMode" "ApprovalMode" NOT NULL DEFAULT 'ANY_ONE',
  ADD COLUMN "approvalGroupKey" TEXT,
  ADD COLUMN "resolvedApproverType" "ApprovalActorType";

DROP INDEX IF EXISTS "LeaveApprovalStep_leaveRequestId_stepOrder_key";
CREATE INDEX "LeaveApprovalStep_tenantId_approverRoleId_status_idx"
  ON "LeaveApprovalStep"("tenantId", "approverRoleId", "status");
CREATE INDEX "LeaveApprovalStep_leaveRequestId_stepOrder_idx"
  ON "LeaveApprovalStep"("leaveRequestId", "stepOrder");
CREATE INDEX "LeaveApprovalStep_leaveRequestId_approvalGroupKey_idx"
  ON "LeaveApprovalStep"("leaveRequestId", "approvalGroupKey");

ALTER TABLE "LeaveApprovalStep"
  ADD CONSTRAINT "LeaveApprovalStep_approverRoleId_fkey"
  FOREIGN KEY ("approverRoleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
