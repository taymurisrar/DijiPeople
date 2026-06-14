-- CreateEnum
CREATE TYPE "DemoSeedBatchStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'DELETED');

-- AlterTable
ALTER TABLE "Tenant"
ADD COLUMN "isDemoData" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "demoBatchId" TEXT,
ADD COLUMN "seedSource" TEXT;

-- AlterTable
ALTER TABLE "CustomerAccount"
ADD COLUMN "isDemoData" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "demoBatchId" TEXT,
ADD COLUMN "seedSource" TEXT;

-- CreateTable
CREATE TABLE "DemoSeedBatch" (
    "id" TEXT NOT NULL,
    "status" "DemoSeedBatchStatus" NOT NULL DEFAULT 'RUNNING',
    "seedSource" TEXT NOT NULL DEFAULT 'seed-demo',
    "tenantId" TEXT,
    "customerAccountId" TEXT,
    "tenantSlug" TEXT,
    "summaryJson" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoSeedBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tenant_isDemoData_idx" ON "Tenant"("isDemoData");
CREATE INDEX "Tenant_demoBatchId_idx" ON "Tenant"("demoBatchId");
CREATE INDEX "CustomerAccount_isDemoData_idx" ON "CustomerAccount"("isDemoData");
CREATE INDEX "CustomerAccount_demoBatchId_idx" ON "CustomerAccount"("demoBatchId");
CREATE INDEX "DemoSeedBatch_status_startedAt_idx" ON "DemoSeedBatch"("status", "startedAt");
CREATE INDEX "DemoSeedBatch_tenantId_idx" ON "DemoSeedBatch"("tenantId");
CREATE INDEX "DemoSeedBatch_customerAccountId_idx" ON "DemoSeedBatch"("customerAccountId");
CREATE INDEX "DemoSeedBatch_tenantSlug_idx" ON "DemoSeedBatch"("tenantSlug");
