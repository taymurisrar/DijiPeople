-- Organization structure runtime fields.
ALTER TABLE "Organization"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "organizationType" TEXT NOT NULL DEFAULT 'OPERATING',
  ADD COLUMN "headEmployeeId" TEXT,
  ADD COLUMN "ownerUserId" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "subStatus" TEXT NOT NULL DEFAULT 'OPERATIONAL',
  ADD COLUMN "description" TEXT,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;

UPDATE "Organization"
SET "code" = COALESCE("code", 'ORG-' || substr("id", 1, 8))
WHERE "code" IS NULL;

ALTER TABLE "BusinessUnit"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "headEmployeeId" TEXT,
  ADD COLUMN "ownerUserId" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "subStatus" TEXT NOT NULL DEFAULT 'OPERATIONAL',
  ADD COLUMN "description" TEXT,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;

UPDATE "BusinessUnit"
SET "code" = COALESCE("code", 'BU-' || substr("id", 1, 8))
WHERE "code" IS NULL;

ALTER TABLE "Department"
  ADD COLUMN "businessUnitId" TEXT,
  ADD COLUMN "headEmployeeId" TEXT,
  ADD COLUMN "ownerUserId" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "subStatus" TEXT NOT NULL DEFAULT 'OPERATIONAL';

UPDATE "Department"
SET "code" = COALESCE("code", 'DEP-' || substr("id", 1, 8))
WHERE "code" IS NULL;

ALTER TABLE "Team"
  ADD COLUMN "departmentId" TEXT;

ALTER TABLE "Employee"
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "teamId" TEXT;

UPDATE "Employee" e
SET "organizationId" = bu."organizationId"
FROM "BusinessUnit" bu
WHERE e."businessUnitId" = bu."id"
  AND e."tenantId" = bu."tenantId"
  AND e."organizationId" IS NULL;

CREATE UNIQUE INDEX "Organization_tenantId_code_key" ON "Organization"("tenantId", "code");
CREATE INDEX "Organization_tenantId_status_idx" ON "Organization"("tenantId", "status");
CREATE INDEX "Organization_tenantId_subStatus_idx" ON "Organization"("tenantId", "subStatus");
CREATE INDEX "Organization_tenantId_isActive_idx" ON "Organization"("tenantId", "isActive");
CREATE INDEX "Organization_tenantId_ownerUserId_idx" ON "Organization"("tenantId", "ownerUserId");
CREATE INDEX "Organization_tenantId_headEmployeeId_idx" ON "Organization"("tenantId", "headEmployeeId");

CREATE UNIQUE INDEX "BusinessUnit_tenantId_code_key" ON "BusinessUnit"("tenantId", "code");
CREATE INDEX "BusinessUnit_tenantId_status_idx" ON "BusinessUnit"("tenantId", "status");
CREATE INDEX "BusinessUnit_tenantId_subStatus_idx" ON "BusinessUnit"("tenantId", "subStatus");
CREATE INDEX "BusinessUnit_tenantId_isActive_idx" ON "BusinessUnit"("tenantId", "isActive");
CREATE INDEX "BusinessUnit_tenantId_ownerUserId_idx" ON "BusinessUnit"("tenantId", "ownerUserId");
CREATE INDEX "BusinessUnit_tenantId_headEmployeeId_idx" ON "BusinessUnit"("tenantId", "headEmployeeId");

CREATE UNIQUE INDEX "Department_id_tenantId_key" ON "Department"("id", "tenantId");
CREATE INDEX "Department_tenantId_businessUnitId_idx" ON "Department"("tenantId", "businessUnitId");
CREATE INDEX "Department_tenantId_status_idx" ON "Department"("tenantId", "status");
CREATE INDEX "Department_tenantId_subStatus_idx" ON "Department"("tenantId", "subStatus");
CREATE INDEX "Department_tenantId_ownerUserId_idx" ON "Department"("tenantId", "ownerUserId");
CREATE INDEX "Department_tenantId_headEmployeeId_idx" ON "Department"("tenantId", "headEmployeeId");

CREATE INDEX "Team_tenantId_departmentId_idx" ON "Team"("tenantId", "departmentId");

CREATE INDEX "Employee_tenantId_organizationId_idx" ON "Employee"("tenantId", "organizationId");
CREATE INDEX "Employee_tenantId_departmentId_idx" ON "Employee"("tenantId", "departmentId");
CREATE INDEX "Employee_tenantId_teamId_idx" ON "Employee"("tenantId", "teamId");

ALTER TABLE "Organization"
  ADD CONSTRAINT "Organization_headEmployeeId_fkey" FOREIGN KEY ("headEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Organization_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Organization_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Organization_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BusinessUnit"
  ADD CONSTRAINT "BusinessUnit_headEmployeeId_fkey" FOREIGN KEY ("headEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "BusinessUnit_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "BusinessUnit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "BusinessUnit_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Department"
  ADD CONSTRAINT "Department_businessUnitId_tenantId_fkey" FOREIGN KEY ("businessUnitId", "tenantId") REFERENCES "BusinessUnit"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Department_headEmployeeId_fkey" FOREIGN KEY ("headEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Department_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Department_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Department_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Team"
  ADD CONSTRAINT "Team_departmentId_tenantId_fkey" FOREIGN KEY ("departmentId", "tenantId") REFERENCES "Department"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_organizationId_tenantId_fkey" FOREIGN KEY ("organizationId", "tenantId") REFERENCES "Organization"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Employee_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
