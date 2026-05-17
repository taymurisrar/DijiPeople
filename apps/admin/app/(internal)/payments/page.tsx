import { PaymentForm } from "@/app/_components/payment-form";
import { PaymentListTable, type PaymentTableRecord } from "@/app/_components/payment-list-table";
import { apiRequestJson } from "@/lib/server-api";

type TenantOption = {
  id: string;
  name: string;
  subscriptions: Array<{ id: string; label: string }>;
  invoices: Array<{ id: string; label: string }>;
};

export default async function PaymentsPage() {
  const [payments, tenants, subscriptions, invoices] = await Promise.all([
    apiRequestJson<PaymentTableRecord[]>("/super-admin/payments"),
    apiRequestJson<Array<{ id: string; name: string }>>("/super-admin/tenants"),
    apiRequestJson<Array<{ id: string; tenant: { id: string }; plan: { name: string } }>>(
      "/super-admin/subscriptions",
    ),
    apiRequestJson<
      Array<{ id: string; tenant: { id: string }; invoiceNumber: string }>
    >("/super-admin/invoices"),
  ]);

  const tenantOptions: TenantOption[] = tenants.map((tenant) => ({
    id: tenant.id,
    name: tenant.name,
    subscriptions: subscriptions
      .filter((subscription) => subscription.tenant.id === tenant.id)
      .map((subscription) => ({
        id: subscription.id,
        label: subscription.plan.name,
      })),
    invoices: invoices
      .filter((invoice) => invoice.tenant.id === tenant.id)
      .map((invoice) => ({
        id: invoice.id,
        label: invoice.invoiceNumber,
      })),
  }));
  const succeeded = payments.filter((payment) => payment.status === "SUCCEEDED");
  const pending = payments.filter((payment) => payment.status === "PENDING");
  const collected = succeeded.reduce((sum, payment) => sum + payment.amount, 0);

  return (
    <main className="space-y-6">
      <section className="rounded-[30px] border border-indigo-100 bg-[radial-gradient(circle_at_top_right,_rgba(14,165,233,0.18),_transparent_32%),linear-gradient(135deg,#ffffff_0%,#eef2ff_100%)] p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          Payments
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">
          Payment operations
        </h1>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Collected" value={`USD ${collected.toFixed(2)}`} />
        <MetricCard label="Successful payments" value={String(succeeded.length)} />
        <MetricCard label="Pending payments" value={String(pending.length)} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,1fr)]">
        <PaymentListTable payments={payments} />

        <PaymentForm tenants={tenantOptions} />
      </section>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-slate-950">{value}</p>
    </article>
  );
}
