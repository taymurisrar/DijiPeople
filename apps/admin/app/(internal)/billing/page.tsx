import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  ReceiptText,
} from "lucide-react";
import { EmptyState } from "@/app/_components/ui/empty-state";
import { MetricCard } from "@/app/_components/ui/metric-card";
import { PageHeader } from "@/app/_components/ui/page-header";
import { SectionCard } from "@/app/_components/ui/section-card";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { apiRequestJson } from "@/lib/server-api";

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

export default async function BillingPage() {
  const [invoices, payments, diagnostics] = await Promise.all([
    apiRequestJson<InvoiceRecord[]>("/super-admin/invoices"),
    apiRequestJson<PaymentRecord[]>("/super-admin/payments"),
    apiRequestJson<BillingDiagnostics>("/super-admin/billing/diagnostics"),
  ]);

  const overdue = invoices.filter(
    (invoice) => invoice.status === "OVERDUE",
  ).length;
  const issued = invoices.filter(
    (invoice) => invoice.status === "ISSUED",
  ).length;
  const successfulPayments = payments.filter(
    (payment) => payment.status === "SUCCEEDED",
  );
  const revenue = successfulPayments.reduce(
    (sum, payment) => sum + payment.amount,
    0,
  );

  return (
    <main className="space-y-6">
      <PageHeader eyebrow="Billing operations" title="Billing overview" />

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Outstanding invoices"
          value={formatNumber(issued)}
          icon={ReceiptText}
        />
        <MetricCard
          label="Overdue invoices"
          value={formatNumber(overdue)}
          icon={Clock3}
        />
        <MetricCard
          label="Collected revenue"
          value={formatCurrency(revenue, "USD")}
          icon={CircleDollarSign}
        />
      </section>

      <SectionCard
        title="Stripe billing diagnostics"
        description="Pre-UAT readiness signals for public plans, checkout prices, webhook processing, and Stripe configuration."
        actions={
          <Link
            href="/billing/webhooks"
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            View webhooks
          </Link>
        }
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
            label="Active duplicate risks"
            value={formatNumber(diagnostics.duplicateCurrencyCycleRisks.length)}
            description="More than one active price in a plan/cycle/currency group"
            healthy={diagnostics.duplicateCurrencyCycleRisks.length === 0}
          />
        </div>
      </SectionCard>

      <section className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          title="Recent invoices"
          actions={
            <Link
              href="/invoices"
              className="text-sm font-medium text-slate-600 hover:text-slate-950"
            >
              View all
            </Link>
          }
        >
          {invoices.length === 0 ? (
            <EmptyState
              title="No invoices yet"
              description="Draft and issued invoices will appear here."
            />
          ) : (
            <div className="space-y-3">
              {invoices.slice(0, 6).map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  <div>
                    <div className="font-medium text-slate-950">
                      {invoice.invoiceNumber}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {invoice.tenant.name} |{" "}
                      {formatCurrency(invoice.amount, invoice.currency)}
                    </div>
                  </div>
                  <TenantStatusBadge value={invoice.status} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Recent payments"
          actions={
            <Link
              href="/payments"
              className="text-sm font-medium text-slate-600 hover:text-slate-950"
            >
              View all
            </Link>
          }
        >
          {payments.length === 0 ? (
            <EmptyState
              title="No payments yet"
              description="Recorded payments will appear here."
            />
          ) : (
            <div className="space-y-3">
              {payments.slice(0, 6).map((payment) => (
                <div
                  key={payment.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  <div>
                    <div className="font-medium text-slate-950">
                      {formatCurrency(payment.amount, payment.currency)}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {payment.tenant.name} | {payment.paymentMethod}
                    </div>
                  </div>
                  <TenantStatusBadge value={payment.status} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </section>
    </main>
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
    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
      <div
        className={`inline-flex rounded-2xl p-2 ring-1 ${
          healthy
            ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
            : "bg-amber-50 text-amber-700 ring-amber-100"
        }`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-4 text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}
