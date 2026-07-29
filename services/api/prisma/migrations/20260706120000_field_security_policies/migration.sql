CREATE TABLE "FieldSecurityPolicy" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "moduleKey" TEXT NOT NULL,
  "entityKey" TEXT NOT NULL,
  "defaultBehavior" TEXT NOT NULL DEFAULT 'ALLOW',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,

  CONSTRAINT "FieldSecurityPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FieldSecurityRule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "policyId" TEXT NOT NULL,
  "fieldKey" TEXT NOT NULL,
  "fieldLabel" TEXT NOT NULL,
  "visibility" TEXT NOT NULL DEFAULT 'VISIBLE',
  "accessMode" TEXT NOT NULL DEFAULT 'EDITABLE',
  "maskingPattern" TEXT,
  "customMask" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,

  CONSTRAINT "FieldSecurityRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FieldSecurityPolicyRole" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "policyId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,

  CONSTRAINT "FieldSecurityPolicyRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FieldSecurityPolicyTeam" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "policyId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,

  CONSTRAINT "FieldSecurityPolicyTeam_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FieldSecurityPolicy_tenantId_name_key" ON "FieldSecurityPolicy"("tenantId", "name");
CREATE INDEX "FieldSecurityPolicy_tenantId_idx" ON "FieldSecurityPolicy"("tenantId");
CREATE INDEX "FieldSecurityPolicy_tenantId_moduleKey_entityKey_idx" ON "FieldSecurityPolicy"("tenantId", "moduleKey", "entityKey");
CREATE INDEX "FieldSecurityPolicy_tenantId_isActive_idx" ON "FieldSecurityPolicy"("tenantId", "isActive");

CREATE UNIQUE INDEX "FieldSecurityRule_policyId_fieldKey_key" ON "FieldSecurityRule"("policyId", "fieldKey");
CREATE INDEX "FieldSecurityRule_tenantId_idx" ON "FieldSecurityRule"("tenantId");
CREATE INDEX "FieldSecurityRule_tenantId_policyId_idx" ON "FieldSecurityRule"("tenantId", "policyId");

CREATE UNIQUE INDEX "FieldSecurityPolicyRole_policyId_roleId_key" ON "FieldSecurityPolicyRole"("policyId", "roleId");
CREATE INDEX "FieldSecurityPolicyRole_tenantId_idx" ON "FieldSecurityPolicyRole"("tenantId");
CREATE INDEX "FieldSecurityPolicyRole_tenantId_policyId_idx" ON "FieldSecurityPolicyRole"("tenantId", "policyId");
CREATE INDEX "FieldSecurityPolicyRole_tenantId_roleId_idx" ON "FieldSecurityPolicyRole"("tenantId", "roleId");

CREATE UNIQUE INDEX "FieldSecurityPolicyTeam_policyId_teamId_key" ON "FieldSecurityPolicyTeam"("policyId", "teamId");
CREATE INDEX "FieldSecurityPolicyTeam_tenantId_idx" ON "FieldSecurityPolicyTeam"("tenantId");
CREATE INDEX "FieldSecurityPolicyTeam_tenantId_policyId_idx" ON "FieldSecurityPolicyTeam"("tenantId", "policyId");
CREATE INDEX "FieldSecurityPolicyTeam_tenantId_teamId_idx" ON "FieldSecurityPolicyTeam"("tenantId", "teamId");

ALTER TABLE "FieldSecurityPolicy" ADD CONSTRAINT "FieldSecurityPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FieldSecurityRule" ADD CONSTRAINT "FieldSecurityRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FieldSecurityRule" ADD CONSTRAINT "FieldSecurityRule_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "FieldSecurityPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FieldSecurityPolicyRole" ADD CONSTRAINT "FieldSecurityPolicyRole_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FieldSecurityPolicyRole" ADD CONSTRAINT "FieldSecurityPolicyRole_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "FieldSecurityPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FieldSecurityPolicyRole" ADD CONSTRAINT "FieldSecurityPolicyRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FieldSecurityPolicyTeam" ADD CONSTRAINT "FieldSecurityPolicyTeam_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FieldSecurityPolicyTeam" ADD CONSTRAINT "FieldSecurityPolicyTeam_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "FieldSecurityPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FieldSecurityPolicyTeam" ADD CONSTRAINT "FieldSecurityPolicyTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
