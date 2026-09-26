"use client";

/*
 * Package lifecycle panels — TASK-0033 / EXECPLAN-0052.
 *
 * Validation, dependencies, released versions, deployment history and
 * environment variables for one package. Every action calls the API, which is
 * the authority; the permission gates here only decide which buttons show.
 */

import { Download, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { PermissionGate } from "@/app/(authenticated)/_components/permission-gate";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { useFormattingContext } from "@/app/components/filters/use-formatting-context";
import { Button } from "@/app/components/ui/button";
import { useDialogBehavior } from "@/app/components/ui/dialog";
import { EmptyState } from "@/app/components/ui/empty-state";
import {
  CheckboxField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import {
  formatDateTime,
  type ResolvedFormattingContext,
} from "@/lib/formatting-context";
import type {
  PackageEnvironmentVariable,
  PackageIssue,
  PackageLifecycle,
  PackageOperationSummary,
  PackageReleaseReadiness,
  PackageVersionSummary,
} from "../types";

type Notify = (
  title: string,
  description?: string,
  variant?: "success" | "error" | "warning" | "info",
) => void;

export async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: init?.body
      ? { "Content-Type": "application/json", ...(init?.headers ?? {}) }
      : init?.headers,
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    message?: string;
    details?: { issues?: PackageIssue[] };
  };
  if (!response.ok) {
    const error = new Error(data.message ?? "The request failed.") as Error & {
      issues?: PackageIssue[];
    };
    error.issues = data.details?.issues;
    throw error;
  }
  return data;
}

/* ----------------------------------------------------------------- shared */

export function severityTone(severity: PackageIssue["severity"]) {
  return severity === "error"
    ? "danger"
    : severity === "warning"
      ? "warning"
      : "info";
}

export function severityLabel(severity: PackageIssue["severity"]) {
  return severity === "error"
    ? "Error"
    : severity === "warning"
      ? "Warning"
      : "Info";
}

