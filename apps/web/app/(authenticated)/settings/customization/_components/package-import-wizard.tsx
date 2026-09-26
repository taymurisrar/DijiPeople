"use client";

/*
 * Import a `.djpkg` — TASK-0033 / EXECPLAN-0052.
 *
 * Upload → Review → Result. Uploading only ANALYZES: the API validates the
 * file, compares every component with this workspace and persists the plan.
 * Nothing changes until Import is pressed, and then the whole package is
 * applied in one transaction — it lands completely or not at all.
 */

import { ArrowLeft, FileUp, PackageCheck, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChangeEvent, useMemo, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { CheckboxField, TextField } from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import { TopAlert } from "@/app/components/notifications/top-alert";
import type {
  PackageComparisonStatus,
  PackageImportItem,
  PackageOperation,
  PackageOperationSummary,
} from "../types";
import {
  DeploymentsTable,
  IssueList,
  operationLabel,
  operationTone,
  requestJson,
} from "./package-lifecycle-panels";

type Step = "upload" | "review" | "result";

const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "review", label: "Review" },
  { key: "result", label: "Result" },
];

const STATUS_LABELS: Record<PackageComparisonStatus, string> = {
  NEW: "New",
  MATCHING: "Unchanged",
  UPDATE: "Update",
  TARGET_MODIFIED: "Changed here",
  CONFLICT: "Conflict",
  MISSING_DEPENDENCY: "Missing dependency",
  INCOMPATIBLE: "Incompatible",
  SKIPPED: "Skipped",
};

const STATUS_ORDER: PackageComparisonStatus[] = [
  "CONFLICT",
  "MISSING_DEPENDENCY",
  "INCOMPATIBLE",
  "NEW",
  "UPDATE",
  "TARGET_MODIFIED",
  "MATCHING",
  "SKIPPED",
];

const TYPE_LABELS: Record<string, string> = {
  table: "Module",
  column: "Field",
  form: "Form",
  view: "View",
  optionSet: "Choice list",
  lookup: "Relationship",
  actionBar: "Action bar",
  widget: "Widget",
  environmentVariable: "Environment variable",
};

function statusTone(status: PackageComparisonStatus) {
  if (status === "CONFLICT" || status === "MISSING_DEPENDENCY" || status === "INCOMPATIBLE") {
    return "danger" as const;
  }
  if (status === "TARGET_MODIFIED") return "warning" as const;
  if (status === "NEW" || status === "UPDATE") return "info" as const;
  return "muted" as const;
}

function modeLabel(operation: PackageOperation) {
  const mode = operation.plan?.mode;
  if (mode === "UPGRADE") return `Upgrade from ${operation.previousVersion}`;
  if (mode === "REINSTALL") return "Already installed";
  if (mode === "DOWNGRADE") return `Downgrade from ${operation.previousVersion}`;
  return "New install";
}

