"use client";

import { useCallback, useEffect, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { DateField } from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import { workRequest } from "../../../work/_lib/work-client";
import {
  WORKLOAD_CAVEAT,
  buildWorkloadQuery,
  defaultWorkloadPeriod,
  formatMinutes,
  loadLabel,
  loadTone,
  validateWorkloadPeriod,
  type Workload,
  type WorkloadPerson,
} from "../../../work/_lib/project-work";

const COLUMNS: DataTableColumn<WorkloadPerson>[] = [
  {
    key: "name",
    header: "Person",
    sortable: true,
    sortAccessor: (row) => row.name,
    searchAccessor: (row) => row.name,
    render: (row) => <span className="font-medium text-foreground">{row.name}</span>,
  },
  {
    key: "openItems",
    header: "Open items",
    sortable: true,
    sortAccessor: (row) => row.openItems,
    render: (row) => row.openItems,
  },
  {
    key: "committed",
    header: "Committed",
    sortable: true,
    sortAccessor: (row) => row.committedMinutes,
    render: (row) => formatMinutes(row.committedMinutes),
  },
  {
    key: "unestimated",
    header: "Unestimated items",
    sortable: true,
    sortAccessor: (row) => row.unestimatedItems,
    render: (row) => row.unestimatedItems,
  },
  {
    key: "overdue",
    header: "Overdue",
    sortable: true,
    sortAccessor: (row) => row.overdue,
    render: (row) => row.overdue,
  },
  {
    key: "load",
    header: "Load",
    sortable: true,
    sortAccessor: (row) => row.loadPercent,
    render: (row) => (
      <StatusPill tone={loadTone(row.loadPercent)}>
        {loadLabel(row.loadPercent)}
      </StatusPill>
    ),
  },
];

/** Who is committed to how much of a period, against a standard week. */
export function WorkloadPanel({ projectId }: { projectId: string }) {
  const [period, setPeriod] = useState(() => defaultWorkloadPeriod());
  const [data, setData] = useState<Workload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (range: { from: string; to: string }) => {
      const problem = validateWorkloadPeriod(range);
      if (problem) {
        setError(problem);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        setData(
          await workRequest<Workload>(
            "work-items",
            `/workload?${buildWorkloadQuery({ ...range, projectId })}`,
          ),
        );
      } catch (e) {
        setData(null);
        setError(e instanceof Error ? e.message : "The request failed.");
      } finally {
        setLoading(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    void load(defaultWorkloadPeriod());
  }, [load]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <DateField
          label="Period start"
          onChange={(from) => setPeriod((p) => ({ ...p, from }))}
          value={period.from}
        />
        <DateField
          label="Period end"
          onChange={(to) => setPeriod((p) => ({ ...p, to }))}
          value={period.to}
        />
        <Button
          loading={loading}
          onClick={() => void load(period)}
          variant="secondary"
        >
          Show workload
        </Button>
      </div>
      <p className="text-sm text-muted">{WORKLOAD_CAVEAT}</p>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {data ? (
        <div aria-busy={loading}>
          <p className="mb-2 text-sm text-foreground">
            {`Capacity for the period: ${formatMinutes(data.capacityMinutes)} per person`}
          </p>
          <DataTable
            columns={COLUMNS}
            emptyState={
              <EmptyState
                description="No one has estimated or assigned work in this period."
                title="No workload to show"
              />
            }
            entityLogicalName="project-workload"
            getRowKey={(row) => row.employeeId}
            rows={data.people}
            searchPlaceholder="Search people"
          />
        </div>
      ) : loading ? (
        <div
          aria-busy="true"
          aria-label="Loading workload"
          className="h-40 animate-pulse rounded-[24px] bg-surface-strong"
          role="status"
        />
      ) : null}
    </div>
  );
}
