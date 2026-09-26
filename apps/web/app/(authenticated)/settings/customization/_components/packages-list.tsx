"use client";

import {
  ExternalLink,
  FileDown,
  FileUp,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { ConfirmDialog } from "@/app/components/feedback/confirm-dialog";
import { TopAlert } from "@/app/components/notifications/top-alert";
import { useFormattingContext } from "@/app/components/filters/use-formatting-context";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { TextAreaField, TextField } from "@/app/components/ui/form-control";
import {
  formatDateTime,
  type ResolvedFormattingContext,
} from "@/lib/formatting-context";
import { StatusPill } from "@/app/components/ui/status-pill";
import { PermissionGate } from "@/app/(authenticated)/_components/permission-gate";
import type { CustomizationPackage } from "../types";
import { useDialogBehavior } from "@/app/components/ui/dialog";

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
  const formattingContext = useFormattingContext();
  const [form, setForm] = useState<PackageFormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomizationPackage | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
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
        filterAccessor: (row) => kindLabel(row),
        filterOptions: [
          { label: "System", value: "System" },
          { label: "Editable", value: "Editable" },
          { label: "Installed", value: "Installed" },
        ],
        render: (row) => (
          <StatusPill tone={row.kind === "installed" ? "info" : "neutral"}>
            {kindLabel(row)}
          </StatusPill>
        ),
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
        key: "installedVersion",
        header: "Installed version",
        render: (row) => row.installedVersion ?? "—",
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
        render: (row) => formatDate(row.updatedAt, formattingContext),
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
                  row.canEdit
                    ? "Edit package"
                    : row.kind === "installed"
                      ? "Installed packages are read-only here."
                      : "DijiPeople Core is read-only."
                }
                type="button"
                variant="ghost"
                aria-label="Edit package"
              />
            </PermissionGate>

            {row.kind !== "system" && row.kind !== undefined ? (
              <PermissionGate anyOf={["customization.export"]}>
                <Button
                  leftIcon={<FileDown className="h-4 w-4" />}
                  onClick={() => exportPackage(row)}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  aria-label="Export latest version"
                  title="Export latest version"
                />
              </PermissionGate>
            ) : null}

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
    [formattingContext],
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
   * TASK-0033 — export downloads the latest RELEASED version, byte for byte,
   * as a `.djpkg`. Release is where completeness is validated now; the old
   * working-copy JSON export and its readiness banner are superseded (their
   * dependency list was always empty, so the banner could never fire).
   */
  async function exportPackage(record: CustomizationPackage) {
    setError(null);
    const response = await fetch(
      `/api/customization/packages/${record.id}/versions/latest/artifact`,
    ).catch(() => null);
    if (!response?.ok) {
      const data = (await response?.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(data?.message ?? "Unable to export package.");
      return;
    }
    const disposition = response.headers.get("content-disposition") ?? "";
    const fileName =
      /filename="([^"]+)"/.exec(disposition)?.[1] ??
      `${record.packageKey}.djpkg`;
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  // BUG-0043: this modal kept its own layout and gained the guarantees
  // it never had - focus containment, Escape, focus restore and dialog
  // semantics. See useDialogBehavior.
  const formDialog = useDialogBehavior({
    open: Boolean(form),
    onClose: () => setForm(null),
  });

  return (
    <div className="grid gap-4">
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
          <PermissionGate anyOf={["customization.packages.import"]}>
            <Button
              href="/settings/customization/packages/import"
              leftIcon={<FileUp className="h-4 w-4" />}
              variant="ghost"
            >
              Import Package
            </Button>
          </PermissionGate>
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
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"
          {...formDialog.backdropProps}
        >
          <form
            {...formDialog.panelProps}
            className="grid max-h-[92vh] w-full max-w-2xl gap-5 overflow-y-auto rounded-[20px] border border-border bg-white p-6 shadow-xl"
            onSubmit={submitPackage}
          >
            <h3 className="text-lg font-semibold text-foreground" id={formDialog.titleId}>
              {form.mode === "create" ? "New package" : "Edit package"}
            </h3>
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
              <Button
                loading={isSaving}
                loadingText={form.mode === "create" ? "Creating..." : "Saving..."}
                type="submit"
              >
                {form.mode === "create" ? "Create" : "Save"}
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

/* TASK-0033 — SYSTEM (DijiPeople Core) | EDITABLE | INSTALLED. */
function kindLabel(row: CustomizationPackage) {
  if (row.kind === "installed") return "Installed";
  if (row.kind === "system" || row.isDefault) return "System";
  return "Editable";
}

function stateLabel(value: CustomizationPackage["state"]) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/*
 * BUG-3496 — formatted with the tenant's context, passed explicitly. The
 * previous `Intl.DateTimeFormat(undefined, …)` used the server's locale during
 * SSR and the browser's after hydration, so the text differed (React #418).
 */
function formatDate(
  value: string | null | undefined,
  context: ResolvedFormattingContext | null,
) {
  if (!value) return "Not set";
  return formatDateTime(value, context) || "Not set";
}

