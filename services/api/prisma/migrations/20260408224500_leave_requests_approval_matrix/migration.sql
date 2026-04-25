-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'Cancelled');

-- CreateEnum
CREATE TYPE "LeaveApprovalStepStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED', 'Cancelled');

-- CreateEnum
CREATE TYPE "ApprovalActorType" AS ENUM ('MANAGER', 'HR');

-- CreateTable
CREATE TABLE "ApprovalMatrix" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leaveTypeId" TEXT,
    "leavePolicyId" TEXT,
    "sequence" INTEGER NOT NULL,
    "approverType" "ApprovalActorType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "ApprovalMatrix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "totalDays" DECIMAL(8,2) NOT NULL,
    "reason" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "attachmentRequired" BOOLEAN NOT NULL DEFAULT false,
    "attachmentReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveApprovalStep" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leaveRequestId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "approverType" "ApprovalActorType" NOT NULL,
    "approverUserId" TEXT,
    "status" "LeaveApprovalStepStatus" NOT NULL DEFAULT 'PENDING',
    "actedAt" TIMESTAMP(3),
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "LeaveApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApprovalMatrix_tenantId_idx" ON "ApprovalMatrix"("tenantId");
CREATE INDEX "ApprovalMatrix_tenantId_isActive_idx" ON "ApprovalMatrix"("tenantId", "isActive");
CREATE INDEX "ApprovalMatrix_tenantId_leaveTypeId_isActive_idx" ON "ApprovalMatrix"("tenantId", "leaveTypeId", "isActive");
CREATE INDEX "ApprovalMatrix_tenantId_leavePolicyId_isActive_idx" ON "ApprovalMatrix"("tenantId", "leavePolicyId", "isActive");

-- CreateIndex
CREATE INDEX "LeaveRequest_tenantId_idx" ON "LeaveRequest"("tenantId");
CREATE INDEX "LeaveRequest_tenantId_employeeId_idx" ON "LeaveRequest"("tenantId", "employeeId");
CREATE INDEX "LeaveRequest_tenantId_status_idx" ON "LeaveRequest"("tenantId", "status");
CREATE INDEX "LeaveRequest_tenantId_startDate_endDate_idx" ON "LeaveRequest"("tenantId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveApprovalStep_leaveRequestId_stepOrder_key" ON "LeaveApprovalStep"("leaveRequestId", "stepOrder");
CREATE INDEX "LeaveApprovalStep_tenantId_idx" ON "LeaveApprovalStep"("tenantId");
CREATE INDEX "LeaveApprovalStep_tenantId_status_idx" ON "LeaveApprovalStep"("tenantId", "status");
CREATE INDEX "LeaveApprovalStep_tenantId_approverUserId_status_idx" ON "LeaveApprovalStep"("tenantId", "approverUserId", "status");

-- AddForeignKey
ALTER TABLE "ApprovalMatrix"
ADD CONSTRAINT "ApprovalMatrix_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApprovalMatrix"
ADD CONSTRAINT "ApprovalMatrix_leaveTypeId_fkey"
FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApprovalMatrix"
ADD CONSTRAINT "ApprovalMatrix_leavePolicyId_fkey"
FOREIGN KEY ("leavePolicyId") REFERENCES "LeavePolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LeaveRequest"
ADD CONSTRAINT "LeaveRequest_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaveRequest"
ADD CONSTRAINT "LeaveRequest_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaveRequest"
ADD CONSTRAINT "LeaveRequest_leaveTypeId_fkey"
FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LeaveApprovalStep"
ADD CONSTRAINT "LeaveApprovalStep_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaveApprovalStep"
ADD CONSTRAINT "LeaveApprovalStep_leaveRequestId_fkey"
FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaveApprovalStep"
ADD CONSTRAINT "LeaveApprovalStep_approverUserId_fkey"
FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
