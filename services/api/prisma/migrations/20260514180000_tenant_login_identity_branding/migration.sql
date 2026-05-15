-- Tenant-aware login identity, public branding, and future custom domain support.

ALTER TYPE "TenantStatus" ADD VALUE IF NOT EXISTS 'PENDING_SETUP';
ALTER TYPE "TenantStatus" ADD VALUE IF NOT EXISTS 'INACTIVE';
ALTER TYPE "TenantStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

DO $$ BEGIN
  CREATE TYPE "TenantDomainType" AS ENUM ('SYSTEM_SUBDOMAIN', 'CUSTOM_DOMAIN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TenantDomainVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "tenantCode" TEXT,
  ADD COLUMN IF NOT EXISTS "displayName" TEXT,
  ADD COLUMN IF NOT EXISTS "legalName" TEXT;

WITH numbered_tenants AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS sequence_number
  FROM "Tenant"
  WHERE "tenantCode" IS NULL
)
UPDATE "Tenant"
SET "tenantCode" = 'TEN-' || LPAD(numbered_tenants.sequence_number::text, 6, '0')
FROM numbered_tenants
WHERE "Tenant"."id" = numbered_tenants."id";

UPDATE "Tenant"
SET "displayName" = COALESCE(NULLIF(TRIM("displayName"), ''), "name")
WHERE "displayName" IS NULL OR TRIM("displayName") = '';

UPDATE "Tenant"
SET "legalName" = COALESCE(
  NULLIF(TRIM("legalName"), ''),
  (
    SELECT "legalCompanyName"
    FROM "CustomerAccount"
    WHERE "CustomerAccount"."id" = "Tenant"."customerAccountId"
  )
)
WHERE "legalName" IS NULL OR TRIM("legalName") = '';

CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_tenantCode_key" ON "Tenant"("tenantCode");
CREATE INDEX IF NOT EXISTS "Tenant_tenantCode_idx" ON "Tenant"("tenantCode");

CREATE TABLE IF NOT EXISTS "TenantBranding" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "logoUrl" TEXT,
  "faviconUrl" TEXT,
  "loginImageUrl" TEXT,
  "primaryColor" TEXT NOT NULL DEFAULT '#0f766e',
  "secondaryColor" TEXT NOT NULL DEFAULT '#115e59',
  "accentColor" TEXT,
  "backgroundColor" TEXT,
  "surfaceColor" TEXT,
  "textColor" TEXT,
  "mutedTextColor" TEXT,
  "fontFamily" TEXT,
  "appTitle" TEXT,
  "brandName" TEXT,
  "shortBrandName" TEXT,
  "portalTagline" TEXT,
  "loginTitle" TEXT,
  "loginSubtitle" TEXT,
  "loginFooterText" TEXT,
  "supportEmail" TEXT,
  "supportPhone" TEXT,
  "privacyPolicyUrl" TEXT,
  "termsOfUseUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantBranding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TenantBranding_tenantId_key" ON "TenantBranding"("tenantId");
CREATE INDEX IF NOT EXISTS "TenantBranding_tenantId_idx" ON "TenantBranding"("tenantId");

DO $$ BEGIN
  ALTER TABLE "TenantBranding"
    ADD CONSTRAINT "TenantBranding_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO "TenantBranding" (
  "id",
  "tenantId",
  "appTitle",
  "brandName",
  "shortBrandName",
  "portalTagline",
  "loginTitle",
  "loginSubtitle",
  "loginFooterText",
  "supportEmail",
  "createdAt",
  "updatedAt"
)
SELECT
  "Tenant"."id" || '-branding',
  "Tenant"."id",
  'DijiPeople',
  COALESCE(NULLIF(TRIM("Tenant"."displayName"), ''), "Tenant"."name"),
  COALESCE(NULLIF(SPLIT_PART("Tenant"."displayName", ' ', 1), ''), SPLIT_PART("Tenant"."name", ' ', 1)),
  'People operations made simple',
  'Welcome to ' || COALESCE(NULLIF(TRIM("Tenant"."displayName"), ''), "Tenant"."name") || ' HR Portal',
  'Sign in to manage HR, timesheets, payroll, and self-service.',
  'Powered by DijiPeople',
  "CustomerAccount"."contactEmail",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Tenant"
LEFT JOIN "CustomerAccount" ON "CustomerAccount"."id" = "Tenant"."customerAccountId"
LEFT JOIN "TenantBranding" ON "TenantBranding"."tenantId" = "Tenant"."id"
WHERE "TenantBranding"."id" IS NULL;

CREATE TABLE IF NOT EXISTS "TenantDomain" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "type" "TenantDomainType" NOT NULL DEFAULT 'SYSTEM_SUBDOMAIN',
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "verificationStatus" "TenantDomainVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "verifiedAt" TIMESTAMP(3),
  "sslStatus" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantDomain_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TenantDomain_domain_key" ON "TenantDomain"("domain");
CREATE INDEX IF NOT EXISTS "TenantDomain_tenantId_idx" ON "TenantDomain"("tenantId");
CREATE INDEX IF NOT EXISTS "TenantDomain_tenantId_type_isPrimary_idx" ON "TenantDomain"("tenantId", "type", "isPrimary");
CREATE INDEX IF NOT EXISTS "TenantDomain_verificationStatus_idx" ON "TenantDomain"("verificationStatus");

DO $$ BEGIN
  ALTER TABLE "TenantDomain"
    ADD CONSTRAINT "TenantDomain_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DROP INDEX IF EXISTS "User_email_key";
CREATE UNIQUE INDEX IF NOT EXISTS "User_tenantId_email_key" ON "User"("tenantId", "email");
