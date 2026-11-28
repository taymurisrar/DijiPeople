"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { SelectField } from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDateTime } from "@/lib/formatting-context";
import {
  DUTY_PAGE_SIZE,
  buildHandoversQuery,
  type DutyHandover,
  type Page,
  type TeamOption,
} from "../_lib/duties";
import { workRequest } from "../_lib/work-client";
import { DutyPager } from "./duty-pager";

type Status = "OPEN" | "ACKNOWLEDGED";

const STATUS_OPTIONS = [
  { value: "OPEN", label: "Open" },
  { value: "ACKNOWLEDGED", label: "Acknowledged" },
];

/**
 * Handovers the viewer sent or may acknowledge, longest-waiting first. Open ones
 * are the default so an unacknowledged handover stays in front of people. Only
 * the person or team it is addressed to can acknowledge; the API enforces that
 * and its message is shown as it arrives.
 */
export function DutyHandoversPanel({
  canWrite,
  initialPage,
  onNew,
  refreshKey,
  teams,
}: {
  canWrite: boolean;
  initialPage: Page<DutyHandover>;
  onNew: () => void;
  refreshKey: number;
  teams: TeamOption[];
}) {
  const [status, setStatus] = useState<Status>("OPEN");
  const [skip, setSkip] = useState(0);
  const [rows, setRows] = useState(initialPage.items);
  const [total, setTotal] = useState(initialPage.total);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const firstRun = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await workRequest<Page<DutyHandover>>(
        "work-duties",
        `/handovers?${buildHandoversQuery({ status, skip })}`,
      );
      setRows(page.items);
      setTotal(page.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setLoading(false);
    }
  }, [status, skip]);

  useEffect(() => {
    // The server already rendered the first page of open handovers.
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    void load();
  }, [load, refreshKey]);

  const acknowledge = async (handover: DutyHandover) => {
    setBusyId(handover.id);
    setActionError(null);
    try {
      await workRequest(
        "work-duties",
        `/handovers/${handover.id}/acknowledge`,
        { method: "POST" },
      );
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setBusyId(null);
    }
  };

  const receiver = (row: DutyHandover) =>
    row.toName ?? teams.find((t) => t.id === row.teamId)?.name ?? "A team";

  const columns: DataTableColumn<DutyHandover>[] = [
    {
      key: "from",
      header: "From",
      searchAccessor: (row) => row.fromName ?? "",
      render: (row) => row.fromName ?? "Unknown",
    },
    {
      key: "to",
      header: "To",
      searchAccessor: (row) => receiver(row),
      render: (row) => receiver(row),
    },
    {
      key: "note",
      header: "Note",
      searchAccessor: (row) => row.note,
      render: (row) => <p className="max-w-md whitespace-pre-wrap">{row.note}</p>,
    },
    {
      key: "sent",
      header: "Sent",
      sortable: true,
      sortAccessor: (row) => row.createdAt,
      render: (row) => formatDateTime(row.createdAt),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusPill tone={row.status === "OPEN" ? "warning" : "good"}>
          {row.status === "OPEN" ? "Open" : "Acknowledged"}
        </StatusPill>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) =>
        row.status === "OPEN" && canWrite ? (
          <Button
            aria-label={`Acknowledge handover from ${row.fromName ?? "unknown"}`}
            loading={busyId === row.id}
            onClick={() => void acknowledge(row)}
            size="xs"
            variant="outline"
          >
            Acknowledge
          </Button>
        ) : null,
    },
  ];

  return (
    <section
      aria-label="Duty handovers"
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4"
    >
      <div className="flex flex-wrap items-end gap-4">
        <SelectField
          label="Status"
          onChange={(next) => {
            setSkip(0);
            setStatus(next as Status);
          }}
          options={STATUS_OPTIONS}
          value={status}
        />
        {canWrite ? (
          <Button
            leftIcon={<Plus aria-hidden="true" className="h-4 w-4" />}
            onClick={onNew}
          >
            New handover
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="grid gap-3" role="alert">
          <p className="text-sm text-danger">{error}</p>
          <div>
            <Button onClick={() => void load()} variant="secondary">
              Retry
            </Button>
          </div>
        </div>
      ) : null}
      {actionError ? (
        <p className="text-sm text-danger" role="alert">
          {actionError}
        </p>
      ) : null}

      <div aria-busy={loading}>
        <DataTable
          columns={columns}
          emptyState={
            <EmptyState
              description="Handovers addressed to you appear here."
              title="No handovers"
            />
          }
          entityLogicalName="work-duty-handovers"
          getRowKey={(row) => row.id}
          pagination={{
            page: 1,
            pageSize: DUTY_PAGE_SIZE,
            total: rows.length,
          }}
          rows={rows}
          searchPlaceholder="Search handovers"
        />
      </div>
      <DutyPager
        disabled={loading}
        label="Handovers"
        onSkip={setSkip}
        shown={rows.length}
        skip={skip}
        total={total}
      />
    </section>
  );
}
