CREATE TYPE "PartnerType" AS ENUM ('INDIVIDUAL', 'COMPANY');
CREATE TYPE "PartnerStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'TERMINATED');
CREATE TYPE "PartnerContractStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'SIGNED', 'DECLINED', 'EXPIRED', 'TERMINATED');
CREATE TYPE "PartnerESignProvider" AS ENUM ('MANUAL', 'DOCUSIGN', 'ADOBE_SIGN', 'DROPBOX_SIGN', 'OTHER');
CREATE TYPE "PartnerCommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAYABLE', 'PAID', 'VOID');

ALTER TABLE "PlatformUser" ADD COLUMN "defaultDashboardView" TEXT;
ALTER TABLE "ErrorLog" ADD COLUMN "assignedToUserId" TEXT;
ALTER TABLE "Lead" ADD COLUMN "partnerId" TEXT;

CREATE TABLE "Partner" (
  "id" TEXT NOT NULL, "code" TEXT NOT NULL, "type" "PartnerType" NOT NULL DEFAULT 'COMPANY',
  "displayName" TEXT NOT NULL, "companyName" TEXT, "contactFirstName" TEXT, "contactLastName" TEXT,
  "email" TEXT NOT NULL, "phone" TEXT, "country" TEXT, "website" TEXT, "taxId" TEXT,
  "defaultCommissionRate" DECIMAL(5,2) NOT NULL DEFAULT 0, "currencyCode" TEXT NOT NULL,
  "status" "PartnerStatus" NOT NULL DEFAULT 'DRAFT', "assignedToUserId" TEXT, "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PartnerContractTemplate" (
  "id" TEXT NOT NULL, "key" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 1, "name" TEXT NOT NULL,
  "title" TEXT NOT NULL, "bodyText" TEXT NOT NULL, "defaultCommissionRate" DECIMAL(5,2),
  "defaultCurrencyCode" TEXT, "eSignProvider" "PartnerESignProvider" NOT NULL DEFAULT 'MANUAL',
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PartnerContractTemplate_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PartnerContract" (
  "id" TEXT NOT NULL, "partnerId" TEXT NOT NULL, "templateId" TEXT, "contractNumber" TEXT NOT NULL,
  "title" TEXT NOT NULL, "status" "PartnerContractStatus" NOT NULL DEFAULT 'DRAFT', "effectiveFrom" TIMESTAMP(3),
  "effectiveTo" TIMESTAMP(3), "commissionRate" DECIMAL(5,2) NOT NULL, "currencyCode" TEXT NOT NULL,
  "termsSnapshot" JSONB, "eSignProvider" "PartnerESignProvider" NOT NULL DEFAULT 'MANUAL', "externalEnvelopeId" TEXT,
  "signerName" TEXT, "signerEmail" TEXT, "sentAt" TIMESTAMP(3), "viewedAt" TIMESTAMP(3), "signedAt" TIMESTAMP(3),
  "declinedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerContract_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PartnerCommission" (
  "id" TEXT NOT NULL, "partnerId" TEXT NOT NULL, "leadId" TEXT, "customerAccountId" TEXT, "invoiceId" TEXT,
  "commissionNumber" TEXT NOT NULL, "status" "PartnerCommissionStatus" NOT NULL DEFAULT 'PENDING',
  "baseAmount" DECIMAL(12,2) NOT NULL, "commissionRate" DECIMAL(5,2) NOT NULL, "commissionAmount" DECIMAL(12,2) NOT NULL,
  "currencyCode" TEXT NOT NULL, "description" TEXT, "earnedAt" TIMESTAMP(3), "dueAt" TIMESTAMP(3), "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerCommission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Partner_code_key" ON "Partner"("code");
CREATE INDEX "Partner_status_createdAt_idx" ON "Partner"("status", "createdAt");
CREATE INDEX "Partner_displayName_idx" ON "Partner"("displayName");
CREATE INDEX "Partner_email_idx" ON "Partner"("email");
CREATE INDEX "Partner_assignedToUserId_idx" ON "Partner"("assignedToUserId");
CREATE UNIQUE INDEX "PartnerContractTemplate_key_version_key" ON "PartnerContractTemplate"("key", "version");
CREATE INDEX "PartnerContractTemplate_isActive_name_idx" ON "PartnerContractTemplate"("isActive", "name");
CREATE UNIQUE INDEX "PartnerContract_contractNumber_key" ON "PartnerContract"("contractNumber");
CREATE INDEX "PartnerContract_partnerId_status_idx" ON "PartnerContract"("partnerId", "status");
CREATE INDEX "PartnerContract_externalEnvelopeId_idx" ON "PartnerContract"("externalEnvelopeId");
CREATE UNIQUE INDEX "PartnerCommission_commissionNumber_key" ON "PartnerCommission"("commissionNumber");
CREATE INDEX "PartnerCommission_partnerId_status_idx" ON "PartnerCommission"("partnerId", "status");
CREATE INDEX "PartnerCommission_leadId_idx" ON "PartnerCommission"("leadId");
CREATE INDEX "PartnerCommission_customerAccountId_idx" ON "PartnerCommission"("customerAccountId");
CREATE INDEX "PartnerCommission_invoiceId_idx" ON "PartnerCommission"("invoiceId");
CREATE INDEX "Lead_partnerId_idx" ON "Lead"("partnerId");
CREATE INDEX "ErrorLog_assignedToUserId_supportStatus_idx" ON "ErrorLog"("assignedToUserId", "supportStatus");

ALTER TABLE "Lead" ADD CONSTRAINT "Lead_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartnerContract" ADD CONSTRAINT "PartnerContract_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerContract" ADD CONSTRAINT "PartnerContract_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PartnerContractTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartnerCommission" ADD CONSTRAINT "PartnerCommission_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ErrorLog" ADD CONSTRAINT "ErrorLog_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
