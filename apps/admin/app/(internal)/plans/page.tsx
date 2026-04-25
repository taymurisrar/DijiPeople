import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleDollarSign, Layers3, Plus, ShieldCheck } from "lucide-react";
import { FeatureChip } from "@/app/_components/ui/feature-chip";
import { EmptyState } from "@/app/_components/ui/empty-state";
import { MetricCard } from "@/app/_components/ui/metric-card";
import { PageHeader } from "@/app/_components/ui/page-header";
import { SectionCard } from "@/app/_components/ui/section-card";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { apiRequestJson } from "@/lib/server-api";

type PlanRecord = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isActive: boolean;
  monthlyBasePrice: number;
  annualBasePrice: number;
  currency: string;
  sortOrder: number;
  subscriptionCount: number;
  features: string[];
};

function formatAnnualSavings(plan: PlanRecord): string {
  const monthlyAnnualized = plan.monthlyBasePrice * 12;
  if (monthlyAnnualized <= 0 || plan.annualBasePrice <= 0) {
    return "Annual discount not configured";
  }

  const saving = monthlyAnnualized - plan.annualBasePrice;
  if (saving <= 0) {
    return "No annual discount";
  }

  const savingPercentage = Math.round((saving / monthlyAnnualized) * 100);
  return `${savingPercentage}% annual saving`;
}

export default async function PlansPage() {
  const plans = await apiRequestJson<PlanRecord[]>("/super-admin/plans");
  const sortedPlans = [...plans].sort((a, b) =>
    a.sortOrder === b.sortOrder ? a.name.localeCompare(b.name) : a.sortOrder - b.sortOrder,
  );

  const activePlans = plans.filter((plan) => plan.isActive).length;
  const inactivePlans = plans.length - activePlans;
  const totalSubscriptions = plans.reduce((sum, plan) => sum + plan.subscriptionCount, 0);
  const estimatedMonthlyPlanValue = plans
    .filter((plan) => plan.isActive)
    .reduce((sum, plan) => sum + plan.monthlyBasePrice, 0);

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Billing structure"
        title="Plans and entitlements"
        description="Configure commercial packages, pricing posture, and module entitlements that control tenant workspace capabilities."
        actions={
          <Link
            href="/plans/new"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            New plan
          </Link>
        }
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total plans"
          value={formatNumber(plans.length)}
          description={`${formatNumber(activePlans)} active | ${formatNumber(inactivePlans)} inactive`}
          icon={Layers3}
        />
        <MetricCard
          label="Active plans"
          value={formatNumber(activePlans)}
          description="Available for subscriptions"
          icon={CheckCircle2}
        />
        <MetricCard
          label="Subscriptions"
          value={formatNumber(totalSubscriptions)}
          description="Mapped tenant subscriptions"
          icon={ShieldCheck}
        />
        <MetricCard
          label="Monthly plan value"
          value={formatCurrency(estimatedMonthlyPlanValue, "USD")}
          description="Base monthly value of active plans"
          icon={CircleDollarSign}
        />
      </section>

      <SectionCard
        title="Plan catalog"
        description={`${formatNumber(plans.length)} commercial package${plans.length === 1 ? "" : "s"} configured for tenant subscriptions.`}
        actions={
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600">
            Sorted by display order
          </div>
        }
      >
        {sortedPlans.length === 0 ? (
          <EmptyState
            title="No plans configured"
            description="Create your first SaaS plan to define pricing, billing cycles, and feature entitlements."
            action={
              <Link
                href="/plans/new"
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                Create plan
              </Link>
            }
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {sortedPlans.map((plan) => {
              const annualSavingLabel = formatAnnualSavings(plan);
              const visibleFeatures = plan.features.slice(0, 5);
              const extraFeatureCount = Math.max(plan.features.length - 5, 0);

              return (
                <article
                  key={plan.id}
                  className="grid gap-5 px-6 py-5 transition hover:bg-slate-50/70 xl:grid-cols-[minmax(280px,1.2fr)_140px_220px_minmax(260px,1fr)_110px_90px] xl:items-start"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Link
                        href={`/plans/${plan.id}`}
                        className="text-base font-semibold text-slate-950 transition hover:text-slate-700"
                      >
                        {plan.name}
                      </Link>
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-slate-500">
                        {plan.key}
                      </span>
                    </div>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                      {plan.description ?? "No description provided."}
                    </p>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 xl:hidden">
                      Status
                    </p>
                    <TenantStatusBadge value={plan.isActive ? "ACTIVE" : "SUSPENDED"} />
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 xl:hidden">
                      Pricing
                    </p>
                    <p className="font-semibold text-slate-950">
                      {formatCurrency(plan.monthlyBasePrice, plan.currency)}
                      <span className="font-medium text-slate-500"> / month</span>
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {formatCurrency(plan.annualBasePrice, plan.currency)} / year
                    </p>
                    <p className="mt-2 text-xs font-medium text-emerald-700">{annualSavingLabel}</p>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 xl:hidden">
                      Features
                    </p>
                    {plan.features.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {visibleFeatures.map((feature) => (
                          <FeatureChip key={`${plan.id}-${feature}`} value={feature} />
                        ))}
                        {extraFeatureCount > 0 ? (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
                            +{extraFeatureCount} more
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-sm text-slate-500">No features mapped</span>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 xl:hidden">
                      Subscriptions
                    </p>
                    <p className="text-sm font-semibold text-slate-950 xl:text-right">
                      {formatNumber(plan.subscriptionCount)}
                    </p>
                  </div>

                  <div className="xl:text-right">
                    <Link
                      href={`/plans/${plan.id}`}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      Open
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>
    </main>
  );
}
