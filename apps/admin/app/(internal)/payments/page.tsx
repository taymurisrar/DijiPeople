import { PaymentForm } from "@/app/_components/payment-form";
import {
  PaymentListTable,
  type PaymentTableRecord,
} from "@/app/_components/payment-list-table";
import {
  AdminCommandBar,
  AdminCommandButton,
  AdminPageHeader,
  AdminSectionCard,
  AdminWorkspace,
} from "@/app/_components/admin-ui";
import { apiRequestJson } from "@/lib/server-api";
import { RefreshCw } from "lucide-react";

type TenantOption = {
  id: string;
  name: string;
  subscriptions: Array<{ id: string; label: string }>;
  invoices: Array<{ id: string; label: string }>;
};

function toNumber(value: unknown): number {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

export default async function PaymentsPage() {
  const [payments, tenants, subscriptions, invoices] = await Promise.all([
    apiRequestJson<PaymentTableRecord[]>("/super-admin/payments"),
    apiRequestJson<Array<{ id: string; name: string }>>("/super-admin/tenants"),
    apiRequestJson<Array<{ id: string; tenant: { id: string }; plan: { name: string } }>>(
      "/super-admin/subscriptions",
    ),
    apiRequestJson<Array<{ id: string; tenant: { id: string }; invoiceNumber: string }>>(
      "/super-admin/invoices",
    ),
  ]);

  const tenantOptions: TenantOption[] = tenants.map((tenant) => ({
    id: tenant.id,
    name: tenant.name,
    subscriptions: subscriptions
      .filter((subscription) => subscription.tenant?.id === tenant.id)
      .map((subscription) => ({
        id: subscription.id,
        label: subscription.plan.name,
      })),
    invoices: invoices
      .filter((invoice) => invoice.tenant?.id === tenant.id)
      .map((invoice) => ({
        id: invoice.id,
        label: invoice.invoiceNumber,
      })),
  }));

  const succeeded = payments.filter((payment) => payment.status === "SUCCEEDED");
  const pending = payments.filter((payment) => payment.status === "PENDING");

  const collected = succeeded.reduce(
    (sum, payment) => sum + toNumber(payment.amount),
    0,
  );

  return (
    <AdminWorkspace>
      <AdminCommandBar
        left={
          <AdminCommandButton href="/payments" icon={RefreshCw}>
            Refresh
          </AdminCommandButton>
        }
      />
      <AdminPageHeader
        eyebrow="Payments"
        title="Payment operations"
        description="Review recorded payments, payment state, tenant links, and related billing context."
      />

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Collected" value={`USD ${collected.toFixed(2)}`} />
        <MetricCard label="Successful payments" value={String(succeeded.length)} />
        <MetricCard label="Pending payments" value={String(pending.length)} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,1fr)]">
        <PaymentListTable payments={payments} />
        <AdminSectionCard title="Record payment">
          <PaymentForm tenants={tenantOptions} />
        </AdminSectionCard>
      </section>
    </AdminWorkspace>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
    </article>
  );
}
