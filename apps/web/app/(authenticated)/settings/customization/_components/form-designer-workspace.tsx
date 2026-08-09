"use client";

import {
  ArrowLeft,
  Eye,
  EyeOff,
  GripVertical,
  PencilRuler,
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
import {
  EMPTY_AUDIENCE_OPTIONS,
  VisibilityRulesEditor,
  type AudienceOptions,
} from "@/app/components/runtime/visibility-rules-editor";
import {
  isSystemFormComponent,
  SYSTEM_COMPONENT_CUSTOMIZATION_MESSAGE,
} from "@/lib/customization/metadata-layering";
import type { CustomizationPackage } from "../types";
import { CustomPackagePickerDialog } from "./custom-package-picker-dialog";

type Props = {
  columns: CustomizationColumn[];
  form: CustomizationForm;
  table: CustomizationTable;
  /*
   * Roles, teams, departments, business units, organizations and designations
   * a tab or section can be gated to. Defaulted so an existing caller that has
   * not been updated still renders, with empty pickers rather than a crash.
   */
  audiences?: AudienceOptions;
  /*
   * Needed only to own the customization layer this designer creates the first
   * time a system form is saved. Defaulted so the designer still renders for a
   * custom form, which needs no layer.
   */
  packages?: CustomizationPackage[];
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

export function FormDesignerWorkspace({
  audiences = EMPTY_AUDIENCE_OPTIONS,
  columns,
  form,
  packages = [],
  table,
}: Props) {
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
  /*
   * Preview swaps the designer chips for the controls the runtime renders, so
   * the layout can be judged as a form rather than as a list of field names.
   * Editing affordances are suppressed while it is on — dragging a preview
   * control would be a click target that looks like data entry.
   */
  const [isPreview, setIsPreview] = useState(false);

  /*
   * A system form is product metadata and is never written to directly. Saving
   * one creates a tenant-owned customization layer, and that layer needs a
   * package to own it — so the package is chosen here, at the save, rather than
   * when the designer opens. Looking at a system form now costs nothing.
   */
  const requiresCustomizationLayer = isSystemFormComponent(form);
  const [selectedPackageId, setSelectedPackageId] = useState(
    packages.find((item) => item.type === "custom" && !item.isReadOnly)?.id ??
      "",
  );
  const [isChoosingPackage, setIsChoosingPackage] = useState(false);

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

  /* Save is the first point at which a system form needs a package. */
  function requestSave() {
    if (requiresCustomizationLayer) {
      setIsChoosingPackage(true);
      return;
    }
    void save();
  }

  async function save() {
    setIsChoosingPackage(false);
    setIsSaving(true);
    setError(null);
    const response = await fetch(
      `/api/customization/tables/${table.tableKey}/forms/${form.formKey}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(requiresCustomizationLayer
            ? { packageId: selectedPackageId }
            : {}),
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
      {/*
       * Sticky so Save stays reachable: the canvas runs to several thousand
       * pixels on a real form, and a toolbar that scrolls away means scrolling
       * back to the top to save.
       */}
      <div className="dp-designer-toolbar sticky top-0 z-20 flex items-center justify-between gap-2 rounded-lg border border-border bg-white/95 px-2.5 py-1 shadow-sm backdrop-blur">
        <div className="dp-scroll-hidden flex min-w-0 items-center gap-2 overflow-x-auto">
          <Button
            href={`/settings/customization/tables/${table.tableKey}/forms`}
            leftIcon={<ArrowLeft className="h-4 w-4" />}
            size="xs"
            variant="ghost"
          >
            Back
          </Button>
          <div className="min-w-0 border-l border-border pl-2">
            <p className="truncate text-sm font-semibold text-foreground">
              {table.displayName} · {metadata.name}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            leftIcon={<Save className="h-4 w-4" />}
            loading={isSaving}
            loadingText="Saving..."
            onClick={requestSave}
            size="xs"
            type="button"
          >
            Save
          </Button>
          <Button
            leftIcon={
              isPreview ? (
                <PencilRuler className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )
            }
            onClick={() => setIsPreview((current) => !current)}
            size="xs"
            type="button"
            variant={isPreview ? "primary" : "secondary"}
          >
            {isPreview ? "Design" : "Preview"}
          </Button>
          <Button
            onClick={() =>
              setMetadata((current) => ({
                ...current,
                isActive: !current.isActive,
              }))
            }
            size="xs"
            type="button"
            variant="secondary"
          >
            {metadata.isActive ? "Deactivate" : "Activate"}
          </Button>
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

      <div className="grid gap-3 xl:grid-cols-[210px_minmax(0,1fr)_270px]">
        {/*
         * Both side panels stick and scroll within the viewport. Previously they
         * shared the canvas's full height, so on a long form the palette and the
         * properties for the selected element sat thousands of pixels above
         * whatever was being edited.
         */}
        <aside className="dp-designer-panel dp-scroll-hidden min-w-0 rounded-[16px] border border-border bg-surface p-3 shadow-sm xl:sticky xl:top-14 xl:max-h-[calc(100vh-5rem)] xl:overflow-y-auto">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Field palette
          </p>
          <div className="mt-2 grid gap-1.5">
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
          <div className="mt-3 grid gap-1">
            {paletteFieldGroups
              .flatMap((group) => group.fields)
              .map((column) => (
                <button
                  className="min-w-0 rounded-md border border-border bg-white px-2 py-1.5 text-left transition hover:border-accent/40 hover:bg-accent-soft"
                  key={column.columnKey}
                  onClick={() => addField(column.columnKey)}
                  title={`${column.columnKey} · ${column.fieldType}`}
                  type="button"
                >
                  <span className="block truncate text-[11px] font-medium leading-tight text-foreground">
                    {column.displayName}
                    {column.isSystem ? (
                      <span className="ml-1.5 font-normal text-muted">
                        locked
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] leading-tight text-muted">
                    {column.columnKey} · {column.fieldType}
                  </span>
                </button>
              ))}
            {paletteFields.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-2 py-4 text-[11px] text-muted">
                No fields match the current palette filters.
              </div>
            ) : null}
          </div>
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              System Widgets
            </p>
            <div className="mt-2 grid gap-1.5">
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
                    size="xs"
                    type="button"
                    variant="secondary"
                  >
                    {used ? `${widget.displayName} added` : widget.displayName}
                  </Button>
                );
              })}
              <Button
                disabled
                size="xs"
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
                    size="xs"
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
                              className={
                                isPreview
                                  ? ""
                                  : "rounded-xl border border-border bg-white px-3 py-3"
                              }
                              columnSpan={field.columnSpan}
                              key={`${section.id}-${field.columnKey}`}
                              parentColumns={section.columns ?? 2}
                            >
                            {isPreview ? (
                              <PreviewField
                                column={column}
                                field={field}
                                onSelect={() =>
                                  setSelection({
                                    type: "field",
                                    tabId: tab.id,
                                    sectionId: section.id,
                                    columnKey: field.columnKey,
                                  })
                                }
                              />
                            ) : (
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
                            )}
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
          audiences={audiences}
          columnByKey={columnByKey}
          form={metadata}
          layout={layout}
          onChangeForm={setMetadata}
          onChangeLayout={updateLayout}
          selection={selection}
          setSelection={setSelection}
        />
      </div>

      <CustomPackagePickerDialog
        confirmLabel="Save customization"
        message={SYSTEM_COMPONENT_CUSTOMIZATION_MESSAGE}
        onClose={() => setIsChoosingPackage(false)}
        onConfirm={() => void save()}
        open={isChoosingPackage}
        packages={packages}
        selectedPackageId={selectedPackageId}
        setSelectedPackageId={setSelectedPackageId}
      />
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
  audiences,
  columnByKey,
  form,
  layout,
  onChangeForm,
  onChangeLayout,
  selection,
  setSelection,
}: {
  audiences: AudienceOptions;
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
    <aside className="dp-designer-panel dp-scroll-hidden min-w-0 rounded-[16px] border border-border bg-surface p-3 shadow-sm xl:sticky xl:top-14 xl:max-h-[calc(100vh-5rem)] xl:overflow-y-auto">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        Properties
      </p>
      <div className="mt-2 grid gap-2.5">
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
                  ...current,
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
                  ...current,
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
            <VisibilityRulesEditor
              audiences={audiences}
              emptyLabel="visible to everyone who can open this form"
              onChange={(visibilityRules) =>
                onChangeLayout((current) => ({
                  ...current,
                  tabs: current.tabs.map((tab) =>
                    tab.id === selectedTab.id
                      ? { ...tab, visibilityRules }
                      : tab,
                  ),
                }))
              }
              rules={selectedTab.visibilityRules ?? []}
              title="Who sees this tab"
            />
            <Button
              leftIcon={<Trash2 className="h-4 w-4" />}
              onClick={() => {
                onChangeLayout((current) => ({
                  ...current,
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
            {/*
             * "Visible" above is an unconditional switch for everyone. These
             * rules narrow it further to an audience, so a section can be shown
             * only to HR without hiding it from them too.
             */}
            <VisibilityRulesEditor
              audiences={audiences}
              emptyLabel="visible to everyone who can open this form"
              onChange={(visibilityRules) =>
                patchSection(
                  onChangeLayout,
                  sectionSelection.tabId,
                  selectedSection.id,
                  { visibilityRules },
                )
              }
              rules={selectedSection.visibilityRules ?? []}
              title="Who sees this section"
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
    ...current,
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
    ...current,
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
    ...current,
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

/*
 * A field as the runtime draws it: label above, control below, required marker
 * where one applies. The control is inert — this is a layout preview, not a
 * form — but it is sized and shaped like the real one so column spans and
 * section widths can be judged honestly.
 */
function PreviewField({
  column,
  field,
  onSelect,
}: {
  column?: CustomizationColumn;
  field: FormLayoutField;
  onSelect: () => void;
}) {
  const label = field.label || column?.displayName || field.columnKey;
  const fieldType = column?.fieldType ?? "text";
  const isHidden = field.isVisible === false;

  return (
    <div
      className={`rounded-lg p-1 transition hover:bg-accent-soft/40 ${
        isHidden ? "opacity-45" : ""
      }`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      role="presentation"
    >
      <p className="mb-1 truncate text-xs font-medium text-foreground">
        {label}
        {field.required ? <span className="ml-0.5 text-danger">*</span> : null}
        {isHidden ? (
          <span className="ml-1.5 text-[10px] font-normal text-muted">
            hidden
          </span>
        ) : null}
      </p>
      <PreviewControl fieldType={fieldType} readOnly={field.readOnly} />
    </div>
  );
}

function PreviewControl({
  fieldType,
  readOnly,
}: {
  fieldType: string;
  readOnly?: boolean;
}) {
  const shell = `w-full rounded-md border border-border px-2 py-1.5 text-xs ${
    readOnly ? "bg-surface-strong text-muted" : "bg-white text-muted"
  }`;

  if (fieldType === "boolean") {
    return (
      <span className="inline-flex items-center gap-2 text-xs text-muted">
        <span className="h-4 w-4 rounded border border-border bg-white" />
        Yes / No
      </span>
    );
  }

  if (fieldType === "textarea" || fieldType === "multiline") {
    return <div className={`${shell} h-14`} />;
  }

  if (fieldType === "select" || fieldType === "lookup") {
    return (
      <div className={`${shell} flex items-center justify-between`}>
        <span>Select…</span>
        <span aria-hidden>▾</span>
      </div>
    );
  }

  return <div className={`${shell} h-7`} />;
}
