-- CreateEnum
CREATE TYPE "BusinessTripStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'INCLUDED_IN_PAYROLL', 'PAID');

-- CreateEnum
CREATE TYPE "BusinessTripApprovalStatus" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TravelAllowanceType" AS ENUM ('DAILY_ALLOWANCE', 'MEAL_ALLOWANCE', 'TRANSPORT_ALLOWANCE', 'HOTEL_ALLOWANCE', 'INCIDENTAL_ALLOWANCE');

-- CreateEnum
CREATE TYPE "TravelAllowanceCalculationBasis" AS ENUM ('PER_DAY', 'PER_NIGHT', 'PER_TRIP');

-- CreateTable
CREATE TABLE "BusinessTrip" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "requestedByUserId" TEXT,
    "title" TEXT NOT NULL,
    "purpose" TEXT,
    "originCountry" TEXT,
    "originCity" TEXT,
    "destinationCountry" TEXT NOT NULL,
    "destinationCity" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "BusinessTripStatus" NOT NULL DEFAULT 'DRAFT',
    "currencyCode" TEXT NOT NULL,
    "estimatedAllowance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "approvedAllowance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "includedInPayrollAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BusinessTrip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessTripApproval" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessTripId" TEXT NOT NULL,
    "status" "BusinessTripApprovalStatus" NOT NULL,
    "actorUserId" TEXT,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BusinessTripApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelAllowancePolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "employeeLevelId" TEXT,
    "countryCode" TEXT,
    "city" TEXT,
    "currencyCode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TravelAllowancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelAllowanceRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "allowanceType" "TravelAllowanceType" NOT NULL,
    "calculationBasis" "TravelAllowanceCalculationBasis" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TravelAllowanceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessTripAllowance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessTripId" TEXT NOT NULL,
    "travelAllowanceRuleId" TEXT,
    "allowanceType" "TravelAllowanceType" NOT NULL,
    "calculationBasis" "TravelAllowanceCalculationBasis" NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "rate" DECIMAL(12,4) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "payrollRunEmployeeId" TEXT,
    "payrollIncludedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BusinessTripAllowance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessTrip_tenantId_employeeId_idx" ON "BusinessTrip"("tenantId", "employeeId");
CREATE INDEX "BusinessTrip_tenantId_status_idx" ON "BusinessTrip"("tenantId", "status");
CREATE INDEX "BusinessTrip_tenantId_startDate_endDate_idx" ON "BusinessTrip"("tenantId", "startDate", "endDate");
CREATE INDEX "BusinessTripApproval_tenantId_businessTripId_idx" ON "BusinessTripApproval"("tenantId", "businessTripId");
CREATE UNIQUE INDEX "TravelAllowancePolicy_tenantId_code_key" ON "TravelAllowancePolicy"("tenantId", "code");
CREATE UNIQUE INDEX "TravelAllowancePolicy_id_tenantId_key" ON "TravelAllowancePolicy"("id", "tenantId");
CREATE INDEX "TravelAllowancePolicy_tenantId_employeeLevelId_idx" ON "TravelAllowancePolicy"("tenantId", "employeeLevelId");
CREATE INDEX "TravelAllowancePolicy_tenantId_countryCode_city_idx" ON "TravelAllowancePolicy"("tenantId", "countryCode", "city");
CREATE INDEX "TravelAllowancePolicy_tenantId_isActive_idx" ON "TravelAllowancePolicy"("tenantId", "isActive");
CREATE UNIQUE INDEX "TravelAllowanceRule_id_tenantId_key" ON "TravelAllowanceRule"("id", "tenantId");
CREATE INDEX "TravelAllowanceRule_tenantId_policyId_idx" ON "TravelAllowanceRule"("tenantId", "policyId");
CREATE INDEX "TravelAllowanceRule_tenantId_allowanceType_idx" ON "TravelAllowanceRule"("tenantId", "allowanceType");
CREATE INDEX "BusinessTripAllowance_tenantId_businessTripId_idx" ON "BusinessTripAllowance"("tenantId", "businessTripId");
CREATE INDEX "BusinessTripAllowance_tenantId_payrollRunEmployeeId_idx" ON "BusinessTripAllowance"("tenantId", "payrollRunEmployeeId");

-- AddForeignKey
ALTER TABLE "BusinessTrip" ADD CONSTRAINT "BusinessTrip_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessTrip" ADD CONSTRAINT "BusinessTrip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessTripApproval" ADD CONSTRAINT "BusinessTripApproval_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessTripApproval" ADD CONSTRAINT "BusinessTripApproval_businessTripId_fkey" FOREIGN KEY ("businessTripId") REFERENCES "BusinessTrip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TravelAllowancePolicy" ADD CONSTRAINT "TravelAllowancePolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TravelAllowancePolicy" ADD CONSTRAINT "TravelAllowancePolicy_employeeLevelId_tenantId_fkey" FOREIGN KEY ("employeeLevelId", "tenantId") REFERENCES "EmployeeLevel"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TravelAllowanceRule" ADD CONSTRAINT "TravelAllowanceRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TravelAllowanceRule" ADD CONSTRAINT "TravelAllowanceRule_policyId_tenantId_fkey" FOREIGN KEY ("policyId", "tenantId") REFERENCES "TravelAllowancePolicy"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessTripAllowance" ADD CONSTRAINT "BusinessTripAllowance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessTripAllowance" ADD CONSTRAINT "BusinessTripAllowance_businessTripId_fkey" FOREIGN KEY ("businessTripId") REFERENCES "BusinessTrip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessTripAllowance" ADD CONSTRAINT "BusinessTripAllowance_travelAllowanceRuleId_tenantId_fkey" FOREIGN KEY ("travelAllowanceRuleId", "tenantId") REFERENCES "TravelAllowanceRule"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BusinessTripAllowance" ADD CONSTRAINT "BusinessTripAllowance_payrollRunEmployeeId_fkey" FOREIGN KEY ("payrollRunEmployeeId") REFERENCES "PayrollRunEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
