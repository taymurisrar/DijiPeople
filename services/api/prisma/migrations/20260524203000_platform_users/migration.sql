CREATE TYPE "PlatformUserRole" AS ENUM ('SUPER_ADMIN', 'MEMBER');

CREATE TYPE "PlatformUserStatus" AS ENUM ('ACTIVE', 'INVITED', 'DISABLED');

CREATE TABLE "PlatformUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "PlatformUserRole" NOT NULL DEFAULT 'MEMBER',
    "status" "PlatformUserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "PlatformUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformRefreshToken" (
    "id" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "sessionId" TEXT,
    "appClientId" TEXT NOT NULL DEFAULT 'admin',
    "tokenFamilyId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "PlatformRefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformUser_email_key" ON "PlatformUser"("email");
CREATE INDEX "PlatformUser_email_idx" ON "PlatformUser"("email");
CREATE INDEX "PlatformUser_role_idx" ON "PlatformUser"("role");
CREATE INDEX "PlatformUser_status_idx" ON "PlatformUser"("status");
CREATE UNIQUE INDEX "PlatformRefreshToken_tokenHash_key" ON "PlatformRefreshToken"("tokenHash");
CREATE INDEX "PlatformRefreshToken_platformUserId_idx" ON "PlatformRefreshToken"("platformUserId");
CREATE INDEX "PlatformRefreshToken_sessionId_idx" ON "PlatformRefreshToken"("sessionId");
CREATE INDEX "PlatformRefreshToken_appClientId_sessionId_idx" ON "PlatformRefreshToken"("appClientId", "sessionId");
CREATE INDEX "PlatformRefreshToken_platformUserId_revokedAt_idx" ON "PlatformRefreshToken"("platformUserId", "revokedAt");
CREATE INDEX "PlatformRefreshToken_platformUserId_appClientId_revokedAt_idx" ON "PlatformRefreshToken"("platformUserId", "appClientId", "revokedAt");
CREATE INDEX "PlatformRefreshToken_expiresAt_idx" ON "PlatformRefreshToken"("expiresAt");

ALTER TABLE "PlatformUser" ADD CONSTRAINT "PlatformUser_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlatformUser" ADD CONSTRAINT "PlatformUser_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlatformRefreshToken" ADD CONSTRAINT "PlatformRefreshToken_platformUserId_fkey" FOREIGN KEY ("platformUserId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
