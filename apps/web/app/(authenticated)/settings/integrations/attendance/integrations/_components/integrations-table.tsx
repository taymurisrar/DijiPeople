"use client";

import Link from "next/link";
import { useMemo } from "react";

import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { EmptyState } from "@/app/components/ui/empty-state";
import { StatusPill } from "@/app/components/ui/status-pill";
import {
  connectionModeLabel,
  describeSchedule,
  formatDateTime,
  statusLabel,
  statusTone,
} from "../../_lib/presentation";
import type { ConnectorSummary, IntegrationSummary } from "../../_lib/types";

/**
 * Integrations list.
 *
 * Readiness is shown as separate columns — Gateway, Devices and Device
 * verification — rather than one traffic light. An integration can be perfectly
 * configured and still not collecting attendance because no gateway has been
 * paired; collapsing that into a single red dot would hide which of them an
 * administrator actually needs to act on.
 */
export function IntegrationsTable({
  integrations,
  connectors,
  canManage,
}: {
  integrations: IntegrationSummary[];
  connectors: ConnectorSummary[];
  canManage: boolean;
}) {
  const connectorLabels = useMemo(
    () =>
      new Map(
        connectors.map((connector) => [
          connector.connectorType,
          connector.displayName,
        ]),
      ),
    [connectors],
  );

  const columns = useMemo<DataTableColumn<IntegrationSummary>[]>(
    () => [
      {
        key: "name",
        header: "Name",
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
            href={`/settings/integrations/attendance/integrations/${row.id}`}
          >
            {row.name}
          </Link>
        ),
      },
      {
        key: "connector",
        header: "Connector",
        sortable: true,
        filterable: true,
        filterType: "select",
        searchable: true,
        sortAccessor: (row) =>
          connectorLabels.get(row.connectorType) ?? row.connectorType,
        filterAccessor: (row) =>
          connectorLabels.get(row.connectorType) ?? row.connectorType,
        searchAccessor: (row) => row.connectorType,
        render: (row) => (
          <span className="text-sm text-foreground">
            {connectorLabels.get(row.connectorType) ?? row.connectorType}
          </span>
        ),
      },
      {
        key: "connectionMode",
        header: "Connection",
        sortable: true,
        filterable: true,
        filterType: "select",
        sortAccessor: (row) => connectionModeLabel(row.connectionMode),
        filterAccessor: (row) => connectionModeLabel(row.connectionMode),
        render: (row) => (
          <span className="text-sm text-foreground">
            {connectionModeLabel(row.connectionMode)}
          </span>
        ),
      },
      {
        key: "gateway",
        header: "Gateway",
        filterable: true,
        filterType: "select",
        filterAccessor: (row) => row.gateway?.name ?? "Not assigned",
        render: (row) =>
          row.gateway ? (
            <span className="text-sm text-foreground">{row.gateway.name}</span>
          ) : row.connectionMode === "LOCAL_GATEWAY" ? (
            <StatusPill tone="warning">Required</StatusPill>
          ) : (
            <span className="text-sm text-muted">Not needed</span>
          ),
      },
      {
        key: "schedule",
        header: "Sync schedule",
        filterAccessor: (row) => row.syncPolicy?.name ?? "Not scheduled",
        render: (row) => (
          <span className="text-sm text-foreground">
            {describeSchedule(row.syncPolicy)}
          </span>
        ),
      },
      {
        key: "devices",
        header: "Devices",
        sortable: true,
        sortAccessor: (row) => row.deviceCount,
        render: (row) =>
          row.deviceCount > 0 ? (
            <span className="text-sm text-foreground">{row.deviceCount}</span>
          ) : (
            <StatusPill tone="warning">None</StatusPill>
          ),
      },
      {
        key: "deviceVerification",
        header: "Device verification",
        // Never rendered as a failure: nothing has attempted verification yet,
        // because no gateway runtime exists to attempt it.
        filterAccessor: () => "Awaiting gateway",
        render: () => <StatusPill tone="info">Awaiting gateway</StatusPill>,
      },
      {
        key: "status",
        header: "Status",
        sortable: true,
        filterable: true,
        filterType: "select",
        sortAccessor: (row) => statusLabel(row.status),
        filterAccessor: (row) => statusLabel(row.status),
        render: (row) => (
          <StatusPill tone={statusTone(row.status)}>
            {statusLabel(row.status)}
          </StatusPill>
        ),
      },
      {
        key: "lastSuccessfulSyncAt",
        header: "Last successful sync",
        sortable: true,
        sortAccessor: (row) =>
          row.lastSuccessfulSyncAt ? new Date(row.lastSuccessfulSyncAt) : null,
        render: (row) => (
          <span className="text-sm text-muted">
            {formatDateTime(row.lastSuccessfulSyncAt)}
          </span>
        ),
      },
    ],
    [connectorLabels],
  );

  if (integrations.length === 0) {
    return (
      <EmptyState
        title="No attendance integrations configured"
        description="Connect an attendance system or attendance device provider to DijiPeople."
        action={
          canManage ? (
            <Link
              className="inline-flex rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
              href="/settings/integrations/attendance/integrations/new"
            >
              Add integration
            </Link>
          ) : null
        }
      />
    );
  }

  return (
    <DataTable
      rows={integrations}
      columns={columns}
      getRowKey={(row) => row.id}
      entityLogicalName="attendance_integration"
      searchPlaceholder="Search integrations"
      initialSort={{ columnKey: "name", direction: "asc" }}
      emptyState={
        <EmptyState
          title="No integrations match your filters"
          description="Adjust the filters or search to see more results."
        />
      }
    />
  );
}
