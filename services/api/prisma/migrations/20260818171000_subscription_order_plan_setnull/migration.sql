-- DropForeignKey
ALTER TABLE "SubscriptionOrder" DROP CONSTRAINT "SubscriptionOrder_planId_fkey";

-- DropForeignKey
ALTER TABLE "SubscriptionOrder" DROP CONSTRAINT "SubscriptionOrder_planPriceId_fkey";

-- AlterTable
ALTER TABLE "SubscriptionOrder" ALTER COLUMN "planId" DROP NOT NULL,
ALTER COLUMN "planPriceId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "SubscriptionOrder" ADD CONSTRAINT "SubscriptionOrder_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionOrder" ADD CONSTRAINT "SubscriptionOrder_planPriceId_fkey" FOREIGN KEY ("planPriceId") REFERENCES "PlanPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

