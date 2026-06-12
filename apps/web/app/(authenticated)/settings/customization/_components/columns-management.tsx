"use client";

import { Edit3, GripVertical, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import { DataTableColumn } from "@/app/components/data-table/types";
import { ConfirmDialog } from "@/app/components/feedback/confirm-dialog";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import {
  CheckboxField,
  SelectField,
  TextField,
} from "@/app/components/ui/form-control";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { PermissionGate } from "@/app/(authenticated)/_components/permission-gate";
import { SYSTEM_COMPONENT_CUSTOMIZATION_MESSAGE } from "@/lib/customization/metadata-layering";
import {
  CustomizationColumn,
  CustomizationPackage,
  CustomizationTable,
} from "../types";
import { CustomPackagePickerDialog } from "./custom-package-picker-dialog";

const fieldTypeOptions = [
  "text",
  "number",
  "date",
  "datetime",
  "boolean",
  "email",
  "phone",
  "reference",
  "choice",
  "multilineText",
].map((value) => ({ value, label: fieldTypeLabel(value) }));

type ChoiceOptionRow = {
  id: string;
  label: string;
  value: string;
  active: boolean;
};

type ColumnFormState = {
  mode: "create" | "edit";
  original?: CustomizationColumn;
  columnKey: string;
  displayName: string;
  fieldType: string;
  isRequired: boolean;
  isVisible: boolean;
  isSearchable: boolean;
  isFilterable: boolean;
  isSortable: boolean;
  maxLength: number | null;
  defaultValue: string;
  lookupTargetTableKey: string;
  optionRows: ChoiceOptionRow[];
  sortOrder: number | null;
};

export function ColumnsManagement({
  columns,
  lookupTables,
  packages,
  table,
}: {
  columns: CustomizationColumn[];
  lookupTables: CustomizationTable[];
  packages: CustomizationPackage[];
  table: CustomizationTable;
}) {
  const router = useRouter();
  const [form, setForm] = useState<ColumnFormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomizationColumn | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState(
    packages.find((item) => item.type === "custom" && !item.isReadOnly)?.id ??
      "",
  );
  const [pendingSystemColumn, setPendingSystemColumn] =
    useState<CustomizationColumn | null>(null);
  const selectedPackage = useMemo(
    () =>
      packages.find((item) => item.id === selectedPackageId) ??
      packages.find((item) => item.type === "custom" && !item.isReadOnly),
    [packages, selectedPackageId],
  );
  const publisherPrefix = packagePrefix(selectedPackage);

  const tableColumns: DataTableColumn<CustomizationColumn>[] = [
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
        key: "logicalName",
        header: "Logical name",
        searchable: true,
        sortable: true,
        sortAccessor: (row) => row.columnKey,
        render: (row) => (
          <code className="rounded-md bg-slate-100 px-2 py-1 text-xs">
            {row.columnKey}
          </code>
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
        key: "required",
        header: "Required",
        filterable: true,
        filterType: "select",
        filterAccessor: (row) => (row.isRequired ? "Yes" : "No"),
        filterOptions: [
          { label: "Required", value: "Yes" },
          { label: "Optional", value: "No" },
        ],
        render: (row) => (row.isRequired ? "Yes" : "No"),
      },
      {
        key: "capabilities",
        header: "Search / filter / sort",
        render: (row) => (
          <div className="space-y-1 text-xs text-muted">
            <p>Searchable: {yesNo(row.isSearchable)}</p>
            <p>Filterable: {yesNo(row.isFilterable)}</p>
            <p>Sortable: {yesNo(row.isSortable)}</p>
          </div>
        ),
      },
      {
        key: "source",
        header: "Source",
        filterable: true,
        filterType: "select",
        filterAccessor: (row) => (row.isSystem ? "System" : "Custom"),
        filterOptions: [
          { label: "System", value: "System" },
          { label: "Custom", value: "Custom" },
        ],
        render: (row) => (
          <StatusPill tone={row.isSystem ? "muted" : "neutral"}>
            {row.isSystem ? "System" : "Custom"}
          </StatusPill>
        ),
      },
      {
        key: "package",
        header: "Package",
        render: (row) => (row.isSystem ? "Default Package" : "Custom Package"),
      },
      {
        key: "lifecycle",
        header: "Lifecycle",
        render: (row) => (
          <StatusPill tone={row.isSystem ? "good" : "muted"}>
            {stateLabel(
              row.lifecycleState ?? (row.isSystem ? "published" : "draft"),
            )}
          </StatusPill>
        ),
      },
      {
        key: "status",
        header: "Status",
        filterable: true,
        filterType: "select",
        filterAccessor: (row) =>
          row.isActive === false ? "Inactive" : "Active",
        filterOptions: [
          { label: "Active", value: "Active" },
          { label: "Inactive", value: "Inactive" },
        ],
        render: (row) => (
          <StatusPill tone={row.isActive === false ? "muted" : "good"}>
            {row.isActive === false ? "Inactive" : "Active"}
          </StatusPill>
        ),
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
                title="Edit field"
                type="button"
                variant="secondary"
              >
                Edit/Rename
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
    ];

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
      isFilterable: false,
      isSortable: false,
      maxLength: null,
      defaultValue: "",
      lookupTargetTableKey: "",
      optionRows: [],
      sortOrder: nextSortOrder(columns),
    });
  }

  function openEdit(column: CustomizationColumn) {
    setError(null);
    if (column.isSystem) {
      setPendingSystemColumn(column);
      return;
    }
    setForm(toColumnFormState(column));
  }

  function toColumnFormState(column: CustomizationColumn): ColumnFormState {
    return {
      mode: "edit",
      original: column,
      columnKey: column.columnKey,
      displayName: column.displayName,
      fieldType: column.fieldType,
      isRequired: column.isRequired,
      isVisible: column.isVisible,
      isSearchable: column.isSearchable,
      isFilterable: column.isFilterable ?? false,
      isSortable: column.isSortable,
      maxLength: column.maxLength,
      defaultValue: column.defaultValue ?? "",
      lookupTargetTableKey: column.lookupTargetTableKey ?? "",
      optionRows: optionSetToRows(column.optionSetJson),
      sortOrder: column.sortOrder,
    };
  }

  function updateForm(patch: Partial<ColumnFormState>) {
    setForm((current) => (current ? { ...current, ...patch } : current));
  }

  function updateDisplayName(displayName: string) {
    setForm((current) => {
      if (!current) return current;
      if (current.mode === "edit") return { ...current, displayName };

      return {
        ...current,
        displayName,
        columnKey:
          current.columnKey &&
          current.columnKey !== generatedFieldKey(current.displayName, publisherPrefix)
            ? current.columnKey
            : generatedFieldKey(displayName, publisherPrefix),
      };
    });
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
    if (form.mode === "edit" && form.original?.isSystem) {
      body.packageId = selectedPackageId;
    }
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
      setError(data.message ?? "Unable to save field metadata.");
      return;
    }

    setForm(null);
    router.refresh();
  }

  function continueSystemColumnEdit() {
    if (!pendingSystemColumn) return;
    setForm(toColumnFormState(pendingSystemColumn));
    setPendingSystemColumn(null);
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
      setError(data.message ?? "Unable to delete field.");
      return;
    }

    setDeleteTarget(null);
    router.refresh();
  }

  return (
    <SectionCard
      description="System fields can be relabeled and adjusted only where safe. Custom fields are package-owned metadata components on this module."
      title="Fields"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {columns.length} field{columns.length === 1 ? "" : "s"} configured for{" "}
          {table.pluralDisplayName}.
        </p>
        <PermissionGate anyOf={["customization.columns.create"]}>
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={openCreate}
            type="button"
          >
            Add custom field
          </Button>
        </PermissionGate>
      </div>

      {error && !form ? (
        <div className="mb-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <DataTable
        className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm"
        columns={tableColumns}
        emptyState={
          <EmptyState
            action={
              <PermissionGate anyOf={["customization.columns.create"]}>
                <Button onClick={openCreate} type="button" variant="secondary">
                  Add custom field
                </Button>
              </PermissionGate>
            }
            description="This module has no registered fields yet."
            title="No fields"
          />
        }
        getRowKey={(row) => row.columnKey}
        initialSort={{ columnKey: "displayName", direction: "asc" }}
        pagination={{ page: 1, pageSize: 10, total: columns.length }}
        rows={columns}
        searchPlaceholder="Search fields"
        tableClassName="min-w-[1060px] divide-y divide-border text-xs"
      />

      {form ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
          <form
            className="grid max-h-[92vh] w-full max-w-3xl gap-5 overflow-y-auto rounded-[24px] border border-border bg-white p-6 shadow-xl"
            onSubmit={handleSubmit}
          >
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                {form.mode === "create" ? "Add custom field" : "Edit field"}
              </h3>
              <p className="mt-1 text-sm leading-6 text-muted">
                {form.original?.isSystem
                  ? "This is a system field. Core type and identity changes are protected."
                  : "Configure metadata for a tenant-managed custom field."}
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
                hint={`Generated from display name with publisher prefix ${publisherPrefix}. This logical name is locked after creation.`}
                label="Field logical name"
                onChange={(columnKey) => updateForm({ columnKey })}
                required
                value={form.columnKey}
              />
              <TextField
                label="Display name"
                onChange={updateDisplayName}
                required
                value={form.displayName}
              />
              <SelectField
                disabled={form.mode === "edit"}
                hint={
                  form.mode === "edit"
                    ? "Field data type is locked after creation."
                    : "Choose the storage and editor data type."
                }
                label="Field type"
                onChange={(fieldType) => updateForm({ fieldType })}
                options={fieldTypeOptions}
                required
                value={form.fieldType}
              />
              <TextField
                disabled={!supportsMaxLength(form.fieldType)}
                label="Max length"
                onChange={(maxLength) =>
                  updateForm({
                    maxLength: maxLength ? Number(maxLength) : null,
                  })
                }
                type="text"
                value={form.maxLength == null ? "" : String(form.maxLength)}
              />
              <TextField
                label="Default value"
                onChange={(defaultValue) => updateForm({ defaultValue })}
                value={form.defaultValue}
              />
              <SelectField
                disabled={form.fieldType !== "reference"}
                label="Reference target"
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
                  checked={form.isFilterable}
                  label="Filterable"
                  onChange={(isFilterable) => updateForm({ isFilterable })}
                />
                <CheckboxField
                  checked={form.isSortable}
                  label="Sortable"
                  onChange={(isSortable) => updateForm({ isSortable })}
                />
              </div>
              {form.fieldType === "choice" ? (
                <ChoiceOptionsEditor
                  onChange={(optionRows) => updateForm({ optionRows })}
                  rows={form.optionRows}
                />
              ) : null}
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
                Save field
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      <ConfirmDialog
        confirmAction={{
          label: "Delete field",
          onClick: handleDelete,
          variant: "danger",
        }}
        description={
          deleteTarget
            ? `Delete ${deleteTarget.displayName}? System fields cannot be deleted, and custom fields with dependencies are blocked by the server.`
            : undefined
        }
        onClose={() => setDeleteTarget(null)}
        open={Boolean(deleteTarget)}
        title="Delete custom field"
      />
      <CustomPackagePickerDialog
        message={SYSTEM_COMPONENT_CUSTOMIZATION_MESSAGE}
        onClose={() => setPendingSystemColumn(null)}
        onConfirm={continueSystemColumnEdit}
        open={Boolean(pendingSystemColumn)}
        packages={packages}
        selectedPackageId={selectedPackageId}
        setSelectedPackageId={setSelectedPackageId}
      />
    </SectionCard>
  );
}

function validateForm(form: ColumnFormState, columns: CustomizationColumn[]) {
  if (
    form.mode === "create" &&
    !/^[a-z][a-z0-9]*_[a-z][a-zA-Z0-9]*$/.test(form.columnKey)
  ) {
    return "Field logical name must use the publisher prefix and camelCase, for example mt_passportExpiryDate.";
  }
  if (!form.displayName.trim()) {
    return "Display name is required.";
  }
  if (
    form.mode === "create" &&
    columns.some((column) => column.columnKey === form.columnKey)
  ) {
    return "A field with this logical name already exists.";
  }
  if (form.original?.isSystem && form.fieldType !== form.original.fieldType) {
    return "System field types cannot be changed.";
  }
  if (form.original?.isSystem && form.original.isRequired && !form.isRequired) {
    return "Required system fields cannot be made optional.";
  }
  if (form.fieldType === "reference" && !form.lookupTargetTableKey) {
    return "Reference fields require a target module.";
  }
  if (
    form.fieldType === "choice" &&
    activeOptionRows(form.optionRows).length === 0
  ) {
    return "Choice fields require at least one active option.";
  }
  if (form.mode === "edit" && form.original?.fieldType !== form.fieldType) {
    return "Field data type cannot be changed after creation.";
  }

  return null;
}

function buildPayload(form: ColumnFormState) {
  const payload: Record<string, unknown> = {
    displayName: form.displayName.trim(),
    fieldType: apiFieldType(form.fieldType),
    isRequired: form.isRequired,
    isVisible: form.isVisible,
    isSearchable: form.isSearchable,
    isFilterable: form.isFilterable,
    isSortable: form.isSortable,
    maxLength: supportsMaxLength(form.fieldType) ? form.maxLength : null,
    defaultValue: form.defaultValue || undefined,
    lookupTargetTableKey:
      form.fieldType === "reference" ? form.lookupTargetTableKey : undefined,
    optionSetJson:
      form.fieldType === "choice"
        ? { options: activeOptionRows(form.optionRows) }
        : undefined,
    sortOrder: form.sortOrder ?? 0,
  };

  if (form.mode === "create") {
    payload.columnKey = form.columnKey;
    payload.dataType = apiFieldType(form.fieldType);
  }

  return payload;
}

function supportsMaxLength(fieldType: string) {
  return ["text", "multilineText", "email", "phone"].includes(fieldType);
}

function nextSortOrder(columns: CustomizationColumn[]) {
  return (
    columns.reduce((max, column) => Math.max(max, column.sortOrder), 0) + 10
  );
}

function optionSetToRows(optionSetJson: CustomizationColumn["optionSetJson"]) {
  const options = optionSetJson?.options;
  if (!Array.isArray(options)) return [];
  return options
    .map((option, index) => {
      const label =
        typeof option === "string"
          ? option
          : (option.label ?? option.value ?? "").trim();
      const value =
        typeof option === "string"
          ? toChoiceValue(option)
          : (option.value ?? toChoiceValue(label)).trim();

      return {
        id: `${index}-${value || label}`,
        label,
        value,
        active: true,
      };
    })
    .filter((option) => option.label && option.value);
}

function activeOptionRows(rows: readonly ChoiceOptionRow[]) {
  return rows
    .filter((row) => row.active && row.label.trim() && row.value.trim())
    .map((row) => ({
      label: row.label.trim(),
      value: row.value.trim(),
      active: row.active,
    }));
}

function generatedFieldKey(displayName: string, prefix = "dp_") {
  const base = toCamelCase(displayName);
  return base ? `${prefix}${base}` : "";
}

function packagePrefix(item?: CustomizationPackage) {
  const value = item?.prefix || item?.publisher?.prefix || "dp_";
  const cleaned = value
    .replace(/_+$/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();

  return cleaned ? `${cleaned}_` : "";
}

function toCamelCase(value: string) {
  const words = value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);

  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      return index === 0
        ? lower
        : `${lower[0]?.toUpperCase() ?? ""}${lower.slice(1)}`;
    })
    .join("");
}

