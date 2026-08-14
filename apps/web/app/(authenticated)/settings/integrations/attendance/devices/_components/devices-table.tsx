"use client";

import Link from "next/link";
import { useMemo } from "react";

import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { EmptyState } from "@/app/components/ui/empty-state";
import { StatusPill } from "@/app/components/ui/status-pill";
import {
  deviceHealthLabel,
  deviceHealthTone,
  deviceStatusLabel,
  deviceStatusTone,
  directionModeLabel,
  formatDateTime,
} from "../../_lib/presentation";
import type { DeviceSummary } from "../../_lib/types";

/**
 * Attendance devices.
 *
 * Health shows "Not checked yet" for every device today. That is accurate:
 * nothing has contacted a terminal, because the component that would do so
 * arrives with the gateway runtime. Rendering it as a red fault would be wrong.
 */
export function DevicesTable({
  devices,
  canManage,
}: {
  devices: DeviceSummary[];
  canManage: boolean;
}) {
  const columns = useMemo<DataTableColumn<DeviceSummary>[]>(
    () => [
      {
        key: "name",
        header: "Device",
        sortable: true,
        filterable: true,
        filterType: "text",
        searchable: true,
        sortAccessor: (row) => row.name,
        filterAccessor: (row) => row.name,
        searchAccessor: (row) => row.name,
        render: (row) => (
          <Link
            className="font-semibold text-foreground hover:text-accent"
            href={`/settings/integrations/attendance/devices/${row.id}`}
          >
            {row.name}
          </Link>
        ),
      },
      {
        key: "integration",
        header: "Integration",
        sortable: true,
        filterable: true,
        filterType: "select",
        sortAccessor: (row) => row.integration?.name ?? "",
        filterAccessor: (row) => row.integration?.name ?? "Unassigned",
        render: (row) => (
          <span className="text-sm text-foreground">
            {row.integration?.name ?? "—"}
          </span>
        ),
      },
      {
        key: "model",
        header: "Model",
        sortable: true,
        sortAccessor: (row) => row.model ?? "",
        render: (row) => (
          <span className="text-sm text-muted">{row.model ?? "—"}</span>
        ),
      },
      {
        key: "serialNumber",
        header: "Serial",
        searchable: true,
        searchAccessor: (row) => row.serialNumber ?? "",
        render: (row) => (
          <span className="font-mono text-xs text-muted">
            {row.serialNumber ?? "—"}
          </span>
        ),
      },
      {
        key: "workSite",
        header: "Work site",
        sortable: true,
        filterable: true,
        filterType: "select",
        sortAccessor: (row) => row.workSite?.name ?? "",
        filterAccessor: (row) => row.workSite?.name ?? "Not assigned",
        render: (row) =>
          row.workSite ? (
            <span className="text-sm text-foreground">{row.workSite.name}</span>
          ) : (
            <StatusPill tone="warning">Not assigned</StatusPill>
          ),
      },
      {
        key: "gateway",
        header: "Gateway",
        filterable: true,
        filterType: "select",
        filterAccessor: (row) => row.gateway?.name ?? "Not assigned",
        render: (row) => (
          <span className="text-sm text-foreground">
            {row.gateway?.name ?? "—"}
          </span>
        ),
      },
      {
        key: "directionMode",
        header: "Direction",
        filterable: true,
        filterType: "select",
        filterAccessor: (row) => directionModeLabel(row.directionMode),
        render: (row) => (
          <span className="text-sm text-muted">
            {directionModeLabel(row.directionMode)}
          </span>
        ),
      },
      {
        key: "healthStatus",
        header: "Health",
        filterable: true,
        filterType: "select",
        filterAccessor: (row) => deviceHealthLabel(row.healthStatus),
        render: (row) => (
          <StatusPill tone={deviceHealthTone(row.healthStatus)}>
            {deviceHealthLabel(row.healthStatus)}
          </StatusPill>
        ),
      },
      {
        key: "status",
        header: "Status",
        sortable: true,
        filterable: true,
        filterType: "select",
        sortAccessor: (row) => deviceStatusLabel(row.status),
        filterAccessor: (row) => deviceStatusLabel(row.status),
        render: (row) => (
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={deviceStatusTone(row.status)}>
              {deviceStatusLabel(row.status)}
            </StatusPill>
            {!row.isEnabled ? (
              <StatusPill tone="muted">Disabled</StatusPill>
            ) : null}
          </div>
        ),
      },
      {
        key: "lastSeenAt",
        header: "Last seen",
        sortable: true,
        sortAccessor: (row) => (row.lastSeenAt ? new Date(row.lastSeenAt) : null),
        render: (row) => (
          <span className="text-sm text-muted">
            {formatDateTime(row.lastSeenAt)}
          </span>
        ),
      },
    ],
    [],
  );

  if (devices.length === 0) {
    return (
      <EmptyState
        title="No attendance devices added"
        description="Add the terminals your employees use to clock in, and assign each one to a work site."
        action={
          canManage ? (
            <Link
              className="inline-flex rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
              href="/settings/integrations/attendance/devices/new"
            >
              Add device
            </Link>
          ) : null
        }
      />
    );
  }

  return (
    <DataTable
      rows={devices}
      columns={columns}
      getRowKey={(row) => row.id}
      entityLogicalName="attendance_device"
      searchPlaceholder="Search devices"
      initialSort={{ columnKey: "name", direction: "asc" }}
      emptyState={
        <EmptyState
          title="No devices match your filters"
          description="Adjust the filters or search to see more results."
        />
      }
    />
  );
}
