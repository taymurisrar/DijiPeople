-- Make email globally unique and align user auth storage
DROP INDEX "User_tenantId_email_key";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
ALTER TABLE "User" DROP COLUMN "currentHashedRefreshToken";

-- Align UserRole with tenant-aware join table shape
ALTER TABLE "UserRole" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "UserRole" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "UserRole" ADD COLUMN "updatedById" TEXT;
UPDATE "UserRole"
SET "tenantId" = "User"."tenantId"
FROM "User"
WHERE "UserRole"."userId" = "User"."id";
ALTER TABLE "UserRole" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "UserRole" ALTER COLUMN "updatedAt" DROP DEFAULT;
CREATE INDEX "UserRole_tenantId_idx" ON "UserRole"("tenantId");
ALTER TABLE "UserRole"
ADD CONSTRAINT "UserRole_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Align RolePermission with tenant-aware join table shape
ALTER TABLE "RolePermission" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "RolePermission" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "RolePermission" ADD COLUMN "updatedById" TEXT;
UPDATE "RolePermission"
SET "tenantId" = "Role"."tenantId"
FROM "Role"
WHERE "RolePermission"."roleId" = "Role"."id";
ALTER TABLE "RolePermission" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "RolePermission" ALTER COLUMN "updatedAt" DROP DEFAULT;
CREATE INDEX "RolePermission_tenantId_idx" ON "RolePermission"("tenantId");
ALTER TABLE "RolePermission"
ADD CONSTRAINT "RolePermission_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Expand foundation indexes
CREATE INDEX "User_tenantId_status_idx" ON "User"("tenantId", "status");
CREATE INDEX "User_tenantId_lastName_firstName_idx" ON "User"("tenantId", "lastName", "firstName");
CREATE UNIQUE INDEX "Role_tenantId_name_key" ON "Role"("tenantId", "name");
CREATE INDEX "Role_tenantId_isSystem_idx" ON "Role"("tenantId", "isSystem");
CREATE UNIQUE INDEX "Permission_tenantId_name_key" ON "Permission"("tenantId", "name");
CREATE INDEX "Tenant_status_idx" ON "Tenant"("status");

-- Create refresh token persistence table
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_tenantId_idx" ON "RefreshToken"("tenantId");
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE INDEX "RefreshToken_userId_revokedAt_idx" ON "RefreshToken"("userId", "revokedAt");
CREATE INDEX "RefreshToken_tenantId_expiresAt_idx" ON "RefreshToken"("tenantId", "expiresAt");
CREATE INDEX "RefreshToken_tenantId_userId_createdAt_idx" ON "RefreshToken"("tenantId", "userId", "createdAt");

ALTER TABLE "RefreshToken"
ADD CONSTRAINT "RefreshToken_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RefreshToken"
ADD CONSTRAINT "RefreshToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
