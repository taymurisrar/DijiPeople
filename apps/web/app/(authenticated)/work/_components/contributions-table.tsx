"use client";

import type { ReactNode } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDateTime } from "@/lib/formatting-context";
import {
  CATEGORY_LABELS,
  SOURCE_LABELS,
  STATE_LABELS,
  VERIFICATION_LABELS,
  WORK_KIND_LABELS,
  describeAmount,
  stateTone,
  verificationTone,
  type ContributionEntry,
} from "../_lib/contributions";
import { personLabel, type PersonOption } from "../_lib/people";

/**
 * The one table of contribution entries, shared by "My evidence" and the review
 * view. Source, verification and state are always text pills, and a quantity is
 * shown in its own unit.
 */
export function ContributionsTable({
  emptyState,
  entityLogicalName,
  people,
  renderActions,
  rows,
}: {
  emptyState: ReactNode;
  entityLogicalName: string;
  /** When given, a Person column names who the entry belongs to. */
  people?: readonly PersonOption[];
  renderActions: (row: ContributionEntry) => ReactNode;
  rows: ContributionEntry[];
}) {
  const columns: DataTableColumn<ContributionEntry>[] = [
    {
      key: "occurredAt",
      header: "When",
      sortable: true,
      sortAccessor: (row) => row.occurredAt,
      render: (row) => (
        <div>
          <p className="font-medium text-foreground">
            {formatDateTime(row.occurredAt)}
          </p>
          {row.capturedOffline ? (
            <p className="text-xs text-muted">Captured offline</p>
          ) : null}
        </div>
      ),
    },
    ...(people
      ? [
          {
            key: "person",
            header: "Person",
            sortable: true,
            sortAccessor: (row: ContributionEntry) =>
              personLabel(people, row.employeeId),
            searchAccessor: (row: ContributionEntry) =>
              personLabel(people, row.employeeId),
            render: (row: ContributionEntry) =>
              personLabel(people, row.employeeId),
          } satisfies DataTableColumn<ContributionEntry>,
        ]
      : []),
    {
      key: "kind",
      header: "Work",
      sortable: true,
      sortAccessor: (row) => row.workKind,
      searchAccessor: (row) => `${row.workKind} ${row.note ?? ""}`,
      render: (row) => (
        <div>
          <p className="font-medium text-foreground">
            {WORK_KIND_LABELS[row.workKind] ?? row.workKind}
          </p>
          <p className="text-xs text-muted">
            {CATEGORY_LABELS[row.category] ?? row.category}
          </p>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      render: (row) => describeAmount(row),
    },
    {
      key: "source",
      header: "Source",
      render: (row) => (
        <StatusPill tone="neutral">
          {SOURCE_LABELS[row.source] ?? row.source}
        </StatusPill>
      ),
    },
    {
      key: "verification",
      header: "Verification",
      sortable: true,
      sortAccessor: (row) => row.verification,
      render: (row) => (
        <StatusPill tone={verificationTone(row.verification)}>
          {VERIFICATION_LABELS[row.verification] ?? row.verification}
        </StatusPill>
      ),
    },
    {
      key: "state",
      header: "State",
      render: (row) => (
        <StatusPill tone={stateTone(row.state)}>
          {`${STATE_LABELS[row.state] ?? row.state}, revision ${row.revision}`}
        </StatusPill>
      ),
    },
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
      searchPlaceholder="Search evidence"
    />
  );
}
