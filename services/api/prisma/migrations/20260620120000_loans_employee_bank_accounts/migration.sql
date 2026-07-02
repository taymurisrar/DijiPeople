ALTER TYPE "PayrollInputSnapshotSourceType" ADD VALUE IF NOT EXISTS 'LOAN';
ALTER TYPE "ApprovalModuleKey" ADD VALUE IF NOT EXISTS 'LOAN_REQUEST';

CREATE TYPE "LoanRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'REJECTED', 'ACTIVE', 'SETTLED', 'CANCELLED');
CREATE TYPE "LoanInstallmentStatus" AS ENUM ('SCHEDULED', 'INCLUDED_IN_PAYROLL', 'PAID', 'WAIVED');
CREATE TYPE "BankAccountVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

CREATE TABLE "Bank" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL,
  "swiftCode" TEXT,
  "routingCode" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Bank_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeBankAccount" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "bankId" TEXT,
  "accountTitle" TEXT NOT NULL,
  "accountNumber" TEXT,
  "iban" TEXT,
  "swiftOrRoutingCode" TEXT,
  "countryCode" TEXT NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "isPrimaryPayroll" BOOLEAN NOT NULL DEFAULT false,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "verificationStatus" "BankAccountVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "verifiedAt" TIMESTAMP(3),
  "verifiedByUserId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeBankAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoanPolicy" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "currencyCode" TEXT,
  "minimumAmount" DECIMAL(12,2),
  "maximumAmount" DECIMAL(12,2),
  "maximumInstallments" INTEGER,
  "interestRatePercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "allowEarlySettlement" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LoanPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoanRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "loanPolicyId" TEXT,
  "requestNumber" TEXT NOT NULL,
  "status" "LoanRequestStatus" NOT NULL DEFAULT 'DRAFT',
  "requestedAmount" DECIMAL(12,2) NOT NULL,
  "approvedAmount" DECIMAL(12,2),
  "currencyCode" TEXT NOT NULL,
  "installmentCount" INTEGER NOT NULL,
  "monthlyDeduction" DECIMAL(12,2),
  "outstandingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "requestedStartDate" TIMESTAMP(3) NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "activatedAt" TIMESTAMP(3),
  "settledAt" TIMESTAMP(3),
  "reason" TEXT,
  "rejectionReason" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LoanRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoanInstallment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "loanRequestId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "installmentNumber" INTEGER NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "principalAmount" DECIMAL(12,2) NOT NULL,
  "interestAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "status" "LoanInstallmentStatus" NOT NULL DEFAULT 'SCHEDULED',
  "payrollRunEmployeeId" TEXT,
  "includedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LoanInstallment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Bank_tenantId_code_key" ON "Bank"("tenantId", "code");
CREATE INDEX "Bank_tenantId_countryCode_isActive_idx" ON "Bank"("tenantId", "countryCode", "isActive");
CREATE INDEX "EmployeeBankAccount_tenantId_employeeId_isPrimaryPayroll_isActive_idx" ON "EmployeeBankAccount"("tenantId", "employeeId", "isPrimaryPayroll", "isActive");
CREATE INDEX "EmployeeBankAccount_tenantId_bankId_idx" ON "EmployeeBankAccount"("tenantId", "bankId");
CREATE INDEX "EmployeeBankAccount_tenantId_verificationStatus_idx" ON "EmployeeBankAccount"("tenantId", "verificationStatus");
CREATE UNIQUE INDEX "LoanPolicy_tenantId_code_key" ON "LoanPolicy"("tenantId", "code");
CREATE INDEX "LoanPolicy_tenantId_isActive_idx" ON "LoanPolicy"("tenantId", "isActive");
CREATE UNIQUE INDEX "LoanRequest_tenantId_requestNumber_key" ON "LoanRequest"("tenantId", "requestNumber");
CREATE INDEX "LoanRequest_tenantId_employeeId_status_idx" ON "LoanRequest"("tenantId", "employeeId", "status");
CREATE INDEX "LoanRequest_tenantId_loanPolicyId_idx" ON "LoanRequest"("tenantId", "loanPolicyId");
CREATE UNIQUE INDEX "LoanInstallment_loanRequestId_installmentNumber_key" ON "LoanInstallment"("loanRequestId", "installmentNumber");
CREATE INDEX "LoanInstallment_tenantId_employeeId_status_dueDate_idx" ON "LoanInstallment"("tenantId", "employeeId", "status", "dueDate");
CREATE INDEX "LoanInstallment_tenantId_payrollRunEmployeeId_idx" ON "LoanInstallment"("tenantId", "payrollRunEmployeeId");

ALTER TABLE "Bank" ADD CONSTRAINT "Bank_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeBankAccount" ADD CONSTRAINT "EmployeeBankAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeBankAccount" ADD CONSTRAINT "EmployeeBankAccount_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeBankAccount" ADD CONSTRAINT "EmployeeBankAccount_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LoanPolicy" ADD CONSTRAINT "LoanPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoanRequest" ADD CONSTRAINT "LoanRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoanRequest" ADD CONSTRAINT "LoanRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoanRequest" ADD CONSTRAINT "LoanRequest_loanPolicyId_fkey" FOREIGN KEY ("loanPolicyId") REFERENCES "LoanPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LoanInstallment" ADD CONSTRAINT "LoanInstallment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoanInstallment" ADD CONSTRAINT "LoanInstallment_loanRequestId_fkey" FOREIGN KEY ("loanRequestId") REFERENCES "LoanRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoanInstallment" ADD CONSTRAINT "LoanInstallment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoanInstallment" ADD CONSTRAINT "LoanInstallment_payrollRunEmployeeId_fkey" FOREIGN KEY ("payrollRunEmployeeId") REFERENCES "PayrollRunEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
