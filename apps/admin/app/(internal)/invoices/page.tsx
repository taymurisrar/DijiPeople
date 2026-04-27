import Link from "next/link";
import { InvoiceStatusForm } from "@/app/_components/invoice-status-form";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
import { apiRequestJson } from "@/lib/server-api";

type InvoiceRecord = {
  id: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  issueDate: string;
  dueDate: string;
  status: "DRAFT" | "ISSUED" | "PAID" | "OVERDUE";
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  subscription: {
    id: string;
    plan: { name: string };
  };
};

export default async function InvoicesPage() {
  const invoices = await apiRequestJson<InvoiceRecord[]>("/super-admin/invoices");

  return (
    <main className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          Invoices
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">
          Invoice lifecycle
        </h1>
      </section>

      <section className="space-y-4">
        {invoices.map((invoice) => (
          <article
            key={invoice.id}
            className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {invoice.invoiceNumber}
                </div>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">
                  {invoice.currency} {invoice.amount.toFixed(2)}
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  {invoice.tenant.name} - {invoice.subscription.plan.name}
                </p>
                <Link
                  className="mt-3 inline-flex text-sm font-medium text-slate-700 hover:text-slate-950"
                  href={`/invoices/${invoice.id}`}
                >
                  View invoice detail
                </Link>
              </div>
              <TenantStatusBadge value={invoice.status} />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <Info
                label="Issue date"
                value={new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
                  new Date(invoice.issueDate),
                )}
              />
              <Info
                label="Due date"
                value={new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
                  new Date(invoice.dueDate),
                )}
              />
              <Info label="Tenant slug" value={invoice.tenant.slug} />
            </div>

            <div className="mt-5">
              <InvoiceStatusForm currentStatus={invoice.status} invoiceId={invoice.id} />
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-medium text-slate-950">{value}</div>
    </div>
  );
}
