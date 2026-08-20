-- The workspace slug a self-service buyer asked for, held from the moment they
-- ask rather than from the moment provisioning runs.
--
-- Tenant.slug is already unique, but no Tenant exists until payment clears, so
-- without this hold two buyers can both be told "maseer is available", both pay,
-- and the collision is only discovered by the second one's provisioning — after
-- the money moved. The reservation has to outlive the check that promised it.
--
-- Nullable-unique on purpose, exactly like SubscriptionOrder.submissionHash:
-- PostgreSQL treats NULLs as distinct, so releasing the value on abandonment
-- returns the name to circulation instead of making it unclaimable forever
-- because somebody once closed a tab.

-- AlterTable
ALTER TABLE "SubscriptionOrder" ADD COLUMN     "requestedSlug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionOrder_requestedSlug_key" ON "SubscriptionOrder"("requestedSlug");
