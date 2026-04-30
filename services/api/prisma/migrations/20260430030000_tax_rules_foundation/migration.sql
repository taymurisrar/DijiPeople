-- CreateEnum
CREATE TYPE "TaxCalculationMethod" AS ENUM ('PERCENTAGE', 'FIXED', 'BRACKET');

-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('INCOME_TAX', 'SOCIAL_SECURITY', 'MEDICARE', 'OTHER');

-- CreateTable
CREATE TABLE "TaxRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "countryCode" TEXT,
    "regionCode" TEXT,
    "employeeLevelId" TEXT,
    "calculationMethod" "TaxCalculationMethod" NOT NULL,
    "taxType" "TaxType" NOT NULL,
    "employeeRate" DECIMAL(8,4),
    "employerRate" DECIMAL(8,4),
    "fixedEmployeeAmount" DECIMAL(12,2),
    "fixedEmployerAmount" DECIMAL(12,2),
    "currencyCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TaxRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRuleBracket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taxRuleId" TEXT NOT NULL,
    "minAmount" DECIMAL(12,2) NOT NULL,
    "maxAmount" DECIMAL(12,2),
    "employeeRate" DECIMAL(8,4),
    "employerRate" DECIMAL(8,4),
    "fixedEmployeeAmount" DECIMAL(12,2),
    "fixedEmployerAmount" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TaxRuleBracket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRulePayComponent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taxRuleId" TEXT NOT NULL,
    "payComponentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaxRulePayComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaxRule_id_tenantId_key" ON "TaxRule"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRule_tenantId_code_key" ON "TaxRule"("tenantId", "code");

-- CreateIndex
CREATE INDEX "TaxRule_tenantId_countryCode_regionCode_idx" ON "TaxRule"("tenantId", "countryCode", "regionCode");

-- CreateIndex
CREATE INDEX "TaxRule_tenantId_employeeLevelId_idx" ON "TaxRule"("tenantId", "employeeLevelId");

-- CreateIndex
CREATE INDEX "TaxRule_tenantId_isActive_idx" ON "TaxRule"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "TaxRuleBracket_tenantId_taxRuleId_idx" ON "TaxRuleBracket"("tenantId", "taxRuleId");

-- CreateIndex
CREATE INDEX "TaxRuleBracket_taxRuleId_minAmount_idx" ON "TaxRuleBracket"("taxRuleId", "minAmount");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRulePayComponent_taxRuleId_payComponentId_key" ON "TaxRulePayComponent"("taxRuleId", "payComponentId");

-- CreateIndex
CREATE INDEX "TaxRulePayComponent_tenantId_taxRuleId_idx" ON "TaxRulePayComponent"("tenantId", "taxRuleId");

-- CreateIndex
CREATE INDEX "TaxRulePayComponent_tenantId_payComponentId_idx" ON "TaxRulePayComponent"("tenantId", "payComponentId");

-- AddForeignKey
ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_employeeLevelId_tenantId_fkey" FOREIGN KEY ("employeeLevelId", "tenantId") REFERENCES "EmployeeLevel"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRuleBracket" ADD CONSTRAINT "TaxRuleBracket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRuleBracket" ADD CONSTRAINT "TaxRuleBracket_taxRuleId_tenantId_fkey" FOREIGN KEY ("taxRuleId", "tenantId") REFERENCES "TaxRule"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRulePayComponent" ADD CONSTRAINT "TaxRulePayComponent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRulePayComponent" ADD CONSTRAINT "TaxRulePayComponent_taxRuleId_tenantId_fkey" FOREIGN KEY ("taxRuleId", "tenantId") REFERENCES "TaxRule"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRulePayComponent" ADD CONSTRAINT "TaxRulePayComponent_payComponentId_tenantId_fkey" FOREIGN KEY ("payComponentId", "tenantId") REFERENCES "PayComponent"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
