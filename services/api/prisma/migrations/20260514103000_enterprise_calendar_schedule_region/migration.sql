ALTER TYPE "TimesheetStatus" ADD VALUE IF NOT EXISTS 'LOCKED';

DO $$ BEGIN CREATE TYPE "ConfigurationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "HolidayType" AS ENUM ('PUBLIC', 'COMPANY', 'OPTIONAL', 'RELIGIOUS', 'REGIONAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "HalfDayPeriod" AS ENUM ('MORNING', 'AFTERNOON'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "WorkWeekModel" AS ENUM ('FIVE_DAY', 'FIVE_AND_HALF_DAY', 'SIX_DAY', 'ROTATING', 'FLEXIBLE', 'SHIFT_BASED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PayCycle" AS ENUM ('WEEKLY', 'BI_WEEKLY', 'SEMI_MONTHLY', 'MONTHLY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "WeekendPolicy" AS ENUM ('FRIDAY_SATURDAY', 'SATURDAY_SUNDAY', 'SUNDAY_ONLY', 'CUSTOM'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ExchangeRateSource" AS ENUM ('MANUAL', 'IMPORT', 'API', 'SYSTEM'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ProjectHealth" AS ENUM ('GREEN', 'AMBER', 'RED', 'UNKNOWN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ProjectRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ProjectPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ProjectDeliveryStatus" AS ENUM ('NOT_STARTED', 'ON_TRACK', 'AT_RISK', 'DELAYED', 'DELIVERED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ProjectBillingStatus" AS ENUM ('NOT_BILLABLE', 'NOT_STARTED', 'IN_PROGRESS', 'READY_TO_BILL', 'BILLED', 'ON_HOLD'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ProjectApprovalMode" AS ENUM ('MANAGER', 'PROJECT_MANAGER', 'BOTH', 'NONE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "HolidayCalendar"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT,
  ADD COLUMN IF NOT EXISTS "businessUnitId" TEXT,
  ADD COLUMN IF NOT EXISTS "projectId" TEXT,
  ADD COLUMN IF NOT EXISTS "code" TEXT,
  ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS "countryCode" TEXT,
  ADD COLUMN IF NOT EXISTS "regionCode" TEXT,
  ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "status" "ConfigurationStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "effectiveStartDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "effectiveEndDate" TIMESTAMP(3);

UPDATE "HolidayCalendar"
SET "code" = UPPER(REGEXP_REPLACE("name", '[^A-Za-z0-9]+', '_', 'g'))
WHERE "code" IS NULL;

ALTER TABLE "WorkSchedule"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT,
  ADD COLUMN IF NOT EXISTS "businessUnitId" TEXT,
  ADD COLUMN IF NOT EXISTS "projectId" TEXT,
  ADD COLUMN IF NOT EXISTS "code" TEXT,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS "workWeekModel" "WorkWeekModel" NOT NULL DEFAULT 'FIVE_DAY',
  ADD COLUMN IF NOT EXISTS "minHoursPerDay" DECIMAL(6,2),
  ADD COLUMN IF NOT EXISTS "standardHoursPerWeek" DECIMAL(6,2),
  ADD COLUMN IF NOT EXISTS "flexibleHours" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "shiftBased" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "status" "ConfigurationStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "effectiveStartDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "effectiveEndDate" TIMESTAMP(3);

UPDATE "WorkSchedule"
SET "code" = UPPER(REGEXP_REPLACE("name", '[^A-Za-z0-9]+', '_', 'g'))
WHERE "code" IS NULL;

CREATE TABLE IF NOT EXISTS "Holiday" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "holidayCalendarId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "holidayDate" TIMESTAMP(3) NOT NULL,
  "type" "HolidayType" NOT NULL DEFAULT 'PUBLIC',
  "isRecurring" BOOLEAN NOT NULL DEFAULT false,
  "recurrenceRule" TEXT,
  "isHalfDay" BOOLEAN NOT NULL DEFAULT false,
  "halfDayPeriod" "HalfDayPeriod",
  "appliesToAll" BOOLEAN NOT NULL DEFAULT true,
  "status" "ConfigurationStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Holiday" ("id", "tenantId", "holidayCalendarId", "name", "description", "holidayDate", "type", "isRecurring", "isHalfDay", "appliesToAll", "status", "createdAt", "updatedAt", "createdById", "updatedById")
SELECT "id" || '_legacy_holiday', "tenantId", "id", "name", "description", "date", CASE WHEN "isOptional" THEN 'OPTIONAL'::"HolidayType" ELSE 'PUBLIC'::"HolidayType" END, false, false, true, 'ACTIVE'::"ConfigurationStatus", "createdAt", "updatedAt", "createdById", "updatedById"
FROM "HolidayCalendar"
WHERE "date" IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS "HolidayCalendarAssignment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "holidayCalendarId" TEXT NOT NULL,
  "organizationId" TEXT,
  "businessUnitId" TEXT,
  "projectId" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "status" "ConfigurationStatus" NOT NULL DEFAULT 'ACTIVE',
  "effectiveStartDate" TIMESTAMP(3),
  "effectiveEndDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "HolidayCalendarAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkScheduleDay" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "workScheduleId" TEXT NOT NULL,
  "dayOfWeek" "WorkWeekday" NOT NULL,
  "isWorkingDay" BOOLEAN NOT NULL DEFAULT true,
  "startTime" TEXT,
  "endTime" TEXT,
  "breakMinutes" INTEGER NOT NULL DEFAULT 0,
  "expectedHours" DECIMAL(6,2),
  "rotationWeek" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkScheduleDay_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ShiftTemplate" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "workScheduleId" TEXT,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "breakMinutes" INTEGER NOT NULL DEFAULT 0,
  "expectedHours" DECIMAL(6,2) NOT NULL,
  "status" "ConfigurationStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "ShiftTemplate_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "consumedAmount" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "burnRate" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "plannedHours" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "actualHours" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "remainingHours" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "projectHealth" "ProjectHealth" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS "riskLevel" "ProjectRiskLevel" NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS "priority" "ProjectPriority" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS "deliveryStatus" "ProjectDeliveryStatus" NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN IF NOT EXISTS "billingStatus" "ProjectBillingStatus" NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN IF NOT EXISTS "requireApproval" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "approvalMode" "ProjectApprovalMode" NOT NULL DEFAULT 'MANAGER';

CREATE TABLE IF NOT EXISTS "PayrollRegion" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "organizationId" TEXT,
  "businessUnitId" TEXT,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "reportingCurrencyCode" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "payCycle" "PayCycle" NOT NULL DEFAULT 'MONTHLY',
  "taxRegion" TEXT,
  "overtimeRulesJson" JSONB,
  "weekendPolicy" "WeekendPolicy" NOT NULL DEFAULT 'SATURDAY_SUNDAY',
  "weekendDays" "WorkWeekday"[],
  "holidayCalendarId" TEXT,
  "workScheduleId" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "status" "ConfigurationStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "PayrollRegion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CurrencyConfiguration" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "organizationId" TEXT,
  "businessUnitId" TEXT,
  "transactionalCurrency" TEXT NOT NULL,
  "reportingCurrency" TEXT NOT NULL,
  "effectiveStartDate" TIMESTAMP(3) NOT NULL,
  "effectiveEndDate" TIMESTAMP(3),
  "status" "ConfigurationStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "CurrencyConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ExchangeRateSnapshot" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "fromCurrency" TEXT NOT NULL,
  "toCurrency" TEXT NOT NULL,
  "rate" DECIMAL(18,8) NOT NULL,
  "effectiveDate" TIMESTAMP(3) NOT NULL,
  "source" "ExchangeRateSource" NOT NULL DEFAULT 'MANUAL',
  "isManual" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,
  CONSTRAINT "ExchangeRateSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "HolidayCalendar_tenantId_code_key" ON "HolidayCalendar"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "HolidayCalendar_tenantId_organizationId_idx" ON "HolidayCalendar"("tenantId", "organizationId");
CREATE INDEX IF NOT EXISTS "HolidayCalendar_tenantId_businessUnitId_idx" ON "HolidayCalendar"("tenantId", "businessUnitId");
CREATE INDEX IF NOT EXISTS "HolidayCalendar_tenantId_projectId_idx" ON "HolidayCalendar"("tenantId", "projectId");
CREATE INDEX IF NOT EXISTS "HolidayCalendar_tenantId_status_idx" ON "HolidayCalendar"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "HolidayCalendar_tenantId_isDefault_status_idx" ON "HolidayCalendar"("tenantId", "isDefault", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "Holiday_holidayCalendarId_holidayDate_name_key" ON "Holiday"("holidayCalendarId", "holidayDate", "name");
CREATE INDEX IF NOT EXISTS "Holiday_tenantId_holidayDate_idx" ON "Holiday"("tenantId", "holidayDate");
CREATE INDEX IF NOT EXISTS "Holiday_tenantId_holidayCalendarId_idx" ON "Holiday"("tenantId", "holidayCalendarId");
CREATE INDEX IF NOT EXISTS "Holiday_tenantId_status_idx" ON "Holiday"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "HolidayCalendarAssignment_tenantId_holidayCalendarId_idx" ON "HolidayCalendarAssignment"("tenantId", "holidayCalendarId");
CREATE INDEX IF NOT EXISTS "HolidayCalendarAssignment_tenantId_organizationId_idx" ON "HolidayCalendarAssignment"("tenantId", "organizationId");
CREATE INDEX IF NOT EXISTS "HolidayCalendarAssignment_tenantId_businessUnitId_idx" ON "HolidayCalendarAssignment"("tenantId", "businessUnitId");
CREATE INDEX IF NOT EXISTS "HolidayCalendarAssignment_tenantId_projectId_idx" ON "HolidayCalendarAssignment"("tenantId", "projectId");
CREATE INDEX IF NOT EXISTS "HolidayCalendarAssignment_tenantId_status_idx" ON "HolidayCalendarAssignment"("tenantId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "WorkSchedule_tenantId_code_key" ON "WorkSchedule"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "WorkSchedule_tenantId_organizationId_idx" ON "WorkSchedule"("tenantId", "organizationId");
CREATE INDEX IF NOT EXISTS "WorkSchedule_tenantId_businessUnitId_idx" ON "WorkSchedule"("tenantId", "businessUnitId");
CREATE INDEX IF NOT EXISTS "WorkSchedule_tenantId_projectId_idx" ON "WorkSchedule"("tenantId", "projectId");
CREATE INDEX IF NOT EXISTS "WorkSchedule_tenantId_status_idx" ON "WorkSchedule"("tenantId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "WorkScheduleDay_workScheduleId_dayOfWeek_rotationWeek_key" ON "WorkScheduleDay"("workScheduleId", "dayOfWeek", "rotationWeek");
CREATE INDEX IF NOT EXISTS "WorkScheduleDay_tenantId_workScheduleId_idx" ON "WorkScheduleDay"("tenantId", "workScheduleId");
CREATE INDEX IF NOT EXISTS "WorkScheduleDay_tenantId_dayOfWeek_idx" ON "WorkScheduleDay"("tenantId", "dayOfWeek");
CREATE UNIQUE INDEX IF NOT EXISTS "ShiftTemplate_tenantId_code_key" ON "ShiftTemplate"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "ShiftTemplate_tenantId_workScheduleId_idx" ON "ShiftTemplate"("tenantId", "workScheduleId");
CREATE INDEX IF NOT EXISTS "ShiftTemplate_tenantId_status_idx" ON "ShiftTemplate"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "Project_tenantId_holidayCalendarId_idx" ON "Project"("tenantId", "holidayCalendarId");
CREATE INDEX IF NOT EXISTS "Project_tenantId_workScheduleId_idx" ON "Project"("tenantId", "workScheduleId");
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollRegion_tenantId_code_key" ON "PayrollRegion"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "PayrollRegion_tenantId_organizationId_idx" ON "PayrollRegion"("tenantId", "organizationId");
CREATE INDEX IF NOT EXISTS "PayrollRegion_tenantId_businessUnitId_idx" ON "PayrollRegion"("tenantId", "businessUnitId");
CREATE INDEX IF NOT EXISTS "PayrollRegion_tenantId_status_idx" ON "PayrollRegion"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "PayrollRegion_tenantId_isDefault_idx" ON "PayrollRegion"("tenantId", "isDefault");
CREATE INDEX IF NOT EXISTS "CurrencyConfiguration_tenantId_organizationId_idx" ON "CurrencyConfiguration"("tenantId", "organizationId");
CREATE INDEX IF NOT EXISTS "CurrencyConfiguration_tenantId_businessUnitId_idx" ON "CurrencyConfiguration"("tenantId", "businessUnitId");
CREATE INDEX IF NOT EXISTS "CurrencyConfiguration_tenantId_status_idx" ON "CurrencyConfiguration"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "CurrencyConfiguration_tenantId_effectiveStartDate_effectiveEndDate_idx" ON "CurrencyConfiguration"("tenantId", "effectiveStartDate", "effectiveEndDate");
CREATE UNIQUE INDEX IF NOT EXISTS "ExchangeRateSnapshot_tenantId_fromCurrency_toCurrency_effectiveDate_key" ON "ExchangeRateSnapshot"("tenantId", "fromCurrency", "toCurrency", "effectiveDate");
CREATE INDEX IF NOT EXISTS "ExchangeRateSnapshot_tenantId_fromCurrency_toCurrency_effectiveDate_idx" ON "ExchangeRateSnapshot"("tenantId", "fromCurrency", "toCurrency", "effectiveDate");
CREATE INDEX IF NOT EXISTS "ExchangeRateSnapshot_tenantId_source_idx" ON "ExchangeRateSnapshot"("tenantId", "source");

ALTER TABLE "HolidayCalendar" ADD CONSTRAINT "HolidayCalendar_organizationId_tenantId_fkey" FOREIGN KEY ("organizationId", "tenantId") REFERENCES "Organization"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HolidayCalendar" ADD CONSTRAINT "HolidayCalendar_businessUnitId_tenantId_fkey" FOREIGN KEY ("businessUnitId", "tenantId") REFERENCES "BusinessUnit"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HolidayCalendar" ADD CONSTRAINT "HolidayCalendar_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_holidayCalendarId_fkey" FOREIGN KEY ("holidayCalendarId") REFERENCES "HolidayCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HolidayCalendarAssignment" ADD CONSTRAINT "HolidayCalendarAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HolidayCalendarAssignment" ADD CONSTRAINT "HolidayCalendarAssignment_holidayCalendarId_fkey" FOREIGN KEY ("holidayCalendarId") REFERENCES "HolidayCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HolidayCalendarAssignment" ADD CONSTRAINT "HolidayCalendarAssignment_organizationId_tenantId_fkey" FOREIGN KEY ("organizationId", "tenantId") REFERENCES "Organization"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HolidayCalendarAssignment" ADD CONSTRAINT "HolidayCalendarAssignment_businessUnitId_tenantId_fkey" FOREIGN KEY ("businessUnitId", "tenantId") REFERENCES "BusinessUnit"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HolidayCalendarAssignment" ADD CONSTRAINT "HolidayCalendarAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkSchedule" ADD CONSTRAINT "WorkSchedule_organizationId_tenantId_fkey" FOREIGN KEY ("organizationId", "tenantId") REFERENCES "Organization"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkSchedule" ADD CONSTRAINT "WorkSchedule_businessUnitId_tenantId_fkey" FOREIGN KEY ("businessUnitId", "tenantId") REFERENCES "BusinessUnit"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkSchedule" ADD CONSTRAINT "WorkSchedule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkScheduleDay" ADD CONSTRAINT "WorkScheduleDay_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkScheduleDay" ADD CONSTRAINT "WorkScheduleDay_workScheduleId_fkey" FOREIGN KEY ("workScheduleId") REFERENCES "WorkSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftTemplate" ADD CONSTRAINT "ShiftTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftTemplate" ADD CONSTRAINT "ShiftTemplate_workScheduleId_fkey" FOREIGN KEY ("workScheduleId") REFERENCES "WorkSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_holidayCalendarId_fkey" FOREIGN KEY ("holidayCalendarId") REFERENCES "HolidayCalendar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_workScheduleId_fkey" FOREIGN KEY ("workScheduleId") REFERENCES "WorkSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollRegion" ADD CONSTRAINT "PayrollRegion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollRegion" ADD CONSTRAINT "PayrollRegion_organizationId_tenantId_fkey" FOREIGN KEY ("organizationId", "tenantId") REFERENCES "Organization"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayrollRegion" ADD CONSTRAINT "PayrollRegion_businessUnitId_tenantId_fkey" FOREIGN KEY ("businessUnitId", "tenantId") REFERENCES "BusinessUnit"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayrollRegion" ADD CONSTRAINT "PayrollRegion_holidayCalendarId_fkey" FOREIGN KEY ("holidayCalendarId") REFERENCES "HolidayCalendar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollRegion" ADD CONSTRAINT "PayrollRegion_workScheduleId_fkey" FOREIGN KEY ("workScheduleId") REFERENCES "WorkSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CurrencyConfiguration" ADD CONSTRAINT "CurrencyConfiguration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CurrencyConfiguration" ADD CONSTRAINT "CurrencyConfiguration_organizationId_tenantId_fkey" FOREIGN KEY ("organizationId", "tenantId") REFERENCES "Organization"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CurrencyConfiguration" ADD CONSTRAINT "CurrencyConfiguration_businessUnitId_tenantId_fkey" FOREIGN KEY ("businessUnitId", "tenantId") REFERENCES "BusinessUnit"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExchangeRateSnapshot" ADD CONSTRAINT "ExchangeRateSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
