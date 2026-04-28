-- Enterprise RBAC matrix foundation.
CREATE TYPE "RoleType" AS ENUM ('SYSTEM', 'CUSTOM');
CREATE TYPE "SecurityAccessLevel" AS ENUM ('NONE', 'USER', 'BUSINESS_UNIT', 'PARENT_CHILD_BUSINESS_UNITS', 'ORGANIZATION', 'TENANT');
CREATE TYPE "SecurityPrivilege" AS ENUM ('READ', 'CREATE', 'WRITE', 'DELETE', 'ASSIGN', 'SHARE', 'APPEND', 'IMPORT', 'EXPORT', 'APPROVE', 'REJECT', 'MANAGE', 'CONFIGURE');

ALTER TABLE "Role"
  ADD COLUMN "roleType" "RoleType" NOT NULL DEFAULT 'CUSTOM',
  ADD COLUMN "isEditable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isCloneable" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Role"
SET "roleType" = CASE WHEN "isSystem" THEN 'SYSTEM'::"RoleType" ELSE 'CUSTOM'::"RoleType" END,
    "isEditable" = CASE WHEN "isSystem" THEN false ELSE true END,
    "isCloneable" = true;

CREATE TABLE "RolePrivilege" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "entityKey" TEXT NOT NULL,
  "privilege" "SecurityPrivilege" NOT NULL,
  "accessLevel" "SecurityAccessLevel" NOT NULL DEFAULT 'NONE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,

  CONSTRAINT "RolePrivilege_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoleMiscPermission" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "permissionKey" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "updatedById" TEXT,

  CONSTRAINT "RoleMiscPermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RolePrivilege_roleId_entityKey_privilege_key" ON "RolePrivilege"("roleId", "entityKey", "privilege");
CREATE INDEX "RolePrivilege_tenantId_idx" ON "RolePrivilege"("tenantId");
CREATE INDEX "RolePrivilege_tenantId_entityKey_idx" ON "RolePrivilege"("tenantId", "entityKey");
CREATE INDEX "RolePrivilege_roleId_idx" ON "RolePrivilege"("roleId");

CREATE UNIQUE INDEX "RoleMiscPermission_roleId_permissionKey_key" ON "RoleMiscPermission"("roleId", "permissionKey");
CREATE INDEX "RoleMiscPermission_tenantId_idx" ON "RoleMiscPermission"("tenantId");
CREATE INDEX "RoleMiscPermission_tenantId_permissionKey_idx" ON "RoleMiscPermission"("tenantId", "permissionKey");
CREATE INDEX "RoleMiscPermission_roleId_idx" ON "RoleMiscPermission"("roleId");

CREATE INDEX "Role_tenantId_roleType_idx" ON "Role"("tenantId", "roleType");

ALTER TABLE "RolePrivilege"
  ADD CONSTRAINT "RolePrivilege_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "RolePrivilege_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoleMiscPermission"
  ADD CONSTRAINT "RoleMiscPermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "RoleMiscPermission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
