"use client";

import { useCallback, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import { EmptyState } from "@/app/components/ui/empty-state";
import { DateField } from "@/app/components/ui/form-control";
import { SectionCard } from "@/app/components/ui/section-card";
import { SegmentedControl } from "@/app/components/ui/segmented-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDate } from "@/lib/formatting-context";
import {
  DAILY_UPDATE_SECTIONS,
  SECTION_LABELS,
  STATUS_LABELS,
  buildUpdatesQuery,
  dateInputFor,
  groupBySection,
  isEvidenceBacked,
  personName,
  statusTone,
  type DailyUpdate,
  type DailyUpdatePage,
  type DailyUpdateStatus,
  type MissingUpdates,
} from "../_lib/daily-updates";
import { workRequest } from "../_lib/work-client";

type StatusFilter = DailyUpdateStatus | "ALL";

const FILTER_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Submitted", value: "SUBMITTED" },
  { label: "Acknowledged", value: "ACKNOWLEDGED" },
  { label: "Draft", value: "DRAFT" },
];

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return dateInputFor(date);
}

/**
 * The daily updates of the people in the viewer's reach, a detail view with
 * acknowledgement, and who has not reported on a chosen date. The API decides
 * who is in reach and refuses acknowledging one's own update.
 */
export function TeamUpdatesManager({
  canAcknowledge,
  initialUpdates,
}: {
  canAcknowledge: boolean;
  initialUpdates: DailyUpdate[];
}) {
  const [updates, setUpdates] = useState(initialUpdates);
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [from, setFrom] = useState(() => daysAgo(6));
  const [to, setTo] = useState(() => dateInputFor());
  const [selected, setSelected] = useState<DailyUpdate | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [missingDate, setMissingDate] = useState(() => dateInputFor());
  const [missing, setMissing] = useState<MissingUpdates | null>(null);
  const [missingError, setMissingError] = useState<string | null>(null);
  const [missingLoading, setMissingLoading] = useState(false);

  const load = useCallback(
    async (next: { status: StatusFilter; from: string; to: string }) => {
      setLoading(true);
      setError(null);
      try {
        const page = await workRequest<DailyUpdatePage>(
          "daily-updates",
          `?${buildUpdatesQuery({
            from: next.from,
            to: next.to,
            status: next.status === "ALL" ? undefined : next.status,
          })}`,
        );
        setUpdates(page.items);
      } catch (e) {
        setError(e instanceof Error ? e.message : "The request failed.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const changeFilter = (next: Partial<{ status: StatusFilter; from: string; to: string }>) => {
    const merged = { status, from, to, ...next };
    if (next.status !== undefined) setStatus(next.status);
    if (next.from !== undefined) setFrom(next.from);
    if (next.to !== undefined) setTo(next.to);
    if (merged.from && merged.to) void load(merged);
  };

  const acknowledge = async (update: DailyUpdate, inDetail: boolean) => {
    setBusyId(update.id);
    if (inDetail) setDetailError(null);
    else setError(null);
    try {
      await workRequest("daily-updates", `/${update.id}/acknowledge`, {
        method: "POST",
      });
      await load({ status, from, to });
      setSelected(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "The request failed.";
      if (inDetail) setDetailError(message);
      else setError(message);
    } finally {
      setBusyId(null);
    }
  };

  const checkMissing = async () => {
    if (!missingDate) return;
    setMissingLoading(true);
    setMissingError(null);
    try {
      setMissing(
        await workRequest<MissingUpdates>(
          "daily-updates",
          `/missing?date=${encodeURIComponent(missingDate)}`,
        ),
      );
    } catch (e) {
      setMissing(null);
      setMissingError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setMissingLoading(false);
    }
  };

  const columns: DataTableColumn<DailyUpdate>[] = [
    {
      key: "person",
      header: "Person",
      sortable: true,
      sortAccessor: (row) => personName(row),
      searchAccessor: (row) => personName(row),
      render: (row) => <span className="font-medium text-foreground">{personName(row)}</span>,
    },
    {
      key: "forDate",
      header: "Date",
      sortable: true,
      sortAccessor: (row) => row.forDate,
      render: (row) => formatDate(row.forDate),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      sortAccessor: (row) => row.status,
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          <StatusPill tone={statusTone(row.status)}>{STATUS_LABELS[row.status]}</StatusPill>
          {row.late ? <StatusPill tone="warning">Late</StatusPill> : null}
        </div>
      ),
    },
    {
      key: "version",
      header: "Version",
      render: (row) => row.version,
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          <Button
            aria-label={`View update: ${personName(row)} ${row.forDate}`}
            onClick={() => {
              setDetailError(null);
              setSelected(row);
            }}
            size="xs"
            variant="outline"
          >
            View
          </Button>
          {canAcknowledge && row.status === "SUBMITTED" ? (
            <Button
              aria-label={`Acknowledge update: ${personName(row)} ${row.forDate}`}
              disabled={busyId !== null}
              loading={busyId === row.id}
              onClick={() => void acknowledge(row, false)}
              size="xs"
              variant="primary"
            >
              Acknowledge
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const detailGroups = selected ? groupBySection(selected.items) : null;

  return (
    <div className="grid gap-6">
      <SectionCard title="Updates">
        <div className="grid gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <SegmentedControl
              label="Status"
              onChange={(value) => changeFilter({ status: value })}
              options={FILTER_OPTIONS}
              value={status}
            />
            <DateField
              label="From"
              onChange={(value) => changeFilter({ from: value })}
              value={from}
            />
            <DateField
              label="To"
              onChange={(value) => changeFilter({ to: value })}
              value={to}
            />
          </div>
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <div aria-busy={loading}>
            <DataTable
              columns={columns}
              emptyState={
                <EmptyState
                  description="Updates from the people in your reach appear here once they are saved."
                  title="No updates in this period"
                />
              }
              entityLogicalName="team-daily-updates"
              getRowKey={(row) => row.id}
              rows={updates}
              searchPlaceholder="Search updates"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Missing updates">
        <div className="grid gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <DateField
              label="Date to check"
              onChange={setMissingDate}
              value={missingDate}
            />
            <Button
              loading={missingLoading}
              onClick={() => void checkMissing()}
              variant="secondary"
            >
              Check missing
            </Button>
          </div>
          {missingError ? (
            <p className="text-sm text-danger" role="alert">
              {missingError}
            </p>
          ) : null}
          {missing ? (
            missing.people.length === 0 ? (
              <EmptyState
                description={
                  missing.due
                    ? "Everyone in your reach has reported."
                    : "No updates are due on this date."
                }
                title="Nobody is missing"
              />
            ) : (
              <ul aria-label="People missing an update" className="grid gap-2">
                {missing.people.map((person) => (
                  <li
                    className="rounded-xl border border-border px-3 py-2 text-sm text-foreground"
                    key={person.employeeId}
                  >
                    {person.name}
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      </SectionCard>

      {selected && detailGroups ? (
        <Dialog
          busy={busyId !== null}
          footer={
            <>
              <Button onClick={() => setSelected(null)} variant="secondary">
                Close
              </Button>
              {canAcknowledge && selected.status === "SUBMITTED" ? (
                <Button
                  loading={busyId === selected.id}
                  onClick={() => void acknowledge(selected, true)}
                >
                  Acknowledge
                </Button>
              ) : null}
            </>
          }
          onClose={() => setSelected(null)}
          open
          size="lg"
          title={`${personName(selected)}, ${formatDate(selected.forDate)}`}
        >
          <div className="grid gap-4">
            {detailError ? (
              <p className="text-sm text-danger" role="alert">
                {detailError}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <StatusPill tone={statusTone(selected.status)}>
                {STATUS_LABELS[selected.status]}
              </StatusPill>
              {selected.late ? <StatusPill tone="warning">Late</StatusPill> : null}
              <StatusPill tone="muted">{`Version ${selected.version}`}</StatusPill>
            </div>
            {selected.summary ? (
              <p className="text-sm text-foreground">{selected.summary}</p>
            ) : null}
            {DAILY_UPDATE_SECTIONS.map((section) =>
              detailGroups[section].length ? (
                <div key={section}>
                  <h3 className="text-sm font-semibold text-foreground">
                    {SECTION_LABELS[section]}
                  </h3>
                  <ul className="mt-2 grid gap-1 text-sm text-foreground">
                    {detailGroups[section].map((item, index) => (
                      <li className="flex flex-wrap items-center gap-2" key={item.id ?? index}>
                        <span>{item.text}</span>
                        {isEvidenceBacked(item) ? (
                          <StatusPill tone="info">From records</StatusPill>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null,
            )}
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
