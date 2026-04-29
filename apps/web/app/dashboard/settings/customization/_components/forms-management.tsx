"use client";

import { Edit3, Plus, Star, Trash2 } from "lucide-react";
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
import { PermissionGate } from "@/app/dashboard/_components/permission-gate";
import {
  CustomizationColumn,
  CustomizationForm,
  CustomizationTable,
  FormLayoutJson,
} from "../types";

type FormState = {
  mode: "create" | "edit";
  original?: CustomizationForm;
  formKey: string;
  name: string;
  description: string;
  type: "main" | "quick" | "create" | "edit";
  isDefault: boolean;
  isActive: boolean;
  layout: FormLayoutJson;
};

export function FormsManagement({
  columns,
  forms,
  table,
}: {
  columns: CustomizationColumn[];
  forms: CustomizationForm[];
  table: CustomizationTable;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomizationForm | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const tableColumns = useMemo<DataTableColumn<CustomizationForm>[]>(
    () => [
      {
        key: "name",
        header: "Form name",
        sortable: true,
        sortAccessor: (row) => row.name,
        render: (row) => (
          <div>
            <p className="font-semibold text-foreground">{row.name}</p>
            <p className="mt-1 text-xs text-muted">{row.formKey}</p>
          </div>
        ),
      },
      { key: "type", header: "Type", render: (row) => row.type },
      {
        key: "default",
        header: "Default",
        render: (row) => (row.isDefault ? "Yes" : "No"),
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
        key: "sections",
        header: "Sections",
        sortable: true,
        sortAccessor: (row) => countSections(row.layoutJson),
        render: (row) => countSections(row.layoutJson),
      },
      {
        key: "actions",
        header: "Actions",
        render: (row) => (
          <div className="flex flex-wrap gap-2">
            <PermissionGate anyOf={["customization.forms.update"]}>
              <Button
                leftIcon={<Edit3 className="h-4 w-4" />}
                onClick={() => openEdit(row)}
                size="sm"
                type="button"
                variant="secondary"
              >
                Edit
              </Button>
              {!row.isDefault ? (
                <Button
                  leftIcon={<Star className="h-4 w-4" />}
                  onClick={() => setDefault(row)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Default
                </Button>
              ) : null}
            </PermissionGate>
            <PermissionGate anyOf={["customization.forms.delete"]}>
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
      formKey: "",
      name: "",
      description: "",
      type: "main",
      isDefault: forms.length === 0,
      isActive: true,
      layout: buildDefaultLayout(columns),
    });
  }

  function openEdit(record: CustomizationForm) {
    setError(null);
    setForm({
      mode: "edit",
      original: record,
      formKey: record.formKey,
      name: record.name,
      description: record.description ?? "",
      type: record.type,
      isDefault: record.isDefault,
      isActive: record.isActive,
      layout: normalizeLayout(record.layoutJson, columns),
    });
  }

  function updateForm(patch: Partial<FormState>) {
    setForm((current) => (current ? { ...current, ...patch } : current));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;

    const validationError = validateForm(form, forms);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    setError(null);
    const response = await fetch(
      form.mode === "create"
        ? `/api/customization/tables/${table.tableKey}/forms`
        : `/api/customization/tables/${table.tableKey}/forms/${form.formKey}`,
      {
        method: form.mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(form.mode === "create" ? { formKey: form.formKey } : {}),
          name: form.name,
          description: form.description,
          type: form.type,
          isDefault: form.isDefault,
          isActive: form.isActive,
          layoutJson: form.layout,
        }),
      },
    );
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    setIsSaving(false);

    if (!response.ok) {
      setError(data.message ?? "Unable to save form.");
      return;
    }

    setForm(null);
    router.refresh();
  }

  async function setDefault(record: CustomizationForm) {
    const response = await fetch(
      `/api/customization/tables/${table.tableKey}/forms/${record.formKey}/set-default`,
      { method: "POST" },
    );
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      setError(data.message ?? "Unable to set default form.");
      return;
    }
    router.refresh();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const response = await fetch(
      `/api/customization/tables/${table.tableKey}/forms/${deleteTarget.formKey}`,
      { method: "DELETE" },
    );
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
    };

    if (!response.ok) {
      setError(data.message ?? "Unable to delete form.");
      return;
    }

    setDeleteTarget(null);
    router.refresh();
  }

  return (
    <SectionCard
      description="Forms define runtime field layout metadata. Designer v1 keeps tabs, sections, ordering, visibility, and required/read-only overrides simple and explicit."
      title="Forms"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {forms.length} form{forms.length === 1 ? "" : "s"} configured for{" "}
          {table.pluralDisplayName}.
        </p>
        <PermissionGate anyOf={["customization.forms.create"]}>
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={openCreate}
            type="button"
          >
            Create form
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
              <PermissionGate anyOf={["customization.forms.create"]}>
                <Button onClick={openCreate} type="button" variant="secondary">
                  Create form
                </Button>
              </PermissionGate>
            }
            description="Create a form layout to control how this table is edited."
            title="No forms"
          />
        }
        getRowKey={(row) => row.formKey}
        rows={forms}
      />

      {form ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
          <form
            className="grid max-h-[92vh] w-full max-w-5xl gap-5 overflow-y-auto rounded-[24px] border border-border bg-white p-6 shadow-xl"
            onSubmit={handleSubmit}
          >
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                {form.mode === "create" ? "Create form" : "Edit form"}
              </h3>
              <p className="mt-1 text-sm leading-6 text-muted">
                Build tabs and sections, then choose fields for each section.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                disabled={form.mode === "edit"}
                label="Form key"
                onChange={(formKey) => updateForm({ formKey })}
                required
                value={form.formKey}
              />
              <TextField
                label="Name"
                onChange={(name) => updateForm({ name })}
                required
                value={form.name}
              />
              <SelectField
                label="Type"
                onChange={(type) =>
                  updateForm({ type: type as FormState["type"] })
                }
                options={[
                  { value: "main", label: "Main" },
                  { value: "quick", label: "Quick" },
                  { value: "create", label: "Create" },
                  { value: "edit", label: "Edit" },
                ]}
                value={form.type}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <CheckboxField
                  checked={form.isDefault}
                  label="Default form"
                  onChange={(isDefault) => updateForm({ isDefault })}
                />
                <CheckboxField
                  checked={form.isActive}
                  label="Active"
                  onChange={(isActive) => updateForm({ isActive })}
                />
              </div>
              <TextAreaField
                className="md:col-span-2"
                label="Description"
                onChange={(description) => updateForm({ description })}
                value={form.description}
              />
            </div>

            <FormDesigner
              columns={columns}
              layout={form.layout}
              onChange={(layout) => updateForm({ layout })}
            />

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
                Save form
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      <ConfirmDialog
        confirmAction={{
          label: "Delete form",
          onClick: handleDelete,
          variant: "danger",
        }}
        description={
          deleteTarget
            ? `Delete ${deleteTarget.name}? Runtime pages will fall back to another default form.`
            : undefined
        }
        onClose={() => setDeleteTarget(null)}
        open={Boolean(deleteTarget)}
        title="Delete form"
      />
    </SectionCard>
  );
}

