-- Extend subscription statuses for Stripe lifecycle states.
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'CANCELED';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'UNPAID';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'INCOMPLETE';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PAUSED';

-- Extend invoice statuses for Stripe invoice lifecycle states.
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_FAILED';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'VOIDED';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'UNCOLLECTIBLE';

-- Extend Payment for Stripe payment-intent idempotency and safe failure details.
ALTER TABLE "Payment"
ADD COLUMN "stripeChargeId" TEXT,
ADD COLUMN "stripeFailureCode" TEXT,
ADD COLUMN "stripeFailureMessage" TEXT;

-- Stripe payment intent IDs are idempotency keys for Stripe-originated payments.
CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key"
ON "Payment"("stripePaymentIntentId")
WHERE "stripePaymentIntentId" IS NOT NULL;

CREATE INDEX "Payment_stripePaymentIntentId_idx" ON "Payment"("stripePaymentIntentId");
CREATE INDEX "Payment_stripeChargeId_idx" ON "Payment"("stripeChargeId");
