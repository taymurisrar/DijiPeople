import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  CreditCard,
  FileText,
  Package,
  ReceiptText,
  RefreshCw,
  Settings,
  Webhook,
} from "lucide-react";
import {
  AdminCommandBar,
  AdminCommandButton,
  AdminPageHeader,
  AdminSectionCard,
  AdminWorkspace,
} from "@/app/_components/admin-ui";
import { WebhookEventsClient } from "@/app/_components/billing/webhook-events-client";
import { EmptyState } from "@/app/_components/ui/empty-state";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { apiRequestJson } from "@/lib/server-api";
import { DEFAULT_PLATFORM_DEFAULTS } from "@/lib/reference-data/platform-reference-data";
import type { Metadata } from "next";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Billing",
};


type InvoiceRecord = {
  id: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  status: string;
  dueDate: string;
  tenant: { name: string };
};

type PaymentRecord = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string;
  tenant: { name: string };
};

type BillingDiagnostics = {
  plansCount: number;
  activePublicPlansCount: number;
  planPricesMissingStripePriceIdCount: number;
  inactivePlanPricesCount: number;
  checkoutReadyPlanPricesCount: number;
  duplicateCurrencyCycleRisks: Array<{
    planId: string;
    billingCycle: string;
    currency: string;
    count: number;
  }>;
  stripeConfigured: boolean;
  webhookConfigured: boolean;
  recentWebhookFailuresCount: number;
};

type WebhookEventsResponse = Parameters<
  typeof WebhookEventsClient
>[0]["initialData"];

const tabs = [
  { key: "overview", label: "Overview", href: "/billing", icon: ReceiptText },
  { key: "plans", label: "Plans / Prices", href: "/plans", icon: Package },
  { key: "invoices", label: "Invoices", href: "/invoices", icon: FileText },
  { key: "payments", label: "Payments", href: "/payments", icon: CreditCard },
  {
    key: "subscriptions",
    label: "Subscriptions",
    href: "/subscriptions",
    icon: Clock3,
  },
  { key: "webhooks", label: "Webhooks", href: "/billing?tab=webhooks", icon: Webhook },
  { key: "settings", label: "Settings", href: "/settings/billing", icon: Settings },
];

