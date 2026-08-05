import {
  BadgeDollarSign,
  CalendarDays,
  CircleDollarSign,
  Layers3,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { PlanForm } from "@/app/_components/plan-form";
import {
  PlanPriceManager,
  type PlanPriceRecord,
} from "@/app/_components/plan-price-manager";
import { PlanDetailActionBar } from "@/app/_components/plans/plan-detail-action-bar";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
import { apiRequestJson } from "@/lib/server-api";
import { RuntimeRecordRoute } from "@/app/_components/runtime/runtime-record-route";

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
  prices: PlanPriceRecord[];
  features: string[];
};

type FeatureAvailability = {
  key: string;
  label: string;
  description: string;
}[];

export default async function PlanDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ workspace?: string }>;
}) {
  const { planId } = await params;
  const { workspace } = await searchParams;
  if (workspace !== "legacy-commerce") {
    return <RuntimeRecordRoute moduleKey="plans" recordId={planId} />;
  }

  const [plan, featureCatalog] = await Promise.all([
    apiRequestJson<PlanRecord>(`/super-admin/plans/${planId}`),
    apiRequestJson<FeatureAvailability>("/super-admin/feature-catalog").catch(
      () => [],
    ),
  ]);

  const monthlyAnnualized = plan.monthlyBasePrice * 12;
  const annualSaving = Math.max(monthlyAnnualized - plan.annualBasePrice, 0);
  const annualSavingPercent =
    monthlyAnnualized > 0
      ? Math.round((annualSaving / monthlyAnnualized) * 100)
      : 0;

  const summaryCards = [
    {
      label: "Monthly price",
      value: formatCurrency(plan.monthlyBasePrice, plan.currency),
      description: "Base recurring monthly charge.",
      icon: CircleDollarSign,
    },
    {
      label: "Annual price",
      value: formatCurrency(plan.annualBasePrice, plan.currency),
      description:
        annualSaving > 0
          ? `${annualSavingPercent}% saving versus monthly billing.`
          : "No annual discount configured.",
      icon: CalendarDays,
    },
    {
      label: "Subscriptions",
      value: String(plan.subscriptionCount),
      description: "Tenants currently assigned to this plan.",
      icon: UsersRound,
    },
    {
      label: "Entitlements",
      value: String(plan.features.length),
      description: "Enabled product capabilities.",
      icon: ShieldCheck,
    },
  ];

  return (
    <main className="space-y-6">
      <PlanDetailActionBar planId={plan.id} />

      <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-8">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Plan detail
              </p>

              <TenantStatusBadge
                value={plan.isActive ? "Active" : "Suspended"}
              />
            </div>

            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
              {plan.name}
            </h1>

            <p className="mt-2 font-mono text-xs uppercase tracking-[0.2em] text-slate-500">
              {plan.key}
            </p>

            <p className="mt-5 max-w-3xl text-sm leading-6 text-slate-600">
              {plan.description ?? "No description provided yet."}
            </p>

            {plan.subscriptionCount > 0 ? (
              <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
                <p className="font-semibold">Controlled billing change</p>
                <p className="mt-1 leading-6">
                  This plan is currently used by {plan.subscriptionCount} tenant
                  {plan.subscriptionCount === 1 ? "" : "s"}. Pricing and
                  entitlement changes may affect active subscriptions.
                </p>
              </div>
            ) : null}
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Pricing posture
            </p>

            <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              {formatCurrency(plan.monthlyBasePrice, plan.currency)}
              <span className="text-sm font-medium text-slate-500">
                {" "}
                / month
              </span>
            </p>

            <p className="mt-2 text-sm text-slate-600">
              {formatCurrency(plan.annualBasePrice, plan.currency)} / year
            </p>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              {annualSaving > 0 ? (
                <>
                  <span className="font-semibold text-slate-950">
                    {formatCurrency(annualSaving, plan.currency)}
                  </span>{" "}
                  annual saving for customers.
                </>
              ) : (
                "Annual billing does not currently offer a saving."
              )}
            </div>

            {annualSavingPercent > 0 ? (
              <div className="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                {annualSavingPercent}% annual discount
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;

          return (
            <div
              key={card.label}
              className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="rounded-2xl bg-slate-50 p-3 text-slate-700 ring-1 ring-slate-200">
                <Icon className="h-5 w-5" />
              </div>

              <p className="mt-5 text-sm font-medium text-slate-500">
                {card.label}
              </p>

              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                {card.value}
              </p>

              <p className="mt-3 text-sm leading-6 text-slate-600">
                {card.description}
              </p>
            </div>
          );
        })}
      </section>

      <section className="rounded-[32px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5 lg:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Layers3 className="h-5 w-5 text-slate-500" />
                <h2 className="text-xl font-semibold text-slate-950">
                  Plan configuration
                </h2>
              </div>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Manage pricing, display order, availability, and entitlement
                mapping for this plan. Treat this screen as a controlled
                commercial configuration record.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {featureCatalog.length} catalog feature
              {featureCatalog.length === 1 ? "" : "s"} available
            </div>
          </div>
        </div>

        <div className="p-6 lg:p-8">
          <PlanForm
            mode="edit"
            actionUrl={`/api/super-admin/plans/${plan.id}`}
            initialPlan={plan}
            featureCatalog={featureCatalog}
          />
        </div>
      </section>

      <section className="rounded-[32px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5 lg:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <BadgeDollarSign className="h-5 w-5 text-slate-500" />
                <h2 className="text-xl font-semibold text-slate-950">
                  Stripe checkout prices
                </h2>
              </div>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Manage currency-specific PlanPrice rows used by tenant
                self-service Checkout. Legacy monthly and annual plan prices
                above remain available for manual billing compatibility.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 lg:p-8">
          <PlanPriceManager
            planId={plan.id}
            initialPrices={plan.prices}
            defaultCurrency={plan.currency}
          />
        </div>
      </section>
    </main>
  );
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
