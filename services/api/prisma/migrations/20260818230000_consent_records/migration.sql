-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('MARKETING_EMAIL', 'COOKIE_FUNCTIONAL', 'COOKIE_ANALYTICS', 'COOKIE_MARKETING');

-- CreateEnum
CREATE TYPE "ConsentState" AS ENUM ('GRANTED', 'DECLINED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "type" "ConsentType" NOT NULL,
    "state" "ConsentState" NOT NULL,
    "visitorId" TEXT,
    "subjectEmail" TEXT,
    "leadId" TEXT,
    "customerAccountId" TEXT,
    "tenantId" TEXT,
    "userId" TEXT,
    "definitionVersion" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentRecord_subjectEmail_type_createdAt_idx" ON "ConsentRecord"("subjectEmail", "type", "createdAt");

-- CreateIndex
CREATE INDEX "ConsentRecord_visitorId_type_idx" ON "ConsentRecord"("visitorId", "type");

-- CreateIndex
CREATE INDEX "ConsentRecord_leadId_idx" ON "ConsentRecord"("leadId");

-- CreateIndex
CREATE INDEX "ConsentRecord_customerAccountId_idx" ON "ConsentRecord"("customerAccountId");

-- CreateIndex
CREATE INDEX "ConsentRecord_tenantId_type_idx" ON "ConsentRecord"("tenantId", "type");

-- CreateIndex
CREATE INDEX "ConsentRecord_type_state_idx" ON "ConsentRecord"("type", "state");

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

