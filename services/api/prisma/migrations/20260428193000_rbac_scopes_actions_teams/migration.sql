-- Add D365-style scope/action aliases while preserving existing seeded values.
ALTER TYPE "SecurityAccessLevel" ADD VALUE IF NOT EXISTS 'SELF';
ALTER TYPE "SecurityAccessLevel" ADD VALUE IF NOT EXISTS 'TEAM';
ALTER TYPE "SecurityAccessLevel" ADD VALUE IF NOT EXISTS 'PARENT_CHILD_BUSINESS_UNIT';

ALTER TYPE "SecurityPrivilege" ADD VALUE IF NOT EXISTS 'APPEND_TO';
ALTER TYPE "SecurityPrivilege" ADD VALUE IF NOT EXISTS 'CUSTOMIZE';

CREATE TYPE "TeamType" AS ENUM ('OWNER', 'ACCESS', 'WORKFLOW');

ALTER TABLE "Role"
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "Team" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "description" TEXT,
  "teamType" "TeamType" NOT NULL DEFAULT 'ACCESS',
  "businessUnitId" TEXT,
  "ownerUserId" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,

  CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamMember" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "isOwner" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,

  CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamRole" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,

  CONSTRAINT "TeamRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Team_tenantId_key_key" ON "Team"("tenantId", "key");
CREATE UNIQUE INDEX "Team_tenantId_name_key" ON "Team"("tenantId", "name");
CREATE INDEX "Team_tenantId_idx" ON "Team"("tenantId");
CREATE INDEX "Team_tenantId_teamType_idx" ON "Team"("tenantId", "teamType");
CREATE INDEX "Team_tenantId_businessUnitId_idx" ON "Team"("tenantId", "businessUnitId");
CREATE INDEX "Team_tenantId_isActive_idx" ON "Team"("tenantId", "isActive");

CREATE UNIQUE INDEX "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");
CREATE INDEX "TeamMember_tenantId_idx" ON "TeamMember"("tenantId");
CREATE INDEX "TeamMember_tenantId_teamId_idx" ON "TeamMember"("tenantId", "teamId");
CREATE INDEX "TeamMember_tenantId_userId_idx" ON "TeamMember"("tenantId", "userId");

CREATE UNIQUE INDEX "TeamRole_teamId_roleId_key" ON "TeamRole"("teamId", "roleId");
CREATE INDEX "TeamRole_tenantId_idx" ON "TeamRole"("tenantId");
CREATE INDEX "TeamRole_tenantId_teamId_idx" ON "TeamRole"("tenantId", "teamId");
CREATE INDEX "TeamRole_tenantId_roleId_idx" ON "TeamRole"("tenantId", "roleId");

CREATE INDEX IF NOT EXISTS "Role_tenantId_isActive_idx" ON "Role"("tenantId", "isActive");

ALTER TABLE "Team"
  ADD CONSTRAINT "Team_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Team_businessUnitId_tenantId_fkey" FOREIGN KEY ("businessUnitId", "tenantId") REFERENCES "BusinessUnit"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Team_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TeamMember"
  ADD CONSTRAINT "TeamMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamRole"
  ADD CONSTRAINT "TeamRole_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TeamRole_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TeamRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
