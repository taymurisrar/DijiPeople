import Link from "next/link";
import { CircleDollarSign, Clock3, ReceiptText } from "lucide-react";
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

export default async function BillingPage() {
  const [invoices, payments] = await Promise.all([
    apiRequestJson<InvoiceRecord[]>("/super-admin/invoices"),
    apiRequestJson<PaymentRecord[]>("/super-admin/payments"),
  ]);

  const overdue = invoices.filter((invoice) => invoice.status === "OVERDUE").length;
  const issued = invoices.filter((invoice) => invoice.status === "ISSUED").length;
  const successfulPayments = payments.filter((payment) => payment.status === "SUCCEEDED");
  const revenue = successfulPayments.reduce((sum, payment) => sum + payment.amount, 0);

  return (
    <main className="space-y-6">
      <PageHeader eyebrow="Billing operations" title="Billing overview" />

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Outstanding invoices" value={formatNumber(issued)} icon={ReceiptText} />
        <MetricCard label="Overdue invoices" value={formatNumber(overdue)} icon={Clock3} />
        <MetricCard label="Collected revenue" value={formatCurrency(revenue, "USD")} icon={CircleDollarSign} />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          title="Recent invoices"
          actions={
            <Link href="/invoices" className="text-sm font-medium text-slate-600 hover:text-slate-950">
              View all
            </Link>
          }
        >
          {invoices.length === 0 ? (
            <EmptyState title="No invoices yet" description="Draft and issued invoices will appear here." />
          ) : (
            <div className="space-y-3">
              {invoices.slice(0, 6).map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  <div>
                    <div className="font-medium text-slate-950">{invoice.invoiceNumber}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      {invoice.tenant.name} | {formatCurrency(invoice.amount, invoice.currency)}
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
            <Link href="/payments" className="text-sm font-medium text-slate-600 hover:text-slate-950">
              View all
            </Link>
          }
        >
          {payments.length === 0 ? (
            <EmptyState title="No payments yet" description="Recorded payments will appear here." />
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
