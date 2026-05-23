-- CreateEnum
CREATE TYPE "WebhookProcessingStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED');

-- AlterTable: Plan
ALTER TABLE "Plan"
ADD COLUMN "stripeProductId" TEXT,
ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "metadataJson" JSONB;

-- CreateTable: PlanPrice
CREATE TABLE "PlanPrice" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "currency" TEXT NOT NULL,
    "unitAmount" DECIMAL(12,2) NOT NULL,
    "stripePriceId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanPrice_pkey" PRIMARY KEY ("id")
);

-- Backfill PlanPrice rows from existing Plan prices.
INSERT INTO "PlanPrice" (
    "id",
    "planId",
    "billingCycle",
    "currency",
    "unitAmount",
    "isActive",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    "id",
    'MONTHLY'::"BillingCycle",
    UPPER(COALESCE(NULLIF("currency", ''), 'USD')),
    "monthlyBasePrice",
    "isActive",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Plan"
ON CONFLICT DO NOTHING;

INSERT INTO "PlanPrice" (
    "id",
    "planId",
    "billingCycle",
    "currency",
    "unitAmount",
    "isActive",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    "id",
    'ANNUAL'::"BillingCycle",
    UPPER(COALESCE(NULLIF("currency", ''), 'USD')),
    "annualBasePrice",
    "isActive",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Plan"
ON CONFLICT DO NOTHING;

-- AlterTable: Subscription
ALTER TABLE "Subscription"
ADD COLUMN "planPriceId" TEXT,
ADD COLUMN "stripeCustomerId" TEXT,
ADD COLUMN "stripeCheckoutSessionId" TEXT,
ADD COLUMN "stripeLatestInvoiceId" TEXT,
ADD COLUMN "stripeStatus" TEXT,
ADD COLUMN "currentPeriodStart" TIMESTAMP(3),
ADD COLUMN "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canceledAt" TIMESTAMP(3),
ADD COLUMN "trialStart" TIMESTAMP(3),
ADD COLUMN "trialEnd" TIMESTAMP(3);

-- Backfill Subscription.planPriceId to the matching plan/cycle/currency row.
UPDATE "Subscription" AS subscription
SET "planPriceId" = price."id"
FROM "PlanPrice" AS price
WHERE price."planId" = subscription."planId"
  AND price."billingCycle" = subscription."billingCycle"
  AND UPPER(price."currency") = UPPER(subscription."currency")
  AND subscription."planPriceId" IS NULL;

-- AlterTable: Invoice
ALTER TABLE "Invoice"
ADD COLUMN "stripeHostedInvoiceUrl" TEXT,
ADD COLUMN "stripeInvoicePdfUrl" TEXT,
ADD COLUMN "stripePaymentIntentId" TEXT,
ADD COLUMN "subtotal" DECIMAL(12,2),
ADD COLUMN "tax" DECIMAL(12,2),
ADD COLUMN "total" DECIMAL(12,2),
ADD COLUMN "amountPaid" DECIMAL(12,2),
ADD COLUMN "amountDue" DECIMAL(12,2),
ADD COLUMN "periodStart" TIMESTAMP(3),
ADD COLUMN "periodEnd" TIMESTAMP(3),
ADD COLUMN "paidAt" TIMESTAMP(3),
ADD COLUMN "voidedAt" TIMESTAMP(3),
ADD COLUMN "metadataJson" JSONB;

-- CreateTable: StripeWebhookEvent
CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "apiVersion" TEXT,
    "livemode" BOOLEAN NOT NULL,
    "pendingWebhooks" INTEGER NOT NULL,
    "processingStatus" "WebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- Indexes: Plan
CREATE UNIQUE INDEX "Plan_stripeProductId_key" ON "Plan"("stripeProductId");
CREATE INDEX "Plan_stripeProductId_idx" ON "Plan"("stripeProductId");

-- Indexes and foreign keys: PlanPrice
CREATE UNIQUE INDEX "PlanPrice_stripePriceId_key" ON "PlanPrice"("stripePriceId");
CREATE UNIQUE INDEX "PlanPrice_planId_billingCycle_currency_key" ON "PlanPrice"("planId", "billingCycle", "currency");
CREATE INDEX "PlanPrice_planId_idx" ON "PlanPrice"("planId");
CREATE INDEX "PlanPrice_billingCycle_currency_isActive_idx" ON "PlanPrice"("billingCycle", "currency", "isActive");
CREATE INDEX "PlanPrice_stripePriceId_idx" ON "PlanPrice"("stripePriceId");

ALTER TABLE "PlanPrice"
ADD CONSTRAINT "PlanPrice_planId_fkey"
FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes and foreign keys: Subscription
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");
CREATE INDEX "Subscription_planPriceId_idx" ON "Subscription"("planPriceId");
CREATE INDEX "Subscription_stripeCustomerId_idx" ON "Subscription"("stripeCustomerId");
CREATE INDEX "Subscription_stripeSubscriptionId_idx" ON "Subscription"("stripeSubscriptionId");
CREATE INDEX "Subscription_stripeCheckoutSessionId_idx" ON "Subscription"("stripeCheckoutSessionId");

ALTER TABLE "Subscription"
ADD CONSTRAINT "Subscription_planPriceId_fkey"
FOREIGN KEY ("planPriceId") REFERENCES "PlanPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes: Invoice
CREATE UNIQUE INDEX "Invoice_stripeInvoiceId_key" ON "Invoice"("stripeInvoiceId");
CREATE INDEX "Invoice_stripeInvoiceId_idx" ON "Invoice"("stripeInvoiceId");
CREATE INDEX "Invoice_stripePaymentIntentId_idx" ON "Invoice"("stripePaymentIntentId");

-- Indexes: StripeWebhookEvent
CREATE UNIQUE INDEX "StripeWebhookEvent_stripeEventId_key" ON "StripeWebhookEvent"("stripeEventId");
CREATE INDEX "StripeWebhookEvent_type_idx" ON "StripeWebhookEvent"("type");
CREATE INDEX "StripeWebhookEvent_processingStatus_idx" ON "StripeWebhookEvent"("processingStatus");
CREATE INDEX "StripeWebhookEvent_createdAt_idx" ON "StripeWebhookEvent"("createdAt");
