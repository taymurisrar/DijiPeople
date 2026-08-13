-- A lead now carries the contracting identity, signatory, billing contact and
-- confirmed commercial terms required to produce the customer agreement before
-- any customer record exists.
ALTER TABLE "Lead"
ADD COLUMN "legalCompanyName" TEXT,
ADD COLUMN "registrationNumber" TEXT,
ADD COLUMN "registeredAddress" TEXT,
ADD COLUMN "countryOfRegistration" TEXT,
ADD COLUMN "taxId" TEXT,
ADD COLUMN "authorizedSignerName" TEXT,
ADD COLUMN "authorizedSignerTitle" TEXT,
ADD COLUMN "authorizedSignerEmail" TEXT,
ADD COLUMN "billingContactName" TEXT,
ADD COLUMN "billingContactEmail" TEXT,
ADD COLUMN "agreedPlanId" TEXT,
ADD COLUMN "agreedSeats" INTEGER,
ADD COLUMN "agreedPrice" DECIMAL(12,2),
ADD COLUMN "billingCycle" "BillingCycle",
ADD COLUMN "subscriptionTerm" TEXT,
ADD COLUMN "paymentTerms" TEXT,
ADD COLUMN "proposedEffectiveDate" TIMESTAMP(3);

CREATE INDEX "Lead_agreedPlanId_idx" ON "Lead"("agreedPlanId");

ALTER TABLE "Lead"
ADD CONSTRAINT "Lead_agreedPlanId_fkey" FOREIGN KEY ("agreedPlanId")
REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seats agreed on the lead follow the customer into onboarding, which is what
-- tenant provisioning reads when it creates the subscription.
ALTER TABLE "CustomerOnboarding"
ADD COLUMN "agreedSeats" INTEGER;
