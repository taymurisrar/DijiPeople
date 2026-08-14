"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { EmptyState } from "@/app/components/ui/empty-state";
import { StatusPill } from "@/app/components/ui/status-pill";
import {
  canCancelJob,
  canRetryJob,
  formatDateTime,
  provisioningOperationLabel,
  provisioningStatusLabel,
  provisioningStatusTone,
} from "../../_lib/presentation";
import type { ProvisioningJob } from "../../_lib/types";

/**
 * Provisioning jobs.
 *
 * Retry requeues a job; it never triggers a device write from the browser. There
 * is deliberately no "run now against the device" action — the gateway picks
 * queued work up, and offering a synchronous button would imply a capability
 * that does not exist.
 */
export function ProvisioningTable({
  jobs,
  canManage,
}: {
  jobs: ProvisioningJob[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(jobId: string, action: "retry" | "cancel") {
    setBusyId(jobId);
    setError(null);

    try {
      const response = await fetch(
        `/api/integrations/attendance/provisioning-jobs/${jobId}/${action}`,
        { method: "POST" },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(
          (body as { message?: string } | null)?.message ??
            "The job could not be updated.",
        );
        return;
      }
      router.refresh();
    } catch {
      setError("The job could not be updated. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  const columns = useMemo<DataTableColumn<ProvisioningJob>[]>(
    () => [
      {
        key: "employee",
        header: "Employee",
        sortable: true,
        searchable: true,
        sortAccessor: (row) =>
          row.employee ? `${row.employee.firstName} ${row.employee.lastName}` : "",
        searchAccessor: (row) =>
          row.employee
            ? `${row.employee.firstName} ${row.employee.lastName} ${row.employee.employeeCode}`
            : "",
        render: (row) =>
          row.employee ? (
            <div>
              <p className="text-sm font-semibold text-foreground">
                {row.employee.firstName} {row.employee.lastName}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {row.employee.employeeCode}
              </p>
            </div>
          ) : (
            <span className="text-sm text-muted">—</span>
          ),
      },
      {
        key: "device",
        header: "Device",
        filterable: true,
        filterType: "select",
        filterAccessor: (row) => row.device?.name ?? "—",
        render: (row) => (
          <span className="text-sm text-foreground">
            {row.device?.name ?? "—"}
          </span>
        ),
      },
      {
        key: "operation",
        header: "Operation",
        filterable: true,
        filterType: "select",
        filterAccessor: (row) => provisioningOperationLabel(row.operation),
        render: (row) => (
          <span className="text-sm text-foreground">
            {provisioningOperationLabel(row.operation)}
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        sortable: true,
        filterable: true,
        filterType: "select",
        sortAccessor: (row) => provisioningStatusLabel(row.status),
        filterAccessor: (row) => provisioningStatusLabel(row.status),
        render: (row) => (
          <StatusPill tone={provisioningStatusTone(row.status)}>
            {provisioningStatusLabel(row.status)}
          </StatusPill>
        ),
      },
      {
        key: "attemptCount",
        header: "Attempts",
        sortable: true,
        sortAccessor: (row) => row.attemptCount,
        render: (row) => (
          <span className="text-sm text-muted">
            {row.attemptCount} of {row.maxAttempts}
          </span>
        ),
      },
      {
        key: "requestedAt",
        header: "Requested",
        sortable: true,
        sortAccessor: (row) => new Date(row.requestedAt),
        render: (row) => (
          <span className="text-sm text-muted">
            {formatDateTime(row.requestedAt)}
          </span>
        ),
      },
      {
        key: "error",
        header: "Error",
        render: (row) =>
          row.errorMessage ? (
            <span className="text-xs text-red-700">{row.errorMessage}</span>
          ) : (
            <span className="text-sm text-muted">—</span>
          ),
      },
      {
        key: "actions",
        header: "",
        render: (row) => {
          if (!canManage) return null;
          const retryable = canRetryJob(row.status);
          const cancellable = canCancelJob(row.status);
          if (!retryable && !cancellable) return null;

          return (
            <div className="flex gap-2">
              {retryable ? (
                <button
                  type="button"
                  className="rounded-2xl border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface-strong disabled:opacity-50"
                  disabled={busyId === row.id}
                  onClick={() => void act(row.id, "retry")}
                >
                  Retry
                </button>
              ) : null}
              {cancellable ? (
                <button
                  type="button"
                  className="rounded-2xl border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface-strong disabled:opacity-50"
                  disabled={busyId === row.id}
                  onClick={() => void act(row.id, "cancel")}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          );
        },
      },
    ],
    [busyId, canManage],
  );

  if (jobs.length === 0) {
    return (
      <EmptyState
        title="No provisioning jobs"
        description="When employees are sent to attendance devices, each device gets its own job here so you can see exactly what succeeded."
      />
    );
  }

  return (
    <div className="grid gap-4">
      {error ? (
        <p className="text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <DataTable
        rows={jobs}
        columns={columns}
        getRowKey={(row) => row.id}
        entityLogicalName="device_provisioning_job"
        searchPlaceholder="Search by employee"
        initialSort={{ columnKey: "requestedAt", direction: "desc" }}
        emptyState={
          <EmptyState
            title="No jobs match your filters"
            description="Adjust the filters or search to see more results."
          />
        }
      />
    </div>
  );
}
