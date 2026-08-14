-- Gateway service credentials and pairing-attempt limiting.
--
-- Purely additive: a new table plus three columns with defaults. No existing
-- migration was touched and no data is rewritten.

-- AlterTable
ALTER TABLE "IntegrationGatewayPairingCode" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "maxAttempts" INTEGER NOT NULL DEFAULT 10;
-- CreateTable
CREATE TABLE "IntegrationGatewayCredential" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "gatewayId" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "label" TEXT,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "lastIpAddress" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    CONSTRAINT "IntegrationGatewayCredential_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "IntegrationGatewayCredential_secretHash_key" ON "IntegrationGatewayCredential"("secretHash");
-- CreateIndex
CREATE INDEX "IntegrationGatewayCredential_tenantId_gatewayId_idx" ON "IntegrationGatewayCredential"("tenantId", "gatewayId");
-- CreateIndex
CREATE INDEX "IntegrationGatewayCredential_gatewayId_revokedAt_idx" ON "IntegrationGatewayCredential"("gatewayId", "revokedAt");
-- CreateIndex
CREATE INDEX "IntegrationGatewayCredential_tenantId_revokedAt_idx" ON "IntegrationGatewayCredential"("tenantId", "revokedAt");
-- AddForeignKey
ALTER TABLE "IntegrationGatewayCredential" ADD CONSTRAINT "IntegrationGatewayCredential_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "IntegrationGatewayCredential" ADD CONSTRAINT "IntegrationGatewayCredential_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "IntegrationGateway"("id") ON DELETE CASCADE ON UPDATE CASCADE;
