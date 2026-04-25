import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileText,
  Layers3,
  Plus,
  ReceiptText,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { apiRequestJson } from "@/lib/server-api";

type DashboardSummary = {
  customers: number;
  tenants: number;
  activeSubscriptions: number;
  openInvoices: number;
  collectedRevenue: number;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("en-US");

export default async function AdminDashboardPage() {
  const summary = await apiRequestJson<DashboardSummary>(
    "/super-admin/dashboard-summary",
  );

  const cards = [
    {
      label: "Customers",
      description: "Total customer accounts registered on the platform.",
      value: numberFormatter.format(summary.customers),
      href: "/customers",
      icon: UsersRound,
      accent: "bg-blue-50 text-blue-700 ring-blue-100",
    },
    {
      label: "Tenants",
      description: "Live tenant workspaces created for customers.",
      value: numberFormatter.format(summary.tenants),
      href: "/tenants",
      icon: Building2,
      accent: "bg-violet-50 text-violet-700 ring-violet-100",
    },
    {
      label: "Active subscriptions",
      description: "Currently active paid or trial subscriptions.",
      value: numberFormatter.format(summary.activeSubscriptions),
      href: "/subscriptions",
      icon: CheckCircle2,
      accent: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    },
    {
      label: "Open invoices",
      description: "Invoices that still need finance attention.",
      value: numberFormatter.format(summary.openInvoices),
      href: "/invoices",
      icon: ReceiptText,
      accent: "bg-amber-50 text-amber-700 ring-amber-100",
    },
  ];

  const tenantActivationRate =
    summary.customers > 0
      ? Math.round((summary.tenants / summary.customers) * 100)
      : 0;

  const subscriptionCoverageRate =
    summary.tenants > 0
      ? Math.round((summary.activeSubscriptions / summary.tenants) * 100)
      : 0;

  const revenuePerCustomer =
    summary.customers > 0 ? summary.collectedRevenue / summary.customers : 0;

  const revenuePerTenant =
    summary.tenants > 0 ? summary.collectedRevenue / summary.tenants : 0;

  const healthItems = [
    {
      label: "Tenant activation",
      value: `${tenantActivationRate}%`,
      description: `${summary.tenants} of ${summary.customers} customers have tenant workspaces.`,
      status:
        tenantActivationRate >= 75
          ? "Healthy"
          : tenantActivationRate >= 40
            ? "Needs attention"
            : "Critical",
    },
    {
      label: "Subscription coverage",
      value: `${subscriptionCoverageRate}%`,
      description: `${summary.activeSubscriptions} active subscriptions across ${summary.tenants} tenants.`,
      status:
        subscriptionCoverageRate >= 75
          ? "Healthy"
          : subscriptionCoverageRate >= 40
            ? "Needs attention"
            : "Critical",
    },
    {
      label: "Billing backlog",
      value: numberFormatter.format(summary.openInvoices),
      description:
        summary.openInvoices > 0
          ? "Open invoices are waiting for review, payment, or reconciliation."
          : "No open invoices pending right now.",
      status:
        summary.openInvoices === 0
          ? "Healthy"
          : summary.openInvoices <= 5
            ? "Needs attention"
            : "Critical",
    },
  ];

  const quickActions = [
    {
      label: "Start customer onboarding",
      description: "Create or continue onboarding for a customer.",
      href: "/onboarding",
      icon: Plus,
    },
    {
      label: "Review billing operations",
      description: "Check invoices, payments, and finance exceptions.",
      href: "/billing",
      icon: FileText,
    },
    {
      label: "Manage plans and entitlements",
      description: "Update subscription packages and module access.",
      href: "/plans",
      icon: Layers3,
    },
  ];

  return (
    <main className="space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              <Clock3 className="h-3.5 w-3.5" />
              Live overview
            </div>

            <h1 className="mt-5 max-w-4xl text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              Platform operations dashboard
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Monitor customer onboarding, tenant activation, subscriptions,
              invoice backlog, and revenue from one admin control plane.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/customers/new"
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                Add customer
              </Link>

              <Link
                href="/invoices"
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                Review invoices
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Collected revenue
                </p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                  {currencyFormatter.format(summary.collectedRevenue)}
                </p>
              </div>

              <div className="rounded-2xl bg-white p-3 text-emerald-700 shadow-sm ring-1 ring-slate-200">
                <CircleDollarSign className="h-6 w-6" />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <p className="text-xs text-slate-500">Per customer</p>
                <p className="mt-1 text-base font-semibold text-slate-950">
                  {currencyFormatter.format(revenuePerCustomer)}
                </p>
              </div>

              <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <p className="text-xs text-slate-500">Per tenant</p>
                <p className="mt-1 text-base font-semibold text-slate-950">
                  {currencyFormatter.format(revenuePerTenant)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;

          return (
            <Link
              key={card.label}
              href={card.href}
              className="group rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <div
                  className={`rounded-2xl p-3 ring-1 ${card.accent}`}
                >
                  <Icon className="h-5 w-5" />
                </div>

                <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700" />
              </div>

              <p className="mt-5 text-sm font-medium text-slate-500">
                {card.label}
              </p>

              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                {card.value}
              </p>

              <p className="mt-3 text-sm leading-6 text-slate-600">
                {card.description}
              </p>
            </Link>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.85fr)]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">
                Platform health
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Key operational ratios calculated from your current customer,
                tenant, subscription, invoice, and revenue data.
              </p>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
              <TrendingUp className="h-3.5 w-3.5" />
              Dynamic metrics
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {healthItems.map((item) => (
              <div
                key={item.label}
                className="rounded-3xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">
                      {item.label}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {item.description}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-2xl font-semibold text-slate-950">
                      {item.value}
                    </p>
                    <span
                      className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        item.status === "Healthy"
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                          : item.status === "Needs attention"
                            ? "bg-amber-50 text-amber-700 ring-1 ring-amber-100"
                            : "bg-rose-50 text-rose-700 ring-1 ring-rose-100"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-950">
            Quick actions
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Common admin workflows for customer lifecycle, billing, and package
            configuration.
          </p>

          <div className="mt-6 space-y-3">
            {quickActions.map((action) => {
              const Icon = action.icon;

              return (
                <Link
                  key={action.label}
                  href={action.href}
                  className="group flex items-start justify-between gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-white hover:shadow-sm"
                >
                  <div className="flex gap-3">
                    <div className="rounded-2xl h-fit bg-white p-2.5 text-slate-700 ring-1 ring-slate-200">
                      <Icon className="h-4 w-4" />
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-slate-950">
                        {action.label}
                      </p>
                      <p className="mt-1 text-sm leading-5 text-slate-600">
                        {action.description}
                      </p>
                    </div>
                  </div>

                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700" />
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="rounded-2xl w-fit bg-blue-50 p-3 text-blue-700 ring-1 ring-blue-100">
            <UsersRound className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-slate-950">
            Customer lifecycle
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Use this area to identify customers that have not yet converted into
            tenants or active subscriptions.
          </p>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="rounded-2xl w-fit bg-amber-50 p-3 text-amber-700 ring-1 ring-amber-100">
            <ReceiptText className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-slate-950">
            Finance control
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Keep open invoices visible so finance operations do not silently pile
            up in the background.
          </p>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="rounded-2xl w-fit bg-emerald-50 p-3 text-emerald-700 ring-1 ring-emerald-100">
            <Banknote className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-slate-950">
            Revenue visibility
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Track collected revenue with simple operational averages per
            customer and tenant.
          </p>
        </div>
      </section>
    </main>
  );
}