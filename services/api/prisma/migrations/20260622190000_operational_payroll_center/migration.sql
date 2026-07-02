ALTER TYPE "PayslipEventType" ADD VALUE IF NOT EXISTS 'DELIVERY_SENT';
ALTER TYPE "PayslipEventType" ADD VALUE IF NOT EXISTS 'DELIVERY_FAILED';

CREATE TYPE "PayslipDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
CREATE TYPE "PayrollBankExportFormat" AS ENUM ('CSV', 'EXCEL', 'GENERIC_BANK_TRANSFER');
CREATE TYPE "PayrollBankExportStatus" AS ENUM ('GENERATED', 'DISBURSED');

ALTER TABLE "PayrollRun"
  ADD COLUMN "finalizedAt" TIMESTAMP(3),
  ADD COLUMN "finalizedBy" TEXT,
  ADD COLUMN "disbursedAt" TIMESTAMP(3),
  ADD COLUMN "disbursedBy" TEXT;

ALTER TABLE "Payslip"
  ADD COLUMN "deliveryStatus" "PayslipDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastDeliveryAttemptAt" TIMESTAMP(3),
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "deliveryError" TEXT;

CREATE TABLE "PayrollBankExport" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "payrollRunId" TEXT NOT NULL,
  "format" "PayrollBankExportFormat" NOT NULL,
  "providerKey" TEXT NOT NULL,
  "status" "PayrollBankExportStatus" NOT NULL DEFAULT 'GENERATED',
  "fileName" TEXT NOT NULL,
  "recordCount" INTEGER NOT NULL,
  "totalAmount" DECIMAL(14,2) NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "metadata" JSONB,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "generatedBy" TEXT NOT NULL,
  "disbursedAt" TIMESTAMP(3),
  "disbursedBy" TEXT,
  CONSTRAINT "PayrollBankExport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PayrollBankExport_tenantId_payrollRunId_idx" ON "PayrollBankExport"("tenantId", "payrollRunId");
CREATE INDEX "PayrollBankExport_tenantId_status_idx" ON "PayrollBankExport"("tenantId", "status");

ALTER TABLE "PayrollBankExport" ADD CONSTRAINT "PayrollBankExport_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollBankExport" ADD CONSTRAINT "PayrollBankExport_payrollRunId_fkey"
  FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
