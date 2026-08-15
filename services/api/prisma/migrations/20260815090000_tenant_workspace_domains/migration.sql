-- Workspace routing: customer environments, environment grouping, and the tenant
-- domain model that turns a hostname into a tenant.
--
-- ADDITIVE ONLY. Every new column is nullable or carries a default that matches
-- what the existing rows already mean. `sslStatus` is deliberately left in place
-- alongside the new `tlsStatus` enum rather than being converted, so no existing
-- value is destroyed; the backfill below reads it and the application prefers
-- the enum from here on.

-- A workspace is one of a customer's environments. Existing tenants are all
-- production workspaces — that is the only thing they could have been.
CREATE TYPE "TenantEnvironmentType" AS ENUM ('PRODUCTION', 'UAT', 'SANDBOX', 'DEVELOPMENT');

-- SYSTEM subdomains sit behind the platform wildcard certificate, so they need
-- no certificate of their own; only CUSTOM domains move through the other states.
CREATE TYPE "TenantDomainTlsStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'ACTIVE', 'FAILED');

-- A hostname can be turned off without being deleted, which keeps the audit
-- trail and stops the name being re-claimed by another tenant.
ALTER TYPE "TenantDomainVerificationStatus" ADD VALUE IF NOT EXISTS 'DISABLED';

ALTER TABLE "Tenant" ADD COLUMN "environmentType" "TenantEnvironmentType" NOT NULL DEFAULT 'PRODUCTION';
ALTER TABLE "Tenant" ADD COLUMN "environmentGroupId" TEXT;

ALTER TABLE "TenantDomain" ADD COLUMN "tlsStatus" "TenantDomainTlsStatus" NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE "TenantDomain" ADD COLUMN "verificationToken" TEXT;
ALTER TABLE "TenantDomain" ADD COLUMN "verificationTokenIssuedAt" TIMESTAMP(3);
ALTER TABLE "TenantDomain" ADD COLUMN "lastVerificationAttemptAt" TIMESTAMP(3);
ALTER TABLE "TenantDomain" ADD COLUMN "verificationFailureReason" TEXT;
ALTER TABLE "TenantDomain" ADD COLUMN "disabledAt" TIMESTAMP(3);
ALTER TABLE "TenantDomain" ADD COLUMN "createdById" TEXT;
ALTER TABLE "TenantDomain" ADD COLUMN "updatedById" TEXT;

-- Organisational only. No data, permission or configuration crosses a group,
-- which is why this is a sibling grouping and not a parent tenant.
CREATE TABLE "TenantEnvironmentGroup" (
  "id"                TEXT NOT NULL,
  "customerAccountId" TEXT NOT NULL,
  "name"              TEXT NOT NULL,
  "description"       TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  "createdById"       TEXT,
  "updatedById"       TEXT,
  CONSTRAINT "TenantEnvironmentGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantEnvironmentGroup_customerAccountId_name_key"
  ON "TenantEnvironmentGroup"("customerAccountId", "name");
CREATE INDEX "TenantEnvironmentGroup_customerAccountId_idx"
  ON "TenantEnvironmentGroup"("customerAccountId");

ALTER TABLE "TenantEnvironmentGroup"
  ADD CONSTRAINT "TenantEnvironmentGroup_customerAccountId_fkey"
  FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Tenant"
  ADD CONSTRAINT "Tenant_environmentGroupId_fkey"
  FOREIGN KEY ("environmentGroupId") REFERENCES "TenantEnvironmentGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Tenant_environmentType_idx" ON "Tenant"("environmentType");
CREATE INDEX "Tenant_environmentGroupId_idx" ON "Tenant"("environmentGroupId");
CREATE INDEX "Tenant_customerAccountId_environmentType_idx" ON "Tenant"("customerAccountId", "environmentType");
CREATE INDEX "TenantDomain_tenantId_isPrimary_idx" ON "TenantDomain"("tenantId", "isPrimary");

-- Exactly one primary hostname per tenant, enforced by the database rather than
-- only by the service. A partial unique index is the right tool: it constrains
-- the primary rows without preventing a tenant from holding several secondary
-- hostnames.
CREATE UNIQUE INDEX "TenantDomain_one_primary_per_tenant"
  ON "TenantDomain"("tenantId") WHERE "isPrimary";

-- Backfill: carry the existing free-text TLS note into the enum. Anything that
-- did not clearly say "active" stays NOT_REQUIRED, which is the truthful state
-- for a system subdomain covered by the platform wildcard certificate.
UPDATE "TenantDomain"
   SET "tlsStatus" = 'ACTIVE'
 WHERE lower(coalesce("sslStatus", '')) = 'active';

UPDATE "TenantDomain"
   SET "tlsStatus" = 'PENDING'
 WHERE lower(coalesce("sslStatus", '')) = 'pending'
   AND "type" = 'CUSTOM_DOMAIN';
