"use client";

import { Edit3, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import { DataTableColumn } from "@/app/components/data-table/types";
import { ConfirmDialog } from "@/app/components/feedback/confirm-dialog";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import {
  CheckboxField,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/app/components/ui/form-control";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { PermissionGate } from "@/app/dashboard/_components/permission-gate";
import { CustomizationColumn, CustomizationTable } from "../types";

const fieldTypeOptions = [
  "text",
  "textarea",
  "number",
  "decimal",
  "date",
  "datetime",
  "boolean",
  "select",
  "multiselect",
  "lookup",
  "email",
  "phone",
  "url",
  "currency",
].map((value) => ({ value, label: value }));

type ColumnFormState = {
  mode: "create" | "edit";
  original?: CustomizationColumn;
  columnKey: string;
  displayName: string;
  fieldType: string;
  isRequired: boolean;
  isVisible: boolean;
  isSearchable: boolean;
  isSortable: boolean;
  maxLength: number | null;
  defaultValue: string;
  lookupTargetTableKey: string;
  optionSetText: string;
  sortOrder: number | null;
};

export function ColumnsManagement({
  columns,
  lookupTables,
  table,
}: {
  columns: CustomizationColumn[];
  lookupTables: CustomizationTable[];
  table: CustomizationTable;
}) {
  const router = useRouter();
  const [form, setForm] = useState<ColumnFormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomizationColumn | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const tableColumns = useMemo<DataTableColumn<CustomizationColumn>[]>(
    () => [
      {
        key: "displayName",
        header: "Display name",
        sortable: true,
        sortAccessor: (row) => row.displayName,
        render: (row) => (
          <div>
            <p className="font-semibold text-foreground">{row.displayName}</p>
            <p className="mt-1 text-xs text-muted">{row.columnKey}</p>
          </div>
        ),
      },
      {
        key: "type",
        header: "Type",
        sortable: true,
        sortAccessor: (row) => row.fieldType,
        render: (row) => (
          <div>
            <p className="text-sm text-foreground">{row.fieldType}</p>
            <p className="mt-1 text-xs text-muted">Data: {row.dataType}</p>
          </div>
        ),
      },
      {
        key: "state",
        header: "Rules",
        render: (row) => (
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={row.isRequired ? "neutral" : "muted"}>
              {row.isRequired ? "Required" : "Optional"}
            </StatusPill>
            <StatusPill tone={row.isVisible ? "good" : "muted"}>
              {row.isVisible ? "Visible" : "Hidden"}
            </StatusPill>
          </div>
        ),
      },
      {
        key: "search",
        header: "Search / sort",
        render: (row) => (
          <div className="space-y-1 text-sm text-muted">
            <p>Searchable: {row.isSearchable ? "Yes" : "No"}</p>
            <p>Sortable: {row.isSortable ? "Yes" : "No"}</p>
          </div>
        ),
      },
      {
        key: "source",
        header: "Source",
        render: (row) => (
          <StatusPill tone={row.isSystem ? "muted" : "neutral"}>
            {row.isSystem ? "System" : "Custom"}
          </StatusPill>
        ),
      },
      {
        key: "maxLength",
        header: "Max length",
        sortable: true,
        sortAccessor: (row) => row.maxLength ?? 0,
        render: (row) => row.maxLength ?? "-",
      },
      {
        key: "order",
        header: "Order",
        sortable: true,
        sortAccessor: (row) => row.sortOrder,
        render: (row) => row.sortOrder,
      },
      {
        key: "actions",
        header: "Actions",
        render: (row) => (
          <div className="flex flex-wrap gap-2">
            <PermissionGate anyOf={["customization.columns.update"]}>
              <Button
                leftIcon={<Edit3 className="h-4 w-4" />}
                onClick={() => openEdit(row)}
                size="sm"
                type="button"
                variant="secondary"
              >
                Edit
              </Button>
            </PermissionGate>
            {!row.isSystem ? (
              <PermissionGate anyOf={["customization.columns.delete"]}>
                <Button
                  leftIcon={<Trash2 className="h-4 w-4" />}
                  onClick={() => setDeleteTarget(row)}
                  size="sm"
                  type="button"
                  variant="danger"
                >
                  Delete
                </Button>
              </PermissionGate>
            ) : null}
          </div>
        ),
      },
    ],
    [],
  );

  function openCreate() {
    setError(null);
    setForm({
      mode: "create",
      columnKey: "",
      displayName: "",
      fieldType: "text",
      isRequired: false,
      isVisible: true,
      isSearchable: false,
      isSortable: false,
      maxLength: null,
      defaultValue: "",
      lookupTargetTableKey: "",
      optionSetText: "",
      sortOrder: nextSortOrder(columns),
    });
  }

  function openEdit(column: CustomizationColumn) {
    setError(null);
    setForm({
      mode: "edit",
      original: column,
      columnKey: column.columnKey,
      displayName: column.displayName,
      fieldType: column.fieldType,
      isRequired: column.isRequired,
      isVisible: column.isVisible,
      isSearchable: column.isSearchable,
      isSortable: column.isSortable,
      maxLength: column.maxLength,
      defaultValue: column.defaultValue ?? "",
      lookupTargetTableKey: column.lookupTargetTableKey ?? "",
      optionSetText: optionSetToText(column.optionSetJson),
      sortOrder: column.sortOrder,
    });
  }

  function updateForm(patch: Partial<ColumnFormState>) {
    setForm((current) => (current ? { ...current, ...patch } : current));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;

    const validationError = validateForm(form, columns);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    setError(null);

    const body = buildPayload(form);
    const response = await fetch(
      form.mode === "create"
        ? `/api/customization/tables/${table.tableKey}/columns`
        : `/api/customization/tables/${table.tableKey}/columns/${form.columnKey}`,
      {
        method: form.mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
    };

    setIsSaving(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to save column metadata.");
      return;
    }

    setForm(null);
    router.refresh();
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    const response = await fetch(
      `/api/customization/tables/${table.tableKey}/columns/${deleteTarget.columnKey}`,
      { method: "DELETE" },
    );
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
    };

    if (!response.ok) {
      setError(data.message ?? "Unable to delete column.");
      return;
    }

    setDeleteTarget(null);
    router.refresh();
  }

  return (
    <SectionCard
      description="System columns can be relabeled, hidden, reordered, and adjusted only where safe. Custom columns are metadata fields on this existing system table."
      title="Columns"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {columns.length} column{columns.length === 1 ? "" : "s"} configured
          for {table.pluralDisplayName}.
        </p>
        <PermissionGate anyOf={["customization.columns.create"]}>
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={openCreate}
            type="button"
          >
            Add custom column
          </Button>
        </PermissionGate>
      </div>

      {error && !form ? (
        <div className="mb-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <DataTable
        columns={tableColumns}
        emptyState={
          <EmptyState
            action={
              <PermissionGate anyOf={["customization.columns.create"]}>
                <Button onClick={openCreate} type="button" variant="secondary">
                  Add custom column
                </Button>
              </PermissionGate>
            }
            description="This table has no registered columns yet."
            title="No columns"
          />
        }
        getRowKey={(row) => row.columnKey}
        initialSort={{ columnKey: "order", direction: "asc" }}
        rows={columns}
      />

      {form ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
          <form
            className="grid max-h-[92vh] w-full max-w-3xl gap-5 overflow-y-auto rounded-[24px] border border-border bg-white p-6 shadow-xl"
            onSubmit={handleSubmit}
          >
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                {form.mode === "create" ? "Add custom column" : "Edit column"}
              </h3>
              <p className="mt-1 text-sm leading-6 text-muted">
                {form.original?.isSystem
                  ? "This is a system column. Core type and identity changes are protected."
                  : "Configure metadata for a tenant-managed custom column."}
              </p>
            </div>

            {form.original?.isSystem ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Required system fields cannot be made optional, and system field
                types cannot be changed.
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                disabled={form.mode === "edit"}
                hint="Use camelCase. This key cannot be changed after creation."
                label="Column key"
                onChange={(columnKey) => updateForm({ columnKey })}
                required
                value={form.columnKey}
              />
              <TextField
                label="Display name"
                onChange={(displayName) => updateForm({ displayName })}
                required
                value={form.displayName}
              />
              <SelectField
                disabled={Boolean(form.original?.isSystem)}
                hint={
                  form.original?.isSystem
                    ? "System field types are locked."
                    : "Unsafe changes are blocked by the server."
                }
                label="Field type"
                onChange={(fieldType) => updateForm({ fieldType })}
                options={fieldTypeOptions}
                required
                value={form.fieldType}
              />
              <NumberField
                label="Sort order"
                min={0}
                onChange={(sortOrder) => updateForm({ sortOrder })}
                value={form.sortOrder}
              />
              <NumberField
                disabled={!supportsMaxLength(form.fieldType)}
                label="Max length"
                min={1}
                onChange={(maxLength) => updateForm({ maxLength })}
                value={form.maxLength}
              />
              <TextField
                label="Default value"
                onChange={(defaultValue) => updateForm({ defaultValue })}
                value={form.defaultValue}
              />
              <SelectField
                disabled={form.fieldType !== "lookup"}
                label="Lookup target"
                onChange={(lookupTargetTableKey) =>
                  updateForm({ lookupTargetTableKey })
                }
                options={lookupTables.map((lookupTable) => ({
                  value: lookupTable.tableKey,
                  label: lookupTable.pluralDisplayName,
                }))}
                placeholder="Select lookup target"
                value={form.lookupTargetTableKey}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <CheckboxField
                  checked={form.isRequired}
                  label="Required"
                  onChange={(isRequired) => updateForm({ isRequired })}
                />
                <CheckboxField
                  checked={form.isVisible}
                  label="Visible"
                  onChange={(isVisible) => updateForm({ isVisible })}
                />
                <CheckboxField
                  checked={form.isSearchable}
                  label="Searchable"
                  onChange={(isSearchable) => updateForm({ isSearchable })}
                />
                <CheckboxField
                  checked={form.isSortable}
                  label="Sortable"
                  onChange={(isSortable) => updateForm({ isSortable })}
                />
              </div>
              <TextAreaField
                className="md:col-span-2"
                disabled={!["select", "multiselect"].includes(form.fieldType)}
                hint="Enter one option per line. Used for select and multiselect fields."
                label="Option values"
                onChange={(optionSetText) => updateForm({ optionSetText })}
                rows={5}
                value={form.optionSetText}
              />
            </div>

            {error ? <p className="text-sm text-danger">{error}</p> : null}

            <div className="flex flex-wrap justify-end gap-3">
              <Button
                onClick={() => {
                  setForm(null);
                  setError(null);
                }}
                type="button"
                variant="secondary"
              >
                Cancel
              </Button>
              <Button loading={isSaving} loadingText="Saving..." type="submit">
                Save column
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      <ConfirmDialog
        confirmAction={{
          label: "Delete column",
          onClick: handleDelete,
          variant: "danger",
        }}
        description={
          deleteTarget
            ? `Delete ${deleteTarget.displayName}? This only removes tenant custom metadata.`
            : undefined
        }
        onClose={() => setDeleteTarget(null)}
        open={Boolean(deleteTarget)}
        title="Delete custom column"
      />
    </SectionCard>
  );
}

function validateForm(form: ColumnFormState, columns: CustomizationColumn[]) {
  if (!/^[a-z][a-zA-Z0-9]*$/.test(form.columnKey)) {
    return "Column key must use camelCase and start with a lowercase letter.";
  }
  if (!form.displayName.trim()) {
    return "Display name is required.";
  }
  if (
    form.mode === "create" &&
    columns.some((column) => column.columnKey === form.columnKey)
  ) {
    return "A column with this key already exists.";
  }
  if (form.original?.isSystem && form.fieldType !== form.original.fieldType) {
    return "System column field types cannot be changed.";
  }
  if (form.original?.isSystem && form.original.isRequired && !form.isRequired) {
    return "Required system columns cannot be made optional.";
  }
  if (form.fieldType === "lookup" && !form.lookupTargetTableKey) {
    return "Lookup fields require a target table.";
  }
  if (
    ["select", "multiselect"].includes(form.fieldType) &&
    parseOptions(form.optionSetText).length === 0
  ) {
    return "Select and multiselect fields require at least one option.";
  }
  if (form.mode === "edit" && form.original && !form.original.isSystem) {
    const safe = isSafeTypeChange(form.original.fieldType, form.fieldType);
    if (!safe) {
      return `Changing field type from ${form.original.fieldType} to ${form.fieldType} is not safe.`;
    }
  }

  return null;
}

function buildPayload(form: ColumnFormState) {
  const payload: Record<string, unknown> = {
    displayName: form.displayName.trim(),
    fieldType: form.fieldType,
    isRequired: form.isRequired,
    isVisible: form.isVisible,
    isSearchable: form.isSearchable,
    isSortable: form.isSortable,
    maxLength: supportsMaxLength(form.fieldType) ? form.maxLength : null,
    defaultValue: form.defaultValue || undefined,
    lookupTargetTableKey:
      form.fieldType === "lookup" ? form.lookupTargetTableKey : undefined,
    optionSetJson: ["select", "multiselect"].includes(form.fieldType)
      ? { options: parseOptions(form.optionSetText) }
      : undefined,
    sortOrder: form.sortOrder ?? 0,
  };

  if (form.mode === "create") {
    payload.columnKey = form.columnKey;
    payload.dataType = form.fieldType;
  }

  return payload;
}

function isSafeTypeChange(current: string, next: string) {
  if (current === next) return true;
  const groups = [
    ["text", "textarea", "email", "phone", "url"],
    ["number", "decimal", "currency"],
    ["date", "datetime"],
  ];
  return groups.some((group) => group.includes(current) && group.includes(next));
}

function supportsMaxLength(fieldType: string) {
  return ["text", "textarea", "email", "phone", "url"].includes(fieldType);
}

function nextSortOrder(columns: CustomizationColumn[]) {
  return columns.reduce((max, column) => Math.max(max, column.sortOrder), 0) + 10;
}

function parseOptions(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function optionSetToText(optionSetJson: CustomizationColumn["optionSetJson"]) {
  const options = optionSetJson?.options;
  if (!Array.isArray(options)) return "";
  return options
    .map((option) =>
      typeof option === "string"
        ? option
        : (option.label ?? option.value ?? "").trim(),
    )
    .filter(Boolean)
    .join("\n");
}
