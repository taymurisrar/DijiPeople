-- CreateEnum
CREATE TYPE "LeaveAccrualType" AS ENUM ('FIXED_ANNUAL', 'MONTHLY_ACCRUAL', 'NONE');

-- CreateTable
CREATE TABLE "LeaveType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "LeaveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeavePolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accrualType" "LeaveAccrualType" NOT NULL,
    "annualEntitlement" DECIMAL(8,2) NOT NULL,
    "carryForwardAllowed" BOOLEAN NOT NULL DEFAULT false,
    "carryForwardLimit" DECIMAL(8,2),
    "negativeBalanceAllowed" BOOLEAN NOT NULL DEFAULT false,
    "genderRestriction" "EmployeeGender",
    "probationRestriction" BOOLEAN,
    "requiresDocumentAfterDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "LeavePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeaveType_tenantId_name_key" ON "LeaveType"("tenantId", "name");
CREATE UNIQUE INDEX "LeaveType_tenantId_code_key" ON "LeaveType"("tenantId", "code");
CREATE INDEX "LeaveType_tenantId_idx" ON "LeaveType"("tenantId");
CREATE INDEX "LeaveType_tenantId_isActive_idx" ON "LeaveType"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "LeavePolicy_tenantId_name_key" ON "LeavePolicy"("tenantId", "name");
CREATE INDEX "LeavePolicy_tenantId_idx" ON "LeavePolicy"("tenantId");
CREATE INDEX "LeavePolicy_tenantId_isActive_idx" ON "LeavePolicy"("tenantId", "isActive");
CREATE INDEX "LeavePolicy_tenantId_accrualType_idx" ON "LeavePolicy"("tenantId", "accrualType");

-- AddForeignKey
ALTER TABLE "LeaveType"
ADD CONSTRAINT "LeaveType_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeavePolicy"
ADD CONSTRAINT "LeavePolicy_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
