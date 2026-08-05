"use client";

import Link from "next/link";
import { ProDataTable } from "@/app/_components/crm/data-table";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
import { InvoiceStatusForm } from "@/app/_components/invoice-status-form";
import { AdminKeyValueGrid } from "@/app/_components/admin-ui";

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
      <ProDataTable
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
        renderExpandedRow={(invoice) => (
          <div className="space-y-3">
            <AdminKeyValueGrid
              items={[
                { label: "Invoice ID", value: invoice.id },
                { label: "Invoice number", value: invoice.invoiceNumber },
                { label: "Tenant", value: invoice.tenant.name },
                { label: "Tenant slug", value: invoice.tenant.slug },
                { label: "Subscription", value: invoice.subscription.plan.name },
                { label: "Issue date", value: formatDate(invoice.issueDate) },
                { label: "Due date", value: formatDate(invoice.dueDate) },
                { label: "Amount", value: `${invoice.currency} ${invoice.amount.toFixed(2)}` },
              ]}
            />
            <div className="flex flex-wrap gap-2">
              <Link
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                href={`/invoices/${invoice.id}`}
              >
                Open invoice
              </Link>
              <Link
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                href={`/tenants/${invoice.tenant.id}`}
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
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}
