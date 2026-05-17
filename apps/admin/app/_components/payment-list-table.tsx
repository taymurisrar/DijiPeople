"use client";

import { DataTable } from "@/app/_components/crm/data-table";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";

export type PaymentTableRecord = {
  id: string;
  tenant: { id: string; name: string; slug: string };
  amount: number;
  currency: string;
  paymentMethod: string;
  status: string;
  paidAt: string | null;
  createdAt: string;
};

export function PaymentListTable({ payments }: { payments: PaymentTableRecord[] }) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <DataTable
        rows={payments}
        rowKey={(payment) => payment.id}
        stickyHeader
        columns={[
          {
            key: "tenant",
            header: "Tenant",
            minWidth: 220,
            render: (payment) => (
              <div>
                <div className="font-medium text-slate-950">{payment.tenant.name}</div>
                <div className="mt-1 text-slate-500">{payment.tenant.slug}</div>
              </div>
            ),
          },
          {
            key: "amount",
            header: "Amount",
            minWidth: 140,
            render: (payment) => `${payment.currency} ${payment.amount.toFixed(2)}`,
          },
          { key: "method", header: "Method", minWidth: 140, render: (payment) => payment.paymentMethod },
          {
            key: "status",
            header: "Status",
            minWidth: 130,
            render: (payment) => <TenantStatusBadge value={payment.status} />,
          },
          {
            key: "paidAt",
            header: "Paid at",
            minWidth: 150,
            render: (payment) => payment.paidAt ? formatDate(payment.paidAt) : "Not paid",
          },
          {
            key: "createdAt",
            header: "Created",
            minWidth: 150,
            render: (payment) => formatDate(payment.createdAt),
          },
        ]}
        emptyTitle="No payments yet"
        emptyDescription="Recorded payments will appear here."
      />
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}
