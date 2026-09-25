-- TASK-0032 WP-01 (EXECPLAN-0051). Additive only.
--   * TOTP MFA on User and PlatformUser, with one-time recovery-code tables (ADR-0019).
--   * Platform sign-in lockout counters on PlatformUser (BUG-3146).
--   * ErrorLog.module for grouping and filtering errors by API module.
--   * SignatureEvidence.typedStyle, the style a typed signature was rendered in.
--   * PLATFORM_OWNER is retired as an assignable role (ADR-0018): its accounts become
--     SUPER_ADMIN. Both roles carry platform.*, so nobody gains or loses access.
--     Idempotent: a second run updates zero rows.
-- AlterTable
ALTER TABLE "SignatureEvidence" ADD COLUMN     "typedStyle" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfaEnabledAt" TIMESTAMP(3),
ADD COLUMN     "mfaLastUsedStep" BIGINT,
ADD COLUMN     "mfaPendingSecretEncrypted" TEXT,
ADD COLUMN     "mfaSecretEncrypted" TEXT;

-- AlterTable
ALTER TABLE "PlatformUser" ADD COLUMN     "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfaEnabledAt" TIMESTAMP(3),
ADD COLUMN     "mfaLastUsedStep" BIGINT,
ADD COLUMN     "mfaPendingSecretEncrypted" TEXT,
ADD COLUMN     "mfaSecretEncrypted" TEXT;

-- AlterTable
ALTER TABLE "ErrorLog" ADD COLUMN     "module" TEXT;

-- CreateTable
CREATE TABLE "UserMfaRecoveryCode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserMfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformUserMfaRecoveryCode" (
    "id" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformUserMfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserMfaRecoveryCode_codeHash_key" ON "UserMfaRecoveryCode"("codeHash");

-- CreateIndex
CREATE INDEX "UserMfaRecoveryCode_tenantId_userId_idx" ON "UserMfaRecoveryCode"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformUserMfaRecoveryCode_codeHash_key" ON "PlatformUserMfaRecoveryCode"("codeHash");

-- CreateIndex
CREATE INDEX "PlatformUserMfaRecoveryCode_platformUserId_idx" ON "PlatformUserMfaRecoveryCode"("platformUserId");

-- CreateIndex
CREATE INDEX "ErrorLog_module_lastSeenAt_idx" ON "ErrorLog"("module", "lastSeenAt");

-- AddForeignKey
ALTER TABLE "UserMfaRecoveryCode" ADD CONSTRAINT "UserMfaRecoveryCode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMfaRecoveryCode" ADD CONSTRAINT "UserMfaRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformUserMfaRecoveryCode" ADD CONSTRAINT "PlatformUserMfaRecoveryCode_platformUserId_fkey" FOREIGN KEY ("platformUserId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ADR-0018: consolidate the two identical top platform roles.
UPDATE "PlatformUser" SET "role" = 'SUPER_ADMIN', "updatedAt" = CURRENT_TIMESTAMP WHERE "role" = 'PLATFORM_OWNER';