export default async function BillingPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const activeTab = params?.tab === "webhooks" ? "webhooks" : "overview";

  const [invoices, payments, diagnostics, webhookEvents, settings] = await Promise.all([
    apiRequestJson<InvoiceRecord[]>("/super-admin/invoices"),
    apiRequestJson<PaymentRecord[]>("/super-admin/payments"),
    apiRequestJson<BillingDiagnostics>("/super-admin/billing/diagnostics"),
    activeTab === "webhooks"
      ? apiRequestJson<WebhookEventsResponse>(
          "/super-admin/billing/stripe-webhook-events?page=1&pageSize=25",
        )
      : Promise.resolve(null),
    apiRequestJson<{ platformDefaults?: { currency?: string; reportingCurrency?: string } }>(
      "/super-admin/platform-settings",
    ),
  ]);
  const reportingCurrency =
    settings.platformDefaults?.reportingCurrency ??
    settings.platformDefaults?.currency ??
    DEFAULT_PLATFORM_DEFAULTS.reportingCurrency;

  const overdue = invoices.filter(
    (invoice) => invoice.status === "OVERDUE",
  ).length;
  const issued = invoices.filter((invoice) => invoice.status === "ISSUED").length;
  const successfulPayments = payments.filter(
    (payment) =>
      payment.status === "SUCCEEDED" &&
      payment.currency === reportingCurrency,
  );
  const revenue = successfulPayments.reduce(
    (sum, payment) => sum + payment.amount,
    0,
  );

  return (
    <AdminWorkspace>
      <AdminCommandBar
        left={
          <AdminCommandButton href="/billing" icon={RefreshCw}>
            Refresh
          </AdminCommandButton>
        }
      />
      <AdminPageHeader
        eyebrow="Billing"
        title="Billing workspace"
        description="Operational billing control center for diagnostics, invoices, payments, subscriptions, and Stripe webhooks."
      />

      <nav className="rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.key;
            return (
              <Link
                className={[
                  "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition",
                  selected
                    ? "bg-slate-950 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
                ].join(" ")}
                href={tab.href}
                key={tab.key}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {activeTab === "webhooks" && webhookEvents ? (
        <>
          <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
            Retry is available only for events marked FAILED and uses stored
            verified payloads through the existing idempotent handlers.
          </section>
          <WebhookEventsClient initialData={webhookEvents} />
        </>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <MetricTile
              label="Outstanding invoices"
              value={formatNumber(issued)}
              icon={ReceiptText}
            />
            <MetricTile
              label="Overdue invoices"
              value={formatNumber(overdue)}
              icon={Clock3}
            />
            <MetricTile
              label="Collected revenue"
              value={formatCurrency(revenue, reportingCurrency)}
              icon={CircleDollarSign}
            />
          </section>

          <AdminSectionCard
            title="Stripe billing diagnostics"
            description="Pre-UAT readiness signals for public plans, checkout prices, webhook processing, and Stripe configuration."
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <DiagnosticTile
                label="Plans"
                value={formatNumber(diagnostics.plansCount)}
                description={`${formatNumber(diagnostics.activePublicPlansCount)} active public`}
                healthy={diagnostics.activePublicPlansCount > 0}
              />
              <DiagnosticTile
                label="Checkout-ready prices"
                value={formatNumber(diagnostics.checkoutReadyPlanPricesCount)}
                description={`${formatNumber(diagnostics.planPricesMissingStripePriceIdCount)} missing Stripe Price ID`}
                healthy={diagnostics.checkoutReadyPlanPricesCount > 0}
              />
              <DiagnosticTile
                label="Inactive PlanPrices"
                value={formatNumber(diagnostics.inactivePlanPricesCount)}
                description="Deactivated prices remain available for history"
                healthy
              />
              <DiagnosticTile
                label="Webhook failures"
                value={formatNumber(diagnostics.recentWebhookFailuresCount)}
                description="Failed events in the last 7 days"
                healthy={diagnostics.recentWebhookFailuresCount === 0}
              />
              <DiagnosticTile
                label="Stripe key"
                value={diagnostics.stripeConfigured ? "Configured" : "Missing"}
                description="Secret key presence only"
                healthy={diagnostics.stripeConfigured}
              />
              <DiagnosticTile
                label="Webhook secret"
                value={diagnostics.webhookConfigured ? "Configured" : "Missing"}
                description="No secret value exposed"
                healthy={diagnostics.webhookConfigured}
              />
              <DiagnosticTile
                label="Duplicate risks"
                value={formatNumber(diagnostics.duplicateCurrencyCycleRisks.length)}
                description="More than one active price in a plan/cycle/currency group"
                healthy={diagnostics.duplicateCurrencyCycleRisks.length === 0}
              />
            </div>
          </AdminSectionCard>

          <section className="grid gap-4 xl:grid-cols-2">
            <RecentList
              emptyDescription="Draft and issued invoices will appear here."
              emptyTitle="No invoices yet"
              items={invoices.slice(0, 6).map((invoice) => ({
                id: invoice.id,
                title: invoice.invoiceNumber,
                description: `${invoice.tenant.name} | ${formatCurrency(invoice.amount, invoice.currency)}`,
                status: invoice.status,
              }))}
              title="Recent invoices"
              viewAllHref="/invoices"
            />
            <RecentList
              emptyDescription="Recorded payments will appear here."
              emptyTitle="No payments yet"
              items={payments.slice(0, 6).map((payment) => ({
                id: payment.id,
                title: formatCurrency(payment.amount, payment.currency),
                description: `${payment.tenant.name} | ${payment.paymentMethod}`,
                status: payment.status,
              }))}
              title="Recent payments"
              viewAllHref="/payments"
            />
          </section>
        </>
      )}
    </AdminWorkspace>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ReceiptText;
  label: string;
  value: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <Icon className="h-5 w-5 text-slate-500" />
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
    </article>
  );
}

function DiagnosticTile({
  label,
  value,
  description,
  healthy,
}: {
  label: string;
  value: string;
  description: string;
  healthy: boolean;
}) {
  const Icon = healthy ? CheckCircle2 : AlertTriangle;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div
        className={`inline-flex rounded-lg p-2 ring-1 ${
          healthy
            ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
            : "bg-amber-50 text-amber-700 ring-amber-100"
        }`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}

function RecentList({
  emptyDescription,
  emptyTitle,
  items,
  title,
  viewAllHref,
}: {
  emptyDescription: string;
  emptyTitle: string;
  items: Array<{ id: string; title: string; description: string; status: string }>;
  title: string;
  viewAllHref: string;
}) {
  return (
    <AdminSectionCard
      actions={
        <Link
          href={viewAllHref}
          className="text-sm font-medium text-slate-600 hover:text-slate-950"
        >
          View all
        </Link>
      }
      title={title}
    >
      {items.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
            >
              <div>
                <div className="font-medium text-slate-950">{item.title}</div>
                <div className="mt-1 text-sm text-slate-600">
                  {item.description}
                </div>
              </div>
              <TenantStatusBadge value={item.status} />
            </div>
          ))}
        </div>
      )}
    </AdminSectionCard>
  );
}
