"use client";

import Link from "next/link";
import { useMemo } from "react";

import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { EmptyState } from "@/app/components/ui/empty-state";
import { StatusPill } from "@/app/components/ui/status-pill";
import {
  formatDateTime,
  gatewayStatusLabel,
  gatewayStatusTone,
} from "../../_lib/presentation";
import type { GatewayDetail } from "../../_lib/types";

export function GatewaysTable({
  gateways,
  canManage,
}: {
  gateways: GatewayDetail[];
  canManage: boolean;
}) {
  const columns = useMemo<DataTableColumn<GatewayDetail>[]>(
    () => [
      {
        key: "name",
        header: "Gateway",
        sortable: true,
        searchable: true,
        sortAccessor: (row) => row.name,
        searchAccessor: (row) => row.name,
        render: (row) => (
          <Link
            className="font-semibold text-foreground hover:text-accent"
            href={`/settings/integrations/attendance/gateways/${row.id}`}
          >
            {row.name}
          </Link>
        ),
      },
      {
        key: "status",
        header: "Status",
        sortable: true,
        filterable: true,
        filterType: "select",
        sortAccessor: (row) => gatewayStatusLabel(row.status),
        filterAccessor: (row) => gatewayStatusLabel(row.status),
        render: (row) => (
          <StatusPill tone={gatewayStatusTone(row.status)}>
            {gatewayStatusLabel(row.status)}
          </StatusPill>
        ),
      },
      {
        key: "version",
        header: "Version",
        render: (row) => (
          <span className="text-sm text-muted">{row.version ?? "—"}</span>
        ),
      },
      {
        key: "platform",
        header: "Platform",
        filterable: true,
        filterType: "select",
        filterAccessor: (row) => row.platform ?? "Unknown",
        render: (row) => (
          <span className="text-sm text-muted">
            {row.platform ?? "—"}
            {row.architecture ? ` · ${row.architecture}` : ""}
          </span>
        ),
      },
      {
        key: "lastHeartbeatAt",
        header: "Last contact",
        sortable: true,
        sortAccessor: (row) =>
          row.lastHeartbeatAt ? new Date(row.lastHeartbeatAt) : null,
        render: (row) => (
          <span className="text-sm text-muted">
            {formatDateTime(row.lastHeartbeatAt)}
          </span>
        ),
      },
      {
        key: "deviceCount",
        header: "Devices",
        sortable: true,
        sortAccessor: (row) => row.deviceCount,
        render: (row) => (
          <span className="text-sm text-foreground">{row.deviceCount}</span>
        ),
      },
      {
        key: "integrationCount",
        header: "Integrations",
        sortable: true,
        sortAccessor: (row) => row.integrationCount,
        render: (row) => (
          <span className="text-sm text-foreground">{row.integrationCount}</span>
        ),
      },
      {
        key: "registeredAt",
        header: "Registered",
        sortable: true,
        sortAccessor: (row) =>
          row.registeredAt ? new Date(row.registeredAt) : null,
        render: (row) => (
          <span className="text-sm text-muted">
            {formatDateTime(row.registeredAt)}
          </span>
        ),
      },
    ],
    [],
  );

  if (gateways.length === 0) {
    return (
      <EmptyState
        title="No local gateways configured"
        description="A gateway is required for attendance devices that are only reachable inside your office network."
        action={
          canManage ? (
            <Link
              className="inline-flex rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
              href="/settings/integrations/attendance/gateways/new"
            >
              Set up gateway
            </Link>
          ) : null
        }
      />
    );
  }

  return (
    <DataTable
      rows={gateways}
      columns={columns}
      getRowKey={(row) => row.id}
      entityLogicalName="integration_gateway"
      searchPlaceholder="Search gateways"
      initialSort={{ columnKey: "name", direction: "asc" }}
      emptyState={
        <EmptyState
          title="No gateways match your filters"
          description="Adjust the filters or search to see more results."
        />
      }
    />
  );
}