export function PackageImportWizard({
  initialOperation,
  recentOperations,
}: {
  initialOperation: PackageOperation | null;
  recentOperations: PackageOperationSummary[];
}) {
  const router = useRouter();
  const [operation, setOperation] = useState<PackageOperation | null>(
    initialOperation,
  );
  const [step, setStep] = useState<Step>(
    !initialOperation
      ? "upload"
      : ["COMPLETED", "FAILED"].includes(initialOperation.status)
        ? "result"
        : "review",
  );
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PackageComparisonStatus | "ALL">("ALL");
  const [values, setValues] = useState<Record<string, string>>({});
  const [allowDowngrade, setAllowDowngrade] = useState(false);

  const plan = operation?.plan ?? null;
  const items = useMemo(
    () =>
      (plan?.items ?? [])
        .filter((item) => statusFilter === "ALL" || item.status === statusFilter)
        .sort(
          (left, right) =>
            STATUS_ORDER.indexOf(left.status) - STATUS_ORDER.indexOf(right.status),
        ),
    [plan?.items, statusFilter],
  );
  const onlyDowngradeBlocks =
    operation?.status === "BLOCKED" &&
    (plan?.packageIssues ?? []).filter((issue) => issue.severity === "error").every((issue) => issue.code === "DOWNGRADE") &&
    (plan?.packageIssues ?? []).some((issue) => issue.code === "DOWNGRADE") &&
    !(plan?.items ?? []).some((item) => item.blocking);
  const missingValues = (plan?.requiredInputs ?? []).filter(
    (input) => !values[input.variableKey]?.trim(),
  );
  const nothingToApply =
    plan?.summary !== undefined &&
    plan.summary.NEW + plan.summary.UPDATE + plan.summary.TARGET_MODIFIED === 0 &&
    !(plan.requiredInputs ?? []).length;
  const canImport =
    operation !== null &&
    (operation.status === "READY" || (onlyDowngradeBlocks && allowDowngrade)) &&
    missingValues.length === 0;

  async function analyze() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/customization/package-imports/analyze", {
        method: "POST",
        body,
      });
      const data = (await response.json().catch(() => ({}))) as PackageOperation & {
        message?: string;
      };
      if (!response.ok) throw new Error(data.message ?? "The package could not be analyzed.");
      setOperation(data);
      setValues({});
      setAllowDowngrade(false);
      setStatusFilter("ALL");
      setStep("review");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function execute() {
    if (!operation) return;
    setBusy(true);
    setError(null);
    try {
      const result = await requestJson<PackageOperation>(
        `/api/customization/package-imports/${operation.id}/execute`,
        {
          method: "POST",
          body: JSON.stringify({
            ...(Object.keys(values).length ? { environmentValues: values } : {}),
            ...(allowDowngrade ? { allowDowngrade: true } : {}),
          }),
        },
      );
      setOperation(result);
    } catch (caught) {
      /* A failed import is recorded; show the recorded result, not just a toast. */
      const refreshed = await requestJson<PackageOperation>(
        `/api/customization/package-operations/${operation.id}`,
      ).catch(() => null);
      if (refreshed && ["FAILED", "COMPLETED"].includes(refreshed.status)) {
        setOperation(refreshed);
      } else {
        setError((caught as Error).message);
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    setStep("result");
    router.refresh();
  }

  function restart() {
    setOperation(null);
    setFile(null);
    setError(null);
    setStep("upload");
    router.replace("/settings/customization/packages/import");
  }

  const itemColumns: DataTableColumn<PackageImportItem>[] = [
    {
      key: "component",
      header: "Component",
      searchable: true,
      searchAccessor: (row) => row.objectKey,
      render: (row) => (
        <span>
          <span className="block font-semibold text-foreground">{row.objectKey}</span>
          <span className="block text-muted">{TYPE_LABELS[row.type] ?? row.type}</span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusPill tone={statusTone(row.status)}>{STATUS_LABELS[row.status]}</StatusPill>
      ),
    },
    {
      key: "changes",
      header: "Changes",
      render: (row) =>
        row.changedFields.length ? row.changedFields.join(", ") : "—",
    },
    {
      key: "details",
      header: "Details",
      render: (row) =>
        row.messages.length ? (
          <ul className="grid gap-1">
            {row.messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          href="/settings/customization/packages"
          leftIcon={<ArrowLeft className="h-4 w-4" />}
          size="xs"
          variant="ghost"
        >
          Packages
        </Button>
      </div>

      <ol aria-label="Import steps" className="flex flex-wrap gap-2">
        {STEPS.map((entry, index) => (
          <li
            aria-current={step === entry.key ? "step" : undefined}
            className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${
              step === entry.key
                ? "border-accent bg-accent text-white"
                : "border-border bg-surface text-muted"
            }`}
            key={entry.key}
          >
            {index + 1}. {entry.label}
          </li>
        ))}
      </ol>

      {error ? (
        <TopAlert
          description={error}
          onDismiss={() => setError(null)}
          title="Action unavailable"
          variant="error"
        />
      ) : null}

      {step === "upload" ? (
        <section className="grid gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm">
          <label className="grid gap-2 text-sm font-medium text-foreground">
            Package file
            <input
              accept=".djpkg,application/json"
              className="text-sm"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setFile(event.target.files?.[0] ?? null)
              }
              type="file"
            />
          </label>
          <div className="flex justify-end">
            <Button
              disabled={!file}
              leftIcon={<FileUp className="h-4 w-4" />}
              loading={busy}
              loadingText="Analyzing..."
              onClick={analyze}
            >
              Analyze
            </Button>
          </div>
        </section>
      ) : null}

      {step === "review" && operation ? (
        <section className="grid gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                {operation.packageDisplayName}
                {operation.packageKey !== "unknown" ? ` ${operation.version}` : ""}
              </h3>
              {plan?.manifest ? (
                <p className="mt-1 text-sm text-muted">
                  {plan.manifest.publisher.displayName} · {operation.packageKey}
                  {plan.manifest.sourceEnvironmentType
                    ? ` · from ${plan.manifest.sourceEnvironmentType}`
                    : ""}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {plan?.manifest ? (
                <StatusPill tone="neutral">{modeLabel(operation)}</StatusPill>
              ) : null}
              <StatusPill tone={operationTone(operation.status)}>
                {operationLabel(operation.status)}
              </StatusPill>
              {plan?.integrity ? (
                <StatusPill tone="good">Integrity verified</StatusPill>
              ) : null}
              {plan?.integrity && !plan.integrity.signed ? (
                <StatusPill tone="muted">Not signed</StatusPill>
              ) : null}
            </div>
          </div>

          {plan?.packageIssues?.length ? (
            <IssueList issues={plan.packageIssues} />
          ) : null}

          {plan?.summary ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
              <FilterChip
                active={statusFilter === "ALL"}
                label={`All ${plan.items?.length ?? 0}`}
                onClick={() => setStatusFilter("ALL")}
              />
              {STATUS_ORDER.filter((status) => plan.summary?.[status]).map((status) => (
                <FilterChip
                  active={statusFilter === status}
                  key={status}
                  label={`${STATUS_LABELS[status]} ${plan.summary?.[status] ?? 0}`}
                  onClick={() => setStatusFilter(status)}
                />
              ))}
            </div>
          ) : null}

          {plan?.items ? (
            <DataTable
              columns={itemColumns}
              emptyState={<EmptyState description="No components match." title="No components" />}
              getRowKey={(row) => row.key}
              pagination={{ page: 1, pageSize: 15, total: items.length }}
              rows={items}
              searchPlaceholder="Search components"
              tableClassName="min-w-[760px] divide-y divide-border text-xs"
            />
          ) : null}

          {plan?.removedFromSource?.length ? (
            <div className="grid gap-2">
              <h4 className="text-sm font-semibold text-foreground">
                No longer in this package — kept here
              </h4>
              <ul className="grid gap-1 text-sm text-muted">
                {plan.removedFromSource.map((entry) => (
                  <li key={entry.key}>
                    {TYPE_LABELS[entry.type] ?? entry.type} {entry.objectKey}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {plan?.requiredInputs?.length ? (
            <div className="grid gap-3">
              <h4 className="text-sm font-semibold text-foreground">
                Values for this environment
              </h4>
              {plan.requiredInputs.map((input) => (
                <TextField
                  hint={input.description ?? undefined}
                  key={input.variableKey}
                  label={input.displayName}
                  onChange={(value) =>
                    setValues((current) => ({ ...current, [input.variableKey]: value }))
                  }
                  required
                  type={input.type === "secret" ? "password" : "text"}
                  value={values[input.variableKey] ?? ""}
                />
              ))}
            </div>
          ) : null}

          {onlyDowngradeBlocks ? (
            <CheckboxField
              checked={allowDowngrade}
              label={`Install the older version ${operation.version} anyway`}
              onChange={setAllowDowngrade}
            />
          ) : null}

          <div className="flex flex-wrap justify-end gap-3">
            <Button
              leftIcon={<RotateCcw className="h-4 w-4" />}
              onClick={restart}
              variant="secondary"
            >
              Upload a different file
            </Button>
            <Button
              disabled={!canImport}
              leftIcon={<PackageCheck className="h-4 w-4" />}
              loading={busy}
              loadingText="Importing..."
              onClick={execute}
              title={
                canImport
                  ? undefined
                  : missingValues.length
                    ? "Enter every required value."
                    : "Resolve the blocking items first."
              }
            >
              {nothingToApply && operation.status === "READY" ? "Confirm — no changes" : "Import"}
            </Button>
          </div>
        </section>
      ) : null}

      {step === "result" && operation ? (
        <section className="grid gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-semibold text-foreground">
              {operation.packageDisplayName} {operation.version}
            </h3>
            <StatusPill tone={operationTone(operation.status)}>
              {operationLabel(operation.status)}
            </StatusPill>
          </div>
          {operation.status === "COMPLETED" ? (
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Created" value={operation.counts.created} />
              <Stat label="Updated" value={operation.counts.updated} />
              <Stat label="Unchanged" value={operation.counts.unchanged} />
              <Stat label="Warnings" value={operation.counts.warnings} />
            </div>
          ) : (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-semibold">{operation.error?.message ?? "The import failed."}</p>
              {operation.error?.failedComponent ? (
                <p className="mt-1">Failed at {operation.error.failedComponent}. Nothing was changed.</p>
              ) : null}
            </div>
          )}
          <p className="text-xs text-muted">Reference {operation.correlationId}</p>
          <div className="flex flex-wrap justify-end gap-3">
            <Button onClick={restart} variant="secondary">
              Import another package
            </Button>
            {operation.status === "COMPLETED" && operation.packageId ? (
              <Button href={`/settings/customization/packages/${operation.packageId}`}>
                Open package
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm">
        <h3 className="text-base font-semibold text-foreground">Recent deployments</h3>
        <DeploymentsTable operations={recentOperations} />
      </section>
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`rounded-md border px-3 py-1 text-xs font-semibold ${
        active
          ? "border-accent bg-accent text-white"
          : "border-border bg-background text-foreground hover:bg-accent-soft"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      <span className="mt-1 block text-xl font-semibold text-foreground">{value}</span>
    </div>
  );
}