export function IssueList({
  issues,
  onRemedy,
}: {
  issues: PackageIssue[];
  onRemedy?: (issue: PackageIssue) => void;
}) {
  if (!issues.length) {
    return (
      <EmptyState description="No validation issues." title="Healthy" />
    );
  }
  return (
    <ul className="grid gap-2">
      {issues.map((issue, index) => (
        <li
          className="flex flex-wrap items-start gap-3 rounded-md border border-border bg-background p-3 text-sm"
          key={`${issue.code}-${issue.componentKey ?? ""}-${index}`}
        >
          <StatusPill tone={severityTone(issue.severity)}>
            {severityLabel(issue.severity)}
          </StatusPill>
          <span className="min-w-0 flex-1 text-foreground">{issue.message}</span>
          {issue.remedy && onRemedy ? (
            <Button onClick={() => onRemedy(issue)} size="xs" variant="ghost">
              {issue.remedy.action === "addDependency"
                ? "Add dependency"
                : "Add to package"}
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function formatDate(
  value: string | null | undefined,
  context: ResolvedFormattingContext | null,
) {
  return value ? formatDateTime(value, context) || "—" : "—";
}

export function operationTone(status: string) {
  return status === "COMPLETED"
    ? "good"
    : status === "FAILED" || status === "BLOCKED"
      ? "danger"
      : status === "READY" || status === "IMPORTING"
        ? "info"
        : "muted";
}

export function operationLabel(status: string) {
  return (
    {
      ANALYZING: "Analyzing",
      READY: "Ready to import",
      BLOCKED: "Blocked",
      IMPORTING: "Importing",
      COMPLETED: "Completed",
      FAILED: "Failed — rolled back",
      SUPERSEDED: "Superseded",
    } as Record<string, string>
  )[status] ?? status;
}

/* ------------------------------------------------------------- validation */

export function ValidationPanel({
  packageId,
  readiness,
  onReadiness,
  onRemedy,
  notify,
}: {
  packageId: string;
  readiness: PackageReleaseReadiness | null;
  onReadiness: (next: PackageReleaseReadiness) => void;
  onRemedy: (issue: PackageIssue) => void;
  notify: Notify;
}) {
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | PackageIssue["severity"]>(
    "all",
  );

  async function revalidate() {
    setLoading(true);
    try {
      onReadiness(
        await requestJson<PackageReleaseReadiness>(
          `/api/customization/packages/${packageId}/release-readiness`,
        ),
      );
    } catch (error) {
      notify("Validation unavailable", (error as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  const issues = (readiness?.issues ?? []).filter(
    (issue) => filter === "all" || issue.severity === filter,
  );

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground">
          Package health
        </h3>
        <Button
          leftIcon={<RefreshCw className="h-4 w-4" />}
          loading={loading}
          onClick={revalidate}
          size="xs"
          variant="ghost"
        >
          Validate again
        </Button>
      </div>
      {readiness ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Count label="Components" value={readiness.componentCount} />
            <Count
              active={filter === "error"}
              label="Errors"
              onClick={() => setFilter(filter === "error" ? "all" : "error")}
              value={readiness.errors}
            />
            <Count
              active={filter === "warning"}
              label="Warnings"
              onClick={() =>
                setFilter(filter === "warning" ? "all" : "warning")
              }
              value={readiness.warnings}
            />
            <Count
              active={filter === "info"}
              label="Information"
              onClick={() => setFilter(filter === "info" ? "all" : "info")}
              value={readiness.infos}
            />
          </div>
          <IssueList issues={issues} onRemedy={onRemedy} />
        </>
      ) : (
        <EmptyState
          description="Validation has not run for this package."
          title="Not validated"
        />
      )}
    </section>
  );
}

function Count({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      <span className="mt-1 block text-xl font-semibold text-foreground">
        {value}
      </span>
    </>
  );
  const className = `rounded-md border p-3 text-left ${
    active ? "border-accent bg-accent-soft" : "border-border bg-background"
  }`;
  return onClick ? (
    <button
      aria-pressed={active}
      className={className}
      onClick={onClick}
      type="button"
    >
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

/* ----------------------------------------------------------- dependencies */

type DependencyRow = {
  packageKey: string;
  displayName: string;
  minVersion: string;
  maxVersion: string;
};

export function DependenciesPanel({
  lifecycle,
  editable,
  pendingDependency,
  onSaved,
  notify,
}: {
  lifecycle: PackageLifecycle;
  editable: boolean;
  pendingDependency: string | null;
  onSaved: () => void;
  notify: Notify;
}) {
  const initialRows = useMemo<DependencyRow[]>(() => {
    const rows = lifecycle.dependencies.map((dependency) => ({
      packageKey: dependency.packageKey,
      displayName: dependency.displayName,
      minVersion: dependency.minVersion,
      maxVersion: dependency.maxVersion ?? "",
    }));
    if (
      pendingDependency &&
      !rows.some((row) => row.packageKey === pendingDependency)
    ) {
      rows.push({
        packageKey: pendingDependency,
        displayName: pendingDependency,
        minVersion: "1.0.0",
        maxVersion: "",
      });
    }
    return rows;
  }, [lifecycle.dependencies, pendingDependency]);
  const [rows, setRows] = useState<DependencyRow[]>(initialRows);
  const [editing, setEditing] = useState(Boolean(pendingDependency));
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await requestJson(
        `/api/customization/packages/${lifecycle.packageId}/dependencies`,
        {
          method: "PUT",
          body: JSON.stringify({
            dependencies: rows
              .filter((row) => row.packageKey.trim())
              .map((row) => ({
                packageKey: row.packageKey.trim(),
                ...(row.displayName.trim() &&
                row.displayName.trim() !== row.packageKey.trim()
                  ? { displayName: row.displayName.trim() }
                  : {}),
                minVersion: row.minVersion.trim(),
                ...(row.maxVersion.trim()
                  ? { maxVersion: row.maxVersion.trim() }
                  : {}),
              })),
          }),
        },
      );
      notify("Dependencies saved");
      setEditing(false);
      onSaved();
    } catch (error) {
      notify("Dependencies not saved", (error as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground">
          Package dependencies
        </h3>
        {editable && !editing ? (
          <PermissionGate anyOf={["customization.packages.manage"]}>
            <Button onClick={() => setEditing(true)} size="xs" variant="ghost">
              Edit
            </Button>
          </PermissionGate>
        ) : null}
      </div>

      {editing ? (
        <form className="grid gap-3" onSubmit={save}>
          {rows.map((row, index) => (
            <div
              className="grid items-end gap-3 md:grid-cols-[2fr_1fr_1fr_auto]"
              key={index}
            >
              <TextField
                label="Package key"
                onChange={(value) =>
                  setRows((current) =>
                    current.map((entry, position) =>
                      position === index
                        ? { ...entry, packageKey: value }
                        : entry,
                    ),
                  )
                }
                required
                value={row.packageKey}
              />
              <TextField
                label="Minimum version"
                onChange={(value) =>
                  setRows((current) =>
                    current.map((entry, position) =>
                      position === index
                        ? { ...entry, minVersion: value }
                        : entry,
                    ),
                  )
                }
                required
                value={row.minVersion}
              />
              <TextField
                label="Maximum version"
                onChange={(value) =>
                  setRows((current) =>
                    current.map((entry, position) =>
                      position === index
                        ? { ...entry, maxVersion: value }
                        : entry,
                    ),
                  )
                }
                value={row.maxVersion}
              />
              <Button
                aria-label={`Remove ${row.packageKey || "dependency"}`}
                leftIcon={<Trash2 className="h-4 w-4" />}
                onClick={() =>
                  setRows((current) =>
                    current.filter((_, position) => position !== index),
                  )
                }
                size="xs"
                type="button"
                variant="ghost"
              >
                Remove
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap justify-between gap-3">
            <Button
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() =>
                setRows((current) => [
                  ...current,
                  {
                    packageKey: "",
                    displayName: "",
                    minVersion: "1.0.0",
                    maxVersion: "",
                  },
                ])
              }
              size="xs"
              type="button"
              variant="ghost"
            >
              Add dependency
            </Button>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setRows(initialRows);
                  setEditing(false);
                }}
                size="xs"
                type="button"
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                leftIcon={<Save className="h-4 w-4" />}
                loading={saving}
                size="xs"
                type="submit"
              >
                Save
              </Button>
            </div>
          </div>
        </form>
      ) : lifecycle.dependencies.length ? (
        <ul className="grid gap-2">
          {lifecycle.dependencies.map((dependency) => (
            <li
              className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-background p-3 text-sm"
              key={dependency.packageKey}
            >
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-foreground">
                  {dependency.displayName}
                </span>
                <span className="block text-xs text-muted">
                  {dependency.packageKey} · requires {dependency.minVersion}
                  {dependency.maxVersion
                    ? ` – ${dependency.maxVersion}`
                    : " or later"}
                </span>
              </span>
              <span className="text-xs text-muted">
                {dependency.availableVersion
                  ? `Available ${dependency.availableVersion}`
                  : "Not installed"}
              </span>
              <StatusPill tone={dependency.satisfied ? "good" : "danger"}>
                {dependency.satisfied ? "Satisfied" : "Not satisfied"}
              </StatusPill>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          description="This package does not depend on another package."
          title="No package dependencies"
        />
      )}

      <div>
        <h4 className="text-sm font-semibold text-foreground">Required by</h4>
        {lifecycle.dependents.length ? (
          <ul className="mt-2 grid gap-2">
            {lifecycle.dependents.map((dependent) => (
              <li
                className="rounded-md border border-border bg-background p-3 text-sm"
                key={dependent.packageId}
              >
                <a
                  className="font-semibold text-accent"
                  href={`/settings/customization/packages/${dependent.packageId}`}
                >
                  {dependent.displayName}
                </a>
                <span className="ml-2 text-xs text-muted">
                  {dependent.version} · requires {dependent.minVersion} or later
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">No package depends on this one.</p>
        )}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- versions */

export function VersionsPanel({
  lifecycle,
}: {
  lifecycle: PackageLifecycle;
}) {
  const formattingContext = useFormattingContext();
  const columns = useMemo<DataTableColumn<PackageVersionSummary>[]>(
    () => [
      {
        key: "version",
        header: "Version",
        sortable: true,
        sortAccessor: (row) => row.version,
        render: (row) => (
          <span className="font-semibold text-foreground">{row.version}</span>
        ),
      },
      {
        key: "releasedAt",
        header: lifecycle.kind === "installed" ? "Installed on" : "Released on",
        sortable: true,
        sortAccessor: (row) => row.releasedAt,
        render: (row) => formatDate(row.releasedAt, formattingContext),
      },
      {
        key: "components",
        header: "Components",
        render: (row) => row.componentCount,
      },
      {
        key: "checksum",
        header: "Checksum",
        render: (row) => (
          <span className="font-mono text-xs" title={row.checksum}>
            {row.checksum.slice(0, 12)}
          </span>
        ),
      },
      { key: "notes", header: "Notes", render: (row) => row.notes ?? "—" },
      {
        key: "download",
        header: "",
        render: (row) => (
          <PermissionGate anyOf={["customization.export"]}>
            <a
              aria-label={`Download version ${row.version}`}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-accent hover:bg-accent-soft"
              download
              href={`/api/customization/packages/${lifecycle.packageId}/versions/${encodeURIComponent(row.version)}/artifact`}
            >
              <Download aria-hidden="true" className="h-4 w-4" />
              Download
            </a>
          </PermissionGate>
        ),
      },
    ],
    [formattingContext, lifecycle.kind, lifecycle.packageId],
  );

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm">
      <h3 className="text-base font-semibold text-foreground">Versions</h3>
      <DataTable
        columns={columns}
        emptyState={
          <EmptyState
            description={
              lifecycle.kind === "installed"
                ? "No installed versions are recorded."
                : "Release the package to create its first version."
            }
            title="No versions"
          />
        }
        getRowKey={(row) => row.id}
        pagination={{ page: 1, pageSize: 10, total: lifecycle.versions.length }}
        rows={lifecycle.versions}
        tableClassName="min-w-[720px] divide-y divide-border text-xs"
      />
    </section>
  );
}

/* ------------------------------------------------------------ deployments */

export function DeploymentsTable({
  operations,
}: {
  operations: PackageOperationSummary[];
}) {
  const formattingContext = useFormattingContext();
  const columns = useMemo<DataTableColumn<PackageOperationSummary>[]>(
    () => [
      {
        key: "createdAt",
        header: "Date",
        sortable: true,
        sortAccessor: (row) => row.createdAt,
        render: (row) => formatDate(row.createdAt, formattingContext),
      },
      {
        key: "package",
        header: "Package",
        searchable: true,
        searchAccessor: (row) => `${row.packageDisplayName} ${row.packageKey}`,
        render: (row) => (
          <span>
            <span className="block font-semibold text-foreground">
              {row.packageDisplayName}
            </span>
            <span className="block text-muted">{row.packageKey}</span>
          </span>
        ),
      },
      {
        key: "kind",
        header: "Operation",
        render: (row) => (row.kind === "UNINSTALL" ? "Uninstall" : "Import"),
      },
      {
        key: "version",
        header: "Version",
        render: (row) =>
          row.previousVersion && row.previousVersion !== row.version
            ? `${row.previousVersion} → ${row.version}`
            : row.version,
      },
      {
        key: "status",
        header: "Status",
        render: (row) => (
          <StatusPill tone={operationTone(row.status)}>
            {operationLabel(row.status)}
          </StatusPill>
        ),
      },
      {
        key: "changes",
        header: "Created / Updated / Unchanged / Conflicts",
        render: (row) =>
          `${row.createdCount} / ${row.updatedCount} / ${row.unchangedCount} / ${row.conflictCount}`,
      },
      {
        key: "open",
        header: "",
        render: (row) =>
          row.kind === "IMPORT" ? (
            <Button
              href={`/settings/customization/packages/import?operation=${row.id}`}
              size="xs"
              variant="ghost"
            >
              Open
            </Button>
          ) : null,
      },
    ],
    [formattingContext],
  );

  return (
    <DataTable
      columns={columns}
      emptyState={
        <EmptyState
          description="No imports or uninstalls have run."
          title="No deployments"
        />
      }
      getRowKey={(row) => row.id}
      pagination={{ page: 1, pageSize: 10, total: operations.length }}
      rows={operations}
      searchPlaceholder="Search deployments"
      tableClassName="min-w-[900px] divide-y divide-border text-xs"
    />
  );
}

/* ---------------------------------------------------- environment values */

export function EnvironmentPanel({
  packageId,
  editable,
  variables,
  onChanged,
  notify,
}: {
  packageId: string;
  editable: boolean;
  variables: PackageEnvironmentVariable[];
  onChanged: () => void;
  notify: Notify;
}) {
  const [valueFor, setValueFor] = useState<PackageEnvironmentVariable | null>(
    null,
  );
  const [value, setValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    variableKey: "",
    displayName: "",
    type: "text" as PackageEnvironmentVariable["type"],
    isRequired: false,
    defaultValue: "",
    description: "",
  });
  const [saving, setSaving] = useState(false);
  const own = variables.filter((variable) => variable.package?.id === packageId);

  const valueDialog = useDialogBehavior({
    open: Boolean(valueFor),
    onClose: () => setValueFor(null),
  });
  const createDialog = useDialogBehavior({
    open: creating,
    onClose: () => setCreating(false),
  });

  async function saveValue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valueFor) return;
    setSaving(true);
    try {
      await requestJson(
        `/api/customization/environment-variables/${valueFor.id}/value`,
        { method: "PUT", body: JSON.stringify({ value }) },
      );
      notify("Value saved", `${valueFor.displayName} is set for this environment.`);
      setValueFor(null);
      onChanged();
    } catch (error) {
      notify("Value not saved", (error as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function createVariable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await requestJson("/api/customization/environment-variables", {
        method: "POST",
        body: JSON.stringify({
          packageId,
          variableKey: draft.variableKey.trim(),
          displayName: draft.displayName.trim(),
          type: draft.type,
          isRequired: draft.isRequired,
          ...(draft.description.trim()
            ? { description: draft.description.trim() }
            : {}),
          ...(draft.defaultValue.trim() && draft.type !== "secret"
            ? { defaultValue: draft.defaultValue.trim() }
            : {}),
        }),
      });
      notify("Environment variable created");
      setCreating(false);
      onChanged();
    } catch (error) {
      notify("Environment variable not created", (error as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  const columns: DataTableColumn<PackageEnvironmentVariable>[] = [
    {
      key: "name",
      header: "Variable",
      render: (row) => (
        <span>
          <span className="block font-semibold text-foreground">
            {row.displayName}
          </span>
          <span className="block text-muted">{row.variableKey}</span>
        </span>
      ),
    },
    { key: "type", header: "Type", render: (row) => row.type },
    {
      key: "required",
      header: "Required",
      render: (row) => (row.isRequired ? "Yes" : "No"),
    },
    {
      key: "value",
      header: "This environment",
      render: (row) =>
        row.hasValue ? (
          row.type === "secret" ? (
            <StatusPill tone="good">Set</StatusPill>
          ) : (
            <span className="break-all">{row.value}</span>
          )
        ) : row.defaultValue ? (
          <span className="text-muted">Default: {row.defaultValue}</span>
        ) : (
          <StatusPill tone={row.isRequired ? "danger" : "muted"}>
            Not set
          </StatusPill>
        ),
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <PermissionGate anyOf={["customization.packages.manage"]}>
          <Button
            onClick={() => {
              setValue(row.type === "secret" ? "" : (row.value ?? ""));
              setValueFor(row);
            }}
            size="xs"
            variant="ghost"
          >
            Set value
          </Button>
        </PermissionGate>
      ),
    },
  ];

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground">
          Environment variables
        </h3>
        {editable ? (
          <PermissionGate anyOf={["customization.packages.manage"]}>
            <Button
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => setCreating(true)}
              size="xs"
              variant="ghost"
            >
              New variable
            </Button>
          </PermissionGate>
        ) : null}
      </div>
      <DataTable
        columns={columns}
        emptyState={
          <EmptyState
            description="This package defines no environment variables."
            title="No environment variables"
          />
        }
        getRowKey={(row) => row.id}
        pagination={{ page: 1, pageSize: 10, total: own.length }}
        rows={own}
        tableClassName="min-w-[720px] divide-y divide-border text-xs"
      />

      {valueFor ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"
          {...valueDialog.backdropProps}
        >
          <form
            {...valueDialog.panelProps}
            className="grid w-full max-w-lg gap-4 rounded-[20px] border border-border bg-white p-6 shadow-xl"
            onSubmit={saveValue}
          >
            <h3
              className="text-lg font-semibold text-foreground"
              id={valueDialog.titleId}
            >
              {valueFor.displayName}
            </h3>
            <TextField
              label="Value"
              onChange={setValue}
              required
              type={valueFor.type === "secret" ? "password" : "text"}
              value={value}
            />
            <div className="flex justify-end gap-3">
              <Button
                onClick={() => setValueFor(null)}
                type="button"
                variant="secondary"
              >
                Cancel
              </Button>
              <Button loading={saving} type="submit">
                Save
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {creating ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"
          {...createDialog.backdropProps}
        >
          <form
            {...createDialog.panelProps}
            className="grid w-full max-w-lg gap-4 rounded-[20px] border border-border bg-white p-6 shadow-xl"
            onSubmit={createVariable}
          >
            <h3
              className="text-lg font-semibold text-foreground"
              id={createDialog.titleId}
            >
              New environment variable
            </h3>
            <TextField
              label="Display name"
              onChange={(next) =>
                setDraft((current) => ({ ...current, displayName: next }))
              }
              required
              value={draft.displayName}
            />
            <TextField
              label="Logical name"
              onChange={(next) =>
                setDraft((current) => ({ ...current, variableKey: next }))
              }
              placeholder="prefix_name"
              required
              value={draft.variableKey}
            />
            <SelectField
              label="Type"
              onChange={(next) =>
                setDraft((current) => ({
                  ...current,
                  type: next as PackageEnvironmentVariable["type"],
                }))
              }
              options={[
                { value: "text", label: "Text" },
                { value: "number", label: "Number" },
                { value: "boolean", label: "Yes / No" },
                { value: "url", label: "URL" },
                { value: "secret", label: "Secret" },
              ]}
              value={draft.type}
            />
            {draft.type !== "secret" ? (
              <TextField
                label="Default value"
                onChange={(next) =>
                  setDraft((current) => ({ ...current, defaultValue: next }))
                }
                value={draft.defaultValue}
              />
            ) : null}
            <TextAreaField
              label="Description"
              onChange={(next) =>
                setDraft((current) => ({ ...current, description: next }))
              }
              value={draft.description}
            />
            <CheckboxField
              checked={draft.isRequired}
              label="Required in every environment"
              onChange={(checked) =>
                setDraft((current) => ({ ...current, isRequired: checked }))
              }
            />
            <div className="flex justify-end gap-3">
              <Button
                onClick={() => setCreating(false)}
                type="button"
                variant="secondary"
              >
                Cancel
              </Button>
              <Button loading={saving} type="submit">
                Create
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

/* ---------------------------------------------------------------- release */

export function ReleaseDialog({
  packageId,
  currentVersion,
  lastVersion,
  onClose,
  onReleased,
}: {
  packageId: string;
  currentVersion: string;
  lastVersion: string | null;
  onClose: () => void;
  onReleased: (version: string, issues?: PackageIssue[]) => void;
}) {
  const router = useRouter();
  const [version, setVersion] = useState(currentVersion);
  const [nextBump, setNextBump] = useState<"patch" | "minor" | "major">(
    "patch",
  );
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; issues: PackageIssue[] } | null>(null);
  const dialog = useDialogBehavior({ open: true, onClose });

  async function release(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await requestJson<{ version: string }>(
        `/api/customization/packages/${packageId}/release`,
        {
          method: "POST",
          body: JSON.stringify({
            version: version.trim(),
            nextBump,
            ...(notes.trim() ? { notes: notes.trim() } : {}),
          }),
        },
      );
      onReleased(result.version);
      router.refresh();
    } catch (caught) {
      const failure = caught as Error & { issues?: PackageIssue[] };
      setError({ message: failure.message, issues: failure.issues ?? [] });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"
      {...dialog.backdropProps}
    >
      <form
        {...dialog.panelProps}
        className="grid max-h-[92vh] w-full max-w-lg gap-4 overflow-y-auto rounded-[20px] border border-border bg-white p-6 shadow-xl"
        onSubmit={release}
      >
        <h3 className="text-lg font-semibold text-foreground" id={dialog.titleId}>
          Release version
        </h3>
        <TextField
          hint={lastVersion ? `Last release: ${lastVersion}` : undefined}
          label="Version"
          onChange={setVersion}
          required
          value={version}
        />
        <SelectField
          label="Next working version"
          onChange={(next) => setNextBump(next as typeof nextBump)}
          options={[
            { value: "patch", label: "Patch" },
            { value: "minor", label: "Minor" },
            { value: "major", label: "Major" },
          ]}
          value={nextBump}
        />
        <TextAreaField label="Release notes" onChange={setNotes} value={notes} />
        {error ? (
          <div className="grid gap-2">
            <p className="text-sm font-semibold text-red-700">{error.message}</p>
            {error.issues.length ? (
              <IssueList
                issues={error.issues.filter((issue) => issue.severity === "error")}
              />
            ) : null}
          </div>
        ) : null}
        <div className="flex justify-end gap-3">
          <Button onClick={onClose} type="button" variant="secondary">
            Cancel
          </Button>
          <Button loading={saving} loadingText="Releasing..." type="submit">
            Release
          </Button>
        </div>
      </form>
    </div>
  );
}
