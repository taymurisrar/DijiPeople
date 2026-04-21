import Link from "next/link";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
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
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          Billing operations
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">
          Billing overview
        </h1>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card label="Outstanding invoices" value={issued} />
        <Card label="Overdue invoices" value={overdue} />
        <Card label="Collected revenue" value={`USD ${revenue.toFixed(2)}`} />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-slate-950">Recent invoices</h2>
            <Link href="/invoices" className="text-sm font-medium text-slate-600 hover:text-slate-950">
              View all
            </Link>
          </div>
          <div className="mt-4 space-y-3">
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
                    {invoice.tenant.name} • {invoice.currency} {invoice.amount.toFixed(2)}
                  </div>
                </div>
                <TenantStatusBadge value={invoice.status} />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-slate-950">Recent payments</h2>
            <Link href="/payments" className="text-sm font-medium text-slate-600 hover:text-slate-950">
              View all
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {payments.slice(0, 6).map((payment) => (
              <div
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
              >
                <div>
                  <div className="font-medium text-slate-950">
                    {payment.currency} {payment.amount.toFixed(2)}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {payment.tenant.name} • {payment.paymentMethod}
                  </div>
                </div>
                <TenantStatusBadge value={payment.status} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function Card({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}
