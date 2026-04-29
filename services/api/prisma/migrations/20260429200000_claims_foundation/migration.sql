-- CreateEnum
CREATE TYPE "ClaimRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'MANAGER_APPROVED', 'PAYROLL_APPROVED', 'REJECTED', 'INCLUDED_IN_PAYROLL', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClaimApprovalStep" AS ENUM ('MANAGER', 'PAYROLL');

-- CreateEnum
CREATE TYPE "ClaimApprovalStatus" AS ENUM ('APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ClaimType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClaimType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimSubType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "claimTypeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "requiresReceipt" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClaimSubType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "submittedByUserId" TEXT,
    "status" "ClaimRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "submittedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "approvedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "managerApprovedAt" TIMESTAMP(3),
    "payrollApprovedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "includedInPayrollAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClaimRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimLineItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "claimRequestId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "claimTypeId" TEXT NOT NULL,
    "claimSubTypeId" TEXT,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "vendor" TEXT,
    "description" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "approvedAmount" DECIMAL(12,2),
    "currencyCode" TEXT NOT NULL,
    "receiptDocumentId" TEXT,
    "payrollRunEmployeeId" TEXT,
    "payrollIncludedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClaimLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimApproval" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "claimRequestId" TEXT NOT NULL,
    "step" "ClaimApprovalStep" NOT NULL,
    "status" "ClaimApprovalStatus" NOT NULL,
    "actorUserId" TEXT,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClaimApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClaimType_tenantId_code_key" ON "ClaimType"("tenantId", "code");
CREATE INDEX "ClaimType_tenantId_isActive_idx" ON "ClaimType"("tenantId", "isActive");
CREATE UNIQUE INDEX "ClaimSubType_claimTypeId_code_key" ON "ClaimSubType"("claimTypeId", "code");
CREATE INDEX "ClaimSubType_tenantId_claimTypeId_idx" ON "ClaimSubType"("tenantId", "claimTypeId");
CREATE INDEX "ClaimSubType_tenantId_isActive_idx" ON "ClaimSubType"("tenantId", "isActive");
CREATE INDEX "ClaimRequest_tenantId_employeeId_idx" ON "ClaimRequest"("tenantId", "employeeId");
CREATE INDEX "ClaimRequest_tenantId_status_idx" ON "ClaimRequest"("tenantId", "status");
CREATE INDEX "ClaimLineItem_tenantId_claimRequestId_idx" ON "ClaimLineItem"("tenantId", "claimRequestId");
CREATE INDEX "ClaimLineItem_tenantId_claimTypeId_idx" ON "ClaimLineItem"("tenantId", "claimTypeId");
CREATE INDEX "ClaimLineItem_tenantId_payrollRunEmployeeId_idx" ON "ClaimLineItem"("tenantId", "payrollRunEmployeeId");
CREATE INDEX "ClaimApproval_tenantId_claimRequestId_idx" ON "ClaimApproval"("tenantId", "claimRequestId");
CREATE INDEX "ClaimApproval_tenantId_step_idx" ON "ClaimApproval"("tenantId", "step");

-- AddForeignKey
ALTER TABLE "ClaimType" ADD CONSTRAINT "ClaimType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClaimSubType" ADD CONSTRAINT "ClaimSubType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClaimSubType" ADD CONSTRAINT "ClaimSubType_claimTypeId_fkey" FOREIGN KEY ("claimTypeId") REFERENCES "ClaimType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClaimRequest" ADD CONSTRAINT "ClaimRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClaimRequest" ADD CONSTRAINT "ClaimRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClaimLineItem" ADD CONSTRAINT "ClaimLineItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClaimLineItem" ADD CONSTRAINT "ClaimLineItem_claimRequestId_fkey" FOREIGN KEY ("claimRequestId") REFERENCES "ClaimRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClaimLineItem" ADD CONSTRAINT "ClaimLineItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClaimLineItem" ADD CONSTRAINT "ClaimLineItem_claimTypeId_fkey" FOREIGN KEY ("claimTypeId") REFERENCES "ClaimType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClaimLineItem" ADD CONSTRAINT "ClaimLineItem_claimSubTypeId_fkey" FOREIGN KEY ("claimSubTypeId") REFERENCES "ClaimSubType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClaimLineItem" ADD CONSTRAINT "ClaimLineItem_receiptDocumentId_fkey" FOREIGN KEY ("receiptDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClaimLineItem" ADD CONSTRAINT "ClaimLineItem_payrollRunEmployeeId_fkey" FOREIGN KEY ("payrollRunEmployeeId") REFERENCES "PayrollRunEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClaimApproval" ADD CONSTRAINT "ClaimApproval_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClaimApproval" ADD CONSTRAINT "ClaimApproval_claimRequestId_fkey" FOREIGN KEY ("claimRequestId") REFERENCES "ClaimRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
