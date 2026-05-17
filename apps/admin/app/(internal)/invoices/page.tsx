import { InvoiceListTable, type InvoiceTableRecord } from "@/app/_components/invoice-list-table";
import { apiRequestJson } from "@/lib/server-api";

export default async function InvoicesPage() {
  const invoices = await apiRequestJson<InvoiceTableRecord[]>("/super-admin/invoices");
  const openInvoices = invoices.filter((invoice) => invoice.status === "ISSUED" || invoice.status === "OVERDUE");
  const paidInvoices = invoices.filter((invoice) => invoice.status === "PAID");
  const outstanding = openInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);

  return (
    <main className="space-y-6">
      <section className="rounded-[30px] border border-indigo-100 bg-[radial-gradient(circle_at_top_right,_rgba(14,165,233,0.18),_transparent_32%),linear-gradient(135deg,#ffffff_0%,#eef2ff_100%)] p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          Invoices
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">
          Invoice lifecycle
        </h1>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Open invoices" value={String(openInvoices.length)} />
        <MetricCard label="Paid invoices" value={String(paidInvoices.length)} />
        <MetricCard label="Outstanding" value={`USD ${outstanding.toFixed(2)}`} />
      </section>

      <InvoiceListTable invoices={invoices} />
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
