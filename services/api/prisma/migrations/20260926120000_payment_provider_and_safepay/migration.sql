-- SESSION-0108. Multi-provider billing: Safepay for PKR alongside Stripe.
-- Additive only — one enum, nullable columns, one table, indexes. No existing
-- column is changed and no row is removed.
--   * PaymentProvider: who executes a payment. DijiPeople owns the subscription
--     either way.
--   * Subscription/Payment/SubscriptionOrder.paymentProvider: nullable. NULL
--     means no provider bills the row (manual, sales-assisted, demo), which is
--     what every non-Stripe row was before this.
--   * Subscription.gracePeriodEndsAt: set only while a DijiPeople-billed renewal
--     is unpaid.
--   * PaymentProviderEvent: webhook idempotency for every provider but Stripe,
--     which keeps StripeWebhookEvent.
-- The backfill at the end is deterministic: only rows Stripe already created
-- are marked STRIPE, identified by the Stripe ids they carry.

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'SAFEPAY');

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "gracePeriodEndsAt" TIMESTAMP(3),
ADD COLUMN     "paymentProvider" "PaymentProvider";

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "failureCode" TEXT,
ADD COLUMN     "failureMessage" TEXT,
ADD COLUMN     "paymentProvider" "PaymentProvider",
ADD COLUMN     "providerCheckoutUrl" TEXT,
ADD COLUMN     "providerPaymentId" TEXT,
ADD COLUMN     "providerReference" TEXT;

-- AlterTable
ALTER TABLE "SubscriptionOrder" ADD COLUMN     "paymentProvider" "PaymentProvider",
ADD COLUMN     "providerCheckoutUrl" TEXT,
ADD COLUMN     "providerPaymentId" TEXT;

-- CreateTable
CREATE TABLE "PaymentProviderEvent" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "processingStatus" "WebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentProviderEvent_provider_processingStatus_idx" ON "PaymentProviderEvent"("provider", "processingStatus");

-- CreateIndex
CREATE INDEX "PaymentProviderEvent_providerPaymentId_idx" ON "PaymentProviderEvent"("providerPaymentId");

-- CreateIndex
CREATE INDEX "PaymentProviderEvent_createdAt_idx" ON "PaymentProviderEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProviderEvent_provider_externalEventId_key" ON "PaymentProviderEvent"("provider", "externalEventId");

-- CreateIndex
CREATE INDEX "Subscription_paymentProvider_status_currentPeriodEnd_idx" ON "Subscription"("paymentProvider", "status", "currentPeriodEnd");

-- CreateIndex
CREATE INDEX "Payment_paymentProvider_status_createdAt_idx" ON "Payment"("paymentProvider", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_paymentProvider_providerPaymentId_key" ON "Payment"("paymentProvider", "providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionOrder_providerPaymentId_key" ON "SubscriptionOrder"("providerPaymentId");

-- Backfill: rows Stripe created, identified by the Stripe ids they already hold.
UPDATE "Subscription" SET "paymentProvider" = 'STRIPE'
 WHERE "stripeSubscriptionId" IS NOT NULL;

UPDATE "Payment" SET "paymentProvider" = 'STRIPE'
 WHERE "stripePaymentIntentId" IS NOT NULL OR "stripeChargeId" IS NOT NULL;

UPDATE "SubscriptionOrder" SET "paymentProvider" = 'STRIPE'
 WHERE "stripeCheckoutSessionId" IS NOT NULL;
