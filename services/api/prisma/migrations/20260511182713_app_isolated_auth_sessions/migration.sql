-- AlterTable
ALTER TABLE "AgentRefreshToken" ADD COLUMN     "absoluteExpiresAt" TIMESTAMP(3),
ADD COLUMN     "lastActivityAt" TIMESTAMP(3),
ADD COLUMN     "lastUsedAt" TIMESTAMP(3),
ADD COLUMN     "sessionId" TEXT;

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "appClientId" TEXT NOT NULL DEFAULT 'web',
ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "tokenFamilyId" TEXT;

-- CreateIndex
CREATE INDEX "AgentRefreshToken_sessionId_idx" ON "AgentRefreshToken"("sessionId");

-- CreateIndex
CREATE INDEX "AgentRefreshToken_deviceId_sessionId_idx" ON "AgentRefreshToken"("deviceId", "sessionId");

-- CreateIndex
CREATE INDEX "RefreshToken_appClientId_sessionId_idx" ON "RefreshToken"("appClientId", "sessionId");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_appClientId_revokedAt_idx" ON "RefreshToken"("userId", "appClientId", "revokedAt");
