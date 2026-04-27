ALTER TYPE "CustomerAccountStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'UNQUALIFIED';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'CONVERTED';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'CLOSED_LOST';

DO $$
BEGIN
  CREATE TYPE "CustomerOnboardingStatus" AS ENUM (
    'NOT_STARTED',
    'IN_PROGRESS',
    'AWAITING_CUSTOMER_INPUT',
    'PENDING_PAYMENT',
    'READY_FOR_TENANT_CREATION',
    'COMPLETED',
    'BLOCKED',
    'CANCELED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Tenant"
  ADD COLUMN "subStatus" TEXT;

ALTER TABLE "CustomerAccount"
  ADD COLUMN "legalCompanyName" TEXT,
  ADD COLUMN "primaryContactFirstName" TEXT,
  ADD COLUMN "primaryContactLastName" TEXT,
  ADD COLUMN "primaryContactEmail" TEXT,
  ADD COLUMN "primaryContactPhone" TEXT,
  ADD COLUMN "billingContactEmail" TEXT,
  ADD COLUMN "financeContactName" TEXT,
  ADD COLUMN "financeContactEmail" TEXT,
  ADD COLUMN "stateProvince" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "addressLine1" TEXT,
  ADD COLUMN "addressLine2" TEXT,
  ADD COLUMN "website" TEXT,
  ADD COLUMN "estimatedEmployeeCount" INTEGER,
  ADD COLUMN "actualEmployeeCount" INTEGER,
  ADD COLUMN "selectedPlanId" TEXT,
  ADD COLUMN "preferredBillingCycle" "BillingCycle",
  ADD COLUMN "customPricingFlag" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "discountApproved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "leadId" TEXT,
  ADD COLUMN "subStatus" TEXT,
  ADD COLUMN "accountManagerUserId" TEXT;

ALTER TABLE "Lead"
  ADD COLUMN "contactFirstName" TEXT,
  ADD COLUMN "contactLastName" TEXT,
  ADD COLUMN "companyWebsite" TEXT,
  ADD COLUMN "country" TEXT,
  ADD COLUMN "stateProvince" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "estimatedEmployeeCount" INTEGER,
  ADD COLUMN "expectedGoLiveDate" TIMESTAMP(3),
  ADD COLUMN "budgetExpectation" TEXT,
  ADD COLUMN "requirementsSummary" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "assignedToUserId" TEXT,
  ADD COLUMN "subStatus" TEXT,
  ADD COLUMN "isQualified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "convertedAt" TIMESTAMP(3);

CREATE TABLE "CustomerOnboarding" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "leadId" TEXT,
  "tenantId" TEXT,
  "onboardingOwnerUserId" TEXT,
  "selectedPlanId" TEXT,
  "billingCycle" "BillingCycle",
  "agreedPrice" DECIMAL(12,2),
  "discountType" "DiscountType" NOT NULL DEFAULT 'NONE',
  "discountValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "featureSelectionSummary" JSONB,
  "primaryOwnerFirstName" TEXT NOT NULL,
  "primaryOwnerLastName" TEXT NOT NULL,
  "primaryOwnerWorkEmail" TEXT NOT NULL,
  "primaryOwnerPhone" TEXT,
  "superAdminFirstName" TEXT,
  "superAdminLastName" TEXT,
  "superAdminWorkEmail" TEXT,
  "serviceAccountEmail" TEXT,
  "contractSigned" BOOLEAN NOT NULL DEFAULT false,
  "paymentConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "implementationKickoffDone" BOOLEAN NOT NULL DEFAULT false,
  "dataReceived" BOOLEAN NOT NULL DEFAULT false,
  "configurationReady" BOOLEAN NOT NULL DEFAULT false,
  "trainingPlanned" BOOLEAN NOT NULL DEFAULT false,
  "tenantCreated" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "status" "CustomerOnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "subStatus" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomerOnboarding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerOnboarding_tenantId_key" ON "CustomerOnboarding"("tenantId");

CREATE INDEX "CustomerAccount_subStatus_idx" ON "CustomerAccount"("subStatus");
CREATE INDEX "CustomerAccount_accountManagerUserId_idx" ON "CustomerAccount"("accountManagerUserId");
CREATE INDEX "CustomerAccount_leadId_idx" ON "CustomerAccount"("leadId");
CREATE INDEX "CustomerAccount_selectedPlanId_idx" ON "CustomerAccount"("selectedPlanId");
CREATE INDEX "Lead_subStatus_createdAt_idx" ON "Lead"("subStatus", "createdAt");
CREATE INDEX "Lead_assignedToUserId_idx" ON "Lead"("assignedToUserId");
CREATE INDEX "CustomerOnboarding_customerId_idx" ON "CustomerOnboarding"("customerId");
CREATE INDEX "CustomerOnboarding_leadId_idx" ON "CustomerOnboarding"("leadId");
CREATE INDEX "CustomerOnboarding_status_idx" ON "CustomerOnboarding"("status");
CREATE INDEX "CustomerOnboarding_subStatus_idx" ON "CustomerOnboarding"("subStatus");
CREATE INDEX "CustomerOnboarding_onboardingOwnerUserId_idx" ON "CustomerOnboarding"("onboardingOwnerUserId");
CREATE INDEX "CustomerOnboarding_selectedPlanId_idx" ON "CustomerOnboarding"("selectedPlanId");

ALTER TABLE "CustomerAccount"
  ADD CONSTRAINT "CustomerAccount_accountManagerUserId_fkey"
  FOREIGN KEY ("accountManagerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerAccount"
  ADD CONSTRAINT "CustomerAccount_selectedPlanId_fkey"
  FOREIGN KEY ("selectedPlanId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerAccount"
  ADD CONSTRAINT "CustomerAccount_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Lead"
  ADD CONSTRAINT "Lead_assignedToUserId_fkey"
  FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerOnboarding"
  ADD CONSTRAINT "CustomerOnboarding_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerOnboarding"
  ADD CONSTRAINT "CustomerOnboarding_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerOnboarding"
  ADD CONSTRAINT "CustomerOnboarding_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerOnboarding"
  ADD CONSTRAINT "CustomerOnboarding_onboardingOwnerUserId_fkey"
  FOREIGN KEY ("onboardingOwnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerOnboarding"
  ADD CONSTRAINT "CustomerOnboarding_selectedPlanId_fkey"
  FOREIGN KEY ("selectedPlanId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
