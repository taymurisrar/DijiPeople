import Link from "next/link";
import { apiRequestJson } from "@/lib/server-api";

type DashboardSummary = {
  customers: number;
  tenants: number;
  activeSubscriptions: number;
  openInvoices: number;
  collectedRevenue: number;
};

export default async function AdminDashboardPage() {
  const summary = await apiRequestJson<DashboardSummary>("/super-admin/dashboard-summary");

  const cards = [
    { label: "Customers", value: summary.customers, href: "/customers" },
    { label: "Tenants", value: summary.tenants, href: "/tenants" },
    {
      label: "Active subscriptions",
      value: summary.activeSubscriptions,
      href: "/subscriptions",
    },
    { label: "Open invoices", value: summary.openInvoices, href: "/invoices" },
  ];

  return (
    <main className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          Overview
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">
          Platform operations dashboard
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Keep customer onboarding, subscriptions, and revenue operations visible in one control plane.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-300 hover:shadow-md"
          >
            <div className="text-sm font-medium text-slate-500">{card.label}</div>
            <div className="mt-3 text-3xl font-semibold text-slate-950">{card.value}</div>
          </Link>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-950">Revenue snapshot</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Collected revenue currently reflects successfully recorded payments, including manual finance updates.
          </p>
          <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Collected revenue
            </div>
            <div className="mt-2 text-4xl font-semibold text-slate-950">
              USD {summary.collectedRevenue.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-950">Quick actions</h2>
          <div className="mt-6 space-y-3">
            <Link
              href="/onboarding"
              className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-800 transition hover:border-slate-300 hover:bg-white"
            >
              Start customer onboarding
            </Link>
            <Link
              href="/billing"
              className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-800 transition hover:border-slate-300 hover:bg-white"
            >
              Review billing operations
            </Link>
            <Link
              href="/plans"
              className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-800 transition hover:border-slate-300 hover:bg-white"
            >
              Update plans and entitlements
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
