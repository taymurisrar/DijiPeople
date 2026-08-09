"use client";

import { Edit3, Eye, EyeOff, Pencil, Plus, Star, Trash2 } from "lucide-react";
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
  TextAreaField,
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
  CustomizationView,
} from "../types";
import { CustomPackagePickerDialog } from "./custom-package-picker-dialog";

type ViewFormState = {
  mode: "create" | "edit";
  original?: CustomizationView;
  viewKey: string;
  name: string;
  description: string;
  type: "system" | "custom";
  isDefault: boolean;
  isHidden: boolean;
  selectedColumns: string[];
  filtersText: string;
  sortingText: string;
};

export function ViewsManagement({
  columns,
  packages,
  table,
  views,
}: {
  columns: CustomizationColumn[];
  packages: CustomizationPackage[];
  table: CustomizationTable;
  views: CustomizationView[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<ViewFormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomizationView | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState(
    packages.find((item) => item.type === "custom" && !item.isReadOnly)?.id ??
      "",
  );
  const [pendingSystemAction, setPendingSystemAction] = useState<null | {
    view: CustomizationView;
    action: "edit" | "designer" | "toggle" | "default";
  }>(null);
  const designerColumns = useMemo(
    () =>
      columns.filter(
        (column) =>
          column.isVisible &&
          column.isVisibleInCustomization !== false &&
          column.isValidForViewDesigner !== false,
      ),
    [columns],
  );

  const tableColumns: DataTableColumn<CustomizationView>[] = [
    {
      key: "name",
      header: "View name",
      searchable: true,
      sortable: true,
      sortAccessor: (row) => row.name,
      searchAccessor: (row) => `${row.name} ${row.viewKey}`,
      render: (row) => (
        <div>
          <p className="font-semibold text-foreground">{row.name}</p>
          <p className="mt-1 text-xs text-muted">{row.viewKey}</p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      filterable: true,
      filterType: "select",
      filterAccessor: viewTypeLabel,
      filterOptions: [
        { label: "System", value: "System" },
        { label: "Personal", value: "Personal" },
        { label: "Shared", value: "Shared" },
      ],
      render: (row) => (
        <StatusPill tone={row.type === "system" ? "muted" : "neutral"}>
          {viewTypeLabel(row)}
        </StatusPill>
      ),
    },
    {
      key: "default",
      header: "Default",
      render: (row) => (row.isDefault ? "Yes" : "No"),
    },
    {
      key: "hidden",
      header: "Status",
      filterable: true,
      filterType: "select",
      filterAccessor: (row) => (row.isHidden ? "Inactive" : "Active"),
      filterOptions: [
        { label: "Active", value: "Active" },
        { label: "Inactive", value: "Inactive" },
      ],
      render: (row) => (
        <StatusPill tone={row.isHidden ? "muted" : "good"}>
          {row.isHidden ? "Inactive" : "Active"}
        </StatusPill>
      ),
    },
    {
      key: "source",
      header: "Source",
      filterable: true,
      filterType: "select",
      filterAccessor: (row) => (row.type === "system" ? "System" : "Custom"),
      filterOptions: [
        { label: "System", value: "System" },
        { label: "Custom", value: "Custom" },
      ],
      render: (row) => (
        <StatusPill tone={row.type === "system" ? "muted" : "neutral"}>
          {row.type === "system" ? "System" : "Custom"}
        </StatusPill>
      ),
    },
    {
      key: "package",
      header: "Package",
      render: (row) =>
        row.type === "system" ? "Default Package" : "Custom Package",
    },
    {
      key: "lifecycle",
      header: "Lifecycle",
      render: (row) => (
        <StatusPill tone={row.type === "system" ? "good" : "muted"}>
          {stateLabel(
            row.lifecycleState ??
              (row.type === "system" ? "published" : "draft"),
          )}
        </StatusPill>
      ),
    },
    {
      key: "columns",
      header: "Fields count",
      sortable: true,
      sortAccessor: (row) => getViewColumnKeys(row).length,
      render: (row) => getViewColumnKeys(row).length,
    },
    {
      key: "filters",
      header: "Filters count",
      sortable: true,
      sortAccessor: (row) => countJsonRules(row.filtersJson),
      render: (row) => countJsonRules(row.filtersJson),
    },
    {
      key: "sorting",
      header: "Sorting count",
      sortable: true,
      sortAccessor: (row) => countJsonRules(row.sortingJson),
      render: (row) => countJsonRules(row.sortingJson),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex items-center gap-1">
          <PermissionGate anyOf={["customization.views.update"]}>
            <Button
              aria-label="Open designer"
              leftIcon={<Edit3 className="h-4 w-4" />}
              onClick={() => openDesigner(row)}
              size="icon-sm"
              title="Open designer"
              type="button"
              variant="secondary"
            />
            <Button
              aria-label="Rename or edit view"
              leftIcon={<Pencil className="h-4 w-4" />}
              onClick={() => openEdit(row)}
              size="icon-sm"
              title="Rename or edit view"
              type="button"
              variant="ghost"
            />
            <Button
              aria-label={row.isHidden ? "Activate view" : "Deactivate view"}
              disabled={!canToggleView(row, views)}
              leftIcon={
                row.isHidden ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )
              }
              onClick={() => toggleHidden(row)}
              size="icon-sm"
              title={
                canToggleView(row, views)
                  ? row.isHidden
                    ? "Activate view"
                    : "Deactivate view"
                  : "Default view cannot be deactivated until another active default exists."
              }
              type="button"
              variant="ghost"
            />
            {!row.isDefault ? (
              <Button
                aria-label="Set as default view"
                leftIcon={<Star className="h-4 w-4" />}
                onClick={() => setDefault(row)}
                size="icon-sm"
                title="Set as default view"
                type="button"
                variant="ghost"
              />
            ) : null}
          </PermissionGate>
          {row.type !== "system" ? (
            <PermissionGate anyOf={["customization.views.delete"]}>
              <Button
                aria-label="Delete view"
                leftIcon={<Trash2 className="h-4 w-4" />}
                onClick={() => setDeleteTarget(row)}
                size="icon-sm"
                title="Delete view"
                type="button"
                variant="danger"
              />
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
      viewKey: "",
      name: "",
      description: "",
      type: "custom",
      isDefault: views.length === 0,
      isHidden: false,
      selectedColumns: designerColumns.map((column) => column.columnKey),
      filtersText: "",
      sortingText: "",
    });
  }

  function openEdit(record: CustomizationView) {
    setError(null);
    if (record.type === "system") {
      setPendingSystemAction({ view: record, action: "edit" });
      return;
    }
    setForm(toViewFormState(record));
  }

  function openDesigner(record: CustomizationView) {
    setError(null);
    if (record.type === "system") {
      setPendingSystemAction({ view: record, action: "designer" });
      return;
    }
    router.push(
      `/settings/customization/tables/${table.tableKey}/views/${record.viewKey}/designer`,
    );
  }

  function toViewFormState(record: CustomizationView): ViewFormState {
    return {
      mode: "edit",
      original: record,
      viewKey: record.viewKey,
      name: record.name,
      description: record.description ?? "",
      type: record.type,
      isDefault: record.isDefault,
      isHidden: record.isHidden,
      selectedColumns: getViewColumnKeys(record),
      filtersText: stringifyOptionalJson(record.filtersJson),
      sortingText: stringifyOptionalJson(record.sortingJson),
    };
  }

  function updateForm(patch: Partial<ViewFormState>) {
    setForm((current) => (current ? { ...current, ...patch } : current));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;

    const validationError = validateForm(form, views);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    setError(null);

    const payload = buildPayload(form);
    const response = await fetch(
      form.mode === "create"
        ? `/api/customization/tables/${table.tableKey}/views`
        : `/api/customization/tables/${table.tableKey}/views/${form.viewKey}`,
      {
        method: form.mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
    };

    setIsSaving(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to save view.");
      return;
    }

    setForm(null);
    router.refresh();
  }

  async function toggleHidden(view: CustomizationView) {
    if (!canToggleView(view, views)) return;
    if (view.type === "system") {
      setPendingSystemAction({ view, action: "toggle" });
      return;
    }
    const action = view.isHidden ? "unhide" : "hide";
    const errorMessage = await postViewAction(
      table.tableKey,
      view.viewKey,
      action,
    );
    if (errorMessage) {
      setError(errorMessage);
      return;
    }
    router.refresh();
  }

  async function setDefault(view: CustomizationView) {
    if (view.type === "system") {
      setPendingSystemAction({ view, action: "default" });
      return;
    }
    const errorMessage = await postViewAction(
      table.tableKey,
      view.viewKey,
      "set-default",
    );
    if (errorMessage) {
      setError(errorMessage);
      return;
    }
    router.refresh();
  }

  async function ensureSystemViewLayer(
    view: CustomizationView,
    packageId: string,
    patch: Partial<CustomizationView> = {},
  ) {
    const response = await fetch(
      `/api/customization/tables/${table.tableKey}/views/${view.viewKey}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId,
          name: patch.name ?? view.name,
          description: patch.description ?? view.description ?? "",
          type: "custom",
          isDefault: patch.isDefault ?? view.isDefault,
          isHidden: patch.isHidden ?? view.isHidden,
          columnsJson: patch.columnsJson ?? view.columnsJson ?? { columns: [] },
          filtersJson: patch.filtersJson ?? view.filtersJson ?? undefined,
          sortingJson: patch.sortingJson ?? view.sortingJson ?? undefined,
          visibilityScope: patch.visibilityScope ?? view.visibilityScope,
        }),
      },
    );
    const data = (await response.json().catch(() => ({}))) as
      | CustomizationView
      | { message?: string };
    if (!response.ok || !("viewKey" in data)) {
      throw new Error(
        "message" in data && data.message
          ? data.message
          : "This component does not exist in published metadata or customization records.",
      );
    }
    return data;
  }

  async function continueSystemAction() {
    if (!pendingSystemAction) return;
    const current = pendingSystemAction;
    setPendingSystemAction(null);
    setIsSaving(true);
    setError(null);
    try {
      const draft = await ensureSystemViewLayer(
        current.view,
        selectedPackageId,
        current.action === "toggle"
          ? { isHidden: !current.view.isHidden }
          : current.action === "default"
            ? { isDefault: true, isHidden: false }
            : {},
      );
      setIsSaving(false);
      if (current.action === "edit") {
        setForm(toViewFormState(draft));
        return;
      }
      if (current.action === "designer") {
        router.push(
          `/settings/customization/tables/${table.tableKey}/views/${draft.viewKey}/designer`,
        );
        return;
      }
      router.refresh();
    } catch (caught) {
      setIsSaving(false);
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to create customization layer.",
      );
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const response = await fetch(
      `/api/customization/tables/${table.tableKey}/views/${deleteTarget.viewKey}`,
      { method: "DELETE" },
    );
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
    };

    if (!response.ok) {
      setError(data.message ?? "Unable to delete view.");
      return;
    }

    setDeleteTarget(null);
    router.refresh();
  }

  return (
    <SectionCard
      description="Views define runtime list fields, default filters, sorting, and visibility scope for this module."
      title="Views"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {views.length} view{views.length === 1 ? "" : "s"} configured for{" "}
          {table.pluralDisplayName}.
        </p>
        <PermissionGate anyOf={["customization.views.create"]}>
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={openCreate}
            type="button"
          >
            Create view
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
              <PermissionGate anyOf={["customization.views.create"]}>
                <Button onClick={openCreate} type="button" variant="secondary">
                  Create view
                </Button>
              </PermissionGate>
            }
            description="Create a saved view to control fields, filters, and sorting."
            title="No views"
          />
        }
        getRowKey={(row) => row.viewKey}
        pagination={{ page: 1, pageSize: 10, total: views.length }}
        rows={views}
        searchPlaceholder="Search views"
        tableClassName="min-w-[1120px] divide-y divide-border text-xs"
      />

      {form ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
          <form
            className="grid max-h-[92vh] w-full max-w-3xl gap-5 overflow-y-auto rounded-[24px] border border-border bg-white p-6 shadow-xl"
            onSubmit={handleSubmit}
          >
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                {form.mode === "create" ? "Create view" : "Edit view"}
              </h3>
              <p className="mt-1 text-sm leading-6 text-muted">
                Configure the fields, default filters, and sorting applied by
                runtime list pages that consume published customization.
              </p>
            </div>

            {form.original?.type === "system" ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                This is a system view. It can be renamed/customized through a
                layer or deactivated when default rules allow, but it cannot be
                deleted.
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                disabled={form.mode === "edit"}
                hint="Use camelCase. This key cannot be changed after creation."
                label="View logical name"
                onChange={(viewKey) => updateForm({ viewKey })}
                required
                value={form.viewKey}
              />
              <TextField
                label="Name"
                onChange={(name) => updateForm({ name })}
                required
                value={form.name}
              />
              <SelectField
                disabled={form.original?.type === "system"}
                label="Type"
                onChange={(type) =>
                  updateForm({ type: type as "system" | "custom" })
                }
                options={[
                  { value: "custom", label: "Custom" },
                  { value: "system", label: "System" },
                ]}
                value={form.type}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <CheckboxField
                  checked={form.isDefault}
                  label="Default view"
                  onChange={(isDefault) => updateForm({ isDefault })}
                />
                <CheckboxField
                  checked={form.isHidden}
                  label="Hidden"
                  onChange={(isHidden) => updateForm({ isHidden })}
                />
              </div>
              <TextAreaField
                className="md:col-span-2"
                label="Description"
                onChange={(description) => updateForm({ description })}
                value={form.description}
              />
            </div>

            <div className="rounded-[20px] border border-border bg-slate-50 p-4">
              <p className="text-sm font-semibold text-foreground">
                Visible fields
              </p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {designerColumns.map((column) => (
                  <CheckboxField
                    checked={form.selectedColumns.includes(column.columnKey)}
                    key={column.columnKey}
                    label={column.displayName}
                    hint={column.columnKey}
                    onChange={(checked) =>
                      updateForm({
                        selectedColumns: checked
                          ? [...form.selectedColumns, column.columnKey]
                          : form.selectedColumns.filter(
                              (key) => key !== column.columnKey,
                            ),
                      })
                    }
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <TextAreaField
                hint='Optional JSON, e.g. [{"columnKey":"employmentStatus","operator":"equals","value":"ACTIVE"}]'
                label="Filters JSON"
                onChange={(filtersText) => updateForm({ filtersText })}
                rows={6}
                value={form.filtersText}
              />
              <TextAreaField
                hint='Optional JSON, e.g. [{"columnKey":"hireDate","direction":"desc"}]'
                label="Sorting JSON"
                onChange={(sortingText) => updateForm({ sortingText })}
                rows={6}
                value={form.sortingText}
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
                Save view
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      <ConfirmDialog
        confirmAction={{
          label: "Delete view",
          onClick: handleDelete,
          variant: "danger",
        }}
        description={
          deleteTarget
            ? `Delete ${deleteTarget.name}? System views cannot be deleted, and default/dependent views are blocked by the server.`
            : undefined
        }
        onClose={() => setDeleteTarget(null)}
        open={Boolean(deleteTarget)}
        title="Delete custom view"
      />
      <CustomPackagePickerDialog
        message={SYSTEM_COMPONENT_CUSTOMIZATION_MESSAGE}
        onClose={() => setPendingSystemAction(null)}
        onConfirm={continueSystemAction}
        open={Boolean(pendingSystemAction)}
        packages={packages}
        selectedPackageId={selectedPackageId}
        setSelectedPackageId={setSelectedPackageId}
      />
    </SectionCard>
  );
}

async function postViewAction(
  tableKey: string,
  viewKey: string,
  action: "hide" | "unhide" | "set-default",
) {
  const response = await fetch(
    `/api/customization/tables/${tableKey}/views/${viewKey}/${action}`,
    {
      method: "POST",
    },
  );
  if (response.ok) return null;
  const data = (await response.json().catch(() => ({}))) as {
    message?: string;
  };
  return data.message ?? "Unable to update view.";
}

function validateForm(form: ViewFormState, views: CustomizationView[]) {
  if (!/^[a-z][a-zA-Z0-9]*$/.test(form.viewKey)) {
    return "View key must use camelCase and start with a lowercase letter.";
  }
  if (!form.name.trim()) {
    return "View name is required.";
  }
  if (
    form.mode === "create" &&
    views.some((view) => view.viewKey === form.viewKey)
  ) {
    return "A view with this key already exists.";
  }
  if (form.selectedColumns.length === 0) {
    return "Select at least one visible field.";
  }
  try {
    parseOptionalJson(form.filtersText);
    parseOptionalJson(form.sortingText);
  } catch {
    return "Filters and sorting must be valid JSON when provided.";
  }

  return null;
}

function buildPayload(form: ViewFormState) {
  const payload: Record<string, unknown> = {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    type: form.type,
    isDefault: form.isDefault,
    isHidden: form.isHidden,
    columnsJson: {
      columns: form.selectedColumns.map((columnKey, index) => ({
        columnKey,
        sortOrder: index * 10,
      })),
    },
    filtersJson: parseOptionalJson(form.filtersText),
    sortingJson: parseOptionalJson(form.sortingText),
    visibilityScope: "tenant",
  };

  if (form.mode === "create") {
    payload.viewKey = form.viewKey;
  }

  return payload;
}

function parseOptionalJson(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return JSON.parse(trimmed) as unknown;
}

function stringifyOptionalJson(value: unknown) {
  return value ? JSON.stringify(value, null, 2) : "";
}

function getViewColumnKeys(view: CustomizationView) {
  const config = view.columnsJson;
  if (!config) return [];
  if (Array.isArray(config)) {
    return config.flatMap((item) => extractColumnKey(item));
  }
  if (typeof config === "object") {
    const maybeColumns = (config as { columns?: unknown }).columns;
    if (Array.isArray(maybeColumns)) {
      return maybeColumns.flatMap((item) => extractColumnKey(item));
    }
  }
  return [];
}

function extractColumnKey(value: unknown) {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") {
    const key = (value as { columnKey?: unknown; fieldKey?: unknown })
      .columnKey;
    return typeof key === "string" ? [key] : [];
  }
  return [];
}

function countJsonRules(value: unknown) {
  if (!value) return "None";
  if (Array.isArray(value)) return value.length;
  if (typeof value === "object") {
    const values = Object.values(value as Record<string, unknown>);
    const arrayValue = values.find(Array.isArray);
    if (Array.isArray(arrayValue)) return arrayValue.length;
    return 1;
  }
  return 1;
}

function viewTypeLabel(view: CustomizationView) {
  if (view.type === "system") return "System";
  if (view.visibilityScope === "user") return "Personal";
  return "Shared";
}

function stateLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function canToggleView(
  view: CustomizationView,
  views: readonly CustomizationView[],
) {
  if (view.isHidden) return true;
  if (!view.isDefault) return true;
  return views.some(
    (candidate) =>
      candidate.viewKey !== view.viewKey &&
      candidate.isDefault &&
      !candidate.isHidden,
  );
}
