"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { Button } from "@/app/components/ui/button";
import { Dialog } from "@/app/components/ui/dialog";
import { EmptyState } from "@/app/components/ui/empty-state";
import { DateField, SelectField } from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import {
  DUTY_PAGE_SIZE,
  buildGenerateBody,
  buildTemplatesQuery,
  describeGenerate,
  formatWeekdays,
  minutesToTime,
  todayInputValue,
  type DutyTemplate,
  type GenerateResult,
  type Page,
  type TeamOption,
} from "../_lib/duties";
import { personLabel, type PersonOption } from "../_lib/people";
import { workRequest } from "../_lib/work-client";
import { DutyPager } from "./duty-pager";

type ActiveFilter = "all" | "active" | "inactive";

const FILTER_OPTIONS = [
  { value: "all", label: "All templates" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

function filterValue(filter: ActiveFilter): boolean | null {
  return filter === "all" ? null : filter === "active";
}

/**
 * Duty templates for a manager: create, edit, activate or deactivate (a
 * template is never deleted, so its history stays), and generate the duties for
 * a date. Who may do each is the API's decision; its message is shown as it
 * arrives.
 */
export function DutyTemplatesPanel({
  onEdit,
  onGenerated,
  onNew,
  people,
  refreshKey,
  teams,
}: {
  onEdit: (template: DutyTemplate) => void;
  onGenerated: () => void;
  onNew: () => void;
  people: PersonOption[];
  refreshKey: number;
  teams: TeamOption[];
}) {
  const [filter, setFilter] = useState<ActiveFilter>("all");
  const [skip, setSkip] = useState(0);
  const [rows, setRows] = useState<DutyTemplate[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [genDate, setGenDate] = useState(todayInputValue());
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genResult, setGenResult] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await workRequest<Page<DutyTemplate>>(
        "work-duties",
        `/templates?${buildTemplatesQuery({ active: filterValue(filter), skip })}`,
      );
      if (!mounted.current) return;
      setRows(page.items);
      setTotal(page.total);
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : "The request failed.");
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [filter, skip]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const setActive = async (template: DutyTemplate, active: boolean) => {
    setBusyId(template.id);
    setActionError(null);
    try {
      await workRequest(
        "work-duties",
        `/templates/${template.id}/${active ? "activate" : "deactivate"}`,
        { method: "POST" },
      );
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setBusyId(null);
    }
  };

  const generate = async () => {
    const built = buildGenerateBody(genDate);
    if (!built.ok) {
      setGenError(built.message);
      return;
    }
    setGenBusy(true);
    setGenError(null);
    setGenResult(null);
    try {
      const result = await workRequest<GenerateResult>(
        "work-duties",
        "/generate",
        { method: "POST", body: built.body },
      );
      setGenResult(describeGenerate(result));
      onGenerated();
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setGenBusy(false);
    }
  };

  const assignee = (template: DutyTemplate) =>
    template.assigneeEmployeeId
      ? personLabel(people, template.assigneeEmployeeId)
      : (teams.find((t) => t.id === template.teamId)?.name ?? "Unassigned");

  const columns: DataTableColumn<DutyTemplate>[] = [
    {
      key: "name",
      header: "Template",
      sortable: true,
      sortAccessor: (row) => row.name,
      searchAccessor: (row) => `${row.name} ${row.key}`,
      render: (row) => (
        <div className="grid">
          <span className="font-medium text-foreground">{row.name}</span>
          <span className="text-xs text-muted">{row.key}</span>
        </div>
      ),
    },
    {
      key: "days",
      header: "Days",
      render: (row) => formatWeekdays(row.weekdays),
    },
    {
      key: "time",
      header: "Time",
      render: (row) =>
        row.startMinutes === null && row.dueMinutes === null
          ? "Any time"
          : `${minutesToTime(row.startMinutes) || "Any"} to ${minutesToTime(row.dueMinutes) || "Any"}`,
    },
    { key: "zone", header: "Timezone", render: (row) => row.timezone },
    {
      key: "assignee",
      header: "Assignee",
      searchAccessor: (row) => assignee(row),
      render: (row) => assignee(row),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusPill tone={row.isActive ? "good" : "muted"}>
          {row.isActive ? "Active" : "Inactive"}
        </StatusPill>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-1.5">
          <Button
            aria-label={`Edit ${row.name}`}
            disabled={busyId === row.id}
            onClick={() => onEdit(row)}
            size="xs"
            variant="outline"
          >
            Edit
          </Button>
          <Button
            aria-label={`${row.isActive ? "Deactivate" : "Activate"} ${row.name}`}
            loading={busyId === row.id}
            onClick={() => void setActive(row, !row.isActive)}
            size="xs"
            variant={row.isActive ? "danger-soft" : "outline"}
          >
            {row.isActive ? "Deactivate" : "Activate"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <section
      aria-label="Duty templates"
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4"
    >
      <div className="flex flex-wrap items-end gap-4">
        <SelectField
          label="Show"
          onChange={(next) => {
            setSkip(0);
            setFilter(next as ActiveFilter);
          }}
          options={FILTER_OPTIONS}
          value={filter}
        />
        <Button
          leftIcon={<Plus aria-hidden="true" className="h-4 w-4" />}
          onClick={onNew}
        >
          New template
        </Button>
        <Button
          onClick={() => {
            setGenError(null);
            setGenResult(null);
            setGenerating(true);
          }}
          variant="secondary"
        >
          Generate duties
        </Button>
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
        {loading && rows.length === 0 && !error ? (
          <div
            aria-label="Loading templates"
            className="h-40 animate-pulse rounded-[24px] bg-surface-strong"
            role="status"
          />
        ) : (
          <DataTable
            columns={columns}
            emptyState={
              <EmptyState
                action={<Button onClick={onNew}>New template</Button>}
                description="Templates you create appear here."
                title="No duty templates"
              />
            }
            entityLogicalName="work-duty-templates"
            getRowKey={(row) => row.id}
            pagination={{
              page: 1,
              pageSize: DUTY_PAGE_SIZE,
              total: rows.length,
            }}
            rows={rows}
            searchPlaceholder="Search templates"
          />
        )}
      </div>
      <DutyPager
        disabled={loading}
        label="Templates"
        onSkip={setSkip}
        shown={rows.length}
        skip={skip}
        total={total}
      />

      <Dialog
        busy={genBusy}
        footer={
          <>
            <Button onClick={() => setGenerating(false)} variant="secondary">
              Close
            </Button>
            <Button loading={genBusy} onClick={() => void generate()}>
              Generate
            </Button>
          </>
        }
        onClose={() => setGenerating(false)}
        open={generating}
        title="Generate duties"
      >
        <div className="grid gap-4">
          {genError ? (
            <p className="text-sm text-danger" role="alert">
              {genError}
            </p>
          ) : null}
          {genResult ? (
            <p className="text-sm text-foreground" role="status">
              {genResult}
            </p>
          ) : null}
          <DateField label="Date" onChange={setGenDate} required value={genDate} />
        </div>
      </Dialog>
    </section>
  );
}
