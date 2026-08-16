-- Lead and Partner acquisition context — Wave 3.
--
-- Entirely additive. No column is dropped, no row is read, written or deleted,
-- and the only relaxation is dropping NOT NULL from two Lead columns.
--
-- Why industry and companySize become nullable:
--   The public contact form does not ask for either, but both were required, so
--   it invented values to satisfy the columns — "General HR operations" (which
--   was actually the visitor's interest area) and "Unknown". That is BUG-0021.
--   Making them optional is what allows the form to stop fabricating. Existing
--   rows keep whatever they hold, including the fabricated values, because
--   rewriting them would be inventing history in the other direction.
--
-- Why the new columns are nullable rather than defaulted:
--   Historical leads predate inquiry intent and attribution. NULL means "not
--   captured", which is true. A default of GENERAL would assert that thousands
--   of past visitors chose "General inquiry", which is not.
--
--   marketingConsent is the one exception and defaults to false — the honest
--   value for a record where nobody was ever asked. It must never be
--   backfilled true.

-- CreateEnum
CREATE TYPE "LeadInquiryIntent" AS ENUM ('REQUEST_DEMO', 'PRICING', 'PRODUCT_FEATURES', 'IMPLEMENTATION', 'PAYROLL', 'ATTENDANCE_INTEGRATION', 'DATA_MIGRATION', 'INTEGRATION', 'PARTNERSHIP', 'EXISTING_CUSTOMER_SUPPORT', 'GENERAL', 'OTHER');

-- CreateEnum
CREATE TYPE "PartnershipModel" AS ENUM ('REFERRAL', 'RESELLER', 'IMPLEMENTATION', 'TECHNOLOGY', 'STRATEGIC', 'CONSULTANT', 'OTHER');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "correlationId" TEXT,
ADD COLUMN     "inquiryIntent" "LeadInquiryIntent",
ADD COLUMN     "interestAreas" TEXT[],
ADD COLUMN     "marketCode" TEXT,
ADD COLUMN     "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marketingConsentAt" TIMESTAMP(3),
ADD COLUMN     "marketingConsentWithdrawnAt" TIMESTAMP(3),
ADD COLUMN     "privacyNoticeAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "privacyNoticeVersion" TEXT,
ADD COLUMN     "referrerUrl" TEXT,
ADD COLUMN     "sourcePage" TEXT,
ADD COLUMN     "submissionHash" TEXT,
ADD COLUMN     "utmCampaign" TEXT,
ADD COLUMN     "utmContent" TEXT,
ADD COLUMN     "utmMedium" TEXT,
ADD COLUMN     "utmSource" TEXT,
ADD COLUMN     "utmTerm" TEXT,
ALTER COLUMN "industry" DROP NOT NULL,
ALTER COLUMN "companySize" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PartnerInquiry" ADD COLUMN     "correlationId" TEXT,
ADD COLUMN     "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marketingConsentAt" TIMESTAMP(3),
ADD COLUMN     "marketingConsentWithdrawnAt" TIMESTAMP(3),
ADD COLUMN     "partnershipModel" "PartnershipModel",
ADD COLUMN     "privacyNoticeVersion" TEXT,
ADD COLUMN     "referrerUrl" TEXT,
ADD COLUMN     "sourcePage" TEXT,
ADD COLUMN     "utmCampaign" TEXT,
ADD COLUMN     "utmMedium" TEXT,
ADD COLUMN     "utmSource" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Lead_submissionHash_key" ON "Lead"("submissionHash");

-- CreateIndex
CREATE INDEX "Lead_inquiryIntent_createdAt_idx" ON "Lead"("inquiryIntent", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_marketCode_createdAt_idx" ON "Lead"("marketCode", "createdAt");

