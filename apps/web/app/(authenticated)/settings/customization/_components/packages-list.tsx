"use client";

import {
  ExternalLink,
  FileDown,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ExportGap } from "@/lib/customization/package-export-gap";
import { FormEvent, useMemo, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { ConfirmDialog } from "@/app/components/feedback/confirm-dialog";
import { TopAlert } from "@/app/components/notifications/top-alert";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { TextAreaField, TextField } from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import { PermissionGate } from "@/app/(authenticated)/_components/permission-gate";
import type { CustomizationPackage } from "../types";

type PackagesListProps = {
  initialMessage?: string;
  packages: CustomizationPackage[];
};

type PackageFormState = {
  mode: "create" | "edit";
  original?: CustomizationPackage;
  displayName: string;
  packageKey: string;
  publisherName: string;
  prefix: string;
  version: string;
  description: string;
};

export function PackagesList({ initialMessage, packages }: PackagesListProps) {
  const router = useRouter();
  const [form, setForm] = useState<PackageFormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomizationPackage | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [exportGaps, setExportGaps] = useState<{
    packageName: string;
    gaps: ExportGap[];
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState(initialMessage ?? null);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const columns = useMemo<DataTableColumn<CustomizationPackage>[]>(
    () => [
      {
        key: "name",
        header: "Package name",
        searchable: true,
        sortable: true,
        sortAccessor: (row) => row.displayName,
        searchAccessor: (row) => `${row.displayName} ${row.packageKey}`,
        render: (row) => (
          <div>
            <p className="font-semibold text-foreground">{row.displayName}</p>
            <p className="mt-1 text-xs text-muted">{row.packageKey}</p>
          </div>
        ),
      },
      {
        key: "publisher",
        header: "Publisher",
        searchable: true,
        sortAccessor: (row) => row.publisherName,
        render: (row) => row.publisherName,
      },
      { key: "prefix", header: "Prefix", render: (row) => row.prefix },
      { key: "version", header: "Version", render: (row) => row.version },
      {
        key: "type",
        header: "Type",
        filterable: true,
        filterType: "select",
        filterAccessor: (row) => typeLabel(row.type),
        filterOptions: [
          { label: "Default", value: "Default" },
          { label: "Custom", value: "Custom" },
          { label: "Managed", value: "Managed" },
          { label: "Unmanaged", value: "Unmanaged" },
          { label: "Patch", value: "Patch" },
        ],
        render: (row) => <StatusPill>{typeLabel(row.type)}</StatusPill>,
      },
      {
        key: "state",
        header: "State",
        filterable: true,
        filterType: "select",
        filterAccessor: (row) => stateLabel(row.state),
        filterOptions: [
          { label: "Draft", value: "Draft" },
          { label: "Published", value: "Published" },
          { label: "Archived", value: "Archived" },
        ],
        render: (row) => (
          <StatusPill tone={row.state === "published" ? "good" : "muted"}>
            {stateLabel(row.state)}
          </StatusPill>
        ),
      },
      {
        key: "managed",
        header: "Managed",
        filterable: true,
        filterType: "select",
        filterAccessor: (row) => (row.isManaged ? "Yes" : "No"),
        filterOptions: [
          { label: "Yes", value: "Yes" },
          { label: "No", value: "No" },
        ],
        render: (row) => (row.isManaged ? "Yes" : "No"),
      },
      {
        key: "components",
        header: "Components count",
        sortable: true,
        sortAccessor: (row) => row.componentsCount,
        render: (row) => row.componentsCount,
      },
      {
        key: "draftComponents",
        header: "Draft",
        sortable: true,
        sortAccessor: (row) => row.draftComponentsCount ?? 0,
        render: (row) => row.draftComponentsCount ?? 0,
      },
      {
        key: "publishedComponents",
        header: "Published",
        sortable: true,
        sortAccessor: (row) => row.publishedComponentsCount ?? 0,
        render: (row) => row.publishedComponentsCount ?? 0,
      },
      {
        key: "updatedAt",
        header: "Modified on",
        sortable: true,
        sortAccessor: (row) => row.updatedAt ?? "",
        render: (row) => formatDate(row.updatedAt),
      },
      {
        key: "actions",
        header: "Actions",
        render: (row) => (
          <div className="flex flex-nowrap gap-2">
            <Button
              href={`/settings/customization/packages/${row.id}`}
              size="icon-sm"
              variant="secondary"
              leftIcon={<ExternalLink className="h-4 w-4" />}
              aria-label="Open package"
              title="Open package"
            />

            <PermissionGate anyOf={["customization.publish"]}>
              <Button
                disabled={!row.canEdit}
                leftIcon={<Pencil className="h-4 w-4" />}
                onClick={() => openEdit(row)}
                size="icon-sm"
                title={
                  row.canEdit ? "Edit package" : "Default Package is read-only."
                }
                type="button"
                variant="ghost"
                aria-label="Edit package"
              />
            </PermissionGate>

            <Button
              leftIcon={<FileDown className="h-4 w-4" />}
              onClick={() => exportPackage(row)}
              size="icon-sm"
              type="button"
              variant="ghost"
              aria-label="Export package"
              title="Export package"
            />

            <PermissionGate anyOf={["customization.publish"]}>
              <Button
                disabled={!row.canDelete}
                leftIcon={<Trash2 className="h-4 w-4" />}
                onClick={() => setDeleteTarget(row)}
                size="icon-sm"
                title={row.deleteDisabledReason ?? "Delete package"}
                type="button"
                variant="danger"
                aria-label="Delete package"
              />
            </PermissionGate>
          </div>
        ),
      },
    ],
    [],
  );

  function openCreate() {
    setForm({
      mode: "create",
      displayName: "",
      packageKey: "",
      publisherName: "",
      prefix: "",
      version: "1.0.0",
      description: "",
    });
    setError(null);
  }

  function openEdit(record: CustomizationPackage) {
    setForm({
      mode: "edit",
      original: record,
      displayName: record.displayName,
      packageKey: record.packageKey,
      publisherName: record.publisherName,
      prefix: record.prefix,
      version: record.version,
      description: record.description ?? "",
    });
    setError(null);
  }

  function updateDisplayName(displayName: string) {
    setForm((current) => {
      if (!current) return current;
      if (current.mode === "edit") return { ...current, displayName };
      const prefix =
        current.prefix ||
        uniquePublisherPrefix(current.publisherName, packages);
      return {
        ...current,
        displayName,
        prefix,
        packageKey:
          current.packageKey &&
          current.packageKey !== packageKey(prefix, current.displayName)
            ? current.packageKey
            : packageKey(prefix, displayName),
      };
    });
  }

  function updatePublisherName(publisherName: string) {
    setForm((current) => {
      if (!current || current.mode === "edit") return current;
      const prefix = uniquePublisherPrefix(publisherName, packages);
      return {
        ...current,
        publisherName,
        prefix,
        packageKey:
          current.packageKey &&
          current.packageKey !== packageKey(current.prefix, current.displayName)
            ? current.packageKey
            : packageKey(prefix, current.displayName),
      };
    });
  }

  async function submitPackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    const validationError = validatePackage(form, packages);
    if (validationError) {
      setError(validationError);
      return;
    }
    setIsSaving(true);
    setError(null);
    const response = await fetch(
      form.mode === "create"
        ? "/api/customization/packages"
        : `/api/customization/packages/${form.original?.id}`,
      {
        method: form.mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageKey: form.packageKey,
          displayName: form.displayName,
          publisherName: form.publisherName,
          version: form.version,
          description: form.description || undefined,
        }),
      },
    );
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    setIsSaving(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to save package.");
      return;
    }
    setForm(null);
    router.refresh();
  }

  async function deletePackage() {
    if (!deleteTarget) return;
    const response = await fetch(
      `/api/customization/packages/${deleteTarget.id}`,
      {
        method: "DELETE",
      },
    );
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    if (!response.ok) {
      setError(data.message ?? "Unable to delete package.");
      return;
    }
    setDeleteTarget(null);
    router.refresh();
  }

  /*
   * Export runs the completeness check first and stops on a blocking gap.
   *
   * A package that downloads cleanly but references metadata it does not carry
   * fails in the target tenant, normally after the administrator has already
   * committed to the migration. Better to refuse here and name what is missing.
   */
  async function exportPackage(record: CustomizationPackage) {
    setError(null);
    setExportGaps(null);

    const readinessResponse = await fetch(
      `/api/customization/packages/${record.id}/export-readiness`,
    ).catch(() => null);

    if (readinessResponse?.ok) {
      const readiness = (await readinessResponse.json().catch(() => null)) as
        | { ready?: boolean; gaps?: ExportGap[] }
        | null;
      if (readiness && readiness.ready === false) {
        setExportGaps({
          packageName: record.displayName,
          gaps: readiness.gaps ?? [],
        });
        return;
      }
      /* Warnings do not block, but they belong on screen before the download. */
      if (readiness?.gaps?.length) {
        setExportGaps({
          packageName: record.displayName,
          gaps: readiness.gaps,
        });
      }
    }

    const response = await fetch(
      `/api/customization/packages/${record.id}/export`,
    );
    const data = await response.json();
    if (!response.ok) {
      setError(data.message ?? "Unable to export package.");
      return;
    }
    downloadJson(data, `${record.packageKey || "package"}.package.json`);
  }

  const blockingGaps = exportGaps?.gaps.filter(
    (gap) => gap.severity === "error",
  );

  return (
    <div className="grid gap-4">
      {exportGaps ? (
        <div
          className={
            blockingGaps?.length
              ? "rounded-lg border border-danger/30 bg-danger/5 p-3"
              : "rounded-lg border border-amber-300 bg-amber-50 p-3"
          }
          role="alert"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {blockingGaps?.length
                  ? `${exportGaps.packageName} is not ready to export`
                  : `${exportGaps.packageName} exported with warnings`}
              </p>
              <p className="mt-1 text-xs text-muted">
                {blockingGaps?.length
                  ? "These references are not in the package. Add them, or the import will land incomplete."
                  : "These dependencies are expected to already exist in the target tenant."}
              </p>
            </div>
            <button
              aria-label="Dismiss"
              className="rounded p-1 text-muted transition hover:bg-muted/20"
              onClick={() => setExportGaps(null)}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="mt-2 grid gap-1">
            {exportGaps.gaps.map((gap) => (
              <li
                className="rounded-md border border-border bg-white px-2 py-1.5 text-xs"
                key={`${gap.componentKey}-${gap.missingKey}`}
              >
                <span
                  className={
                    gap.severity === "error"
                      ? "font-semibold text-danger"
                      : "font-semibold text-amber-700"
                  }
                >
                  {gap.severity === "error" ? "Missing" : "External"}
                </span>{" "}
                <code>{gap.missingKey}</code>{" "}
                <span className="text-muted">
                  required by {gap.componentType} {gap.componentKey}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <PermissionGate anyOf={["customization.publish"]}>
            <Button
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={openCreate}
              type="button"
            >
              New Package
            </Button>
          </PermissionGate>
          <Button
            leftIcon={<RefreshCw className="h-4 w-4" />}
            onClick={() => router.refresh()}
            type="button"
            variant="ghost"
          >
            Refresh
          </Button>
          <Button
            href="/settings/customization/publish"
            type="button"
            variant="ghost"
          >
            Publish Center
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}
      {successMessage ? (
        <TopAlert
          onDismiss={() => setSuccessMessage(null)}
          title={successMessage}
          variant="success"
        />
      ) : null}

      <DataTable
        className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm"
        columns={columns}
        emptyState={
          <EmptyState description="No packages found." title="No packages" />
        }
        getRowKey={(row) => row.id}
        initialSort={{ columnKey: "name", direction: "asc" }}
        pagination={{ page: 1, pageSize: 10, total: packages.length }}
        rows={packages}
        searchPlaceholder="Search packages"
        tableClassName="min-w-[1240px] divide-y divide-border text-xs"
      />

      {form ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
          <form
            className="grid max-h-[92vh] w-full max-w-2xl gap-5 overflow-y-auto rounded-[20px] border border-border bg-white p-6 shadow-xl"
            onSubmit={submitPackage}
          >
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                {form.mode === "create" ? "New Package" : "Edit Package"}
              </h3>
              <p className="mt-1 text-sm text-muted">
                Custom Package publisher is required. Prefix is generated from
                the publisher name and locked after the first custom component.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label="Package name"
                onChange={updateDisplayName}
                required
                value={form.displayName}
              />
              <TextField
                label="Publisher"
                onChange={updatePublisherName}
                required
                disabled={form.mode === "edit"}
                value={form.publisherName}
              />
              <TextField
                disabled
                label="Prefix"
                onChange={() => undefined}
                value={form.prefix}
              />
              <TextField
                disabled={form.mode === "edit"}
                label="Package key"
                onChange={(packageKeyValue) =>
                  setForm((current) =>
                    current
                      ? { ...current, packageKey: packageKeyValue }
                      : current,
                  )
                }
                required
                value={form.packageKey}
              />
              <TextField
                disabled={form.mode === "edit"}
                label="Version"
                onChange={(version) =>
                  setForm((current) =>
                    current ? { ...current, version } : current,
                  )
                }
                required
                value={form.version}
              />
              <TextField
                disabled
                label="Type"
                onChange={() => undefined}
                value="Custom"
              />
              <TextAreaField
                className="md:col-span-2"
                label="Description"
                onChange={(description) =>
                  setForm((current) =>
                    current ? { ...current, description } : current,
                  )
                }
                value={form.description}
              />
            </div>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <div className="flex justify-end gap-3">
              <Button
                onClick={() => setForm(null)}
                type="button"
                variant="secondary"
              >
                Cancel
              </Button>
              <Button loading={isSaving} loadingText="Saving..." type="submit">
                Save Package
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      <ConfirmDialog
        confirmAction={{
          label: "Delete Package",
          onClick: deletePackage,
          variant: "danger",
        }}
        description={
          deleteTarget
            ? `Delete ${deleteTarget.displayName}? Package delete is blocked when dependencies or components exist.`
            : undefined
        }
        onClose={() => setDeleteTarget(null)}
        open={Boolean(deleteTarget)}
        title="Delete Package"
      />
    </div>
  );
}

function validatePackage(
  form: PackageFormState,
  packages: readonly CustomizationPackage[],
) {
  if (!form.displayName.trim()) return "Package name is required.";
  if (form.mode === "create" && !form.publisherName.trim()) {
    return "Publisher is required for Custom Packages.";
  }
  if (form.mode === "create" && !/^([a-z][a-z0-9]*_)/.test(form.prefix)) {
    return "Publisher prefix must be generated before saving.";
  }
  if (!/^[a-z][a-z0-9]*_[a-z][a-zA-Z0-9]*$/.test(form.packageKey)) {
    return "Package key must start with the generated publisher prefix, for example mt_corePackage.";
  }
  if (!/^\d+\.\d+\.\d+$/.test(form.version)) {
    return "Version must use semantic version format, for example 1.0.0.";
  }
  if (
    form.mode === "create" &&
    packages.some((item) => item.packageKey === form.packageKey)
  ) {
    return "A package already uses this key.";
  }
  return null;
}

function packageKey(prefix: string, displayName: string) {
  const words = displayName
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
  if (words.length === 0) return "";
  return `${ensurePrefix(prefix)}${words
    .map((word, index) =>
      index === 0
        ? word.toLowerCase()
        : `${word[0]?.toUpperCase() ?? ""}${word.slice(1).toLowerCase()}`,
    )
    .join("")}`;
}

function uniquePublisherPrefix(
  publisherName: string,
  packages: readonly CustomizationPackage[],
) {
  const base = publisherPrefix(publisherName);
  const existing = new Set(
    packages
      .filter((item) => !item.isDefault)
      .map((item) => ensurePrefix(item.prefix))
      .filter(Boolean),
  );
  if (!existing.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base.replace(/_$/g, "")}${index}_`;
    if (!existing.has(candidate)) return candidate;
  }
  return base;
}

function publisherPrefix(value: string) {
  const words = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
  const prefix =
    words.length > 1
      ? words.map((word) => word[0]).join("")
      : (words[0] ?? "dp").slice(0, 2).padEnd(2, "a");

  return ensurePrefix(prefix || "dp");
}

function ensurePrefix(value: string) {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/_+$/g, "")
    .replace(/[^a-z0-9]/g, "");

  return cleaned ? `${cleaned}_` : "";
}

function typeLabel(value: CustomizationPackage["type"]) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function stateLabel(value: CustomizationPackage["state"]) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function downloadJson(value: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
