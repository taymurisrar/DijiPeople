"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { Button } from "@/app/components/ui/button";

export type DeliveryPayslip = {
  id: string;
  payslipNumber: string;
  status: string;
  deliveryStatus: string;
  deliveryAttempts: number;
  deliveredAt?: string | null;
  deliveryError?: string | null;
  employee?: { firstName?: string; lastName?: string; employeeCode?: string };
  payrollRun?: { payrollPeriod?: { name?: string } };
};

function generationLabel(status: string) {
  if (status === "PUBLISHED") return "Generated / Published";
  if (status === "GENERATED") return "Generated";
  return status.toLowerCase().replaceAll("_", " ");
}

function deliveryLabel(row: DeliveryPayslip) {
  if (row.deliveryStatus === "FAILED") return "Failed";
  if (row.deliveryStatus === "SENT") {
    return row.deliveryAttempts > 1 ? "Resent to provider" : "Sent to provider";
  }
  if (row.status === "PUBLISHED") return "Queued";
  return "Not queued";
}

export function PayslipDeliveryTable({
  canDeliver,
  canManage,
  payslips,
}: {
  canDeliver: boolean;
  canManage: boolean;
  payslips: DeliveryPayslip[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function action(id: string, operation: "deliver" | "regenerate") {
    setBusy(`${id}:${operation}`);
    setError(null);
    const response = await fetch(`/api/payslips/${id}/${operation}`, {
      method: "POST",
    });
    setBusy(null);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(body?.message ?? `Unable to ${operation} payslip.`);
      return;
    }
    router.refresh();
  }
  const columns: DataTableColumn<DeliveryPayslip>[] = [
    {
      key: "payslip",
      header: "Payslip",
      sortable: true,
      searchable: true,
      sortAccessor: (row) => row.payslipNumber,
      searchAccessor: (row) =>
        `${row.payslipNumber} ${row.employee?.firstName ?? ""} ${row.employee?.lastName ?? ""}`,
      render: (row) => (
        <Link
          className="font-semibold text-accent hover:underline"
          href={`/payroll/payslips/${row.id}`}
        >
          {row.payslipNumber}
          <span className="block text-xs font-normal text-muted">
            {row.employee?.firstName} {row.employee?.lastName} /{" "}
            {row.employee?.employeeCode}
          </span>
        </Link>
      ),
    },
    {
      key: "period",
      header: "Period",
      sortable: true,
      sortAccessor: (row) => row.payrollRun?.payrollPeriod?.name ?? "",
      render: (row) => row.payrollRun?.payrollPeriod?.name ?? "-",
    },
    {
      key: "generation",
      header: "Generation",
      sortable: true,
      filterable: true,
      filterAccessor: (row) => generationLabel(row.status),
      sortAccessor: (row) => generationLabel(row.status),
      render: (row) => generationLabel(row.status),
    },
    {
      key: "delivery",
      header: "Provider submission",
      sortable: true,
      filterable: true,
      filterAccessor: deliveryLabel,
      sortAccessor: deliveryLabel,
      render: (row) => (
        <span>
          {deliveryLabel(row)}
          <span className="block text-xs text-muted">
            {row.deliveryAttempts} provider attempt(s)
            {row.deliveryError ? ` / ${row.deliveryError}` : ""}
          </span>
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          {canManage && ["DRAFT", "GENERATED"].includes(row.status) ? (
            <Button
              disabled={Boolean(busy)}
              onClick={() => action(row.id, "regenerate")}
              size="sm"
              variant="secondary"
            >
              Regenerate
            </Button>
          ) : null}
          {canDeliver && row.status === "PUBLISHED" ? (
            <Button
              disabled={Boolean(busy)}
              onClick={() => action(row.id, "deliver")}
              size="sm"
              variant="secondary"
            >
              {row.deliveryAttempts > 0
                ? "Resend to provider"
                : "Send to provider"}
            </Button>
          ) : null}
          <a
            className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-accent"
            href={`/api/payslips/${row.id}/download`}
          >
            Download
          </a>
        </div>
      ),
    },
  ];
  return (
    <div className="grid gap-3">
      {error ? (
        <p className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <DataTable
        columns={columns}
        getRowKey={(row) => row.id}
        rows={payslips}
      />
    </div>
  );
}
