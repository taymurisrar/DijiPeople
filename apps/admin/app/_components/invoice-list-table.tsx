"use client";

import Link from "next/link";
import { DataTable } from "@/app/_components/crm/data-table";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
import { InvoiceStatusForm } from "@/app/_components/invoice-status-form";

export type InvoiceTableRecord = {
  id: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  issueDate: string;
  dueDate: string;
  status: "DRAFT" | "ISSUED" | "PAID" | "OVERDUE";
  tenant: { id: string; name: string; slug: string };
  subscription: { id: string; plan: { name: string } };
};

export function InvoiceListTable({ invoices }: { invoices: InvoiceTableRecord[] }) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <DataTable
        rows={invoices}
        rowKey={(invoice) => invoice.id}
        stickyHeader
        columns={[
          {
            key: "invoice",
            header: "Invoice",
            minWidth: 180,
            render: (invoice) => (
              <div>
                <div className="font-semibold text-slate-950">{invoice.invoiceNumber}</div>
                <Link className="mt-1 inline-flex text-xs text-slate-500 hover:text-slate-950" href={`/invoices/${invoice.id}`}>
                  View detail
                </Link>
              </div>
            ),
          },
          {
            key: "tenant",
            header: "Tenant",
            minWidth: 220,
            render: (invoice) => (
              <div>
                <div className="font-medium text-slate-950">{invoice.tenant.name}</div>
                <div className="mt-1 text-slate-500">{invoice.tenant.slug}</div>
              </div>
            ),
          },
          {
            key: "plan",
            header: "Plan",
            minWidth: 160,
            render: (invoice) => invoice.subscription.plan.name,
          },
          {
            key: "amount",
            header: "Amount",
            minWidth: 140,
            render: (invoice) => `${invoice.currency} ${invoice.amount.toFixed(2)}`,
          },
          {
            key: "issueDate",
            header: "Issued",
            minWidth: 140,
            render: (invoice) => formatDate(invoice.issueDate),
          },
          {
            key: "dueDate",
            header: "Due",
            minWidth: 140,
            render: (invoice) => formatDate(invoice.dueDate),
          },
          {
            key: "status",
            header: "Status",
            minWidth: 130,
            render: (invoice) => <TenantStatusBadge value={invoice.status} />,
          },
          {
            key: "actions",
            header: "Actions",
            minWidth: 210,
            sticky: "right",
            cellClassName: "bg-white",
            headerClassName: "bg-slate-50",
            render: (invoice) => <InvoiceStatusForm currentStatus={invoice.status} invoiceId={invoice.id} />,
          },
        ]}
        emptyTitle="No invoices yet"
        emptyDescription="Draft and issued invoices will appear here."
      />
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}
