-- CreateEnum
CREATE TYPE "PolicyType" AS ENUM ('LEAVE', 'CLAIM', 'TADA', 'PAYROLL', 'TAX');

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "PolicyAssignmentScopeType" AS ENUM ('TENANT', 'ORGANIZATION', 'BUSINESS_UNIT', 'DEPARTMENT', 'EMPLOYEE_LEVEL', 'EMPLOYEE');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "employeeLevelId" TEXT;

-- CreateTable
CREATE TABLE "EmployeeLevel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "policyType" "PolicyType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL,
    "status" "PolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "scopeType" "PolicyAssignmentScopeType" NOT NULL,
    "scopeId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicySnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "policyType" "PolicyType" NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshotData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeLevel_id_tenantId_key" ON "EmployeeLevel"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeLevel_tenantId_code_key" ON "EmployeeLevel"("tenantId", "code");

-- CreateIndex
CREATE INDEX "EmployeeLevel_tenantId_rank_idx" ON "EmployeeLevel"("tenantId", "rank");

-- CreateIndex
CREATE INDEX "EmployeeLevel_tenantId_isActive_idx" ON "EmployeeLevel"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_id_tenantId_key" ON "Policy"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_tenantId_policyType_name_version_key" ON "Policy"("tenantId", "policyType", "name", "version");

-- CreateIndex
CREATE INDEX "Policy_tenantId_policyType_effectiveFrom_idx" ON "Policy"("tenantId", "policyType", "effectiveFrom");

-- CreateIndex
CREATE INDEX "Policy_tenantId_policyType_status_isActive_idx" ON "Policy"("tenantId", "policyType", "status", "isActive");

-- CreateIndex
CREATE INDEX "PolicyAssignment_tenantId_scopeType_scopeId_idx" ON "PolicyAssignment"("tenantId", "scopeType", "scopeId");

-- CreateIndex
CREATE INDEX "PolicyAssignment_tenantId_policyId_idx" ON "PolicyAssignment"("tenantId", "policyId");

-- CreateIndex
CREATE INDEX "PolicyAssignment_tenantId_isActive_idx" ON "PolicyAssignment"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "PolicySnapshot_tenantId_policyType_createdAt_idx" ON "PolicySnapshot"("tenantId", "policyType", "createdAt");

-- CreateIndex
CREATE INDEX "PolicySnapshot_tenantId_policyId_idx" ON "PolicySnapshot"("tenantId", "policyId");

-- CreateIndex
CREATE INDEX "Employee_tenantId_employeeLevelId_idx" ON "Employee"("tenantId", "employeeLevelId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_employeeLevelId_tenantId_fkey" FOREIGN KEY ("employeeLevelId", "tenantId") REFERENCES "EmployeeLevel"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLevel" ADD CONSTRAINT "EmployeeLevel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAssignment" ADD CONSTRAINT "PolicyAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAssignment" ADD CONSTRAINT "PolicyAssignment_policyId_tenantId_fkey" FOREIGN KEY ("policyId", "tenantId") REFERENCES "Policy"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicySnapshot" ADD CONSTRAINT "PolicySnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicySnapshot" ADD CONSTRAINT "PolicySnapshot_policyId_tenantId_fkey" FOREIGN KEY ("policyId", "tenantId") REFERENCES "Policy"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
