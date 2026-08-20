-- CreateEnum
CREATE TYPE "TenantReadinessStatus" AS ENUM ('NOT_READY', 'PROVISIONING', 'READY', 'PARTIALLY_READY', 'BLOCKED');

-- CreateEnum
CREATE TYPE "SeatChangeDirection" AS ENUM ('INCREASE', 'DECREASE');

-- CreateEnum
CREATE TYPE "SeatChangeStatus" AS ENUM ('SCHEDULED', 'APPLIED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlanChangeDirection" AS ENUM ('UPGRADE', 'DOWNGRADE');

-- CreateEnum
CREATE TYPE "PlanChangeStatus" AS ENUM ('SCHEDULED', 'APPLIED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "dataRegion" TEXT,
ADD COLUMN     "readinessStatus" "TenantReadinessStatus" NOT NULL DEFAULT 'NOT_READY',
ADD COLUMN     "readyAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TenantProvisioningRun" ADD COLUMN     "breachedAt" TIMESTAMP(3),
ADD COLUMN     "customerAccountId" TEXT,
ADD COLUMN     "escalateAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionOrderId" TEXT,
ADD COLUMN     "targetReadyBy" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SeatChangeRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "direction" "SeatChangeDirection" NOT NULL,
    "fromSeats" INTEGER NOT NULL,
    "toSeats" INTEGER NOT NULL,
    "status" "SeatChangeStatus" NOT NULL DEFAULT 'SCHEDULED',
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "providerSynced" BOOLEAN NOT NULL DEFAULT false,
    "providerError" TEXT,
    "requestedByUserId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeatChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanChangeRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "direction" "PlanChangeDirection" NOT NULL,
    "fromPlanId" TEXT NOT NULL,
    "toPlanId" TEXT NOT NULL,
    "toPlanPriceId" TEXT,
    "status" "PlanChangeStatus" NOT NULL DEFAULT 'SCHEDULED',
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "entitlementImpact" JSONB,
    "providerSynced" BOOLEAN NOT NULL DEFAULT false,
    "providerError" TEXT,
    "requestedByUserId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeatChangeRequest_subscriptionId_status_idx" ON "SeatChangeRequest"("subscriptionId", "status");

-- CreateIndex
CREATE INDEX "SeatChangeRequest_status_effectiveAt_idx" ON "SeatChangeRequest"("status", "effectiveAt");

-- CreateIndex
CREATE INDEX "SeatChangeRequest_tenantId_createdAt_idx" ON "SeatChangeRequest"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "PlanChangeRequest_subscriptionId_status_idx" ON "PlanChangeRequest"("subscriptionId", "status");

-- CreateIndex
CREATE INDEX "PlanChangeRequest_status_effectiveAt_idx" ON "PlanChangeRequest"("status", "effectiveAt");

-- CreateIndex
CREATE INDEX "PlanChangeRequest_tenantId_createdAt_idx" ON "PlanChangeRequest"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "TenantProvisioningRun" ADD CONSTRAINT "TenantProvisioningRun_subscriptionOrderId_fkey" FOREIGN KEY ("subscriptionOrderId") REFERENCES "SubscriptionOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantProvisioningRun" ADD CONSTRAINT "TenantProvisioningRun_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatChangeRequest" ADD CONSTRAINT "SeatChangeRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatChangeRequest" ADD CONSTRAINT "SeatChangeRequest_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanChangeRequest" ADD CONSTRAINT "PlanChangeRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanChangeRequest" ADD CONSTRAINT "PlanChangeRequest_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanChangeRequest" ADD CONSTRAINT "PlanChangeRequest_fromPlanId_fkey" FOREIGN KEY ("fromPlanId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanChangeRequest" ADD CONSTRAINT "PlanChangeRequest_toPlanId_fkey" FOREIGN KEY ("toPlanId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

