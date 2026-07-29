ALTER TYPE "DocumentEntityType" ADD VALUE IF NOT EXISTS 'PAYSLIP';
ALTER TYPE "DocumentEntityType" ADD VALUE IF NOT EXISTS 'PAYROLL_BANK_EXPORT';

ALTER TYPE "PayrollBankExportStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED';
ALTER TYPE "PayrollBankExportStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_DISBURSED';
ALTER TYPE "PayrollBankExportStatus" ADD VALUE IF NOT EXISTS 'FAILED';
ALTER TYPE "PayrollBankExportStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

CREATE TYPE "PayrollPaymentLineStatus" AS ENUM ('GENERATED', 'SUBMITTED', 'DISBURSED', 'FAILED', 'CANCELLED');

ALTER TABLE "Payslip"
  ADD COLUMN "documentId" TEXT,
  ADD COLUMN "documentChecksum" TEXT,
  ADD COLUMN "documentVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "documentGeneratedAt" TIMESTAMP(3);

ALTER TABLE "PayrollBankExport"
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "submittedBy" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledBy" TEXT,
  ADD COLUMN "documentId" TEXT;

CREATE TABLE "PayrollPaymentLine" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "payrollBankExportId" TEXT NOT NULL,
  "payrollRunId" TEXT NOT NULL,
  "payrollRunEmployeeId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "employeeBankAccountId" TEXT NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "status" "PayrollPaymentLineStatus" NOT NULL DEFAULT 'GENERATED',
  "transactionReference" TEXT,
  "failureReason" TEXT,
  "disbursedAt" TIMESTAMP(3),
  "reconciledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PayrollPaymentLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PayrollPaymentLine_tenantId_payrollRunId_idx"
  ON "PayrollPaymentLine"("tenantId", "payrollRunId");
CREATE INDEX "PayrollPaymentLine_tenantId_payrollBankExportId_idx"
  ON "PayrollPaymentLine"("tenantId", "payrollBankExportId");
CREATE INDEX "PayrollPaymentLine_tenantId_payrollRunEmployeeId_idx"
  ON "PayrollPaymentLine"("tenantId", "payrollRunEmployeeId");
CREATE INDEX "PayrollPaymentLine_tenantId_employeeId_idx"
  ON "PayrollPaymentLine"("tenantId", "employeeId");
CREATE INDEX "PayrollPaymentLine_tenantId_status_idx"
  ON "PayrollPaymentLine"("tenantId", "status");

ALTER TABLE "Payslip"
  ADD CONSTRAINT "Payslip_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PayrollBankExport"
  ADD CONSTRAINT "PayrollBankExport_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PayrollPaymentLine"
  ADD CONSTRAINT "PayrollPaymentLine_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "PayrollPaymentLine_payrollBankExportId_fkey"
    FOREIGN KEY ("payrollBankExportId") REFERENCES "PayrollBankExport"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "PayrollPaymentLine_payrollRunId_tenantId_fkey"
    FOREIGN KEY ("payrollRunId", "tenantId") REFERENCES "PayrollRun"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "PayrollPaymentLine_payrollRunEmployeeId_fkey"
    FOREIGN KEY ("payrollRunEmployeeId") REFERENCES "PayrollRunEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "PayrollPaymentLine_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "PayrollPaymentLine_employeeBankAccountId_fkey"
    FOREIGN KEY ("employeeBankAccountId") REFERENCES "EmployeeBankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
