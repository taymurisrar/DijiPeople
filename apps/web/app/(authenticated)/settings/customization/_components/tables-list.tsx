"use client";

import { Edit3, ExternalLink, PauseCircle, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import { DataTableColumn } from "@/app/components/data-table/types";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import {
  CheckboxField,
  TextAreaField,
  TextField,
} from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import { PermissionGate } from "@/app/(authenticated)/_components/permission-gate";
import { CustomizationTable } from "../types";

type TablesListProps = {
  tables: CustomizationTable[];
};

type EditState = {
  mode: "create" | "edit";
  tableKey: string;
  displayName: string;
  pluralDisplayName: string;
  icon: string;
  description: string;
  isActive: boolean;
};

export function TablesList({ tables }: TablesListProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<EditState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomizationTable | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const columns = useMemo<DataTableColumn<CustomizationTable>[]>(
    () => [
      {
        key: "displayName",
        header: "Module name",
        sortable: true,
        searchable: true,
        sortAccessor: (row) => row.displayName,
        searchAccessor: (row) => `${row.displayName} ${row.description ?? ""}`,
        render: (row) => (
          <div>
            <p className="font-semibold text-foreground">{row.displayName}</p>
            <p className="mt-1 max-w-xs truncate text-xs text-muted">
              {row.description || row.pluralDisplayName}
            </p>
          </div>
        ),
      },
      {
        key: "tableKey",
        header: "Logical name",
        sortable: true,
        searchable: true,
        sortAccessor: (row) => row.tableKey,
        render: (row) => (
          <code className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">
            {row.tableKey}
          </code>
        ),
      },
      {
        key: "route",
        header: "Route",
        searchable: true,
        searchAccessor: (row) => row.moduleKey,
        sortable: true,
        sortAccessor: (row) => row.moduleKey,
        render: (row) => (
          <span className="text-xs text-muted">
            /{row.moduleKey || row.tableKey}
          </span>
        ),
      },
      {
        key: "type",
        header: "Type",
        filterable: true,
        filterType: "select",
        filterAccessor: (row) => componentSource(row),
        filterOptions: [
          { label: "System", value: "System" },
          { label: "Custom", value: "Custom" },
        ],
        render: (row) => (
          <StatusPill tone={row.isCustomTable ? "neutral" : "muted"}>
            {componentSource(row)}
          </StatusPill>
        ),
      },
      {
        key: "status",
        header: "Status",
        filterable: true,
        filterType: "select",
        filterAccessor: (row) => (row.isActive ? "Active" : "Inactive"),
        filterOptions: [
          { label: "Active", value: "Active" },
          { label: "Inactive", value: "Inactive" },
        ],
        render: (row) => statusBadge(row.isActive),
      },
      {
        key: "source",
        header: "Source",
        filterable: true,
        filterType: "select",
        filterAccessor: (row) => row.source ?? componentSource(row),
        filterOptions: [
          { label: "System", value: "System" },
          { label: "Custom", value: "Custom" },
        ],
        render: (row) => row.source ?? componentSource(row),
      },
      {
        key: "package",
        header: "Package",
        searchable: true,
        searchAccessor: (row) => row.packageName ?? "",
        render: (row) => row.packageName ?? "Default Package",
      },
      {
        key: "lifecycle",
        header: "Lifecycle",
        filterable: true,
        filterType: "select",
        filterAccessor: (row) => lifecycleLabel(row.lifecycleState),
        filterOptions: [
          { label: "Draft", value: "Draft" },
          { label: "Published", value: "Published" },
          { label: "Deprecated", value: "Deprecated" },
          { label: "Archived", value: "Archived" },
        ],
        render: (row) => lifecycleLabel(row.lifecycleState),
      },
      metricColumn("fields", "Fields count", (row) =>
        readCount(row, "fieldsCount"),
      ),
      metricColumn("forms", "Forms count", (row) =>
        readCount(row, "formsCount"),
      ),
      metricColumn("views", "Views count", (row) =>
        readCount(row, "viewsCount"),
      ),
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
        cellClassName: "min-w-[260px]",
        render: (row) => (
<div className="flex gap-2">
  <Button
    href={`/settings/customization/tables/${row.tableKey}`}
    leftIcon={<ExternalLink className="h-4 w-4" />}
    size="icon-sm"
    variant="secondary"
    aria-label="Customize"
    title="Customize"
  />

  <PermissionGate anyOf={["customization.tables.update"]}>
    <Button
      leftIcon={<Edit3 className="h-4 w-4" />}
      onClick={() =>
        setEditing({
          mode: "edit",
          tableKey: row.tableKey,
          displayName: row.displayName,
          pluralDisplayName: row.pluralDisplayName,
          icon: row.icon ?? "",
          description: row.description ?? "",
          isActive: row.isActive,
        })
      }
      size="icon-sm"
      variant="ghost"
      aria-label="Rename"
      title="Rename"
    />

    <Button
      disabled={!row.isCustomTable}
      leftIcon={<PauseCircle className="h-4 w-4" />}
      onClick={() =>
        row.isCustomTable
          ? setEditing({
              mode: "edit",
              tableKey: row.tableKey,
              displayName: row.displayName,
              pluralDisplayName: row.pluralDisplayName,
              icon: row.icon ?? "",
              description: row.description ?? "",
              isActive: !row.isActive,
            })
          : undefined
      }
      size="icon-sm"
      variant="ghost"
      aria-label={row.isActive ? "Deactivate" : "Activate"}
      title={row.isActive ? "Deactivate" : "Activate"}
      type="button"
    />

    {row.isCustomTable && (
      <Button
        leftIcon={<Trash2 className="h-4 w-4" />}
        onClick={() => setDeleteTarget(row)}
        size="icon-sm"
        variant="danger"
        aria-label="Delete"
        title="Delete"
      />
    )}
  </PermissionGate>
</div>
        ),
      },
    ],
    [],
  );

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;

    setError(null);
    setIsSaving(true);

    const response = await fetch(
      editing.mode === "create"
        ? "/api/customization/tables"
        : `/api/customization/tables/${editing.tableKey}`,
      {
        method: editing.mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editing.mode === "create" ? { tableKey: editing.tableKey } : {}),
          displayName: editing.displayName,
          pluralDisplayName: editing.pluralDisplayName,
          icon: editing.icon,
          description: editing.description,
          isActive: editing.isActive,
        }),
      },
    );
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
    };

    setIsSaving(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to save customization table.");
      return;
    }

    setEditing(null);
    router.refresh();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setError(null);
    const response = await fetch(
      `/api/customization/tables/${deleteTarget.tableKey}`,
      { method: "DELETE" },
    );
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    if (!response.ok) {
      setError(data.message ?? "Unable to delete customization table.");
      return;
    }
    setDeleteTarget(null);
    router.refresh();
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <PermissionGate anyOf={["customization.tables.update"]}>
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() =>
              setEditing({
                mode: "create",
                tableKey: "",
                displayName: "",
                pluralDisplayName: "",
                icon: "",
                description: "",
                isActive: true,
              })
            }
            type="button"
          >
            Create module
          </Button>
        </PermissionGate>
      </div>

      {error && !editing ? (
        <div className="mb-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <DataTable
        className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm"
        columns={columns}
        emptyState={
          <EmptyState
            description="No metadata modules are registered for customization yet."
            title="No configurable modules"
          />
        }
        getRowKey={(row) => row.tableKey}
        initialSort={{ columnKey: "displayName", direction: "asc" }}
        pagination={{ page: 1, pageSize: 10, total: tables.length }}
        rows={tables}
        searchPlaceholder="Search modules"
        tableClassName="min-w-[980px] divide-y divide-border text-xs"
      />

      {editing ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
          <form
            className="grid w-full max-w-2xl gap-5 rounded-[24px] border border-border bg-white p-6 shadow-xl"
            onSubmit={handleSave}
          >
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                {editing.mode === "create"
                  ? "Create custom module"
                  : "Edit module metadata"}
              </h3>
              <p className="mt-1 text-sm text-muted">
                {editing.mode === "create"
                  ? "Create a tenant-scoped metadata module."
                  : `Update tenant-facing labels for ${editing.tableKey}.`}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                disabled={editing.mode === "edit"}
                hint="Use camelCase. This logical name is immutable after creation."
                label="Module logical name"
                onChange={(tableKey) =>
                  setEditing((current) =>
                    current ? { ...current, tableKey } : current,
                  )
                }
                required
                value={editing.tableKey}
              />
              <TextField
                label="Display name"
                onChange={(displayName) =>
                  setEditing((current) =>
                    current ? { ...current, displayName } : current,
                  )
                }
                required
                value={editing.displayName}
              />
              <TextField
                label="Plural display name"
                onChange={(pluralDisplayName) =>
                  setEditing((current) =>
                    current ? { ...current, pluralDisplayName } : current,
                  )
                }
                required
                value={editing.pluralDisplayName}
              />
              <TextField
                label="Icon"
                onChange={(icon) =>
                  setEditing((current) =>
                    current ? { ...current, icon } : current,
                  )
                }
                value={editing.icon}
              />
              <CheckboxField
                checked={editing.isActive}
                hint="Inactive modules stay registered but should be hidden from customization-driven UI."
                label="Active"
                onChange={(isActive) =>
                  setEditing((current) =>
                    current ? { ...current, isActive } : current,
                  )
                }
              />
              <TextAreaField
                className="md:col-span-2"
                label="Description"
                onChange={(description) =>
                  setEditing((current) =>
                    current ? { ...current, description } : current,
                  )
                }
                value={editing.description}
              />
            </div>

            {error ? <p className="text-sm text-danger">{error}</p> : null}

            <div className="flex flex-wrap justify-end gap-3">
              <Button
                onClick={() => setEditing(null)}
                type="button"
                variant="secondary"
              >
                Cancel
              </Button>
              <Button loading={isSaving} loadingText="Saving..." type="submit">
                Save changes
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
          <div className="grid w-full max-w-lg gap-4 rounded-[24px] border border-border bg-white p-6 shadow-xl">
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                Delete custom module
              </h3>
              <p className="mt-1 text-sm leading-6 text-muted">
                Delete {deleteTarget.displayName}? System modules cannot be
                deleted, and modules with dependent fields, forms, or views are
                blocked by the server.
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <Button
                onClick={() => setDeleteTarget(null)}
                type="button"
                variant="secondary"
              >
                Cancel
              </Button>
              <Button onClick={handleDelete} type="button" variant="danger">
                Delete module
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function componentSource(row: CustomizationTable) {
  return row.isCustomTable || row.isCustom ? "Custom" : "System";
}

function statusBadge(isActive: boolean) {
  return (
    <StatusPill tone={isActive ? "good" : "muted"}>
      {isActive ? "Active" : "Inactive"}
    </StatusPill>
  );
}

function lifecycleLabel(value?: string | null) {
  if (!value) return "Published";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function metricColumn(
  key: string,
  header: string,
  accessor: (row: CustomizationTable) => number,
): DataTableColumn<CustomizationTable> {
  return {
    key,
    header,
    sortable: true,
    sortAccessor: accessor,
    render: accessor,
  };
}

function readCount(row: CustomizationTable, key: string) {
  const record = row as unknown as Record<string, unknown>;
  const value = record[key];
  if (typeof value === "number") return value;

  const count = record._count;
  if (count && typeof count === "object") {
    const mappedKey =
      key === "fieldsCount"
        ? "columns"
        : key === "formsCount"
          ? "forms"
          : key === "viewsCount"
            ? "views"
            : key;
    const countValue = (count as Record<string, unknown>)[mappedKey];
    if (typeof countValue === "number") return countValue;
  }

  return typeof value === "number" ? value : 0;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}
