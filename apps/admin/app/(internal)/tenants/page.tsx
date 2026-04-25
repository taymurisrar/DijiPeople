import Link from "next/link";
import { ArrowRight, Building2, CheckCircle2, CircleDollarSign, Layers3 } from "lucide-react";
import { FeatureChip } from "@/app/_components/ui/feature-chip";
import { EmptyState } from "@/app/_components/ui/empty-state";
import { MetricCard } from "@/app/_components/ui/metric-card";
import { PageHeader } from "@/app/_components/ui/page-header";
import { SectionCard } from "@/app/_components/ui/section-card";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
import type { BillingCycleValue, SubscriptionStatusValue, TenantStatusValue } from "@/lib/domain";
import {
  formatBillingCycle,
  formatCurrency,
  formatDate,
  formatNumber,
  pluralize,
} from "@/lib/formatters";
import { apiRequestJson } from "@/lib/server-api";

type TenantSubscription = {
  plan: {
    id: string;
    key: string;
    name: string;
  };
  status: SubscriptionStatusValue | string;
  billingCycle: BillingCycleValue | string;
  finalPrice: number;
  currency: string;
};

type TenantSummary = {
  id: string;
  name: string;
  slug: string;
  status: TenantStatusValue | string;
  createdAt: string;
  updatedAt: string;
  customerAccount: {
    id: string;
    companyName: string;
    status: string;
  } | null;
  userCount: number;
  employeeCount: number;
  enabledFeatures: string[];
  subscription: TenantSubscription | null;
};

function getMonthlyValue(subscription: TenantSubscription) {
  if (String(subscription.status).toUpperCase() === "CANCELLED") {
    return 0;
  }

  const isAnnual = ["ANNUAL"].includes(String(subscription.billingCycle).toUpperCase());
  return isAnnual ? subscription.finalPrice / 12 : subscription.finalPrice;
}

export default async function TenantsPage() {
  const tenants = await apiRequestJson<TenantSummary[]>("/super-admin/tenants");

  const totalTenants = tenants.length;
  const activeTenants = tenants.filter(
    (tenant) => String(tenant.status).toUpperCase() === "ACTIVE",
  ).length;
  const onboardingTenants = tenants.filter(
    (tenant) => String(tenant.status).toUpperCase() === "ONBOARDING",
  ).length;
  const tenantsWithSubscriptions = tenants.filter((tenant) => tenant.subscription).length;
  const totalUsers = tenants.reduce((sum, tenant) => sum + tenant.userCount, 0);
  const totalEmployees = tenants.reduce((sum, tenant) => sum + tenant.employeeCount, 0);
  const monthlyRecurringRevenue = tenants.reduce((sum, tenant) => {
    if (!tenant.subscription) return sum;
    return sum + getMonthlyValue(tenant.subscription);
  }, 0);

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="SaaS tenants"
        title="Tenant workspace overview"
        description="Review tenant health, customer ownership, subscriptions, user adoption, and enabled feature footprint in one control plane."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total tenants"
          value={formatNumber(totalTenants)}
          description="Workspaces created on the platform."
          icon={Building2}
        />
        <MetricCard
          label="Active tenants"
          value={formatNumber(activeTenants)}
          description={`${pluralize(onboardingTenants, "tenant")} currently onboarding.`}
          icon={CheckCircle2}
        />
        <MetricCard
          label="Subscribed tenants"
          value={formatNumber(tenantsWithSubscriptions)}
          description="Tenants with configured subscription plans."
          icon={Layers3}
        />
        <MetricCard
          label="Estimated MRR"
          value={formatCurrency(monthlyRecurringRevenue, "USD")}
          description="Monthly value normalized from monthly and annual billing."
          icon={CircleDollarSign}
        />
      </section>

      <SectionCard
        title="Tenant directory"
        description={`${pluralize(totalTenants, "tenant")} found across the platform.`}
        actions={
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600">
            Users: {formatNumber(totalUsers)} | Employees: {formatNumber(totalEmployees)}
          </div>
        }
      >
        {tenants.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No tenants found"
            description="Tenant workspaces will appear here when customer onboarding creates or activates a tenant."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1220px] divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <th className="px-6 py-4">Tenant</th>
                  <th className="px-6 py-4">Customer</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Subscription</th>
                  <th className="px-6 py-4">Features</th>
                  <th className="px-6 py-4 text-right">Users</th>
                  <th className="px-6 py-4 text-right">Employees</th>
                  <th className="px-6 py-4">Created</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {tenants.map((tenant) => {
                  const featurePreview = tenant.enabledFeatures.slice(0, 3);
                  const extraFeatureCount = Math.max(tenant.enabledFeatures.length - featurePreview.length, 0);

                  return (
                    <tr key={tenant.id} className="align-top transition hover:bg-slate-50/70">
                      <td className="px-6 py-5">
                        <Link
                          href={`/tenants/${tenant.id}`}
                          className="font-semibold text-slate-950 transition hover:text-slate-700"
                        >
                          {tenant.name}
                        </Link>
                        <div className="mt-1 font-mono text-xs text-slate-500">{tenant.slug}</div>
                      </td>
                      <td className="px-6 py-5">
                        {tenant.customerAccount ? (
                          <>
                            <Link
                              href={`/customers/${tenant.customerAccount.id}`}
                              className="font-medium text-slate-950 transition hover:text-slate-700"
                            >
                              {tenant.customerAccount.companyName}
                            </Link>
                            <div className="mt-1 text-xs text-slate-500">{tenant.customerAccount.status}</div>
                          </>
                        ) : (
                          <span className="text-slate-500">No customer account</span>
                        )}
                      </td>
                      <td className="px-6 py-5">
                        <TenantStatusBadge value={tenant.status} />
                      </td>
                      <td className="px-6 py-5">
                        {tenant.subscription ? (
                          <>
                            <div className="font-medium text-slate-950">{tenant.subscription.plan.name}</div>
                            <div className="mt-2">
                              <TenantStatusBadge value={tenant.subscription.status} />
                            </div>
                            <div className="mt-2 text-xs text-slate-500">
                              {formatCurrency(tenant.subscription.finalPrice, tenant.subscription.currency)}{" "}
                              | {formatBillingCycle(tenant.subscription.billingCycle)}
                            </div>
                          </>
                        ) : (
                          <span className="text-slate-500">Not configured</span>
                        )}
                      </td>
                      <td className="px-6 py-5">
                        {featurePreview.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {featurePreview.map((feature) => (
                              <FeatureChip key={`${tenant.id}-${feature}`} value={feature} />
                            ))}
                            {extraFeatureCount > 0 ? (
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
                                +{extraFeatureCount} more
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-slate-500">No features</span>
                        )}
                      </td>
                      <td className="px-6 py-5 text-right font-medium text-slate-950">
                        {formatNumber(tenant.userCount)}
                      </td>
                      <td className="px-6 py-5 text-right font-medium text-slate-950">
                        {formatNumber(tenant.employeeCount)}
                      </td>
                      <td className="px-6 py-5 text-slate-500">{formatDate(tenant.createdAt)}</td>
                      <td className="px-6 py-5 text-right">
                        <Link
                          href={`/tenants/${tenant.id}`}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          Open
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </main>
  );
}
