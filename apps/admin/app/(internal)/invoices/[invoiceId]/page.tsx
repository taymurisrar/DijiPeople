import Link from "next/link";
import { InvoiceActions } from "@/app/_components/invoice-actions";
import { apiRequestJson } from "@/lib/server-api";

type InvoiceDetail = {
  id: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  status: string;
  issueDate: string;
  dueDate: string;
  subtotal?: number | null;
  tax?: number | null;
  total?: number | null;
  amountPaid?: number | null;
  amountDue?: number | null;
  generatedAt: string | null;
  generatedByUserId: string | null;
  emailedAt: string | null;
  emailedTo: string | null;
  emailStatus: string | null;
  pdfStorageKey: string | null;
  tenant: { id: string; name: string; slug: string };
  customerAccount: { id: string; companyName: string } | null;
  subscription: {
    id: string;
    status: string;
    plan: { id: string; key: string; name: string };
  };
  payments: Array<{
    id: string;
    amount: number;
    status: string;
    paymentMethod: string;
    paidAt: string | null;
  }>;
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  const invoice = await apiRequestJson<InvoiceDetail>(`/super-admin/invoices/${invoiceId}`);
  const paidAmount =
    invoice.amountPaid ??
    invoice.payments
      .filter((payment) => payment.status === "SUCCEEDED")
      .reduce((sum, payment) => sum + toNumber(payment.amount, 0), 0);
  const subtotal = invoice.subtotal ?? invoice.amount;
  const tax = invoice.tax ?? 0;
  const total = invoice.total ?? invoice.amount;
  const amountDue = invoice.amountDue ?? Math.max(total - paidAmount, 0);

  return (
    <main className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <Link className="text-sm font-medium text-slate-600 hover:text-slate-950" href="/invoices">
          Back to invoices
        </Link>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          Invoice detail
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">{invoice.invoiceNumber}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {invoice.currency} {invoice.amount.toFixed(2)} • {invoice.status}
        </p>
        <div className="mt-5">
          <InvoiceActions invoiceId={invoice.id} />
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <Info label="Tenant" value={invoice.tenant.name} />
          <Info label="Customer" value={invoice.customerAccount?.companyName ?? "Not linked"} />
          <Info label="Plan" value={invoice.subscription.plan.name} />
          <Info label="Subscription status" value={invoice.subscription.status} />
          <Info label="Issue date" value={formatDate(invoice.issueDate)} />
          <Info label="Due date" value={formatDate(invoice.dueDate)} />
          <Info label="Subtotal" value={formatCurrency(invoice.currency, subtotal)} />
          <Info label="Tax" value={formatCurrency(invoice.currency, tax)} />
          <Info label="Total" value={formatCurrency(invoice.currency, total)} />
          <Info label="Outstanding balance" value={formatCurrency(invoice.currency, amountDue)} />
          <Info label="PDF generated" value={formatDate(invoice.generatedAt)} />
          <Info label="PDF storage key" value={invoice.pdfStorageKey ?? "Not generated"} />
          <Info label="Last emailed" value={formatDate(invoice.emailedAt)} />
          <Info label="Email status" value={invoice.emailStatus ?? "Not emailed"} />
          <Info label="Emailed to" value={invoice.emailedTo ?? "Not emailed"} />
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-950">Linked payments</h2>
        {invoice.payments.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
            No linked payments.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {invoice.payments.map((payment) => (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4" key={payment.id}>
                <p className="font-medium text-slate-900">
                  {formatCurrency(invoice.currency, payment.amount)}
                </p>
                <p className="text-sm text-slate-600">
                  {payment.status} • {payment.paymentMethod}
                </p>
                <p className="text-xs text-slate-500">{formatDate(payment.paidAt)}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-950">{value}</p>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}

function formatCurrency(currency: string, value?: number | null) {
  return `${currency} ${toNumber(value, 0).toFixed(2)}`;
}

function toNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