function toChoiceValue(label: string) {
  return toCamelCase(label);
}

function yesNo(value: unknown) {
  return value ? "Yes" : "No";
}

function fieldTypeLabel(value: string) {
  const labels: Record<string, string> = {
    multilineText: "multiline text",
    reference: "reference",
    choice: "choice",
  };

  return labels[value] ?? value;
}

function stateLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function apiFieldType(value: string) {
  const map: Record<string, string> = {
    reference: "lookup",
    choice: "select",
    multilineText: "textarea",
  };

  return map[value] ?? value;
}

function ChoiceOptionsEditor({
  onChange,
  rows,
}: {
  readonly onChange: (rows: ChoiceOptionRow[]) => void;
  readonly rows: readonly ChoiceOptionRow[];
}) {
  function updateRow(id: string, patch: Partial<ChoiceOptionRow>) {
    onChange(
      rows.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        if (
          patch.label !== undefined &&
          row.value === toChoiceValue(row.label)
        ) {
          next.value = toChoiceValue(patch.label);
        }
        return next;
      }),
    );
  }

  function addRow() {
    onChange([
      ...rows,
      { id: crypto.randomUUID(), label: "", value: "", active: true },
    ]);
  }

  return (
    <div className="md:col-span-2 rounded-lg border border-border bg-slate-50 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Choice options
          </p>
          <p className="text-xs text-muted">
            Define labels, stable values, and active state.
          </p>
        </div>
        <Button onClick={addRow} size="sm" type="button" variant="secondary">
          Add option
        </Button>
      </div>

      <div className="grid gap-2">
        {rows.map((row, index) => (
          <div
            className="grid gap-2 rounded-md border border-border bg-white p-2 md:grid-cols-[auto_1fr_1fr_auto_auto]"
            key={row.id}
          >
            <span className="flex h-10 items-center text-muted">
              <GripVertical className="h-4 w-4" />
            </span>
            <TextField
              label={`Label ${index + 1}`}
              onChange={(label) => updateRow(row.id, { label })}
              value={row.label}
            />
            <TextField
              label="Value/key"
              onChange={(value) => updateRow(row.id, { value })}
              value={row.value}
            />
            <CheckboxField
              checked={row.active}
              label="Active"
              onChange={(active) => updateRow(row.id, { active })}
            />
            <Button
              onClick={() =>
                onChange(rows.filter((item) => item.id !== row.id))
              }
              size="sm"
              type="button"
              variant="ghost"
            >
              Remove
            </Button>
          </div>
        ))}
        {rows.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-white px-3 py-6 text-center text-sm text-muted">
            No options yet.
          </div>
        ) : null}
      </div>
    </div>
  );
}
