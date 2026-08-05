"use client";

import Link from "next/link";
import { useState } from "react";
import { ProDataTable } from "@/app/_components/crm/data-table";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
import { formatCurrency, formatDate } from "@/lib/formatters";

export type TenantInvoice = {
  id: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  issueDate: string;
  dueDate: string;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  paidAt: string | null;
  amountPaid: number;
  amountDue: number;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
};

export function TenantInvoicesTable({
  invoices,
}: {
  invoices: TenantInvoice[];
}) {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(invoices.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rows = invoices.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  return (
    <ProDataTable
      rows={rows}
      rowKey={(invoice) => invoice.id}
      emptyTitle="No invoices"
      emptyDescription="No invoices are linked to this tenant subscription yet."
      pagination={{
        page: currentPage,
        pageSize,
        totalRecords: invoices.length,
        onPageChange: setPage,
      }}
      columns={[
        {
          key: "number",
          header: "Invoice",
          render: (invoice) => (
            <span className="font-semibold text-slate-950">
              {invoice.invoiceNumber}
            </span>
          ),
        },
        {
          key: "period",
          header: "Billing period",
          render: (invoice) =>
            invoice.periodStart
              ? `${formatDate(invoice.periodStart)} - ${formatDate(invoice.periodEnd)}`
              : formatDate(invoice.issueDate),
        },
        {
          key: "status",
          header: "Status",
          render: (invoice) => <TenantStatusBadge value={invoice.status} />,
        },
        {
          key: "due",
          header: "Due date",
          render: (invoice) => formatDate(invoice.dueDate),
        },
        {
          key: "paid",
          header: "Paid date",
          render: (invoice) => formatDate(invoice.paidAt),
        },
        {
          key: "amount",
          header: "Amount",
          align: "right",
          render: (invoice) => formatCurrency(invoice.amount, invoice.currency),
        },
        {
          key: "payment",
          header: "Payment",
          render: (invoice) =>
            invoice.amountDue <= 0
              ? "Paid"
              : `${formatCurrency(invoice.amountDue, invoice.currency)} due`,
        },
        {
          key: "actions",
          header: "Actions",
          align: "right",
          render: (invoice) =>
            invoice.hostedInvoiceUrl || invoice.invoicePdfUrl ? (
              <Link
                className="font-semibold text-slate-700 hover:text-slate-950"
                href={invoice.hostedInvoiceUrl ?? invoice.invoicePdfUrl ?? "#"}
                target="_blank"
              >
                Open
              </Link>
            ) : (
              <Link
                className="font-semibold text-slate-700 hover:text-slate-950"
                href={`/invoices/${invoice.id}`}
              >
                Details
              </Link>
            ),
        },
      ]}
    />
  );
}
