ALTER TYPE "TimesheetEntryType" ADD VALUE IF NOT EXISTS 'INTERNAL';
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'CLOSED';

CREATE TYPE "ProjectBillingType" AS ENUM ('NON_BILLABLE', 'FIXED_PRICE', 'TIME_AND_MATERIAL', 'RETAINER');
CREATE TYPE "ProjectAllocationType" AS ENUM ('PERCENTAGE', 'HOURS');
CREATE TYPE "ProjectResourceStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PROSPECT', 'ARCHIVED');

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferencesJson" JSONB;

CREATE TABLE "Customer" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "industry" TEXT,
  "contactName" TEXT,
  "contactEmail" TEXT,
  "contactPhone" TEXT,
  "billingEmail" TEXT,
  "websiteUrl" TEXT,
  "address" TEXT,
  "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectRole" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "ProjectRole_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT,
  ADD COLUMN IF NOT EXISTS "customerId" TEXT,
  ADD COLUMN IF NOT EXISTS "projectManagerEmployeeId" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryManagerEmployeeId" TEXT,
  ADD COLUMN IF NOT EXISTS "timezone" TEXT,
  ADD COLUMN IF NOT EXISTS "currencyCode" TEXT,
  ADD COLUMN IF NOT EXISTS "holidayCalendarId" TEXT,
  ADD COLUMN IF NOT EXISTS "workScheduleId" TEXT,
  ADD COLUMN IF NOT EXISTS "billingType" "ProjectBillingType" NOT NULL DEFAULT 'NON_BILLABLE',
  ADD COLUMN IF NOT EXISTS "budgetHours" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "budgetAmount" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "budgetCurrencyCode" TEXT,
  ADD COLUMN IF NOT EXISTS "allowTimesheets" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "ProjectAssignment"
  ADD COLUMN IF NOT EXISTS "projectRoleId" TEXT,
  ADD COLUMN IF NOT EXISTS "allocationHours" DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS "allocationType" "ProjectAllocationType" NOT NULL DEFAULT 'PERCENTAGE',
  ADD COLUMN IF NOT EXISTS "costRateAmount" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "billingRateAmount" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "currencyCode" TEXT,
  ADD COLUMN IF NOT EXISTS "approvalManagerEmployeeId" TEXT,
  ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "status" "ProjectResourceStatus" NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "TimesheetEntry"
  ADD COLUMN IF NOT EXISTS "activityCode" TEXT,
  ADD COLUMN IF NOT EXISTS "billableFlag" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "timezone" TEXT,
  ADD COLUMN IF NOT EXISTS "currencyCode" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Customer_tenantId_code_key" ON "Customer"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "Customer_tenantId_idx" ON "Customer"("tenantId");
CREATE INDEX IF NOT EXISTS "Customer_tenantId_status_idx" ON "Customer"("tenantId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "ProjectRole_tenantId_code_key" ON "ProjectRole"("tenantId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectRole_tenantId_name_key" ON "ProjectRole"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "ProjectRole_tenantId_isActive_idx" ON "ProjectRole"("tenantId", "isActive");

CREATE UNIQUE INDEX IF NOT EXISTS "Project_tenantId_code_key" ON "Project"("tenantId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "Project_tenantId_customerId_code_key" ON "Project"("tenantId", "customerId", "code");
CREATE INDEX IF NOT EXISTS "Project_tenantId_organizationId_idx" ON "Project"("tenantId", "organizationId");
CREATE INDEX IF NOT EXISTS "Project_tenantId_customerId_idx" ON "Project"("tenantId", "customerId");
CREATE INDEX IF NOT EXISTS "Project_tenantId_timezone_idx" ON "Project"("tenantId", "timezone");
CREATE INDEX IF NOT EXISTS "Project_tenantId_currencyCode_idx" ON "Project"("tenantId", "currencyCode");

CREATE INDEX IF NOT EXISTS "ProjectAssignment_tenantId_status_idx" ON "ProjectAssignment"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "ProjectAssignment_tenantId_startDate_endDate_idx" ON "ProjectAssignment"("tenantId", "startDate", "endDate");
CREATE INDEX IF NOT EXISTS "TimesheetEntry_tenantId_projectId_date_idx" ON "TimesheetEntry"("tenantId", "projectId", "date");

ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectRole"
  ADD CONSTRAINT "ProjectRole_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_organizationId_tenantId_fkey" FOREIGN KEY ("organizationId", "tenantId") REFERENCES "Organization"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Project_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectAssignment"
  ADD CONSTRAINT "ProjectAssignment_projectRoleId_fkey" FOREIGN KEY ("projectRoleId") REFERENCES "ProjectRole"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectAssignment_approvalManagerEmployeeId_fkey" FOREIGN KEY ("approvalManagerEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
