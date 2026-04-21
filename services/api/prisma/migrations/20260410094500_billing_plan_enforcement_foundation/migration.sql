-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanFeature" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "planId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "PlanFeature_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Plan" ("id", "key", "name", "description", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('plan_starter', 'starter', 'Starter', 'Core people operations for growing teams.', true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plan_growth', 'growth', 'Growth', 'Adds delivery and talent workflows for scaling organizations.', true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plan_enterprise', 'enterprise', 'Enterprise', 'Full platform access with payroll and advanced operations modules.', true, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "PlanFeature" ("id", "planId", "featureKey", "isEnabled", "createdAt", "updatedAt")
VALUES
  ('pf_starter_employees', 'plan_starter', 'employees', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_starter_organization', 'plan_starter', 'organization', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_starter_leave', 'plan_starter', 'leave', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_starter_attendance', 'plan_starter', 'attendance', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_starter_documents', 'plan_starter', 'documents', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_starter_notifications', 'plan_starter', 'notifications', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_starter_branding', 'plan_starter', 'branding', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_growth_employees', 'plan_growth', 'employees', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_growth_organization', 'plan_growth', 'organization', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_growth_leave', 'plan_growth', 'leave', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_growth_attendance', 'plan_growth', 'attendance', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_growth_timesheets', 'plan_growth', 'timesheets', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_growth_projects', 'plan_growth', 'projects', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_growth_recruitment', 'plan_growth', 'recruitment', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_growth_onboarding', 'plan_growth', 'onboarding', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_growth_documents', 'plan_growth', 'documents', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_growth_notifications', 'plan_growth', 'notifications', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_growth_branding', 'plan_growth', 'branding', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_enterprise_employees', 'plan_enterprise', 'employees', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_enterprise_organization', 'plan_enterprise', 'organization', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_enterprise_leave', 'plan_enterprise', 'leave', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_enterprise_attendance', 'plan_enterprise', 'attendance', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_enterprise_timesheets', 'plan_enterprise', 'timesheets', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_enterprise_projects', 'plan_enterprise', 'projects', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_enterprise_recruitment', 'plan_enterprise', 'recruitment', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_enterprise_onboarding', 'plan_enterprise', 'onboarding', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_enterprise_documents', 'plan_enterprise', 'documents', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_enterprise_notifications', 'plan_enterprise', 'notifications', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_enterprise_branding', 'plan_enterprise', 'branding', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pf_enterprise_payroll', 'plan_enterprise', 'payroll', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

ALTER TABLE "Subscription" ADD COLUMN "planId" TEXT;

UPDATE "Subscription"
SET "planId" = CASE "plan"
  WHEN 'STARTER' THEN 'plan_starter'
  WHEN 'GROWTH' THEN 'plan_growth'
  WHEN 'ENTERPRISE' THEN 'plan_enterprise'
  ELSE 'plan_starter'
END;

ALTER TABLE "Subscription"
ALTER COLUMN "planId" SET NOT NULL;

-- DropIndex
DROP INDEX "Subscription_plan_status_idx";

-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "plan";

-- DropEnum
DROP TYPE "SubscriptionPlan";

-- CreateIndex
CREATE UNIQUE INDEX "Plan_key_key" ON "Plan"("key");

-- CreateIndex
CREATE INDEX "Plan_tenantId_idx" ON "Plan"("tenantId");

-- CreateIndex
CREATE INDEX "Plan_isActive_sortOrder_idx" ON "Plan"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "PlanFeature_tenantId_idx" ON "PlanFeature"("tenantId");

-- CreateIndex
CREATE INDEX "PlanFeature_planId_idx" ON "PlanFeature"("planId");

-- CreateIndex
CREATE INDEX "PlanFeature_featureKey_isEnabled_idx" ON "PlanFeature"("featureKey", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "PlanFeature_planId_featureKey_key" ON "PlanFeature"("planId", "featureKey");

-- CreateIndex
CREATE INDEX "Subscription_planId_status_idx" ON "Subscription"("planId", "status");

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanFeature" ADD CONSTRAINT "PlanFeature_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanFeature" ADD CONSTRAINT "PlanFeature_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
