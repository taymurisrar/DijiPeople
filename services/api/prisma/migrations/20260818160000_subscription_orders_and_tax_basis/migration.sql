-- CreateEnum
CREATE TYPE "SubscriptionOrderStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'PAID', 'ACTIVATED', 'ABANDONED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaxTreatment" AS ENUM ('NOT_DETERMINED', 'NOT_APPLICABLE', 'INCLUSIVE', 'EXCLUSIVE', 'REVERSE_CHARGE', 'EXEMPT');

-- CreateTable
CREATE TABLE "SubscriptionOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "leadId" TEXT,
    "tenantId" TEXT,
    "subscriptionId" TEXT,
    "planId" TEXT NOT NULL,
    "planPriceId" TEXT NOT NULL,
    "marketId" TEXT,
    "currency" TEXT NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "billingInterval" "BillingInterval" NOT NULL,
    "requestedSeats" INTEGER NOT NULL,
    "unitAmount" DECIMAL(12,2) NOT NULL,
    "subtotalAmount" DECIMAL(12,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "promotionId" TEXT,
    "taxTreatment" "TaxTreatment" NOT NULL DEFAULT 'NOT_DETERMINED',
    "taxJurisdiction" TEXT,
    "taxRatePercent" DECIMAL(6,3),
    "taxRegistrationRef" TEXT,
    "taxProviderRef" TEXT,
    "taxRateSnapshot" JSONB,
    "commercialSnapshot" JSONB,
    "status" "SubscriptionOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "stripeCustomerId" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "submissionHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "abandonedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionOrder_orderNumber_key" ON "SubscriptionOrder"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionOrder_stripeCheckoutSessionId_key" ON "SubscriptionOrder"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionOrder_submissionHash_key" ON "SubscriptionOrder"("submissionHash");

-- CreateIndex
CREATE INDEX "SubscriptionOrder_customerAccountId_status_idx" ON "SubscriptionOrder"("customerAccountId", "status");

-- CreateIndex
CREATE INDEX "SubscriptionOrder_status_expiresAt_idx" ON "SubscriptionOrder"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "SubscriptionOrder_tenantId_idx" ON "SubscriptionOrder"("tenantId");

-- CreateIndex
CREATE INDEX "SubscriptionOrder_planPriceId_idx" ON "SubscriptionOrder"("planPriceId");

-- CreateIndex
CREATE INDEX "SubscriptionOrder_leadId_idx" ON "SubscriptionOrder"("leadId");

-- AddForeignKey
ALTER TABLE "SubscriptionOrder" ADD CONSTRAINT "SubscriptionOrder_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionOrder" ADD CONSTRAINT "SubscriptionOrder_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionOrder" ADD CONSTRAINT "SubscriptionOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionOrder" ADD CONSTRAINT "SubscriptionOrder_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionOrder" ADD CONSTRAINT "SubscriptionOrder_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionOrder" ADD CONSTRAINT "SubscriptionOrder_planPriceId_fkey" FOREIGN KEY ("planPriceId") REFERENCES "PlanPrice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionOrder" ADD CONSTRAINT "SubscriptionOrder_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionOrder" ADD CONSTRAINT "SubscriptionOrder_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

