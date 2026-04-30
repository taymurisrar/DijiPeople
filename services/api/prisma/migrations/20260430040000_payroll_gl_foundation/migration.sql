-- CreateEnum
CREATE TYPE "PayrollGlAccountType" AS ENUM ('ASSET', 'LIABILITY', 'EXPENSE', 'EQUITY', 'REVENUE');

-- CreateEnum
CREATE TYPE "PayrollJournalEntryStatus" AS ENUM ('DRAFT', 'GENERATED', 'EXPORTED', 'VOIDED');

-- AlterTable
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_id_tenantId_key" UNIQUE ("id", "tenantId");

-- CreateTable
CREATE TABLE "PayrollGlAccount" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "accountType" "PayrollGlAccountType" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PayrollGlAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPostingRule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "sourceCategory" "PayrollRunLineItemCategory" NOT NULL,
  "payComponentId" TEXT,
  "taxRuleId" TEXT,
  "debitAccountId" TEXT,
  "creditAccountId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PayrollPostingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollJournalEntry" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "payrollRunId" TEXT NOT NULL,
  "status" "PayrollJournalEntryStatus" NOT NULL DEFAULT 'DRAFT',
  "journalNumber" TEXT,
  "generatedAt" TIMESTAMP(3),
  "exportedAt" TIMESTAMP(3),
  "voidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PayrollJournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollJournalEntryLine" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "journalEntryId" TEXT NOT NULL,
  "payrollRunLineItemId" TEXT,
  "accountId" TEXT NOT NULL,
  "debitAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "creditAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "description" TEXT,
  "employeeId" TEXT,
  "payComponentId" TEXT,
  "taxRuleId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PayrollJournalEntryLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollGlAccount_id_tenantId_key" ON "PayrollGlAccount"("id", "tenantId");
CREATE UNIQUE INDEX "PayrollGlAccount_tenantId_code_key" ON "PayrollGlAccount"("tenantId", "code");
CREATE INDEX "PayrollGlAccount_tenantId_accountType_idx" ON "PayrollGlAccount"("tenantId", "accountType");
CREATE INDEX "PayrollGlAccount_tenantId_isActive_idx" ON "PayrollGlAccount"("tenantId", "isActive");

CREATE UNIQUE INDEX "PayrollPostingRule_id_tenantId_key" ON "PayrollPostingRule"("id", "tenantId");
CREATE INDEX "PayrollPostingRule_tenantId_sourceCategory_idx" ON "PayrollPostingRule"("tenantId", "sourceCategory");
CREATE INDEX "PayrollPostingRule_tenantId_payComponentId_idx" ON "PayrollPostingRule"("tenantId", "payComponentId");
CREATE INDEX "PayrollPostingRule_tenantId_taxRuleId_idx" ON "PayrollPostingRule"("tenantId", "taxRuleId");
CREATE INDEX "PayrollPostingRule_tenantId_isActive_idx" ON "PayrollPostingRule"("tenantId", "isActive");

CREATE UNIQUE INDEX "PayrollJournalEntry_id_tenantId_key" ON "PayrollJournalEntry"("id", "tenantId");
CREATE UNIQUE INDEX "PayrollJournalEntry_tenantId_payrollRunId_key" ON "PayrollJournalEntry"("tenantId", "payrollRunId");
CREATE UNIQUE INDEX "PayrollJournalEntry_payrollRunId_tenantId_key" ON "PayrollJournalEntry"("payrollRunId", "tenantId");
CREATE INDEX "PayrollJournalEntry_tenantId_status_idx" ON "PayrollJournalEntry"("tenantId", "status");

CREATE INDEX "PayrollJournalEntryLine_tenantId_journalEntryId_idx" ON "PayrollJournalEntryLine"("tenantId", "journalEntryId");
CREATE INDEX "PayrollJournalEntryLine_tenantId_accountId_idx" ON "PayrollJournalEntryLine"("tenantId", "accountId");
CREATE INDEX "PayrollJournalEntryLine_tenantId_employeeId_idx" ON "PayrollJournalEntryLine"("tenantId", "employeeId");

-- AddForeignKey
ALTER TABLE "PayrollGlAccount" ADD CONSTRAINT "PayrollGlAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PayrollPostingRule" ADD CONSTRAINT "PayrollPostingRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollPostingRule" ADD CONSTRAINT "PayrollPostingRule_payComponentId_tenantId_fkey" FOREIGN KEY ("payComponentId", "tenantId") REFERENCES "PayComponent"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayrollPostingRule" ADD CONSTRAINT "PayrollPostingRule_taxRuleId_tenantId_fkey" FOREIGN KEY ("taxRuleId", "tenantId") REFERENCES "TaxRule"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayrollPostingRule" ADD CONSTRAINT "PayrollPostingRule_debitAccountId_tenantId_fkey" FOREIGN KEY ("debitAccountId", "tenantId") REFERENCES "PayrollGlAccount"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayrollPostingRule" ADD CONSTRAINT "PayrollPostingRule_creditAccountId_tenantId_fkey" FOREIGN KEY ("creditAccountId", "tenantId") REFERENCES "PayrollGlAccount"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PayrollJournalEntry" ADD CONSTRAINT "PayrollJournalEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollJournalEntry" ADD CONSTRAINT "PayrollJournalEntry_payrollRunId_tenantId_fkey" FOREIGN KEY ("payrollRunId", "tenantId") REFERENCES "PayrollRun"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PayrollJournalEntryLine" ADD CONSTRAINT "PayrollJournalEntryLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollJournalEntryLine" ADD CONSTRAINT "PayrollJournalEntryLine_journalEntryId_tenantId_fkey" FOREIGN KEY ("journalEntryId", "tenantId") REFERENCES "PayrollJournalEntry"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollJournalEntryLine" ADD CONSTRAINT "PayrollJournalEntryLine_payrollRunLineItemId_fkey" FOREIGN KEY ("payrollRunLineItemId") REFERENCES "PayrollRunLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollJournalEntryLine" ADD CONSTRAINT "PayrollJournalEntryLine_accountId_tenantId_fkey" FOREIGN KEY ("accountId", "tenantId") REFERENCES "PayrollGlAccount"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayrollJournalEntryLine" ADD CONSTRAINT "PayrollJournalEntryLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollJournalEntryLine" ADD CONSTRAINT "PayrollJournalEntryLine_payComponentId_tenantId_fkey" FOREIGN KEY ("payComponentId", "tenantId") REFERENCES "PayComponent"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayrollJournalEntryLine" ADD CONSTRAINT "PayrollJournalEntryLine_taxRuleId_tenantId_fkey" FOREIGN KEY ("taxRuleId", "tenantId") REFERENCES "TaxRule"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
