"use client";

import { Edit3, ExternalLink, Plus, Trash2 } from "lucide-react";
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
        header: "Display name",
        sortable: true,
        sortAccessor: (row) => row.displayName,
        render: (row) => (
          <div>
            <p className="font-semibold text-foreground">{row.displayName}</p>
            <p className="mt-1 text-xs text-muted">{row.description}</p>
          </div>
        ),
      },
      {
        key: "tableKey",
        header: "Table key",
        sortable: true,
        sortAccessor: (row) => row.tableKey,
        render: (row) => (
          <code className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">
            {row.tableKey}
          </code>
        ),
      },
      {
        key: "pluralName",
        header: "Plural name",
        sortable: true,
        sortAccessor: (row) => row.pluralDisplayName,
        render: (row) => row.pluralDisplayName,
      },
      {
        key: "active",
        header: "Active",
        render: (row) => (
          <StatusPill tone={row.isActive ? "good" : "muted"}>
            {row.isActive ? "Active" : "Inactive"}
          </StatusPill>
        ),
      },
      {
        key: "customizable",
        header: "Customizable",
        render: (row) => (
          <StatusPill tone={row.isCustomizable ? "neutral" : "muted"}>
            {row.isCustomizable ? "Yes" : "No"}
          </StatusPill>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        render: (row) => (
          <div className="flex flex-wrap gap-2">
            <Button
              href={`/settings/customization/tables/${row.tableKey}`}
              leftIcon={<ExternalLink className="h-4 w-4" />}
              size="sm"
              variant="secondary"
            >
              Open
            </Button>
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
                size="sm"
                type="button"
                variant="ghost"
              >
                Edit
              </Button>
              {row.isCustomTable ? (
                <Button
                  leftIcon={<Trash2 className="h-4 w-4" />}
                  onClick={() => setDeleteTarget(row)}
                  size="sm"
                  type="button"
                  variant="danger"
                >
                  Delete
                </Button>
              ) : null}
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
      <div className="mb-4 flex justify-end">
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
            Create table
          </Button>
        </PermissionGate>
      </div>

      {error && !editing ? (
        <div className="mb-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <DataTable
        columns={columns}
        emptyState={
          <EmptyState
            description="No system tables are registered for customization yet."
            title="No configurable tables"
          />
        }
        getRowKey={(row) => row.tableKey}
        initialSort={{ columnKey: "displayName", direction: "asc" }}
        rows={tables}
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
                  ? "Create custom table"
                  : "Edit table metadata"}
              </h3>
              <p className="mt-1 text-sm text-muted">
                {editing.mode === "create"
                  ? "Create a tenant-scoped metadata table."
                  : `Update tenant-facing labels for ${editing.tableKey}.`}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                disabled={editing.mode === "edit"}
                hint="Use camelCase. This logical name is immutable after creation."
                label="Table logical name"
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
                hint="Inactive tables stay registered but should be hidden from customization-driven UI."
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
                Delete custom table
              </h3>
              <p className="mt-1 text-sm leading-6 text-muted">
                Delete {deleteTarget.displayName}? System tables cannot be
                deleted, and tables with dependent columns, forms, or views are
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
                Delete table
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
