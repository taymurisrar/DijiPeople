"use client";

import {
  ArrowLeft,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { listSupportedSystemWidgets } from "@repo/config";
import { Button } from "@/app/components/ui/button";
import {
  CheckboxField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import {
  FormGrid,
  FormGridItem,
  normalizeFormGridColumnCount,
  normalizeFormGridColumnSpan,
} from "@/app/components/metadata/form-layout-grid";
import type {
  CustomizationColumn,
  CustomizationForm,
  CustomizationTable,
  FormLayoutField,
  FormLayoutComponent,
  FormLayoutJson,
  FormLayoutSection,
} from "../types";

type Props = {
  columns: CustomizationColumn[];
  form: CustomizationForm;
  table: CustomizationTable;
};

type Selection =
  | { type: "form" }
  | { type: "tab"; tabId: string }
  | { type: "section"; tabId: string; sectionId: string }
  | { type: "field"; tabId: string; sectionId: string; columnKey: string };

type DragState =
  | { type: "field"; tabId: string; sectionId: string; columnKey: string }
  | { type: "section"; tabId: string; sectionId: string }
  | null;

export function FormDesignerWorkspace({ columns, form, table }: Props) {
  const router = useRouter();
  const designerColumns = useMemo(
    () =>
      columns.filter(
        (column) =>
          column.isVisible &&
          column.isVisibleInCustomization !== false &&
          column.isValidForFormDesigner !== false,
      ),
    [columns],
  );
  const columnByKey = useMemo(
    () => new Map(designerColumns.map((column) => [column.columnKey, column])),
    [designerColumns],
  );
  const [metadata, setMetadata] = useState({
    name: form.name,
    description: form.description ?? "",
    type: form.type,
    isDefault: form.isDefault,
    isActive: form.isActive,
  });
  const [layout, setLayout] = useState<FormLayoutJson>(() =>
    normalizeLayout(form.layoutJson, designerColumns),
  );
  const [selection, setSelection] = useState<Selection>({ type: "form" });
  const [dragState, setDragState] = useState<DragState>(null);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [paletteUsedFilter, setPaletteUsedFilter] = useState("available");
  const [paletteSourceFilter, setPaletteSourceFilter] = useState("all");
  const [paletteTypeFilter, setPaletteTypeFilter] = useState("all");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usedFieldKeys = new Set(
    layout.tabs.flatMap((tab) =>
      tab.sections.flatMap((section) =>
        (section.fields ?? []).map((field) => field.columnKey),
      ),
    ),
  );
  const paletteFields = designerColumns.filter((column) => {
    const isUsed = usedFieldKeys.has(column.columnKey);
    const query = paletteSearch.trim().toLowerCase();
    if (paletteUsedFilter === "available" && isUsed) return false;
    if (paletteUsedFilter === "used" && !isUsed) return false;
    if (paletteSourceFilter === "system" && !column.isSystem) return false;
    if (paletteSourceFilter === "custom" && column.isSystem) return false;
    if (paletteTypeFilter !== "all" && column.fieldType !== paletteTypeFilter) {
      return false;
    }
    if (!query) return true;
    return `${column.displayName} ${column.columnKey} ${column.fieldType}`
      .toLowerCase()
      .includes(query);
  });
  const paletteFieldGroups = groupPaletteFields(paletteFields, usedFieldKeys);
  const fieldTypeOptions = Array.from(
    new Set(designerColumns.map((column) => column.fieldType)),
  ).sort();
  const supportedWidgets = listSupportedSystemWidgets(table.tableKey);
  const usedWidgetKeys = new Set(
    layout.tabs.flatMap((tab) =>
      tab.sections.flatMap((section) =>
        (section.components ?? []).map((component) => component.widgetId),
      ),
    ),
  );

  function updateLayout(updater: (current: FormLayoutJson) => FormLayoutJson) {
    setLayout((current) => resequenceLayout(updater(current)));
  }

  async function save() {
    setIsSaving(true);
    setError(null);
    const response = await fetch(
      `/api/customization/tables/${table.tableKey}/forms/${form.formKey}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: metadata.name,
          description: metadata.description,
          type: metadata.type,
          isDefault: metadata.isDefault,
          isActive: metadata.isActive,
          layoutJson: resequenceLayout(layout),
        }),
      },
    );
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    setIsSaving(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to save form designer changes.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-white px-4 py-2 shadow-sm">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
          <Button
            href={`/settings/customization/tables/${table.tableKey}/forms`}
            leftIcon={<ArrowLeft className="h-4 w-4" />}
            variant="ghost"
          >
            Back
          </Button>
          <Button
            leftIcon={<Save className="h-4 w-4" />}
            loading={isSaving}
            loadingText="Saving..."
            onClick={save}
            type="button"
          >
            Save
          </Button>
          <Button
            onClick={() =>
              setMetadata((current) => ({
                ...current,
                isActive: !current.isActive,
              }))
            }
            type="button"
            variant="secondary"
          >
            {metadata.isActive ? "Deactivate" : "Activate"}
          </Button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusPill tone={form.isSystem ? "neutral" : "good"}>
            {form.isSystem ? "System" : "Custom"}
          </StatusPill>
          <StatusPill tone={metadata.isActive ? "good" : "muted"}>
            {metadata.isActive ? "Active" : "Inactive"}
          </StatusPill>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <div className="grid min-h-[680px] gap-4 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        <aside className="rounded-[20px] border border-border bg-surface p-4 shadow-sm">
          <p className="text-sm font-semibold text-foreground">Field palette</p>
          <p className="mt-1 text-xs text-muted">
            Only form-designer-valid columns are listed.
          </p>
          <div className="mt-3 grid gap-2">
            <div className="flex items-center gap-2 rounded-md border border-border bg-white px-2 py-1.5">
              <Search className="h-4 w-4 text-muted" />
              <input
                className="w-full bg-transparent text-xs outline-none"
                onChange={(event) => setPaletteSearch(event.target.value)}
                placeholder="Search fields"
                value={paletteSearch}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <SelectField
                label="Usage"
                onChange={setPaletteUsedFilter}
                options={[
                  { value: "available", label: "Available" },
                  { value: "used", label: "Used" },
                  { value: "all", label: "All" },
                ]}
                value={paletteUsedFilter}
              />
              <SelectField
                label="Source"
                onChange={setPaletteSourceFilter}
                options={[
                  { value: "all", label: "All" },
                  { value: "system", label: "System" },
                  { value: "custom", label: "Custom" },
                ]}
                value={paletteSourceFilter}
              />
            </div>
            <SelectField
              label="Type"
              onChange={setPaletteTypeFilter}
              options={[
                { value: "all", label: "All types" },
                ...fieldTypeOptions.map((type) => ({
                  value: type,
                  label: type,
                })),
              ]}
              value={paletteTypeFilter}
            />
          </div>
          <div className="mt-4 grid max-h-[520px] gap-1.5 overflow-y-auto pr-1">
            {paletteFieldGroups
              .flatMap((group) => group.fields)
              .map((column) => (
                <button
                  className="rounded-md border border-border bg-white px-2.5 py-2 text-left text-xs transition hover:border-accent/40 hover:bg-accent-soft"
                  key={column.columnKey}
                  onClick={() => addField(column.columnKey)}
                  type="button"
                >
                  <span className="block font-medium text-foreground">
                    {column.displayName}
                    {column.isSystem ? (
                      <span className="ml-2 text-xs text-muted">locked</span>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {column.columnKey} · {column.fieldType}
                  </span>
                </button>
              ))}
            {paletteFields.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-3 py-6 text-sm text-muted">
                No fields match the current palette filters.
              </div>
            ) : null}
          </div>
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-sm font-semibold text-foreground">
              System Widgets
            </p>
            <p className="mt-1 text-xs text-muted">
              Only Widgets supported by this Module are available.
            </p>
            <div className="mt-3 grid gap-2">
              {supportedWidgets.map((widget) => {
                const used = usedWidgetKeys.has(widget.widgetKey);
                return (
                  <Button
                    disabled={used}
                    key={widget.widgetKey}
                    onClick={() =>
                      addWidget({
                        id: uniqueKey(
                          "widget",
                          Array.from(usedWidgetKeys),
                        ),
                        componentType: "widget",
                        widgetId: widget.widgetKey,
                        widgetType: widget.aliases[0] ?? widget.widgetKey,
                        label: widget.displayName,
                        columnSpan: 1,
                      })
                    }
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    {used ? `${widget.displayName} added` : widget.displayName}
                  </Button>
                );
              })}
              <Button
                disabled
                size="sm"
                title="Custom Widget execution requires future plugin or code-activity registration."
                type="button"
                variant="ghost"
              >
                Custom Widget (future)
              </Button>
            </div>
          </div>
        </aside>

        <main className="rounded-[20px] border border-border bg-slate-50 p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {metadata.name}
              </p>
              <p className="mt-1 text-xs text-muted">
                {table.displayName} · {form.formKey}
              </p>
            </div>
            <Button
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={addTab}
              type="button"
              variant="secondary"
            >
              Add tab
            </Button>
          </div>

          <div className="grid gap-4">
            {layout.tabs.map((tab) => (
              <section
                className="rounded-[20px] border border-border bg-white p-4"
                key={tab.id}
                onClick={() => setSelection({ type: "tab", tabId: tab.id })}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      {tab.label}
                    </h3>
                    <p className="text-xs text-muted">{tab.id}</p>
                  </div>
                  <Button
                    leftIcon={<Plus className="h-4 w-4" />}
                    onClick={(event) => {
                      event.stopPropagation();
                      addSection(tab.id);
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Add section
                  </Button>
                </div>

                <FormGrid
                  className="mt-4"
                  columns={tab.columns}
                  gap="section"
                  kind="tab"
                >
                  {tab.sections.map((section) => (
                    <FormGridItem
                      className="rounded-2xl border border-border bg-slate-50 p-4"
                      columnSpan={section.columnSpan}
                      key={section.id}
                      parentColumns={tab.columns}
                    >
                    <div
                      draggable
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelection({
                          type: "section",
                          tabId: tab.id,
                          sectionId: section.id,
                        });
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDragStart={() =>
                        setDragState({
                          type: "section",
                          tabId: tab.id,
                          sectionId: section.id,
                        })
                      }
                      onDrop={() => moveDraggedSection(tab.id, section.id)}
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <GripVertical className="h-4 w-4 text-muted" />
                          <div>
                            {section.labelVisible !== false ? (
                              <p className="font-medium text-foreground">
                                {section.label}
                              </p>
                            ) : (
                              <p className="font-medium text-muted">
                                Label hidden
                              </p>
                            )}
                            <p className="text-xs text-muted">{section.id}</p>
                          </div>
                        </div>
                        {section.isVisible === false ? (
                          <EyeOff className="h-4 w-4 text-muted" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted" />
                        )}
                      </div>

                      <FormGrid
                        columns={section.columns ?? 2}
                        kind="section"
                        onDragOver={(event) => event.preventDefault()}
                      >
                        {(section.fields ?? []).map((field) => {
                          const column = columnByKey.get(field.columnKey);
                          return (
                            <FormGridItem
                              className="rounded-xl border border-border bg-white px-3 py-3"
                              columnSpan={field.columnSpan}
                              key={`${section.id}-${field.columnKey}`}
                              parentColumns={section.columns ?? 2}
                            >
                            <div
                              draggable
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelection({
                                  type: "field",
                                  tabId: tab.id,
                                  sectionId: section.id,
                                  columnKey: field.columnKey,
                                });
                              }}
                              onDragStart={(event) => {
                                event.stopPropagation();
                                setDragState({
                                  type: "field",
                                  tabId: tab.id,
                                  sectionId: section.id,
                                  columnKey: field.columnKey,
                                });
                              }}
                              onDrop={(event) => {
                                event.stopPropagation();
                                moveDraggedField(
                                  tab.id,
                                  section.id,
                                  field.columnKey,
                                );
                              }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <p className="text-sm font-medium text-foreground">
                                    {field.label ||
                                      column?.displayName ||
                                      field.columnKey}
                                  </p>
                                  <p className="text-xs text-muted">
                                    {field.columnKey}
                                    {column?.isSystem ? " · locked" : ""}
                                  </p>
                                </div>
                                <GripVertical className="h-4 w-4 text-muted" />
                              </div>
                            </div>
                            </FormGridItem>
                          );
                        })}
                        {(section.components ?? []).map((component) => (
                          <FormGridItem
                            className="rounded-xl border border-accent/30 bg-accent-soft px-3 py-3"
                            columnSpan={component.columnSpan}
                            key={component.id}
                            parentColumns={section.columns ?? 2}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium text-foreground">
                                  {component.label ?? component.widgetId}
                                </p>
                                <p className="text-xs text-muted">
                                  {component.widgetId} · System Widget
                                </p>
                              </div>
                              <Button
                                leftIcon={<Trash2 className="h-4 w-4" />}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  removeWidget(
                                    tab.id,
                                    section.id,
                                    component.id,
                                  );
                                }}
                                size="xs"
                                type="button"
                                variant="ghost"
                              >
                                Remove
                              </Button>
                            </div>
                          </FormGridItem>
                        ))}
                      </FormGrid>
                    </div>
                    </FormGridItem>
                  ))}
                </FormGrid>
              </section>
            ))}
          </div>
        </main>

        <PropertiesPanel
          columnByKey={columnByKey}
          form={metadata}
          layout={layout}
          onChangeForm={setMetadata}
          onChangeLayout={updateLayout}
          selection={selection}
          setSelection={setSelection}
        />
      </div>
    </div>
  );

  function addTab() {
    updateLayout((current) => ({
      tabs: [
        ...current.tabs,
        {
          id: uniqueKey(
            "tab",
            current.tabs.map((tab) => tab.id),
          ),
          label: `Tab ${current.tabs.length + 1}`,
          columns: 1,
          sections: [],
        },
      ],
    }));
  }

  function addSection(tabId: string) {
    updateLayout((current) => ({
      tabs: current.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              sections: [
                ...tab.sections,
                {
                  id: uniqueKey(
                    "section",
                    tab.sections.map((section) => section.id),
                  ),
                  label: `Section ${tab.sections.length + 1}`,
                  labelVisible: true,
                  columns: 2,
                  columnSpan: 1,
                  isVisible: true,
                  fields: [],
                },
              ],
            }
          : tab,
      ),
    }));
  }

  function addField(columnKey: string) {
    const firstTab = layout.tabs[0];
    const firstSection = firstTab?.sections[0];
    if (!firstTab) {
      updateLayout(() => ({
        tabs: [
          {
            id: "main",
            label: "Main",
            sections: [
              {
                id: "general",
                label: "General",
                labelVisible: true,
                columns: 2,
                isVisible: true,
                fields: [{ columnKey, isVisible: true, columnSpan: 1 }],
              },
            ],
          },
        ],
      }));
      return;
    }
    if (!firstSection) {
      updateLayout((current) => ({
        tabs: current.tabs.map((tab) =>
          tab.id === firstTab.id
            ? {
                ...tab,
                sections: [
                  {
                    id: "general",
                    label: "General",
                    labelVisible: true,
                    columns: 2,
                    columnSpan: 1,
                    isVisible: true,
                    fields: [{ columnKey, isVisible: true, columnSpan: 1 }],
                  },
                ],
              }
            : tab,
        ),
      }));
      return;
    }
    updateLayout((current) => ({
      tabs: current.tabs.map((tab) =>
        tab.id === firstTab.id
          ? {
              ...tab,
              sections: tab.sections.map((section) =>
                section.id === firstSection.id
                  ? {
                      ...section,
                      fields: [
                        ...(section.fields ?? []),
                        { columnKey, isVisible: true, columnSpan: 1 },
                      ],
                    }
                  : section,
              ),
            }
          : tab,
      ),
    }));
  }

  function addWidget(component: FormLayoutComponent) {
    const firstTab = layout.tabs.find((tab) => tab.tabType !== "related_module");
    const firstSection = firstTab?.sections[0];
    if (!firstTab || !firstSection) {
      setError("Add a Field tab and Section before placing a Widget.");
      return;
    }
    updateLayout((current) => ({
      ...current,
      tabs: current.tabs.map((tab) =>
        tab.id === firstTab.id
          ? {
              ...tab,
              sections: tab.sections.map((section) =>
                section.id === firstSection.id
                  ? {
                      ...section,
                      components: [...(section.components ?? []), component],
                    }
                  : section,
              ),
            }
          : tab,
      ),
    }));
  }

  function removeWidget(tabId: string, sectionId: string, componentId: string) {
    updateLayout((current) => ({
      ...current,
      tabs: current.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              sections: tab.sections.map((section) =>
                section.id === sectionId
                  ? {
                      ...section,
                      components: (section.components ?? []).filter(
                        (component) => component.id !== componentId,
                      ),
                    }
                  : section,
              ),
            }
          : tab,
      ),
    }));
  }

  function moveDraggedSection(targetTabId: string, targetSectionId: string) {
    if (!dragState || dragState.type !== "section") return;
    if (dragState.tabId !== targetTabId) return;
    updateLayout((current) => ({
      tabs: current.tabs.map((tab) =>
        tab.id === targetTabId
          ? {
              ...tab,
              sections: moveById(
                tab.sections,
                dragState.sectionId,
                targetSectionId,
              ),
            }
          : tab,
      ),
    }));
    setDragState(null);
  }

  function moveDraggedField(
    targetTabId: string,
    targetSectionId: string,
    targetColumnKey: string,
  ) {
    if (!dragState || dragState.type !== "field") return;
    updateLayout((current) =>
      moveField(current, dragState, {
        tabId: targetTabId,
        sectionId: targetSectionId,
        columnKey: targetColumnKey,
      }),
    );
    setDragState(null);
  }
}

function PropertiesPanel({
  columnByKey,
  form,
  layout,
  onChangeForm,
  onChangeLayout,
  selection,
  setSelection,
}: {
  columnByKey: Map<string, CustomizationColumn>;
  form: {
    name: string;
    description: string;
    type: CustomizationForm["type"];
    isDefault: boolean;
    isActive: boolean;
  };
  layout: FormLayoutJson;
  onChangeForm: (
    value: typeof form | ((current: typeof form) => typeof form),
  ) => void;
  onChangeLayout: (
    updater: (current: FormLayoutJson) => FormLayoutJson,
  ) => void;
  selection: Selection;
  setSelection: (selection: Selection) => void;
}) {
  const selectedTab =
    selection.type === "tab" ||
    selection.type === "section" ||
    selection.type === "field"
      ? layout.tabs.find((tab) => tab.id === selection.tabId)
      : null;
  const selectedSection =
    selectedTab && (selection.type === "section" || selection.type === "field")
      ? selectedTab.sections.find(
          (section) => section.id === selection.sectionId,
        )
      : null;
  const selectedField =
    selectedSection && selection.type === "field"
      ? selectedSection.fields.find(
          (field) => field.columnKey === selection.columnKey,
        )
      : null;
  const selectedColumn = selectedField
    ? columnByKey.get(selectedField.columnKey)
    : null;
  const sectionSelection =
    selection.type === "section" || selection.type === "field"
      ? selection
      : null;
  const fieldSelection = selection.type === "field" ? selection : null;

  return (
    <aside className="rounded-[20px] border border-border bg-surface p-4 shadow-sm">
      <p className="text-sm font-semibold text-foreground">Properties</p>
      <div className="mt-4 grid gap-4">
        {selection.type === "form" ? (
          <>
            <TextField
              label="Form name"
              onChange={(name) =>
                onChangeForm((current) => ({ ...current, name }))
              }
              value={form.name}
            />
            <SelectField
              label="Form type"
              onChange={(type) =>
                onChangeForm((current) => ({
                  ...current,
                  type: type as CustomizationForm["type"],
                }))
              }
              options={[
                { value: "main", label: "Main Form" },
                { value: "minimal", label: "Minimal Form" },
                { value: "quick", label: "Quick Create Form" },
                { value: "card", label: "Card Form" },
                { value: "lookup", label: "Lookup Form" },
              ]}
              value={form.type}
            />
            <CheckboxField
              checked={form.isDefault}
              label="Default form"
              onChange={(isDefault) =>
                onChangeForm((current) => ({ ...current, isDefault }))
              }
            />
            <CheckboxField
              checked={form.isActive}
              label="Active"
              onChange={(isActive) =>
                onChangeForm((current) => ({ ...current, isActive }))
              }
            />
            <TextAreaField
              label="Description"
              onChange={(description) =>
                onChangeForm((current) => ({ ...current, description }))
              }
              value={form.description}
            />
          </>
        ) : null}

        {selectedTab && selection.type === "tab" ? (
          <>
            <TextField
              label="Tab label"
              onChange={(label) =>
                onChangeLayout((current) => ({
                  tabs: current.tabs.map((tab) =>
                    tab.id === selectedTab.id ? { ...tab, label } : tab,
                  ),
                }))
              }
              value={selectedTab.label}
            />
            <TextField
              label="Logical name"
              onChange={() => undefined}
              value={selectedTab.id}
              disabled
            />
            <SelectField
              label="Tab columns"
              onChange={(columns) =>
                onChangeLayout((current) => ({
                  tabs: current.tabs.map((tab) =>
                    tab.id === selectedTab.id
                      ? { ...tab, columns: clampColumns(columns) }
                      : tab,
                  ),
                }))
              }
              options={layoutOptions()}
              value={String(selectedTab.columns ?? 1)}
            />
            <Button
              leftIcon={<Trash2 className="h-4 w-4" />}
              onClick={() => {
                onChangeLayout((current) => ({
                  tabs: current.tabs.filter((tab) => tab.id !== selectedTab.id),
                }));
                setSelection({ type: "form" });
              }}
              type="button"
              variant="danger"
            >
              Remove tab
            </Button>
          </>
        ) : null}

        {selectedSection && sectionSelection ? (
          <>
            <TextField
              label="Section label"
              onChange={(label) =>
                patchSection(
                  onChangeLayout,
                  sectionSelection.tabId,
                  selectedSection.id,
                  {
                    label,
                  },
                )
              }
              value={selectedSection.label}
            />
            <TextField
              label="Logical name"
              onChange={() => undefined}
              value={selectedSection.id}
              disabled
            />
            <SelectField
              label="Section columns"
              onChange={(columns) =>
                patchSection(
                  onChangeLayout,
                  sectionSelection.tabId,
                  selectedSection.id,
                  {
                    columns: clampColumns(columns),
                  },
                )
              }
              options={[...layoutOptions()]}
              value={String(selectedSection.columns ?? 2)}
            />
            <SelectField
              label="Section span"
              onChange={(columnSpan) =>
                patchSection(
                  onChangeLayout,
                  sectionSelection.tabId,
                  selectedSection.id,
                  {
                    columnSpan: clampSpan(
                      columnSpan,
                      selectedTab?.columns ?? 1,
                    ),
                  },
                )
              }
              options={layoutOptions(selectedTab?.columns ?? 1)}
              value={String(selectedSection.columnSpan ?? 1)}
            />
            <CheckboxField
              checked={selectedSection.labelVisible !== false}
              label="Show label"
              onChange={(labelVisible) =>
                patchSection(
                  onChangeLayout,
                  sectionSelection.tabId,
                  selectedSection.id,
                  {
                    labelVisible,
                  },
                )
              }
            />
            <CheckboxField
              checked={selectedSection.isVisible !== false}
              label="Visible"
              onChange={(isVisible) =>
                patchSection(
                  onChangeLayout,
                  sectionSelection.tabId,
                  selectedSection.id,
                  {
                    isVisible,
                  },
                )
              }
            />
          </>
        ) : null}

        {selectedField && fieldSelection ? (
          <>
            <TextField
              label="Field label"
              onChange={(label) =>
                patchField(onChangeLayout, fieldSelection, { label })
              }
              value={
                selectedField.label ??
                selectedColumn?.displayName ??
                selectedField.columnKey
              }
            />
            <TextField
              label="Logical name"
              onChange={() => undefined}
              value={selectedField.columnKey}
              disabled
            />
            <CheckboxField
              checked={selectedField.isVisible !== false}
              label="Visible on form"
              onChange={(isVisible) =>
                patchField(onChangeLayout, fieldSelection, { isVisible })
              }
            />
            <SelectField
              label="Field span"
              onChange={(columnSpan) =>
                patchField(onChangeLayout, fieldSelection, {
                  columnSpan: clampSpan(
                    columnSpan,
                    selectedSection?.columns ?? 2,
                  ),
                })
              }
              options={layoutOptions(selectedSection?.columns ?? 2)}
              value={String(selectedField.columnSpan ?? 1)}
            />
            <CheckboxField
              checked={Boolean(selectedField.required)}
              label="Required on this form"
              onChange={(required) =>
                patchField(onChangeLayout, fieldSelection, { required })
              }
            />
            <CheckboxField
              checked={Boolean(selectedField.readOnly)}
              label="Read-only on this form"
              onChange={(readOnly) =>
                patchField(onChangeLayout, fieldSelection, { readOnly })
              }
            />
            <Button
              leftIcon={<Trash2 className="h-4 w-4" />}
              onClick={() => {
                removeField(onChangeLayout, fieldSelection);
                setSelection({
                  type: "section",
                  tabId: fieldSelection.tabId,
                  sectionId: fieldSelection.sectionId,
                });
              }}
              type="button"
              variant="danger"
            >
              Remove from form
            </Button>
          </>
        ) : null}
      </div>
    </aside>
  );
}

function normalizeLayout(
  layout: FormLayoutJson | undefined,
  columns: CustomizationColumn[],
): FormLayoutJson {
  if (layout?.tabs?.length) return resequenceLayout(normalizeSpans(layout));
  return resequenceLayout({
    columns: 1,
    tabs: [
      {
        id: "main",
        label: "Main",
        columns: 1,
        sections: [
          {
            id: "general",
            label: "General",
            labelVisible: true,
            columns: 2,
            columnSpan: 1,
            isVisible: true,
            fields: columns.slice(0, 8).map((column) => ({
              columnKey: column.columnKey,
              label: column.displayName,
              isVisible: true,
              required: column.isRequired,
              readOnly: column.isReadOnly,
              columnSpan: 1,
            })),
          },
        ],
      },
    ],
  });
}

function normalizeSpans(layout: FormLayoutJson): FormLayoutJson {
  return {
    ...layout,
    columns: clampColumns(layout.columns ?? 1),
    tabs: layout.tabs.map((tab) => ({
      ...tab,
      columns: clampColumns(tab.columns ?? 1),
      sections: (tab.sections ?? []).map((section) => ({
        ...section,
        columns: clampColumns(section.columns ?? 2),
        columnSpan: clampSpan(section.columnSpan ?? 1, tab.columns ?? 1),
        fields: (section.fields ?? []).map((field) => ({
          ...field,
          columnSpan: clampSpan(field.columnSpan ?? 1, section.columns ?? 2),
        })),
        components: (section.components ?? []).map((component) => ({
          ...component,
          columnSpan: clampSpan(
            component.columnSpan ?? 1,
            section.columns ?? 2,
          ),
        })),
      })),
    })),
  };
}

function resequenceLayout(layout: FormLayoutJson): FormLayoutJson {
  const normalized = normalizeSpans(layout);
  return {
    ...normalized,
    tabs: normalized.tabs.map((tab, tabIndex) => ({
      ...tab,
      sequence: tabIndex * 10,
      sections: (tab.sections ?? []).map((section, sectionIndex) => ({
        ...section,
        sequence: sectionIndex * 10,
        fields: (section.fields ?? []).map((field, fieldIndex) => ({
          ...field,
          sequence: fieldIndex * 10,
        })),
        components: (section.components ?? []).map(
          (component, componentIndex) => ({
            ...component,
            sequence: componentIndex * 10,
          }),
        ),
      })),
    })),
  };
}

function clampColumns(value: unknown): 1 | 2 | 3 | 4 {
  return normalizeFormGridColumnCount(value);
}

function clampSpan(value: unknown, parentColumns: unknown): 1 | 2 | 3 | 4 {
  return normalizeFormGridColumnSpan(value, parentColumns);
}

function layoutOptions(maxColumns: unknown = 4) {
  const max = clampColumns(maxColumns);
  return [1, 2, 3]
    .filter((value) => value <= max)
    .map((value) => ({
      value: String(value),
      label: `${value} column${value === 1 ? "" : "s"}`,
    }));
}

function groupPaletteFields(
  fields: CustomizationColumn[],
  usedFieldKeys: Set<string>,
) {
  const hiddenOrLocked = (field: CustomizationColumn) =>
    field.isVisible === false || usedFieldKeys.has(field.columnKey);
  const groups = [
    {
      label: "System Fields",
      fields: fields.filter(
        (field) =>
          field.isSystem &&
          field.isVisible !== false &&
          field.isReadOnly !== true &&
          !hiddenOrLocked(field),
      ),
    },
    {
      label: "Business Fields",
      fields: fields.filter(
        (field) =>
          field.isSystem &&
          field.isVisible !== false &&
          field.isReadOnly === true &&
          !hiddenOrLocked(field),
      ),
    },
    {
      label: "Custom Fields",
      fields: fields.filter(
        (field) => !field.isSystem && !hiddenOrLocked(field),
      ),
    },
    {
      label: "Hidden/Locked Fields",
      fields: fields.filter(hiddenOrLocked),
    },
  ];

  return groups
    .map((group) => ({
      ...group,
      fields: Array.from(
        new Map(group.fields.map((field) => [field.columnKey, field])).values(),
      ),
    }))
    .filter((group) => group.fields.length > 0);
}

function uniqueKey(prefix: string, existing: string[]) {
  let index = existing.length + 1;
  let key = `${prefix}${index}`;
  while (existing.includes(key)) {
    index += 1;
    key = `${prefix}${index}`;
  }
  return key;
}

function moveById<T extends { id: string }>(
  items: T[],
  sourceId: string,
  targetId: string,
) {
  const next = [...items];
  const from = next.findIndex((item) => item.id === sourceId);
  const to = next.findIndex((item) => item.id === targetId);
  if (from < 0 || to < 0 || from === to) return items;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function moveField(
  layout: FormLayoutJson,
  source: NonNullable<DragState>,
  target: { tabId: string; sectionId: string; columnKey: string },
): FormLayoutJson {
  if (source.type !== "field") return layout;
  const sourceField = layout.tabs
    .find((tab) => tab.id === source.tabId)
    ?.sections.find((section) => section.id === source.sectionId)
    ?.fields.find((field) => field.columnKey === source.columnKey);
  if (!sourceField) return layout;

  return {
    tabs: layout.tabs.map((tab) => ({
      ...tab,
      sections: tab.sections.map((section) => {
        const fields = (section.fields ?? []).filter(
          (field) => field.columnKey !== source.columnKey,
        );
        if (tab.id === target.tabId && section.id === target.sectionId) {
          const index = fields.findIndex(
            (field) => field.columnKey === target.columnKey,
          );
          fields.splice(index < 0 ? fields.length : index, 0, sourceField);
        }
        return { ...section, fields };
      }),
    })),
  };
}

function patchSection(
  onChangeLayout: (
    updater: (current: FormLayoutJson) => FormLayoutJson,
  ) => void,
  tabId: string,
  sectionId: string,
  patch: Partial<FormLayoutSection>,
) {
  onChangeLayout((current) => ({
    tabs: current.tabs.map((tab) =>
      tab.id === tabId
        ? {
            ...tab,
            sections: tab.sections.map((section) =>
              section.id === sectionId ? { ...section, ...patch } : section,
            ),
          }
        : tab,
    ),
  }));
}

function patchField(
  onChangeLayout: (
    updater: (current: FormLayoutJson) => FormLayoutJson,
  ) => void,
  selection: Selection,
  patch: Partial<FormLayoutField>,
) {
  if (selection.type !== "field") return;
  onChangeLayout((current) => ({
    tabs: current.tabs.map((tab) =>
      tab.id === selection.tabId
        ? {
            ...tab,
            sections: tab.sections.map((section) =>
              section.id === selection.sectionId
                ? {
                    ...section,
                    fields: section.fields.map((field) =>
                      field.columnKey === selection.columnKey
                        ? { ...field, ...patch }
                        : field,
                    ),
                  }
                : section,
            ),
          }
        : tab,
    ),
  }));
}

function removeField(
  onChangeLayout: (
    updater: (current: FormLayoutJson) => FormLayoutJson,
  ) => void,
  selection: Selection,
) {
  if (selection.type !== "field") return;
  onChangeLayout((current) => ({
    tabs: current.tabs.map((tab) =>
      tab.id === selection.tabId
        ? {
            ...tab,
            sections: tab.sections.map((section) =>
              section.id === selection.sectionId
                ? {
                    ...section,
                    fields: section.fields.filter(
                      (field) => field.columnKey !== selection.columnKey,
                    ),
                  }
                : section,
            ),
          }
        : tab,
    ),
  }));
}
