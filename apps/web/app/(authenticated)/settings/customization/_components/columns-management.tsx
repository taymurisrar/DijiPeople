"use client";

import { Edit3, GripVertical, KeyRound, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import { DataTableColumn } from "@/app/components/data-table/types";
import { ConfirmDialog } from "@/app/components/feedback/confirm-dialog";
import { useSideToast } from "@/app/components/notifications/use-side-toast";
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
import {
  apiFieldType,
  buildColumnPayload,
  supportsMaxLength,
} from "../_lib/column-payload";
import { CustomPackagePickerDialog } from "./custom-package-picker-dialog";
import { useDialogBehavior } from "@/app/components/ui/dialog";

/*
 * The dialog's own type vocabulary. ITEM-0184 — these were shown as the raw
 * values ("datetime", "multiline text"); the labels are what an administrator
 * reads, the values are what the payload builder maps to the API's types.
 */
const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  datetime: "Date and time",
  boolean: "Yes/No",
  email: "Email",
  phone: "Phone",
  reference: "Reference",
  choice: "Choice",
  multilineText: "Multiline text",
};

const fieldTypeOptions = Object.entries(FIELD_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

/* The API stores some types under other names; the list reads those back. */
const API_TYPE_LABELS: Record<string, string> = {
  text: "Text",
  textarea: "Multiline text",
  number: "Number",
  decimal: "Decimal",
  date: "Date",
  datetime: "Date and time",
  boolean: "Yes/No",
  select: "Choice",
  multiselect: "Multiple choice",
  lookup: "Reference",
  email: "Email",
  phone: "Phone",
  url: "URL",
  currency: "Currency",
};

function uiFieldType(apiType: string) {
  const map: Record<string, string> = {
    lookup: "reference",
    select: "choice",
    textarea: "multilineText",
  };
  return map[apiType] ?? apiType;
}

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

type FieldErrors = Partial<
  Record<
    "columnKey" | "displayName" | "maxLength" | "lookupTargetTableKey" | "form",
    string
  >
>;

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
  const { notifySuccess, toast } = useSideToast();
  const [form, setForm] = useState<ColumnFormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomizationColumn | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
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
        <p className="flex items-center gap-1.5 font-semibold text-foreground">
          {row.displayName}
          {row.isPrimaryName ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/20 bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
              <KeyRound aria-hidden className="h-3 w-3" />
              Primary name
            </span>
          ) : null}
        </p>
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
      render: (row) => API_TYPE_LABELS[row.fieldType] ?? row.fieldType,
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
      /*
       * ITEM-0184 / BUG-3495 — this read "Default Package" or "Custom Package"
       * from `isSystem` alone, so one module showed three package names at
       * once. It is the owning package's real name now.
       */
      render: (row) =>
        row.packageName ?? (row.isSystem ? "Default Package" : "Not set"),
    },
    {
      key: "lifecycle",
      header: "Lifecycle",
      render: (row) => {
        const state =
          row.lifecycleState ?? (row.isSystem ? "published" : "draft");
        return (
          <StatusPill tone={state === "published" ? "good" : "muted"}>
            {stateLabel(state)}
          </StatusPill>
        );
      },
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex items-center gap-1">
          <PermissionGate anyOf={["customization.columns.update"]}>
            {!row.isPrimaryName && canBePrimaryName(row) ? (
              <Button
                aria-label="Set as primary name"
                leftIcon={<KeyRound className="h-4 w-4" />}
                onClick={() => setPrimaryName(row)}
                size="icon-sm"
                title="Set as primary name"
                type="button"
                variant="ghost"
              />
            ) : null}
            <Button
              aria-label="Edit field"
              leftIcon={<Edit3 className="h-4 w-4" />}
              onClick={() => openEdit(row)}
              size="icon-sm"
              title="Edit field"
              type="button"
              variant="secondary"
            />
          </PermissionGate>
          {!row.isSystem ? (
            <PermissionGate anyOf={["customization.columns.delete"]}>
              <Button
                aria-label="Delete field"
                leftIcon={<Trash2 className="h-4 w-4" />}
                onClick={() => setDeleteTarget(row)}
                size="icon-sm"
                title="Delete field"
                type="button"
                variant="danger"
              />
            </PermissionGate>
          ) : null}
        </div>
      ),
    },
  ];

  /*
   * Only a column that can actually render a readable label is offered. The
   * API rejects the rest, so filtering here keeps the button from appearing
   * where it would only produce an error.
   */
  const NAMEABLE_TYPES = ["text", "email", "phone", "url", "select"];

  function canBePrimaryName(column: CustomizationColumn) {
    return (
      column.isVisible !== false &&
      NAMEABLE_TYPES.includes(column.fieldType ?? column.dataType)
    );
  }

  async function setPrimaryName(column: CustomizationColumn) {
    setError(null);
    const response = await fetch(
      `/api/customization/tables/${table.tableKey}/columns/${column.columnKey}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrimaryName: true }),
      },
    );
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      setError(payload.message ?? "Unable to set the primary name column.");
      return;
    }
    notifySuccess(`${column.displayName} is now the primary name`);
    router.refresh();
  }

  function openCreate() {
    setError(null);
    setFieldErrors({});
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
    setFieldErrors({});
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
      fieldType: uiFieldType(column.fieldType),
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
          current.columnKey !==
            generatedFieldKey(current.displayName, publisherPrefix)
            ? current.columnKey
            : generatedFieldKey(displayName, publisherPrefix),
      };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;

    const validation = validateForm(form, columns);
    setFieldErrors(validation);
    if (Object.keys(validation).length > 0) {
      return;
    }

    setIsSaving(true);
    setError(null);

    const body = buildColumnPayload({
      ...form,
      options: activeOptionRows(form.optionRows),
    });
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
      message?: string | string[];
    };

    setIsSaving(false);
    if (!response.ok) {
      const message = Array.isArray(data.message)
        ? data.message.join(" ")
        : data.message;
      setFieldErrors(
        placeServerError(message ?? "Unable to save the field."),
      );
      return;
    }

    notifySuccess(
      form.mode === "create"
        ? `${form.displayName.trim()} created`
        : `${form.displayName.trim()} saved`,
    );
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

    notifySuccess(`${deleteTarget.displayName} deleted`);
    setDeleteTarget(null);
    router.refresh();
  }

  // BUG-0043: this modal kept its own layout and gained the guarantees
  // it never had - focus containment, Escape, focus restore and dialog
  // semantics. See useDialogBehavior.
  const formDialog = useDialogBehavior({
    open: Boolean(form),
    onClose: () => setForm(null),
  });

  return (
    <SectionCard title="Fields">
      {toast}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {columns.length} field{columns.length === 1 ? "" : "s"}
        </p>
        <PermissionGate anyOf={["customization.columns.create"]}>
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={openCreate}
            type="button"
          >
            Add field
          </Button>
        </PermissionGate>
      </div>

      {error && !form ? (
        <div
          className="mb-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger"
          role="alert"
        >
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
                  Add field
                </Button>
              </PermissionGate>
            }
            description="This module has no fields yet."
            title="No fields"
          />
        }
        getRowKey={(row) => row.columnKey}
        initialSort={{ columnKey: "displayName", direction: "asc" }}
        pagination={{ page: 1, pageSize: 10, total: columns.length }}
        rows={columns}
        searchPlaceholder="Search fields"
        tableClassName="min-w-[760px] divide-y divide-border text-xs"
      />

      {form ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"
          {...formDialog.backdropProps}
        >
          <form
            {...formDialog.panelProps}
            className="grid max-h-[92vh] w-full max-w-3xl gap-5 overflow-y-auto rounded-[24px] border border-border bg-white p-6 shadow-xl"
            onSubmit={handleSubmit}
          >
            <h3
              className="text-lg font-semibold text-foreground"
              id={formDialog.titleId}
            >
              {form.mode === "create" ? "Add field" : "Edit field"}
            </h3>

            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label="Display name"
                onChange={updateDisplayName}
                required
                value={form.displayName}
                error={fieldErrors.displayName}
              />
              <TextField
                disabled={form.mode === "edit"}
                label="Logical name"
                onChange={(columnKey) => updateForm({ columnKey })}
                required
                value={form.columnKey}
                error={fieldErrors.columnKey}
              />
              <SelectField
                disabled={form.mode === "edit"}
                label="Field type"
                onChange={(fieldType) => updateForm({ fieldType })}
                options={fieldTypeOptions}
                required
                value={form.fieldType}
              />
              {supportsMaxLength(form.fieldType) ? (
                <TextField
                  label="Maximum length"
                  onChange={(maxLength) =>
                    updateForm({
                      maxLength:
                        maxLength.trim() === "" ? null : Number(maxLength),
                    })
                  }
                  type="text"
                  value={form.maxLength == null ? "" : String(form.maxLength)}
                  error={fieldErrors.maxLength}
                />
              ) : null}
              {form.fieldType === "reference" ? (
                <SelectField
                  label="Reference target"
                  onChange={(lookupTargetTableKey) =>
                    updateForm({ lookupTargetTableKey })
                  }
                  options={lookupTables.map((lookupTable) => ({
                    value: lookupTable.tableKey,
                    label: lookupTable.pluralDisplayName,
                  }))}
                  placeholder="Select a module"
                  required
                  value={form.lookupTargetTableKey}
                  error={fieldErrors.lookupTargetTableKey}
                />
              ) : null}
              <TextField
                label="Default value"
                onChange={(defaultValue) => updateForm({ defaultValue })}
                value={form.defaultValue}
              />
              <div className="grid gap-3 md:col-span-2 md:grid-cols-3">
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

            {fieldErrors.form ? (
              <p className="text-sm text-danger" role="alert">
                {fieldErrors.form}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-3">
              <Button
                onClick={() => {
                  setForm(null);
                  setFieldErrors({});
                }}
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
          label: "Delete field",
          onClick: handleDelete,
          variant: "danger",
        }}
        description={
          deleteTarget ? `Delete ${deleteTarget.displayName}?` : undefined
        }
        onClose={() => setDeleteTarget(null)}
        open={Boolean(deleteTarget)}
        title="Delete field"
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

/*
 * Errors are placed on the field they concern (ITEM-0184 — the maximum length
 * error used to appear at the bottom of the dialog, under a disabled control).
 */
function validateForm(
  form: ColumnFormState,
  columns: CustomizationColumn[],
): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.displayName.trim()) {
    errors.displayName = "Enter a display name.";
  }
  if (
    form.mode === "create" &&
    !/^[a-z][a-z0-9]*_[a-z][a-zA-Z0-9]*$/.test(form.columnKey)
  ) {
    errors.columnKey = "Use the publisher prefix followed by a name, for example mt_passportExpiry.";
  } else if (
    form.mode === "create" &&
    columns.some((column) => column.columnKey === form.columnKey)
  ) {
    errors.columnKey = "A field with this logical name already exists.";
  }
  if (
    supportsMaxLength(form.fieldType) &&
    form.maxLength !== null &&
    (!Number.isInteger(form.maxLength) || form.maxLength < 1)
  ) {
    errors.maxLength = "Enter a whole number of at least 1.";
  }
  if (form.fieldType === "reference" && !form.lookupTargetTableKey) {
    errors.lookupTargetTableKey = "Choose the module this field refers to.";
  }
  if (
    form.fieldType === "choice" &&
    activeOptionRows(form.optionRows).length === 0
  ) {
    errors.form = "Add at least one active option.";
  }
  if (
    form.original &&
    apiFieldType(form.fieldType) !== form.original.fieldType
  ) {
    errors.form = "A field's type cannot be changed after creation.";
  }
  if (form.original?.isSystem && form.original.isRequired && !form.isRequired) {
    errors.form = "A required system field cannot be made optional.";
  }

  return errors;
}

function placeServerError(message: string): FieldErrors {
  const lower = message.toLowerCase();
  if (lower.includes("maximum length")) return { maxLength: message };
  if (lower.includes("lookup target")) return { lookupTargetTableKey: message };
  if (lower.includes("column already") || lower.includes("columnkey")) {
    return { columnKey: message };
  }
  return { form: message };
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

function stateLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
        <p className="text-sm font-semibold text-foreground">Options</p>
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
              <GripVertical aria-hidden className="h-4 w-4" />
            </span>
            <TextField
              label={`Label ${index + 1}`}
              onChange={(label) => updateRow(row.id, { label })}
              value={row.label}
            />
            <TextField
              label="Value"
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
