"use client";

import type { ViewMetadata } from "@/lib/runtime/metadata-runtime.types";
import {
  Check,
  ChevronDown,
  Download,
  History,
  RefreshCw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { PermissionGate } from "../../_components/permission-gate";

type ExportItem = {
  id: string;
  exportType: string;
  format: string;
  status: string;
  rowCount: number;
  requestedAt: string;
  downloadable: boolean;
  failureReason?: string | null;
};

type ExportFormat = "XLSX" | "CSV" | "PDF";
type OpenPanel = "menu" | "advanced" | "history" | null;

export type TimesheetExportLookupOption = {
  id: string;
  label: string;
};

export type TimesheetCurrentExportFilters = {
  year?: number;
  month?: number;
  status?: string;
  employeeIds?: string[];
  organizationId?: string;
  businessUnitId?: string;
  departmentId?: string;
};

type AdvancedFilters = {
  year: string;
  month: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  employeeIds: string[];
  organizationId: string;
  businessUnitId: string;
  departmentId: string;
  projectIds: string[];
};

const TIMESHEET_STATUSES = [
  "NOT_STARTED",
  "DRAFT",
  "IN_PROGRESS",
  "SUBMITTED",
  "PENDING_APPROVAL",
  "PARTIALLY_APPROVED",
  "APPROVED",
  "REJECTED",
  "OVERDUE",
  "PAYROLL_READY",
  "PAYROLL_PROCESSED",
  "LOCKED",
  "NOT_REQUIRED",
  "AUTO_COMPLETED",
  "EXCEPTION",
  "CANCELLED",
] as const;

export function TimesheetExportActions({
  activeView,
  businessUnits = [],
  currentEmployeeId,
  departments = [],
  employees = [],
  filters,
  organizations = [],
  projects = [],
  selectedRecordIds,
  timezone,
}: {
  activeView: ViewMetadata | null;
  businessUnits?: TimesheetExportLookupOption[];
  currentEmployeeId?: string | null;
  departments?: TimesheetExportLookupOption[];
  employees?: TimesheetExportLookupOption[];
  filters: TimesheetCurrentExportFilters;
  organizations?: TimesheetExportLookupOption[];
  projects?: TimesheetExportLookupOption[];
  selectedRecordIds: readonly string[];
  timezone: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [format, setFormat] = useState<ExportFormat>("XLSX");
  const [items, setItems] = useState<ExportItem[]>([]);
  const [panel, setPanel] = useState<OpenPanel>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState<AdvancedFilters>({
    year: filters.year?.toString() ?? "",
    month: filters.month?.toString() ?? "",
    status: filters.status ?? "",
    dateFrom: "",
    dateTo: "",
    employeeIds: filters.employeeIds ?? [],
    organizationId: filters.organizationId ?? "",
    businessUnitId: filters.businessUnitId ?? "",
    departmentId: filters.departmentId ?? "",
    projectIds: [],
  });
  const viewLabel = activeView?.displayName ?? "Current view";
  const currentViewFilters = useMemo(
    () =>
      resolveCurrentViewFilters({
        activeView,
        currentEmployeeId,
        filters,
      }),
    [activeView, currentEmployeeId, filters],
  );

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setPanel(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPanel(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  async function loadHistory() {
    setError(null);
    try {
      const response = await fetch("/api/timesheet-exports", {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as {
        items?: ExportItem[];
        message?: string;
      };
      if (!response.ok) {
        throw new Error(data.message ?? "Unable to load export history.");
      }
      setItems(data.items ?? []);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load export history.",
      );
    }
  }

  function showPanel(nextPanel: Exclude<OpenPanel, null>) {
    setError(null);
    setPanel((current) => (current === nextPanel ? null : nextPanel));
    if (nextPanel === "history") void loadHistory();
  }

  async function createExport(
    exportType: "CURRENT" | "ADVANCED" | "SELECTED",
    exportFilters: Record<string, unknown> = {},
  ) {
    setBusy(true);
    setError(null);
    try {
      if (
        typeof exportFilters.dateFrom === "string" &&
        typeof exportFilters.dateTo === "string" &&
        exportFilters.dateFrom &&
        exportFilters.dateTo &&
        exportFilters.dateFrom > exportFilters.dateTo
      ) {
        throw new Error("The start date must be on or before the end date.");
      }

      if (exportType === "SELECTED" && !selectedRecordIds.length) {
        throw new Error("Select at least one timesheet to export.");
      }

      const response = await fetch("/api/timesheet-exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exportType,
          format,
          ...(exportType === "SELECTED"
            ? { timesheetIds: selectedRecordIds }
            : exportFilters),
          timezone,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        item?: ExportItem;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(data.message ?? "Unable to create export.");
      }

      if (data.item?.downloadable) {
        setPanel(null);
        window.location.assign(
          `/api/timesheet-exports/${data.item.id}/download`,
        );
        return;
      }

      await loadHistory();
      setPanel("history");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to create export.",
      );
      setPanel((current) => current ?? "menu");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PermissionGate permission="timesheets.export">
      <div className="relative" ref={rootRef}>
        <div
          aria-label="Timesheet export actions"
          className="inline-flex h-9 overflow-hidden rounded-md border border-border bg-white shadow-sm"
          role="group"
        >
          <select
            aria-label="Export format"
            className="border-0 border-r border-border bg-white px-2 text-xs font-semibold text-foreground outline-none focus:bg-muted/10"
            disabled={busy}
            onChange={(event) => setFormat(event.target.value as ExportFormat)}
            title="Export format"
            value={format}
          >
            <option value="XLSX">XLSX</option>
            <option value="CSV">CSV</option>
            <option value="PDF">PDF</option>
          </select>
          <button
            className="inline-flex items-center gap-2 px-3 text-sm font-medium text-foreground transition hover:bg-muted/20 disabled:cursor-wait disabled:opacity-60"
            disabled={busy}
            onClick={() => void createExport("CURRENT", currentViewFilters)}
            title={`Export ${viewLabel}`}
            type="button"
          >
            <Download className="h-4 w-4" />
            <span>{busy ? "Preparing…" : "Export"}</span>
          </button>
          <button
            aria-expanded={panel !== null}
            aria-haspopup="menu"
            aria-label="More export options"
            className="inline-flex w-9 items-center justify-center border-l border-border transition hover:bg-muted/20"
            disabled={busy}
            onClick={() => showPanel("menu")}
            type="button"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>

        {panel === "menu" ? (
          <div
            className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-border bg-white p-1.5 shadow-xl"
            role="menu"
          >
            <ExportMenuButton
              description={viewLabel}
              icon={<Download className="h-4 w-4" />}
              label="Export current view"
              onClick={() =>
                void createExport("CURRENT", currentViewFilters)
              }
            />
            <ExportMenuButton
              description={
                selectedRecordIds.length
                  ? `${selectedRecordIds.length} selected row${selectedRecordIds.length === 1 ? "" : "s"}`
                  : "Select rows in the table first"
              }
              disabled={!selectedRecordIds.length}
              icon={<Check className="h-4 w-4" />}
              label="Export selected rows"
              onClick={() => void createExport("SELECTED")}
            />
            <ExportMenuButton
              description="Date, employee, organization, project, and status"
              icon={<SlidersHorizontal className="h-4 w-4" />}
              label="Advanced export"
              onClick={() => showPanel("advanced")}
            />
            <ExportMenuButton
              description="Download or review previous requests"
              icon={<History className="h-4 w-4" />}
              label="Export history"
              onClick={() => showPanel("history")}
            />
            <InlineError message={error} />
          </div>
        ) : null}

        {panel === "advanced" ? (
          <div className="absolute right-0 z-50 mt-2 w-[min(760px,calc(100vw-3rem))] rounded-xl border border-border bg-white p-4 shadow-xl">
            <PanelHeader
              onClose={() => setPanel(null)}
              subtitle={`Exporting as ${format}`}
              title="Advanced timesheet export"
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <CompactInput
                label="From date"
                onChange={(dateFrom) =>
                  setAdvanced((current) => ({ ...current, dateFrom }))
                }
                type="date"
                value={advanced.dateFrom}
              />
              <CompactInput
                label="To date"
                onChange={(dateTo) =>
                  setAdvanced((current) => ({ ...current, dateTo }))
                }
                type="date"
                value={advanced.dateTo}
              />
              <CompactInput
                label="Year"
                max="2200"
                min="2000"
                onChange={(year) =>
                  setAdvanced((current) => ({ ...current, year }))
                }
                type="number"
                value={advanced.year}
              />
              <CompactSelect
                label="Month"
                onChange={(month) =>
                  setAdvanced((current) => ({ ...current, month }))
                }
                options={monthOptions()}
                value={advanced.month}
              />
              <CompactSelect
                label="Status"
                onChange={(status) =>
                  setAdvanced((current) => ({ ...current, status }))
                }
                options={TIMESHEET_STATUSES.map((status) => ({
                  id: status,
                  label: humanize(status),
                }))}
                value={advanced.status}
              />
              <CompactSelect
                label="Organization"
                onChange={(organizationId) =>
                  setAdvanced((current) => ({ ...current, organizationId }))
                }
                options={organizations}
                value={advanced.organizationId}
              />
              <CompactSelect
                label="Business unit"
                onChange={(businessUnitId) =>
                  setAdvanced((current) => ({ ...current, businessUnitId }))
                }
                options={businessUnits}
                value={advanced.businessUnitId}
              />
              <CompactSelect
                label="Department"
                onChange={(departmentId) =>
                  setAdvanced((current) => ({ ...current, departmentId }))
                }
                options={departments}
                value={advanced.departmentId}
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <CompactMultiSelect
                label="Employees"
                onChange={(employeeIds) =>
                  setAdvanced((current) => ({ ...current, employeeIds }))
                }
                options={employees}
                value={advanced.employeeIds}
              />
              <CompactMultiSelect
                label="Projects"
                onChange={(projectIds) =>
                  setAdvanced((current) => ({ ...current, projectIds }))
                }
                options={projects}
                value={advanced.projectIds}
              />
            </div>
            <InlineError message={error} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
              <p className="text-xs text-muted">
                Blank fields include every record within your access scope.
              </p>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
                disabled={busy}
                onClick={() =>
                  void createExport(
                    "ADVANCED",
                    compactAdvancedFilters(advanced),
                  )
                }
                type="button"
              >
                <Download className="h-4 w-4" />
                {busy ? "Preparing…" : `Export ${format}`}
              </button>
            </div>
          </div>
        ) : null}

        {panel === "history" ? (
          <div className="absolute right-0 z-50 mt-2 w-[min(520px,calc(100vw-3rem))] rounded-xl border border-border bg-white p-4 shadow-xl">
            <PanelHeader
              action={
                <button
                  aria-label="Refresh export history"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted/20"
                  onClick={() => void loadHistory()}
                  type="button"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              }
              onClose={() => setPanel(null)}
              subtitle="Recent timesheet export requests"
              title="Export history"
            />
            <InlineError message={error} />
            <div className="mt-3 grid max-h-72 gap-2 overflow-auto">
              {items.slice(0, 12).map((item) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                  key={item.id}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {humanize(item.exportType)} · {item.format}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {item.rowCount} rows ·{" "}
                      {new Date(item.requestedAt).toLocaleString()}
                    </p>
                    {item.failureReason ? (
                      <p className="mt-1 text-xs text-danger">
                        {item.failureReason}
                      </p>
                    ) : null}
                  </div>
                  {item.downloadable ? (
                    <a
                      className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/20"
                      href={`/api/timesheet-exports/${item.id}/download`}
                    >
                      Download
                    </a>
                  ) : (
                    <span className="shrink-0 text-xs font-semibold text-muted">
                      {humanize(item.status)}
                    </span>
                  )}
                </div>
              ))}
              {!items.length && !error ? (
                <p className="rounded-lg bg-muted/10 px-3 py-5 text-center text-sm text-muted">
                  No export requests yet.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </PermissionGate>
  );
}

function ExportMenuButton({
  description,
  disabled = false,
  icon,
  label,
  onClick,
}: {
  description: string;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-muted/20 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      role="menuitem"
      type="button"
    >
      <span className="mt-0.5 text-muted">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">
          {label}
        </span>
        <span className="block truncate text-xs text-muted">
          {description}
        </span>
      </span>
    </button>
  );
}

function PanelHeader({
  action,
  onClose,
  subtitle,
  title,
}: {
  action?: ReactNode;
  onClose: () => void;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
      </div>
      <div className="flex items-center gap-1">
        {action}
        <button
          aria-label="Close"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted/20"
          onClick={onClose}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function InlineError({ message }: { message: string | null }) {
  return message ? (
    <p
      aria-live="polite"
      className="mt-3 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger"
      role="alert"
    >
      {message}
    </p>
  ) : null;
}

function CompactInput({
  label,
  onChange,
  value,
  ...inputProps
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
} & Pick<InputHTMLAttributes<HTMLInputElement>, "max" | "min" | "type">) {
  return (
    <label className="grid min-w-0 gap-1 text-xs font-medium text-muted">
      {label}
      <input
        {...inputProps}
        className="min-h-9 w-full min-w-0 rounded-md border border-border bg-white px-2.5 text-sm text-foreground outline-none focus:border-accent"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function CompactSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: TimesheetExportLookupOption[];
  value: string;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-xs font-medium text-muted">
      {label}
      <select
        className="min-h-9 w-full min-w-0 rounded-md border border-border bg-white px-2.5 text-sm text-foreground outline-none focus:border-accent"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">All permitted</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CompactMultiSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string[]) => void;
  options: TimesheetExportLookupOption[];
  value: string[];
}) {
  return (
    <label className="grid min-w-0 gap-1 text-xs font-medium text-muted">
      {label}
      <select
        className="min-h-24 w-full min-w-0 rounded-md border border-border bg-white px-2.5 py-1 text-sm text-foreground outline-none focus:border-accent"
        multiple
        onChange={(event) =>
          onChange(
            Array.from(
              event.currentTarget.selectedOptions,
              (option) => option.value,
            ),
          )
        }
        value={value}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="font-normal">
        {options.length
          ? "Use Ctrl or Cmd to choose multiple."
          : "No permitted options are available."}
      </span>
    </label>
  );
}

function compactAdvancedFilters(filters: AdvancedFilters) {
  return {
    ...(filters.year ? { year: Number(filters.year) } : {}),
    ...(filters.month ? { month: Number(filters.month) } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.dateFrom ? { dateFrom: filters.dateFrom } : {}),
    ...(filters.dateTo ? { dateTo: filters.dateTo } : {}),
    ...(filters.employeeIds.length ? { employeeIds: filters.employeeIds } : {}),
    ...(filters.organizationId
      ? { organizationId: filters.organizationId }
      : {}),
    ...(filters.businessUnitId
      ? { businessUnitId: filters.businessUnitId }
      : {}),
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.projectIds.length ? { projectIds: filters.projectIds } : {}),
  };
}

function resolveCurrentViewFilters({
  activeView,
  currentEmployeeId,
  filters,
}: {
  activeView: ViewMetadata | null;
  currentEmployeeId?: string | null;
  filters: TimesheetCurrentExportFilters;
}) {
  const resolved: TimesheetCurrentExportFilters = { ...filters };

  if (activeView?.logicalName === "timesheets.my" && currentEmployeeId) {
    resolved.employeeIds = [currentEmployeeId];
  }

  for (const filter of activeView?.filters ?? []) {
    if (filter.operator !== "eq" && filter.operator !== "equals") continue;

    const value = filter.value;
    if (filter.fieldLogicalName === "year" && typeof value === "number") {
      resolved.year = value;
    } else if (
      filter.fieldLogicalName === "month" &&
      typeof value === "number"
    ) {
      resolved.month = value;
    } else if (
      filter.fieldLogicalName === "status" &&
      typeof value === "string"
    ) {
      resolved.status = value;
    } else if (
      filter.fieldLogicalName === "employeeId" &&
      typeof value === "string"
    ) {
      resolved.employeeIds = [value];
    } else if (
      filter.fieldLogicalName === "businessUnitId" &&
      typeof value === "string"
    ) {
      resolved.businessUnitId = value;
    } else if (
      filter.fieldLogicalName === "departmentId" &&
      typeof value === "string"
    ) {
      resolved.departmentId = value;
    }
  }

  return resolved;
}

function monthOptions() {
  return Array.from({ length: 12 }, (_, index) => ({
    id: String(index + 1),
    label: new Intl.DateTimeFormat(undefined, { month: "short" }).format(
      new Date(2024, index, 1),
    ),
  }));
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
