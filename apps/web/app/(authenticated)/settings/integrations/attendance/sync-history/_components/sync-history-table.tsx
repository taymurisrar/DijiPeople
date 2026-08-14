"use client";

import { useMemo } from "react";

import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { EmptyState } from "@/app/components/ui/empty-state";
import { StatusPill } from "@/app/components/ui/status-pill";
import {
  formatDateTime,
  formatDuration,
  runStatusLabel,
  runStatusTone,
  runTypeLabel,
} from "../../_lib/presentation";
import type { IntegrationRun } from "../../_lib/types";

/**
 * Synchronisation history.
 *
 * Shows counts and outcomes only. Connector configuration never appears here —
 * the API's run projection excludes it, and nothing in this table would render
 * it even if it were present.
 */
export function SyncHistoryTable({ runs }: { runs: IntegrationRun[] }) {
  const columns = useMemo<DataTableColumn<IntegrationRun>[]>(
    () => [
      {
        key: "startedAt",
        header: "Started",
        sortable: true,
        sortAccessor: (row) => new Date(row.startedAt),
        render: (row) => (
          <span className="text-sm text-foreground">
            {formatDateTime(row.startedAt)}
          </span>
        ),
      },
      {
        key: "integration",
        header: "Integration",
        filterable: true,
        filterType: "select",
        searchable: true,
        filterAccessor: (row) => row.integration?.name ?? "—",
        searchAccessor: (row) => row.integration?.name ?? "",
        render: (row) => (
          <span className="text-sm text-foreground">
            {row.integration?.name ?? "—"}
          </span>
        ),
      },
      {
        key: "device",
        header: "Device",
        filterable: true,
        filterType: "select",
        filterAccessor: (row) => row.device?.name ?? "All devices",
        render: (row) => (
          <span className="text-sm text-muted">
            {row.device?.name ?? "All devices"}
          </span>
        ),
      },
      {
        key: "gateway",
        header: "Gateway",
        filterable: true,
        filterType: "select",
        filterAccessor: (row) => row.gateway?.name ?? "—",
        render: (row) => (
          <span className="text-sm text-muted">{row.gateway?.name ?? "—"}</span>
        ),
      },
      {
        key: "runType",
        header: "Type",
        filterable: true,
        filterType: "select",
        filterAccessor: (row) => runTypeLabel(row.runType),
        render: (row) => (
          <span className="text-sm text-foreground">
            {runTypeLabel(row.runType)}
          </span>
        ),
      },
      {
        key: "status",
        header: "Result",
        sortable: true,
        filterable: true,
        filterType: "select",
        sortAccessor: (row) => runStatusLabel(row.status),
        filterAccessor: (row) => runStatusLabel(row.status),
        render: (row) => (
          <StatusPill tone={runStatusTone(row.status)}>
            {runStatusLabel(row.status)}
          </StatusPill>
        ),
      },
      {
        key: "records",
        header: "Records",
        render: (row) => (
          <div className="text-xs leading-5 text-muted">
            <p className="text-sm font-semibold text-foreground">
              {row.recordsRead} read
            </p>
            <p>
              {row.recordsNew} new · {row.recordsDuplicate} duplicate
            </p>
            <p>
              {row.recordsMapped} mapped · {row.recordsUnmapped} unmapped
              {row.recordsFailed > 0 ? ` · ${row.recordsFailed} failed` : ""}
            </p>
          </div>
        ),
      },
      {
        key: "durationMs",
        header: "Duration",
        sortable: true,
        sortAccessor: (row) => row.durationMs ?? 0,
        render: (row) => (
          <span className="text-sm text-muted">
            {formatDuration(row.durationMs)}
          </span>
        ),
      },
      {
        key: "error",
        header: "Error",
        render: (row) =>
          row.errorMessage ? (
            <span className="text-xs text-red-700">
              {row.errorCode ? `${row.errorCode}: ` : ""}
              {row.errorMessage}
            </span>
          ) : (
            <span className="text-sm text-muted">—</span>
          ),
      },
    ],
    [],
  );

  if (runs.length === 0) {
    return (
      <EmptyState
        title="No synchronisation runs yet"
        description="Once an integration is active and a gateway is connected, every sync appears here with what it collected."
      />
    );
  }

  return (
    <DataTable
      rows={runs}
      columns={columns}
      getRowKey={(row) => row.id}
      entityLogicalName="integration_run"
      searchPlaceholder="Search by integration"
      initialSort={{ columnKey: "startedAt", direction: "desc" }}
      emptyState={
        <EmptyState
          title="No runs match your filters"
          description="Adjust the filters or search to see more results."
        />
      }
    />
  );
}
