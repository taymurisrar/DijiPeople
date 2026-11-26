"use client";

import { useCallback, useEffect, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import {
  CheckboxField,
  DateField,
  SelectField,
} from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDate } from "@/lib/formatting-context";
import {
  BLOCKED_TIME_NOTE,
  BLOCKER_CATEGORY_LABELS,
  BLOCKER_STATUSES,
  BLOCKER_STATUS_LABELS,
  CAUSE_SUMMARY_NOTES,
  buildBlockerSummaryQuery,
  buildBlockersQuery,
  causeLabel,
  causeTone,
  defaultBlockerPeriod,
  formatBlockedDuration,
  orderedCauseRows,
  type BlockerPage,
  type BlockerStatus,
  type BlockerSummary,
  type WorkBlocker,
} from "../_lib/blockers";
import type { PersonOption } from "../_lib/people";
import { validateWorkloadPeriod } from "../_lib/project-work";
import { workRequest } from "../_lib/work-client";
import { BlockerBadges } from "./blocker-badges";
import { BlockerDialogs, type BlockerPending } from "./blocker-dialogs";
import { BlockerRowActions } from "./blocker-row-actions";
import { SummaryTile } from "./summary-tile";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  ...BLOCKER_STATUSES.map((value) => ({
    value,
    label: BLOCKER_STATUS_LABELS[value],
  })),
];

type Filters = { status: BlockerStatus | ""; mine: boolean; overdue: boolean };

/**
 * Blockers across the work the viewer can see. The API decides what is in reach
 * and whether each action is allowed; its message is shown as it arrives.
 * Blocked time is reported beside effort, and a cause no reviewer has judged is
 * shown as undetermined, never guessed.
 */
