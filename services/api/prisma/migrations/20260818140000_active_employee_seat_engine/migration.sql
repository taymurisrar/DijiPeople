-- CreateEnum
CREATE TYPE "SeatUsagePeriodStatus" AS ENUM ('OPEN', 'CLOSED', 'RECONCILED');

-- CreateEnum
CREATE TYPE "SeatOverageStatus" AS ENUM ('OBSERVED', 'WARNED', 'REVIEW_REQUIRED', 'ACCEPTED', 'RESOLVED');

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "scheduledSeats" INTEGER,
ADD COLUMN     "scheduledSeatsEffectiveAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SeatUsageSample" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "sampledOn" DATE NOT NULL,
    "activeEmployeeCount" INTEGER NOT NULL,
    "purchasedCapacity" INTEGER NOT NULL,
    "overage" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeatUsageSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatUsagePeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "purchasedCapacity" INTEGER NOT NULL,
    "peakActiveEmployees" INTEGER NOT NULL DEFAULT 0,
    "peakObservedOn" TIMESTAMP(3),
    "endingActiveEmployees" INTEGER NOT NULL DEFAULT 0,
    "peakOverage" INTEGER NOT NULL DEFAULT 0,
    "billedQuantity" INTEGER,
    "status" "SeatUsagePeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "reconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeatUsagePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatOverageEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "purchasedCapacity" INTEGER NOT NULL,
    "activeEmployeeCount" INTEGER NOT NULL,
    "peakActiveEmployees" INTEGER NOT NULL,
    "peakOverage" INTEGER NOT NULL,
    "peakOveragePercent" INTEGER NOT NULL,
    "status" "SeatOverageStatus" NOT NULL DEFAULT 'OBSERVED',
    "reviewedByPlatformUser" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeatOverageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeatUsageSample_tenantId_sampledOn_idx" ON "SeatUsageSample"("tenantId", "sampledOn");

-- CreateIndex
CREATE INDEX "SeatUsageSample_subscriptionId_sampledOn_idx" ON "SeatUsageSample"("subscriptionId", "sampledOn");

-- CreateIndex
CREATE INDEX "SeatUsageSample_overage_idx" ON "SeatUsageSample"("overage");

-- CreateIndex
CREATE UNIQUE INDEX "SeatUsageSample_subscriptionId_sampledOn_key" ON "SeatUsageSample"("subscriptionId", "sampledOn");

-- CreateIndex
CREATE INDEX "SeatUsagePeriod_tenantId_periodStart_idx" ON "SeatUsagePeriod"("tenantId", "periodStart");

-- CreateIndex
CREATE INDEX "SeatUsagePeriod_status_periodEnd_idx" ON "SeatUsagePeriod"("status", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "SeatUsagePeriod_subscriptionId_periodStart_key" ON "SeatUsagePeriod"("subscriptionId", "periodStart");

-- CreateIndex
CREATE INDEX "SeatOverageEvent_tenantId_detectedAt_idx" ON "SeatOverageEvent"("tenantId", "detectedAt");

-- CreateIndex
CREATE INDEX "SeatOverageEvent_status_detectedAt_idx" ON "SeatOverageEvent"("status", "detectedAt");

-- CreateIndex
CREATE INDEX "SeatOverageEvent_subscriptionId_resolvedAt_idx" ON "SeatOverageEvent"("subscriptionId", "resolvedAt");

-- AddForeignKey
ALTER TABLE "SeatUsageSample" ADD CONSTRAINT "SeatUsageSample_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatUsageSample" ADD CONSTRAINT "SeatUsageSample_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatUsagePeriod" ADD CONSTRAINT "SeatUsagePeriod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatUsagePeriod" ADD CONSTRAINT "SeatUsagePeriod_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatOverageEvent" ADD CONSTRAINT "SeatOverageEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatOverageEvent" ADD CONSTRAINT "SeatOverageEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

