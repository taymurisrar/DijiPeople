CREATE TYPE "PromotionDuration" AS ENUM ('ONCE', 'REPEATING', 'FOREVER');
CREATE TYPE "PromotionScope" AS ENUM ('GLOBAL', 'PLAN', 'PRICE', 'CUSTOMER', 'SUBSCRIPTION');

ALTER TABLE "PlanPrice" ADD COLUMN "effectiveTo" TIMESTAMP(3),
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "supersedesPriceId" TEXT;
CREATE INDEX "PlanPrice_supersedesPriceId_idx" ON "PlanPrice"("supersedesPriceId");
ALTER TABLE "PlanPrice" ADD CONSTRAINT "PlanPrice_supersedesPriceId_fkey" FOREIGN KEY ("supersedesPriceId") REFERENCES "PlanPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "discountType" "DiscountType" NOT NULL,
    "percentOff" DECIMAL(5,2),
    "amountOff" DECIMAL(12,2),
    "currency" TEXT,
    "duration" "PromotionDuration" NOT NULL,
    "durationMonths" INTEGER,
    "scope" "PromotionScope" NOT NULL DEFAULT 'GLOBAL',
    "planId" TEXT,
    "planPriceId" TEXT,
    "customerAccountId" TEXT,
    "subscriptionId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemBy" TIMESTAMP(3),
    "maximumRedemptions" INTEGER,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "stripeCouponId" TEXT,
    "stripePromotionCodeId" TEXT,
    "stripeEnvironment" "StripeEnvironment",
    "stripeSyncStatus" "StripeSyncStatus" NOT NULL DEFAULT 'NOT_SYNCED',
    "stripeSyncError" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesPromotionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Promotion_code_isActive_idx" ON "Promotion"("code", "isActive");
CREATE UNIQUE INDEX "Promotion_stripeCouponId_key" ON "Promotion"("stripeCouponId");
CREATE UNIQUE INDEX "Promotion_stripePromotionCodeId_key" ON "Promotion"("stripePromotionCodeId");
CREATE INDEX "Promotion_isActive_startsAt_idx" ON "Promotion"("isActive", "startsAt");
CREATE INDEX "Promotion_scope_planId_planPriceId_idx" ON "Promotion"("scope", "planId", "planPriceId");
CREATE INDEX "Promotion_customerAccountId_idx" ON "Promotion"("customerAccountId");
CREATE INDEX "Promotion_subscriptionId_idx" ON "Promotion"("subscriptionId");
CREATE INDEX "Promotion_supersedesPromotionId_idx" ON "Promotion"("supersedesPromotionId");
CREATE INDEX "Promotion_stripeSyncStatus_stripeEnvironment_idx" ON "Promotion"("stripeSyncStatus", "stripeEnvironment");

ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_planPriceId_fkey" FOREIGN KEY ("planPriceId") REFERENCES "PlanPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_supersedesPromotionId_fkey" FOREIGN KEY ("supersedesPromotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "SubscriptionPromotion" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "stripeDiscountId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    CONSTRAINT "SubscriptionPromotion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SubscriptionPromotion_subscriptionId_promotionId_key" ON "SubscriptionPromotion"("subscriptionId", "promotionId");
CREATE INDEX "SubscriptionPromotion_subscriptionId_isActive_idx" ON "SubscriptionPromotion"("subscriptionId", "isActive");
CREATE INDEX "SubscriptionPromotion_promotionId_idx" ON "SubscriptionPromotion"("promotionId");
ALTER TABLE "SubscriptionPromotion" ADD CONSTRAINT "SubscriptionPromotion_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionPromotion" ADD CONSTRAINT "SubscriptionPromotion_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_discount_value_check" CHECK (
  ("discountType" = 'PERCENTAGE' AND "percentOff" > 0 AND "percentOff" <= 100 AND "amountOff" IS NULL AND "currency" IS NULL)
  OR
  ("discountType" = 'FLAT' AND "amountOff" > 0 AND "currency" IS NOT NULL AND "percentOff" IS NULL)
);
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_duration_check" CHECK (
  ("duration" = 'REPEATING' AND "durationMonths" > 0)
  OR
  ("duration" <> 'REPEATING' AND "durationMonths" IS NULL)
);