export function BlockersManager({
  canWrite,
  initialPage,
  people,
  projectId,
}: {
  canWrite: boolean;
  initialPage: BlockerPage;
  people: PersonOption[];
  projectId?: string;
}) {
  const [filters, setFilters] = useState<Filters>({
    status: "OPEN",
    mine: false,
    overdue: false,
  });
  const [rows, setRows] = useState<WorkBlocker[]>(initialPage.items ?? []);
  const [total, setTotal] = useState(initialPage.total ?? 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<BlockerPending | null>(null);
  const [causeRefused, setCauseRefused] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const [period, setPeriod] = useState(() => defaultBlockerPeriod());
  const [summary, setSummary] = useState<BlockerSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (next: Filters, skip: number) => {
      setLoading(true);
      setError(null);
      try {
        const page = await workRequest<BlockerPage>(
          "work-blockers",
          `?${buildBlockersQuery({ ...next, projectId, skip })}`,
        );
        setRows((current) => (skip ? [...current, ...page.items] : page.items));
        setTotal(page.total);
      } catch (e) {
        setError(e instanceof Error ? e.message : "The request failed.");
      } finally {
        setLoading(false);
      }
    },
    [projectId],
  );

  const loadSummary = useCallback(
    async (range: { from: string; to: string }) => {
      const problem = validateWorkloadPeriod(range);
      if (problem) {
        setSummaryError(problem);
        return;
      }
      setSummaryLoading(true);
      setSummaryError(null);
      try {
        setSummary(
          await workRequest<BlockerSummary>(
            "work-blockers",
            `/summary?${buildBlockerSummaryQuery({ ...range, projectId })}`,
          ),
        );
      } catch (e) {
        setSummary(null);
        setSummaryError(e instanceof Error ? e.message : "The request failed.");
      } finally {
        setSummaryLoading(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    void loadSummary(defaultBlockerPeriod());
  }, [loadSummary]);

  const change = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    void fetchPage(next, 0);
  };

  const refresh = () => {
    void fetchPage(filters, 0);
    void loadSummary(period);
  };

  const columns: DataTableColumn<WorkBlocker>[] = [
    {
      key: "workItem",
      header: "Work item",
      sortable: true,
      sortAccessor: (row) => row.workItemTitle ?? "",
      searchAccessor: (row) => row.workItemTitle ?? "",
      render: (row) => (
        <span className="font-medium text-foreground">
          {row.workItemTitle ?? "Work item"}
        </span>
      ),
    },
    {
      key: "blocker",
      header: "Blocker",
      searchAccessor: (row) => `${row.reason} ${BLOCKER_CATEGORY_LABELS[row.category] ?? ""}`,
      render: (row) => (
        <div className="grid gap-2">
          <p className="text-sm text-foreground">{row.reason}</p>
          <BlockerBadges blocker={row} />
          {row.resolution ? (
            <p className="text-xs text-muted">{`Resolution: ${row.resolution}`}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      sortable: true,
      sortAccessor: (row) => row.ownerName ?? "",
      searchAccessor: (row) => row.ownerName ?? "",
      render: (row) =>
        row.ownerName ?? <span className="text-muted">No owner yet</span>,
    },
    {
      key: "due",
      header: "Due",
      sortable: true,
      sortAccessor: (row) => row.dueAt ?? "",
      render: (row) =>
        row.dueAt ? formatDate(row.dueAt) : <span className="text-muted">No due date</span>,
    },
    {
      key: "raised",
      header: "Raised",
      sortable: true,
      sortAccessor: (row) => row.raisedAt,
      render: (row) => formatDate(row.raisedAt),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-1.5">
          <BlockerRowActions
            blocker={row}
            canWrite={canWrite}
            causeRefused={causeRefused.has(row.id)}
            disabled={loading}
            onAction={setPending}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="grid gap-6">
      <section aria-label="Blocked time summary" className="grid gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <DateField
            label="Summary period start"
            onChange={(from) => setPeriod((p) => ({ ...p, from }))}
            value={period.from}
          />
          <DateField
            label="Summary period end"
            onChange={(to) => setPeriod((p) => ({ ...p, to }))}
            value={period.to}
          />
          <Button
            loading={summaryLoading}
            onClick={() => void loadSummary(period)}
            variant="secondary"
          >
            Show summary
          </Button>
        </div>
        {summaryError ? (
          <p className="text-sm text-danger" role="alert">
            {summaryError}
          </p>
        ) : null}
        {summary ? (
          <div aria-busy={summaryLoading} className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryTile label="Blockers in period" value={summary.blockers} />
              <SummaryTile label="Open blockers" value={summary.open} />
              <SummaryTile label="Overdue blockers" value={summary.overdue} />
            </div>
            {summary.truncated ? (
              <p className="text-sm text-muted" role="status">
                There are more blockers than can be summarised exactly; figures cover the first part.
              </p>
            ) : null}
            <div className="grid gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                Blocked time by cause
              </h3>
              <ul aria-label="Blocked time by cause" className="grid gap-2">
                {orderedCauseRows(summary).map((row) => (
                  <li
                    className={`grid gap-1 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${
                      row.cause === "UNDETERMINED"
                        ? "border-amber-300 bg-amber-50/50"
                        : row.cause === "WORKER_CONTROLLABLE"
                          ? "border-red-300 bg-red-50/50"
                          : "border-border"
                    }`}
                    key={row.cause}
                  >
                    <div className="grid gap-1">
                      <StatusPill tone={causeTone(row.cause)}>
                        {causeLabel(row.cause)}
                      </StatusPill>
                      <p className="text-xs text-muted">
                        {CAUSE_SUMMARY_NOTES[row.cause]}
                      </p>
                    </div>
                    <p className="text-sm text-foreground">
                      {`${formatBlockedDuration(row.minutes)} blocked, ${row.count} blocker${row.count === 1 ? "" : "s"}, ${row.open} open`}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
            {summary.byCategory.length ? (
              <div className="grid gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Blocked time by category
                </h3>
                <ul aria-label="Blocked time by category" className="grid gap-2">
                  {summary.byCategory.map((row) => (
                    <li
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm"
                      key={row.category}
                    >
                      <span className="text-foreground">
                        {BLOCKER_CATEGORY_LABELS[row.category] ?? row.category}
                      </span>
                      <span className="text-foreground">
                        {`${formatBlockedDuration(row.minutes)} blocked, ${row.count} blocker${row.count === 1 ? "" : "s"}, ${row.open} open`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="text-sm text-muted">{BLOCKED_TIME_NOTE}</p>
          </div>
        ) : summaryLoading ? (
          <div
            aria-busy="true"
            aria-label="Loading blocked time summary"
            className="h-32 animate-pulse rounded-[24px] bg-surface-strong"
            role="status"
          />
        ) : null}
      </section>

      <section aria-label="Blockers list" className="grid gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <SelectField
            label="Status"
            onChange={(value) => change({ status: value as BlockerStatus | "" })}
            options={STATUS_OPTIONS}
            value={filters.status}
          />
          <CheckboxField
            checked={filters.mine}
            label="Waiting on me"
            onChange={(mine) => change({ mine })}
          />
          <CheckboxField
            checked={filters.overdue}
            label="Overdue"
            onChange={(overdue) => change({ overdue })}
          />
          {projectId ? (
            <Button href="/work/blockers" size="xs" variant="outline">
              Show all projects
            </Button>
          ) : null}
        </div>

        {error ? (
          <div className="grid gap-3" role="alert">
            <p className="text-sm text-danger">{error}</p>
            <div>
              <Button onClick={() => void fetchPage(filters, 0)} variant="secondary">
                Retry
              </Button>
            </div>
          </div>
        ) : null}

        <div aria-busy={loading}>
          <DataTable
            columns={columns}
            emptyState={
              <EmptyState
                description="Blockers raised on work you can see appear here."
                title="No blockers to show"
              />
            }
            entityLogicalName="work-blockers"
            getRowKey={(row) => row.id}
            pagination={{ page: 1, pageSize: 10, total: rows.length }}
            rows={rows}
            searchPlaceholder="Search blockers"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted" role="status">
            {`Showing ${rows.length} of ${total} blockers`}
          </p>
          {rows.length < total ? (
            <Button
              loading={loading}
              onClick={() => void fetchPage(filters, rows.length)}
              variant="secondary"
            >
              Load more blockers
            </Button>
          ) : null}
        </div>
      </section>

      <BlockerDialogs
        onCauseRefused={(id) =>
          setCauseRefused((current) => new Set(current).add(id))
        }
        onClose={() => setPending(null)}
        onDone={refresh}
        pending={pending}
        people={people}
      />
    </div>
  );
}
