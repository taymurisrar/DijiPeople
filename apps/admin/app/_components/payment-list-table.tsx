"use client";

import Link from "next/link";
import { DataTable } from "@/app/_components/crm/data-table";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
import { AdminKeyValueGrid } from "@/app/_components/admin-ui";

export type PaymentTableRecord = {
  id: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  amount: number | string | null;
  currency: string | null;
  paymentMethod: string;
  status: string;
  paidAt: string | null;
  createdAt: string;
};

function formatMoney(
  amount: number | string | null | undefined,
  currency?: string | null,
) {
  const numericAmount = Number(amount ?? 0);

  return `${currency ?? "USD"} ${
    Number.isFinite(numericAmount)
      ? numericAmount.toFixed(2)
      : "0.00"
  }`;
}

export function PaymentListTable({
  payments,
}: {
  payments: PaymentTableRecord[];
}) {
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
                <div className="font-medium text-slate-950">
                  {payment.tenant.name}
                </div>
                <div className="mt-1 text-slate-500">
                  {payment.tenant.slug}
                </div>
              </div>
            ),
          },
          {
            key: "amount",
            header: "Amount",
            minWidth: 140,
            render: (payment) =>
              formatMoney(payment.amount, payment.currency),
          },
          {
            key: "method",
            header: "Method",
            minWidth: 140,
            render: (payment) => payment.paymentMethod,
          },
          {
            key: "status",
            header: "Status",
            minWidth: 130,
            render: (payment) => (
              <TenantStatusBadge value={payment.status} />
            ),
          },
          {
            key: "paidAt",
            header: "Paid at",
            minWidth: 150,
            render: (payment) =>
              payment.paidAt
                ? formatDate(payment.paidAt)
                : "Not paid",
          },
          {
            key: "createdAt",
            header: "Created",
            minWidth: 150,
            render: (payment) =>
              formatDate(payment.createdAt),
          },
        ]}
        emptyTitle="No payments yet"
        emptyDescription="Recorded payments will appear here."
        renderExpandedRow={(payment) => (
          <div className="space-y-3">
            <AdminKeyValueGrid
              items={[
                { label: "Payment ID", value: payment.id },
                { label: "Tenant", value: payment.tenant.name },
                { label: "Slug", value: payment.tenant.slug },
                { label: "Method", value: payment.paymentMethod },
                { label: "Created", value: formatDate(payment.createdAt) },
                {
                  label: "Paid at",
                  value: payment.paidAt ? formatDate(payment.paidAt) : "Not paid",
                },
              ]}
            />
            <div className="flex flex-wrap gap-2">
              <Link
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                href={`/tenants/${payment.tenant.id}`}
              >
                Open tenant
              </Link>
            </div>
          </div>
        )}
      />
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(value));
}
