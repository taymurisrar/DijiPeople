import { PaymentForm } from "@/app/_components/payment-form";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
import { apiRequestJson } from "@/lib/server-api";

type TenantOption = {
  id: string;
  name: string;
  subscriptions: Array<{ id: string; label: string }>;
  invoices: Array<{ id: string; label: string }>;
};

type PaymentRecord = {
  id: string;
  tenant: { id: string; name: string; slug: string };
  amount: number;
  currency: string;
  paymentMethod: string;
  status: string;
  paidAt: string | null;
  invoiceId: string | null;
  subscriptionId: string;
  createdAt: string;
};

export default async function PaymentsPage() {
  const [payments, tenants, subscriptions, invoices] = await Promise.all([
    apiRequestJson<PaymentRecord[]>("/super-admin/payments"),
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

  return (
    <main className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          Payments
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">
          Payment operations
        </h1>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,1fr)]">
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  <th className="px-6 py-4">Tenant</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Method</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Paid at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="px-6 py-5">
                      <div className="font-medium text-slate-950">{payment.tenant.name}</div>
                      <div className="mt-1 text-slate-500">{payment.tenant.slug}</div>
                    </td>
                    <td className="px-6 py-5">
                      {payment.currency} {payment.amount.toFixed(2)}
                    </td>
                    <td className="px-6 py-5">{payment.paymentMethod}</td>
                    <td className="px-6 py-5">
                      <TenantStatusBadge value={payment.status} />
                    </td>
                    <td className="px-6 py-5">
                      {payment.paidAt
                        ? new Intl.DateTimeFormat("en-US", {
                            dateStyle: "medium",
                          }).format(new Date(payment.paidAt))
                        : "Not paid"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <PaymentForm tenants={tenantOptions} />
      </section>
    </main>
  );
}
