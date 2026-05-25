import { InvoiceListTable, type InvoiceTableRecord } from "@/app/_components/invoice-list-table";
import {
  AdminCommandBar,
  AdminCommandButton,
  AdminPageHeader,
  AdminWorkspace,
} from "@/app/_components/admin-ui";
import { apiRequestJson } from "@/lib/server-api";
import { RefreshCw } from "lucide-react";

export default async function InvoicesPage() {
  const invoices = await apiRequestJson<InvoiceTableRecord[]>("/super-admin/invoices");
  const openInvoices = invoices.filter((invoice) => invoice.status === "ISSUED" || invoice.status === "OVERDUE");
  const paidInvoices = invoices.filter((invoice) => invoice.status === "PAID");
  const outstanding = openInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);

  return (
    <AdminWorkspace>
      <AdminCommandBar
        left={
          <AdminCommandButton href="/invoices" icon={RefreshCw}>
            Refresh
          </AdminCommandButton>
        }
      />
      <AdminPageHeader
        eyebrow="Invoices"
        title="Invoice lifecycle"
        description="Track invoice state, due dates, tenant context, and payment readiness from one compact billing view."
      />
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Open invoices" value={String(openInvoices.length)} />
        <MetricCard label="Paid invoices" value={String(paidInvoices.length)} />
        <MetricCard label="Outstanding" value={`USD ${outstanding.toFixed(2)}`} />
      </section>

      <InvoiceListTable invoices={invoices} />
    </AdminWorkspace>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
    </article>
  );
}
