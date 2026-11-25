"use client";

import type { ReactNode } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDate } from "@/lib/formatting-context";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  priorityTone,
  slaBadge,
  statusTone,
  type WorkItem,
} from "../_lib/work-items";

/**
 * The one table both work screens render. Status, priority and SLA standing
 * always carry text, never colour alone.
 */
export function WorkItemsTable({
  emptyState,
  entityLogicalName,
  extraColumns = [],
  queueNames,
  renderActions,
  rows,
}: {
  emptyState: ReactNode;
  entityLogicalName: string;
  extraColumns?: DataTableColumn<WorkItem>[];
  queueNames: ReadonlyMap<string, string>;
  renderActions: (row: WorkItem) => ReactNode;
  rows: WorkItem[];
}) {
  const columns: DataTableColumn<WorkItem>[] = [
    {
      key: "title",
      header: "Work item",
      sortable: true,
      sortAccessor: (row) => row.title,
      searchAccessor: (row) => row.title,
      render: (row) => (
        <div>
          <p className="font-medium text-foreground">{row.title}</p>
          <p className="text-xs text-muted">{row.kind.replace(/_/g, " ").toLowerCase()}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      sortAccessor: (row) => row.status,
      render: (row) => (
        <StatusPill tone={statusTone(row.status)}>
          {STATUS_LABELS[row.status] ?? row.status}
        </StatusPill>
      ),
    },
    {
      key: "priority",
      header: "Priority",
      sortable: true,
      sortAccessor: (row) => row.priority,
      render: (row) => (
        <StatusPill tone={priorityTone(row.priority)}>
          {PRIORITY_LABELS[row.priority] ?? row.priority}
        </StatusPill>
      ),
    },
    {
      key: "due",
      header: "Due",
      sortable: true,
      sortAccessor: (row) => row.dueAt ?? row.resolutionDueAt,
      render: (row) => {
        const due = row.dueAt ?? row.resolutionDueAt;
        return due ? formatDate(due) : <span className="text-muted">None</span>;
      },
    },
    {
      key: "sla",
      header: "SLA",
      render: (row) => {
        const response = slaBadge(row.sla?.response);
        const resolution = slaBadge(row.sla?.resolution);
        return (
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={response.tone}>
              {`Response: ${response.label}`}
            </StatusPill>
            <StatusPill tone={resolution.tone}>
              {`Resolution: ${resolution.label}`}
            </StatusPill>
          </div>
        );
      },
    },
    {
      key: "queue",
      header: "Queue",
      searchAccessor: (row) => (row.queueId ? queueNames.get(row.queueId) : ""),
      render: (row) =>
        row.queueId ? (
          (queueNames.get(row.queueId) ?? row.queueId.slice(0, 8))
        ) : (
          <span className="text-muted">None</span>
        ),
    },
    ...extraColumns,
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-2">{renderActions(row)}</div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      emptyState={emptyState}
      entityLogicalName={entityLogicalName}
      getRowKey={(row) => row.id}
      rows={rows}
      searchPlaceholder="Search work"
    />
  );
}
