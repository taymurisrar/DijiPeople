ALTER TABLE "SupportCase"
  ADD COLUMN "category" TEXT,
  ADD COLUMN "subcategory" TEXT,
  ADD COLUMN "productArea" TEXT,
  ADD COLUMN "partnerId" TEXT,
  ADD COLUMN "subscriptionId" TEXT,
  ADD COLUMN "invoiceId" TEXT,
  ADD COLUMN "customerOnboardingId" TEXT,
  ADD COLUMN "contractId" TEXT,
  ADD COLUMN "parentCaseId" TEXT,
  ADD COLUMN "mergedIntoCaseId" TEXT,
  ADD COLUMN "escalationLevel" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "resolutionCategory" TEXT,
  ADD COLUMN "reopenedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "closureConfirmedAt" TIMESTAMP(3);

CREATE TABLE "SupportCaseAttachment" (
  "id" TEXT NOT NULL,
  "supportCaseId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "isCustomerSafe" BOOLEAN NOT NULL DEFAULT false,
  "uploadedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportCaseAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportCase_partnerId_status_idx" ON "SupportCase"("partnerId", "status");
CREATE INDEX "SupportCase_subscriptionId_idx" ON "SupportCase"("subscriptionId");
CREATE INDEX "SupportCase_invoiceId_idx" ON "SupportCase"("invoiceId");
CREATE INDEX "SupportCase_customerOnboardingId_idx" ON "SupportCase"("customerOnboardingId");
CREATE INDEX "SupportCase_contractId_idx" ON "SupportCase"("contractId");
CREATE INDEX "SupportCase_parentCaseId_idx" ON "SupportCase"("parentCaseId");
CREATE INDEX "SupportCase_mergedIntoCaseId_idx" ON "SupportCase"("mergedIntoCaseId");
CREATE INDEX "SupportCaseAttachment_supportCaseId_createdAt_idx" ON "SupportCaseAttachment"("supportCaseId", "createdAt");
CREATE INDEX "SupportCaseAttachment_sha256_idx" ON "SupportCaseAttachment"("sha256");

ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_customerOnboardingId_fkey" FOREIGN KEY ("customerOnboardingId") REFERENCES "CustomerOnboarding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_parentCaseId_fkey" FOREIGN KEY ("parentCaseId") REFERENCES "SupportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_mergedIntoCaseId_fkey" FOREIGN KEY ("mergedIntoCaseId") REFERENCES "SupportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportCaseAttachment" ADD CONSTRAINT "SupportCaseAttachment_supportCaseId_fkey" FOREIGN KEY ("supportCaseId") REFERENCES "SupportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
