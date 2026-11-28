"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { DateField } from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDate, formatDateTime } from "@/lib/formatting-context";
import {
  DUTY_PAGE_SIZE,
  buildOccurrencesQuery,
  checklistProgress,
  isDateInput,
  occurrenceTone,
  statusLabel,
  todayInputValue,
  type DutyOccurrence,
  type Page,
} from "../_lib/duties";
import { personLabel, type PersonOption } from "../_lib/people";
import { workRequest } from "../_lib/work-client";
import { DutyPager } from "./duty-pager";
import { DutyTemplateLookup } from "./duty-template-lookup";

const ALL_TEMPLATES = "";

/**
 * The duty occurrences the viewer can see, newest date first, so today and what
 * is coming sit at the top. Which ones appear is the API's decision; the page is
 * the server's page and the total is the server's count.
 */
export function DutyOccurrencesPanel({
  canFilterTemplates,
  initialPage,
  onOpen,
  people,
  refreshKey,
}: {
  canFilterTemplates: boolean;
  initialPage: Page<DutyOccurrence>;
  onOpen: (occurrence: DutyOccurrence) => void;
  people: PersonOption[];
  refreshKey: number;
}) {
  const [date, setDate] = useState("");
  const [templateId, setTemplateId] = useState(ALL_TEMPLATES);
  const [skip, setSkip] = useState(0);
  const [rows, setRows] = useState(initialPage.items);
  const [total, setTotal] = useState(initialPage.total);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRun = useRef(true);

  const load = useCallback(async () => {
    if (date && !isDateInput(date)) return;
    setLoading(true);
    setError(null);
    try {
      const page = await workRequest<Page<DutyOccurrence>>(
        "work-duties",
        `/occurrences?${buildOccurrencesQuery({
          date: date || undefined,
          templateId: templateId || undefined,
          skip,
        })}`,
      );
      setRows(page.items);
      setTotal(page.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setLoading(false);
    }
  }, [date, templateId, skip]);

  useEffect(() => {
    // The server already rendered the first page with these exact filters.
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    void load();
  }, [load, refreshKey]);

  const columns: DataTableColumn<DutyOccurrence>[] = [
    {
      key: "date",
      header: "Date",
      sortable: true,
      sortAccessor: (row) => row.forDate,
      render: (row) => formatDate(row.forDate),
    },
    {
      key: "duty",
      header: "Duty",
      searchAccessor: (row) => `${row.templateName} ${row.templateKey}`,
      render: (row) => (
        <span className="font-medium text-foreground">{row.templateName}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusPill tone={occurrenceTone(row.status)}>
          {statusLabel(row.status)}
        </StatusPill>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      searchAccessor: (row) => personLabel(people, row.ownerEmployeeId),
      render: (row) => personLabel(people, row.ownerEmployeeId),
    },
    {
      key: "due",
      header: "Due",
      render: (row) =>
        row.dueAt ? (
          formatDateTime(row.dueAt)
        ) : (
          <span className="text-muted">No due time</span>
        ),
    },
    {
      key: "checks",
      header: "Checklist",
      render: (row) => {
        const progress = checklistProgress(row.checks);
        return progress.total === 0
          ? "None"
          : `${progress.done} of ${progress.total}`;
      },
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <Button
          aria-label={`Open ${row.templateName} for ${row.forDate}`}
          onClick={() => onOpen(row)}
          size="xs"
          variant="outline"
        >
          Open
        </Button>
      ),
    },
  ];

  return (
    <section
      aria-label="Duty occurrences"
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4"
    >
      <div className="flex flex-wrap items-end gap-4">
        <DateField
          label="Date"
          onChange={(next) => {
            setSkip(0);
            setDate(next);
          }}
          value={date}
        />
        <Button
          onClick={() => {
            setSkip(0);
            setDate(todayInputValue());
          }}
          variant="secondary"
        >
          Today
        </Button>
        {date ? (
          <Button
            onClick={() => {
              setSkip(0);
              setDate("");
            }}
            variant="ghost"
          >
            All dates
          </Button>
        ) : null}
        {canFilterTemplates ? (
          <DutyTemplateLookup
            label="Template"
            onChange={(next) => {
              setSkip(0);
              setTemplateId(next);
            }}
            value={templateId}
          />
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

      <div aria-busy={loading}>
        <DataTable
          columns={columns}
          emptyState={
            <EmptyState
              description="Duties generated for you appear here."
              title="No duties to show"
            />
          }
          entityLogicalName="work-duty-occurrences"
          getRowKey={(row) => row.id}
          pagination={{
            page: 1,
            pageSize: DUTY_PAGE_SIZE,
            total: rows.length,
          }}
          rows={rows}
          searchPlaceholder="Search duties"
        />
      </div>
      <DutyPager
        disabled={loading}
        label="Duties"
        onSkip={setSkip}
        shown={rows.length}
        skip={skip}
        total={total}
      />
    </section>
  );
}
