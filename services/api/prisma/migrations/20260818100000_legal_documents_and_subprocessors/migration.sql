-- CreateEnum
CREATE TYPE "LegalDocumentType" AS ENUM ('PRIVACY_POLICY', 'TERMS_OF_SERVICE', 'SUBSCRIPTION_BILLING_TERMS', 'REFUND_CANCELLATION_POLICY', 'COOKIE_POLICY', 'ACCEPTABLE_USE_POLICY', 'DATA_PROCESSING_ADDENDUM', 'DATA_RETENTION_POLICY', 'SECURITY_NOTICE', 'SUBPROCESSOR_LIST');

-- CreateEnum
CREATE TYPE "LegalDocumentVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SubprocessorStatus" AS ENUM ('ACTIVE', 'PLANNED', 'RETIRED');

-- CreateEnum
CREATE TYPE "SubprocessorCategory" AS ENUM ('INFRASTRUCTURE', 'DATABASE', 'EMAIL', 'PAYMENTS', 'MONITORING', 'STORAGE', 'SUPPORT', 'ANALYTICS');

-- CreateTable
CREATE TABLE "LegalDocument" (
    "id" TEXT NOT NULL,
    "type" "LegalDocumentType" NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "marketId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalDocumentVersion" (
    "id" TEXT NOT NULL,
    "legalDocumentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "LegalDocumentVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "contentMarkdown" TEXT NOT NULL,
    "changeSummary" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "publishedByPlatformUser" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalDocumentAcknowledgement" (
    "id" TEXT NOT NULL,
    "legalDocumentVersionId" TEXT NOT NULL,
    "leadId" TEXT,
    "customerAccountId" TEXT,
    "tenantId" TEXT,
    "userId" TEXT,
    "source" TEXT NOT NULL,
    "subjectEmail" TEXT,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "LegalDocumentAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subprocessor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "category" "SubprocessorCategory" NOT NULL,
    "processingRegion" TEXT,
    "websiteUrl" TEXT,
    "status" "SubprocessorStatus" NOT NULL DEFAULT 'ACTIVE',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subprocessor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocument_slug_key" ON "LegalDocument"("slug");

-- CreateIndex
CREATE INDEX "LegalDocument_type_isActive_idx" ON "LegalDocument"("type", "isActive");

-- CreateIndex
CREATE INDEX "LegalDocument_marketId_idx" ON "LegalDocument"("marketId");

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocument_type_marketId_key" ON "LegalDocument"("type", "marketId");

-- CreateIndex
CREATE INDEX "LegalDocumentVersion_legalDocumentId_status_effectiveFrom_idx" ON "LegalDocumentVersion"("legalDocumentId", "status", "effectiveFrom");

-- CreateIndex
CREATE INDEX "LegalDocumentVersion_status_effectiveFrom_idx" ON "LegalDocumentVersion"("status", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocumentVersion_legalDocumentId_version_key" ON "LegalDocumentVersion"("legalDocumentId", "version");

-- CreateIndex
CREATE INDEX "LegalDocumentAcknowledgement_legalDocumentVersionId_idx" ON "LegalDocumentAcknowledgement"("legalDocumentVersionId");

-- CreateIndex
CREATE INDEX "LegalDocumentAcknowledgement_leadId_idx" ON "LegalDocumentAcknowledgement"("leadId");

-- CreateIndex
CREATE INDEX "LegalDocumentAcknowledgement_customerAccountId_idx" ON "LegalDocumentAcknowledgement"("customerAccountId");

-- CreateIndex
CREATE INDEX "LegalDocumentAcknowledgement_tenantId_idx" ON "LegalDocumentAcknowledgement"("tenantId");

-- CreateIndex
CREATE INDEX "LegalDocumentAcknowledgement_userId_idx" ON "LegalDocumentAcknowledgement"("userId");

-- CreateIndex
CREATE INDEX "LegalDocumentAcknowledgement_subjectEmail_idx" ON "LegalDocumentAcknowledgement"("subjectEmail");

-- CreateIndex
CREATE INDEX "Subprocessor_status_category_idx" ON "Subprocessor"("status", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Subprocessor_name_key" ON "Subprocessor"("name");

-- AddForeignKey
ALTER TABLE "LegalDocument" ADD CONSTRAINT "LegalDocument_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalDocumentVersion" ADD CONSTRAINT "LegalDocumentVersion_legalDocumentId_fkey" FOREIGN KEY ("legalDocumentId") REFERENCES "LegalDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalDocumentAcknowledgement" ADD CONSTRAINT "LegalDocumentAcknowledgement_legalDocumentVersionId_fkey" FOREIGN KEY ("legalDocumentVersionId") REFERENCES "LegalDocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