function FormDesigner({
  columns,
  layout,
  onChange,
}: {
  columns: CustomizationColumn[];
  layout: FormLayoutJson;
  onChange: (layout: FormLayoutJson) => void;
}) {
  const tab = layout.tabs[0] ?? { id: "main", label: "Main", sections: [] };

  function updateSections(sections: FormLayoutJson["tabs"][number]["sections"]) {
    onChange({ tabs: [{ ...tab, sections }] });
  }

  return (
    <div className="grid gap-4 rounded-[22px] border border-border bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-foreground">Designer v1</p>
          <p className="text-sm text-muted">
            One main tab with ordered sections. Drag-and-drop can come later.
          </p>
        </div>
        <Button
          onClick={() =>
            updateSections([
              ...tab.sections,
              {
                id: `section${tab.sections.length + 1}`,
                label: `Section ${tab.sections.length + 1}`,
                columns: 2,
                fields: [],
              },
            ])
          }
          type="button"
          variant="secondary"
        >
          Add section
        </Button>
      </div>

      {tab.sections.map((section, sectionIndex) => (
        <div
          className="grid gap-4 rounded-[20px] border border-border bg-white p-4"
          key={section.id}
        >
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <TextField
              label="Section label"
              onChange={(label) => {
                const next = [...tab.sections];
                next[sectionIndex] = { ...section, label };
                updateSections(next);
              }}
              value={section.label}
            />
            <div className="flex items-end gap-2">
              <Button
                disabled={sectionIndex === 0}
                onClick={() =>
                  updateSections(moveItem(tab.sections, sectionIndex, -1))
                }
                type="button"
                variant="ghost"
              >
                Up
              </Button>
              <Button
                disabled={sectionIndex === tab.sections.length - 1}
                onClick={() =>
                  updateSections(moveItem(tab.sections, sectionIndex, 1))
                }
                type="button"
                variant="ghost"
              >
                Down
              </Button>
              <Button
                onClick={() =>
                  updateSections(
                    tab.sections.filter((item) => item.id !== section.id),
                  )
                }
                type="button"
                variant="danger"
              >
                Remove
              </Button>
            </div>
          </div>

          <SelectField
            label="Add field"
            onChange={(columnKey) => {
              if (!columnKey) return;
              const next = [...tab.sections];
              const currentFields = section.fields ?? [];
              if (currentFields.some((field) => field.columnKey === columnKey)) {
                return;
              }
              next[sectionIndex] = {
                ...section,
                fields: [...currentFields, { columnKey, isVisible: true }],
              };
              updateSections(next);
            }}
            options={columns.map((column) => ({
              value: column.columnKey,
              label: column.displayName,
            }))}
            placeholder="Select field to add"
            value=""
          />

          <div className="grid gap-2">
            {(section.fields ?? []).map((field, fieldIndex) => {
              const column = columns.find(
                (item) => item.columnKey === field.columnKey,
              );
              return (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-slate-50 px-4 py-3"
                  key={`${section.id}-${field.columnKey}`}
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {column?.displayName ?? field.columnKey}
                    </p>
                    <p className="text-xs text-muted">{field.columnKey}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={fieldIndex === 0}
                      onClick={() =>
                        updateSections(
                          updateSectionFields(
                            tab.sections,
                            sectionIndex,
                            moveItem(section.fields, fieldIndex, -1),
                          ),
                        )
                      }
                      type="button"
                      variant="ghost"
                    >
                      Up
                    </Button>
                    <Button
                      disabled={fieldIndex === section.fields.length - 1}
                      onClick={() =>
                        updateSections(
                          updateSectionFields(
                            tab.sections,
                            sectionIndex,
                            moveItem(section.fields, fieldIndex, 1),
                          ),
                        )
                      }
                      type="button"
                      variant="ghost"
                    >
                      Down
                    </Button>
                    <Button
                      onClick={() =>
                        updateSections(
                          updateSectionFields(
                            tab.sections,
                            sectionIndex,
                            section.fields.filter(
                              (item) => item.columnKey !== field.columnKey,
                            ),
                          ),
                        )
                      }
                      type="button"
                      variant="danger"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="rounded-[20px] border border-border bg-white p-4">
        <p className="font-semibold text-foreground">Preview</p>
        <div className="mt-3 grid gap-4">
          {tab.sections.map((section) => (
            <div key={`preview-${section.id}`}>
              <p className="text-sm font-semibold text-foreground">
                {section.label}
              </p>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {(section.fields ?? []).map((field) => (
                  <div
                    className="rounded-xl border border-border bg-slate-50 px-3 py-2 text-sm text-muted"
                    key={`preview-${section.id}-${field.columnKey}`}
                  >
                    {columns.find((column) => column.columnKey === field.columnKey)
                      ?.displayName ?? field.columnKey}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function validateForm(form: FormState, forms: CustomizationForm[]) {
  if (!/^[a-z][a-zA-Z0-9]*$/.test(form.formKey)) {
    return "Form key must use camelCase and start with a lowercase letter.";
  }
  if (!form.name.trim()) return "Form name is required.";
  if (
    form.mode === "create" &&
    forms.some((record) => record.formKey === form.formKey)
  ) {
    return "A form with this key already exists.";
  }
  if (!form.layout.tabs.length || !form.layout.tabs[0]?.sections.length) {
    return "Add at least one section.";
  }
  if (
    form.layout.tabs[0].sections.every((section) => !section.fields?.length)
  ) {
    return "Add at least one field to the form.";
  }
  return null;
}

function buildDefaultLayout(columns: CustomizationColumn[]): FormLayoutJson {
  return {
    tabs: [
      {
        id: "main",
        label: "Main",
        sections: [
          {
            id: "details",
            label: "Details",
            columns: 2,
            fields: columns
              .filter((column) => column.isVisible)
              .slice(0, 8)
              .map((column) => ({
                columnKey: column.columnKey,
                isVisible: true,
              })),
          },
        ],
      },
    ],
  };
}

function normalizeLayout(
  layout: FormLayoutJson | undefined,
  columns: CustomizationColumn[],
) {
  if (layout?.tabs?.length) return layout;
  return buildDefaultLayout(columns);
}

function countSections(layout: FormLayoutJson | undefined) {
  return layout?.tabs?.reduce(
    (count, tab) => count + (tab.sections?.length ?? 0),
    0,
  ) ?? 0;
}

function moveItem<T>(items: T[], index: number, delta: number) {
  const next = [...items];
  const target = index + delta;
  if (target < 0 || target >= next.length) return next;
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

function updateSectionFields(
  sections: FormLayoutJson["tabs"][number]["sections"],
  sectionIndex: number,
  fields: FormLayoutJson["tabs"][number]["sections"][number]["fields"],
) {
  const next = [...sections];
  next[sectionIndex] = { ...next[sectionIndex], fields };
  return next;
}
