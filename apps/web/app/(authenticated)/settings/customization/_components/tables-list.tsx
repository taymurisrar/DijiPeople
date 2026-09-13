"use client";

import { Edit3, ExternalLink, PauseCircle, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import { DataTableColumn } from "@/app/components/data-table/types";
import { useFormattingContext } from "@/app/components/filters/use-formatting-context";
import { useSideToast } from "@/app/components/notifications/use-side-toast";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import {
  CheckboxField,
  TextAreaField,
  TextField,
} from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import { PermissionGate } from "@/app/(authenticated)/_components/permission-gate";
import { formatDate } from "@/lib/formatting-context";
import { CustomizationTable } from "../types";
import { useDialogBehavior } from "@/app/components/ui/dialog";

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
  const formattingContext = useFormattingContext();
  const { notifySuccess, toast } = useSideToast();
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
        header: "Module",
        sortable: true,
        searchable: true,
        sortAccessor: (row) => row.displayName,
        searchAccessor: (row) => `${row.displayName} ${row.description ?? ""}`,
        render: (row) => (
          <div>
            <p className="font-semibold text-foreground">{row.displayName}</p>
            {row.description ? (
              <p className="mt-1 max-w-xs truncate text-xs text-muted">
                {row.description}
              </p>
            ) : null}
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
        key: "package",
        header: "Package",
        searchable: true,
        searchAccessor: (row) => row.packageName ?? "",
        render: (row) =>
          row.packageName ?? (row.isCustomTable ? "Not set" : "Default Package"),
      },
      {
        key: "lifecycle",
        header: "Lifecycle",
        filterable: true,
        filterType: "select",
        filterAccessor: (row) => lifecycleLabel(row),
        filterOptions: [
          { label: "Draft", value: "Draft" },
          { label: "Published", value: "Published" },
        ],
        render: (row) => lifecycleLabel(row),
      },
      metricColumn("fields", "Fields", (row) => readCount(row, "fieldsCount")),
      metricColumn("forms", "Forms", (row) => readCount(row, "formsCount")),
      metricColumn("views", "Views", (row) => readCount(row, "viewsCount")),
      {
        key: "updatedAt",
        header: "Modified",
        sortable: true,
        sortAccessor: (row) => row.updatedAt ?? "",
        render: (row) => formatDate(row.updatedAt, formattingContext) || "-",
      },
      {
        key: "actions",
        header: "Actions",
        render: (row) => (
          <div className="flex gap-1">
            <Button
              href={`/settings/customization/tables/${row.tableKey}`}
              leftIcon={<ExternalLink className="h-4 w-4" />}
              size="icon-sm"
              variant="secondary"
              aria-label={`Open ${row.displayName}`}
              title="Open"
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
                aria-label={`Rename ${row.displayName}`}
                title="Rename"
              />

              {row.isCustomTable ? (
                <Button
                  leftIcon={<PauseCircle className="h-4 w-4" />}
                  onClick={() =>
                    setEditing({
                      mode: "edit",
                      tableKey: row.tableKey,
                      displayName: row.displayName,
                      pluralDisplayName: row.pluralDisplayName,
                      icon: row.icon ?? "",
                      description: row.description ?? "",
                      isActive: !row.isActive,
                    })
                  }
                  size="icon-sm"
                  variant="ghost"
                  aria-label={
                    row.isActive
                      ? `Deactivate ${row.displayName}`
                      : `Activate ${row.displayName}`
                  }
                  title={row.isActive ? "Deactivate" : "Activate"}
                  type="button"
                />
              ) : null}

              {row.isCustomTable ? (
                <Button
                  leftIcon={<Trash2 className="h-4 w-4" />}
                  onClick={() => setDeleteTarget(row)}
                  size="icon-sm"
                  variant="danger"
                  aria-label={`Delete ${row.displayName}`}
                  title="Delete"
                />
              ) : null}
            </PermissionGate>
          </div>
        ),
      },
    ],
    [formattingContext],
  );

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;

    if (editing.mode === "create" && !editing.tableKey) {
      setError("Enter a display name.");
      return;
    }

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
      message?: string | string[];
    };

    setIsSaving(false);
    if (!response.ok) {
      setError(
        (Array.isArray(data.message) ? data.message.join(" ") : data.message) ??
          "Unable to save the module.",
      );
      return;
    }

    const saved = editing;
    setEditing(null);
    if (saved.mode === "create") {
      /*
       * ITEM-0184 — a new module used to be created silently onto a list sorted
       * by name, usually on a page the user was not looking at. It opens now.
       */
      notifySuccess(`${saved.displayName.trim()} created`);
      router.push(`/settings/customization/tables/${saved.tableKey}`);
      return;
    }
    notifySuccess(`${saved.displayName.trim()} saved`);
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
      setError(data.message ?? "Unable to delete the module.");
      return;
    }
    notifySuccess(`${deleteTarget.displayName} deleted`);
    setDeleteTarget(null);
    router.refresh();
  }

  // BUG-0043: kept its own layout, gained the guarantees it never had -
  // focus containment, Escape, focus restore and dialog semantics.
  const editDialog = useDialogBehavior({
    open: Boolean(editing),
    onClose: () => setEditing(null),
  });
  const deleteDialog = useDialogBehavior({
    open: Boolean(deleteTarget),
    onClose: () => setDeleteTarget(null),
  });

  return (
    <>
      {toast}
      <div className="mb-3 flex justify-end">
        <PermissionGate anyOf={["customization.tables.update"]}>
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setError(null);
              setEditing({
                mode: "create",
                tableKey: "",
                displayName: "",
                pluralDisplayName: "",
                icon: "",
                description: "",
                isActive: true,
              });
            }}
            type="button"
          >
            Create module
          </Button>
        </PermissionGate>
      </div>

      {error && !editing ? (
        <div
          className="mb-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <DataTable
        className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm"
        columns={columns}
        emptyState={
          <EmptyState
            description="No modules are available for customization."
            title="No modules"
          />
        }
        getRowKey={(row) => row.tableKey}
        initialSort={{ columnKey: "displayName", direction: "asc" }}
        pagination={{ page: 1, pageSize: 10, total: tables.length }}
        rows={tables}
        searchPlaceholder="Search modules"
        tableClassName="min-w-[860px] divide-y divide-border text-xs"
      />

      {editing ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"
          {...editDialog.backdropProps}
        >
          <form
            {...editDialog.panelProps}
            className="grid max-h-[92vh] w-full max-w-2xl gap-5 overflow-y-auto rounded-[24px] border border-border bg-white p-6 shadow-xl"
            onSubmit={handleSave}
          >
            <h3
              className="text-lg font-semibold text-foreground"
              id={editDialog.titleId}
            >
              {editing.mode === "create" ? "Create module" : "Edit module"}
            </h3>

            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label="Display name"
                onChange={(displayName) =>
                  setEditing((current) =>
                    current
                      ? {
                          ...current,
                          displayName,
                          /*
                           * ITEM-0184 — the logical name is derived from the
                           * display name and shown read-only. It used to be a
                           * raw camelCase input a business user had to invent.
                           */
                          tableKey:
                            current.mode === "create"
                              ? toCamelCase(displayName)
                              : current.tableKey,
                        }
                      : current,
                  )
                }
                required
                value={editing.displayName}
              />
              <TextField
                label="Plural name"
                onChange={(pluralDisplayName) =>
                  setEditing((current) =>
                    current ? { ...current, pluralDisplayName } : current,
                  )
                }
                required
                value={editing.pluralDisplayName}
              />
              <TextField
                disabled
                label="Logical name"
                onChange={() => undefined}
                value={editing.tableKey}
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

            {error ? (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-3">
              <Button
                onClick={() => setEditing(null)}
                type="button"
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                loading={isSaving}
                loadingText={
                  editing.mode === "create" ? "Creating..." : "Saving..."
                }
                type="submit"
              >
                {editing.mode === "create" ? "Create" : "Save"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"
          {...deleteDialog.backdropProps}
        >
          <div
            {...deleteDialog.panelProps}
            className="grid w-full max-w-lg gap-4 rounded-[24px] border border-border bg-white p-6 shadow-xl"
          >
            <h3
              className="text-lg font-semibold text-foreground"
              id={deleteDialog.titleId}
            >
              Delete {deleteTarget.displayName}?
            </h3>
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

function lifecycleLabel(row: CustomizationTable) {
  const value =
    row.lifecycleState ?? (row.isCustomTable ? "draft" : "published");
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

  return 0;
}

function toCamelCase(value: string) {
  const words = value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
  const camel = words
    .map((word, index) => {
      const lower = word.toLowerCase();
      return index === 0
        ? lower
        : `${lower[0]?.toUpperCase() ?? ""}${lower.slice(1)}`;
    })
    .join("");
  // The API key must start with a letter.
  return /^[a-z]/.test(camel) ? camel : camel ? `m${camel}` : "";
}
