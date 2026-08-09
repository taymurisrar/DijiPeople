"use client";

import { Edit3, Plus, RotateCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
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
import { CustomizationPackage, CustomizationTable } from "../types";

type MetadataComponentType =
  | "choiceList"
  | "relationship"
  | "actionBar"
  | "widget";

type MetadataComponentRow = {
  id: string;
  componentKey: string;
  logicalName: string;
  displayName: string;
  packageId: string;
  packageName: string;
  lifecycleState: "draft" | "published" | "deprecated" | "archived";
  layerAction: "create" | "modify" | "remove" | "reference";
  source: "System" | "Custom";
  isSystem: boolean;
  isCustom: boolean;
  isActive: boolean;
  metadataJson: Record<string, unknown>;
  updatedAt: string;
};

type OptionRow = {
  id: string;
  label: string;
  value: string;
  active: boolean;
  color: string;
  parentStatus: string;
};

type ActionRow = {
  id: string;
  label: string;
  command: string;
  group: string;
  icon: string;
  permissionKey: string;
  order: string;
};

type EditorState = {
  mode: "create" | "edit";
  original?: MetadataComponentRow;
  displayName: string;
  logicalName: string;
  packageId: string;
  isActive: boolean;
  choiceType: string;
  options: OptionRow[];
  targetModuleKey: string;
  relationshipType: string;
  referenceField: string;
  generateRelatedList: boolean;
  cascadeBehavior: string;
  actionScope: string;
  actions: ActionRow[];
  notes: string;
};

const SYSTEM_ACTIONS = [
  "New",
  "Edit",
  "Delete",
  "Refresh",
  "Assign",
  "Share",
  "Import",
  "Export",
  "Export Template",
  "Back",
  "Save",
  "Save & Close",
];

const componentConfig: Record<
  MetadataComponentType,
  {
    title: string;
    description: string;
    apiType: string;
    addLabel: string;
    emptyTitle: string;
  }
> = {
  choiceList: {
    title: "Choice Lists",
    description:
      "Configure package-backed Choice List metadata for fields, status, and dependent sub-status values.",
    apiType: "choiceList",
    addLabel: "Add choice list",
    emptyTitle: "No choice lists",
  },
  relationship: {
    title: "Relationships",
    description:
      "Configure package-backed Relationship metadata used by references and Related Lists.",
    apiType: "relationship",
    addLabel: "Add relationship",
    emptyTitle: "No relationships",
  },
  actionBar: {
    title: "Action Bars",
    description:
      "Configure package-backed Action Bar metadata for list, record, and Related List command surfaces.",
    apiType: "actionBar",
    addLabel: "Add action bar",
    emptyTitle: "No action bars",
  },
  widget: {
    title: "Widgets",
    description:
      "Review executable system Widgets registered for this module, including type, permissions, supported form surfaces, and data-adapter requirements.",
    apiType: "widget",
    addLabel: "Add widget",
    emptyTitle: "No registered widgets",
  },
};

export function MetadataComponentsManagement({
  componentType,
  lookupTables,
  onCountChange,
  packages,
  readOnly = false,
  table,
}: {
  componentType: MetadataComponentType;
  lookupTables: CustomizationTable[];
  onCountChange?: (count: number) => void;
  packages: CustomizationPackage[];
  readOnly?: boolean;
  table: CustomizationTable;
}) {
  const config = componentConfig[componentType];
  const router = useRouter();
  const [rows, setRows] = useState<MetadataComponentRow[]>([]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const editablePackages = packages.filter(
    (item) => !item.isDefault && !item.isReadOnly,
  );
  const defaultPackageId = editablePackages[0]?.id ?? "";
  const prefix = packagePrefix(
    editablePackages.find((item) => item.id === editor?.packageId) ??
      editablePackages[0],
  );

  useEffect(() => {
    void loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [componentType, table.tableKey]);

  const tableColumns = useMemo(
    () => buildColumns(componentType, openEdit, deactivateRow, readOnly),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [componentType, readOnly],
  );

  async function loadRows() {
    setIsLoading(true);
    setError(null);
    const response = await fetch(
      `/api/customization/tables/${table.tableKey}/metadata-components?componentType=${config.apiType}`,
    );
    const data = (await response.json().catch(() => [])) as
      | MetadataComponentRow[]
      | { message?: string };
    setIsLoading(false);
    if (!response.ok || !Array.isArray(data)) {
      setError(
        !Array.isArray(data) && data.message
          ? data.message
          : `Unable to load ${config.title.toLowerCase()}.`,
      );
      return;
    }
    setRows(data);
    onCountChange?.(data.length);
  }

  function openCreate() {
    setError(null);
    setEditor({
      mode: "create",
      displayName: "",
      logicalName: "",
      packageId: defaultPackageId,
      isActive: true,
      choiceType: "global",
      options: [],
      targetModuleKey: "",
      relationshipType: "oneToMany",
      referenceField: "",
      generateRelatedList: true,
      cascadeBehavior: "none",
      actionScope: "list",
      actions: defaultActionRows(componentType),
      notes: "",
    });
  }

  function openEdit(row: MetadataComponentRow) {
    const metadata = row.metadataJson ?? {};
    setError(null);
    setEditor({
      mode: "edit",
      original: row,
      displayName: row.displayName,
      logicalName: row.logicalName,
      packageId: row.packageId || defaultPackageId,
      isActive: row.isActive,
      choiceType: stringValue(metadata.type, "global"),
      options: optionRows(metadata.options),
      targetModuleKey: stringValue(metadata.targetModuleKey, ""),
      relationshipType: stringValue(metadata.relationshipType, "oneToMany"),
      referenceField: stringValue(metadata.referenceField, ""),
      generateRelatedList: metadata.generateRelatedList !== false,
      cascadeBehavior: stringValue(metadata.cascadeBehavior, "none"),
      actionScope: stringValue(metadata.scope, "list"),
      actions: actionRows(metadata.actions, componentType),
      notes: stringValue(metadata.notes, ""),
    });
  }

  function updateEditor(patch: Partial<EditorState>) {
    setEditor((current) => (current ? { ...current, ...patch } : current));
  }

  function updateDisplayName(displayName: string) {
    setEditor((current) => {
      if (!current) return current;
      if (current.mode === "edit") return { ...current, displayName };
      const generated = generatedLogicalName(displayName, prefix);
      return {
        ...current,
        displayName,
        logicalName:
          current.logicalName &&
          current.logicalName !==
            generatedLogicalName(current.displayName, prefix)
            ? current.logicalName
            : generated,
      };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const validationError = validateEditor(editor, rows, componentType);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    setError(null);
    const response = await fetch("/api/customization/layers/ensure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        moduleKey: table.tableKey,
        componentType: config.apiType,
        componentKey: editor.logicalName,
        displayName: editor.displayName.trim(),
        packageId: editor.packageId || undefined,
        layerAction: editor.mode === "create" ? "create" : "modify",
        metadataJson: buildMetadata(editor, componentType, table.tableKey),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    setIsSaving(false);
    if (!response.ok) {
      setError(data.message ?? `Unable to save ${config.title.toLowerCase()}.`);
      return;
    }
    setEditor(null);
    await loadRows();
    router.refresh();
  }

  async function deactivateRow(row: MetadataComponentRow) {
    if (row.isSystem) {
      setError(
        "System metadata cannot be deleted. Create a draft customization layer to deactivate it.",
      );
      return;
    }
    setIsSaving(true);
    setError(null);
    const response = await fetch("/api/customization/layers/ensure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        moduleKey: table.tableKey,
        componentType: config.apiType,
        componentKey: row.logicalName,
        displayName: row.displayName,
        packageId: row.packageId || undefined,
        layerAction: "modify",
        metadataJson: { ...row.metadataJson, isActive: false },
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    setIsSaving(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to deactivate metadata component.");
      return;
    }
    await loadRows();
    router.refresh();
  }

  return (
    <SectionCard description={config.description} title={config.title}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {rows.length} {config.title.toLowerCase()} configured for{" "}
          {table.pluralDisplayName}.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            leftIcon={<RotateCw className="h-4 w-4" />}
            onClick={loadRows}
            size="sm"
            type="button"
            variant="secondary"
          >
            Refresh
          </Button>
          {!readOnly ? (
            <Button
              disabled={!editablePackages.length}
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={openCreate}
              size="sm"
              title={
                editablePackages.length
                  ? undefined
                  : "Create or select a custom package before adding metadata."
              }
              type="button"
            >
              {config.addLabel}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <DataTable
        className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm"
        columns={tableColumns}
        emptyState={
          <EmptyState
            action={
              !readOnly ? (
                <Button
                  disabled={!editablePackages.length}
                  onClick={openCreate}
                  type="button"
                  variant="secondary"
                >
                  {config.addLabel}
                </Button>
              ) : undefined
            }
            description={
              isLoading
                ? "Loading metadata components..."
                : readOnly
                  ? "No executable system widgets are registered for this module."
                  : "Create a draft layer in a custom package to configure this metadata type."
            }
            title={config.emptyTitle}
          />
        }
        getRowKey={(row) => row.id}
        initialSort={{ columnKey: "displayName", direction: "asc" }}
        pagination={{ page: 1, pageSize: 10, total: rows.length }}
        rows={rows}
        searchPlaceholder={`Search ${config.title.toLowerCase()}`}
        tableClassName="min-w-[1040px] divide-y divide-border text-xs"
      />

      {editor ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
          <form
            className="grid max-h-[92vh] w-full max-w-4xl gap-4 overflow-y-auto rounded-lg border border-border bg-white p-5 shadow-xl"
            onSubmit={handleSubmit}
          >
            <div>
              <h3 className="text-base font-semibold text-foreground">
                {editor.mode === "create" ? config.addLabel : "Edit metadata"}
              </h3>
              <p className="mt-1 text-sm text-muted">
                Saves as draft package metadata. Published runtime metadata is
                unchanged until publish.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <TextField
                label="Display name"
                onChange={updateDisplayName}
                required
                value={editor.displayName}
              />
              <TextField
                disabled={editor.mode === "edit"}
                hint={`Generated with publisher prefix ${prefix}_. Locked after creation.`}
                label="Logical name"
                onChange={(logicalName) => updateEditor({ logicalName })}
                required
                value={editor.logicalName}
              />
              <SelectField
                disabled={editor.mode === "edit"}
                label="Package"
                onChange={(packageId) => updateEditor({ packageId })}
                options={editablePackages.map((item) => ({
                  label: item.displayName,
                  value: item.id,
                }))}
                value={editor.packageId}
              />
              <CheckboxField
                checked={editor.isActive}
                label="Active"
                onChange={(isActive) => updateEditor({ isActive })}
              />
            </div>

            {componentType === "choiceList" ? (
              <ChoiceListEditor editor={editor} updateEditor={updateEditor} />
            ) : null}
            {componentType === "relationship" ? (
              <RelationshipEditor
                editor={editor}
                lookupTables={lookupTables}
                table={table}
                updateEditor={updateEditor}
              />
            ) : null}
            {componentType === "actionBar" ? (
              <ActionBarEditor editor={editor} updateEditor={updateEditor} />
            ) : null}

            <TextAreaField
              label="Notes"
              onChange={(notes) => updateEditor({ notes })}
              value={editor.notes}
            />

            {error ? <p className="text-sm text-danger">{error}</p> : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                onClick={() => {
                  setEditor(null);
                  setError(null);
                }}
                type="button"
                variant="secondary"
              >
                Cancel
              </Button>
              <Button loading={isSaving} loadingText="Saving..." type="submit">
                Save draft metadata
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </SectionCard>
  );
}

function buildColumns(
  componentType: MetadataComponentType,
  openEdit: (row: MetadataComponentRow) => void,
  deactivateRow: (row: MetadataComponentRow) => void,
  readOnly: boolean,
): DataTableColumn<MetadataComponentRow>[] {
  const detailColumn: DataTableColumn<MetadataComponentRow> =
    componentType === "choiceList"
      ? {
          key: "choiceType",
          header: "Type / Options",
          render: (row) => (
            <div>
              <p>
                {choiceTypeLabel(stringValue(row.metadataJson.type, "global"))}
              </p>
              <p className="text-xs text-muted">
                {arrayValue(row.metadataJson.options).length} options
              </p>
            </div>
          ),
        }
      : componentType === "relationship"
        ? {
            key: "relationshipTarget",
            header: "Target / Type",
            render: (row) => (
              <div>
                <p>
                  {stringValue(row.metadataJson.targetModuleKey, "Not set")}
                </p>
                <p className="text-xs text-muted">
                  {relationshipTypeLabel(
                    stringValue(row.metadataJson.relationshipType, "oneToMany"),
                  )}
                </p>
              </div>
            ),
          }
        : componentType === "widget"
          ? {
              key: "widgetType",
              header: "Widget / Requirements",
              render: (row) => (
                <div>
                  <p>{stringValue(row.metadataJson.widgetType, "System")}</p>
                  <p className="text-xs text-muted">
                    {arrayValue(row.metadataJson.requiredPermissions).length}{" "}
                    permissions ·{" "}
                    {
                      arrayValue(row.metadataJson.requiredDataAdapterMethods)
                        .length
                    }{" "}
                    adapter methods
                  </p>
                </div>
              ),
            }
          : {
              key: "actionScope",
              header: "Scope / Actions",
              render: (row) => (
                <div>
                  <p>
                    {actionScopeLabel(
                      stringValue(row.metadataJson.scope, "list"),
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {arrayValue(row.metadataJson.actions).length} actions
                  </p>
                </div>
              ),
            };

  return [
    {
      key: "displayName",
      header: "Name",
      searchable: true,
      sortable: true,
      sortAccessor: (row) => row.displayName,
      render: (row) => (
        <div>
          <p className="font-semibold text-foreground">{row.displayName}</p>
          <p className="text-xs text-muted">{row.logicalName}</p>
        </div>
      ),
    },
    detailColumn,
    {
      key: "source",
      header: "Source",
      filterable: true,
      filterType: "select",
      filterAccessor: (row) => row.source,
      filterOptions: [
        { label: "System", value: "System" },
        { label: "Custom", value: "Custom" },
      ],
      render: (row) => (
        <StatusPill tone={row.source === "System" ? "muted" : "neutral"}>
          {row.source}
        </StatusPill>
      ),
    },
    {
      key: "package",
      header: "Package",
      searchable: true,
      render: (row) => row.packageName,
    },
    {
      key: "lifecycle",
      header: "Lifecycle",
      render: (row) => (
        <StatusPill tone={row.lifecycleState === "draft" ? "warning" : "good"}>
          {stateLabel(row.lifecycleState)}
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
      render: (row) => (
        <StatusPill tone={row.isActive ? "good" : "muted"}>
          {row.isActive ? "Active" : "Inactive"}
        </StatusPill>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) =>
        readOnly ? (
          <StatusPill tone="good">Registered</StatusPill>
        ) : (
          <div className="flex items-center gap-1">
            <Button
              aria-label="Edit component"
              leftIcon={<Edit3 className="h-4 w-4" />}
              onClick={() => openEdit(row)}
              size="icon-sm"
              title="Edit component"
              type="button"
              variant="secondary"
            />
            <Button
              aria-label="Deactivate component"
              disabled={row.isSystem || !row.isActive}
              leftIcon={<Trash2 className="h-4 w-4" />}
              onClick={() => deactivateRow(row)}
              size="icon-sm"
              title={
                row.isSystem
                  ? "System metadata cannot be deleted."
                  : "Deactivate this draft metadata component."
              }
              type="button"
              variant="danger"
            />
          </div>
        ),
    },
  ];
}

function ChoiceListEditor({
  editor,
  updateEditor,
}: {
  editor: EditorState;
  updateEditor: (patch: Partial<EditorState>) => void;
}) {
  function updateOption(id: string, patch: Partial<OptionRow>) {
    updateEditor({
      options: editor.options.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        if (patch.label !== undefined && row.value === toCamelCase(row.label)) {
          next.value = toCamelCase(patch.label);
        }
        return next;
      }),
    });
  }

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-slate-50 p-3">
      <SelectField
        label="Choice List type"
        onChange={(choiceType) => updateEditor({ choiceType })}
        options={[
          { value: "global", label: "Global" },
          { value: "local", label: "Local" },
          { value: "status", label: "Status" },
          { value: "subStatus", label: "Sub Status" },
        ]}
        value={editor.choiceType}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">Options</p>
        <Button
          onClick={() =>
            updateEditor({
              options: [
                ...editor.options,
                {
                  id: crypto.randomUUID(),
                  label: "",
                  value: "",
                  active: true,
                  color: "",
                  parentStatus: "",
                },
              ],
            })
          }
          size="sm"
          type="button"
          variant="secondary"
        >
          Add option
        </Button>
      </div>
      <div className="grid gap-2">
        {editor.options.map((row, index) => (
          <div
            className="grid gap-2 rounded-md border border-border bg-white p-2 md:grid-cols-[1fr_1fr_auto_120px_1fr_auto]"
            key={row.id}
          >
            <TextField
              label={`Label ${index + 1}`}
              onChange={(label) => updateOption(row.id, { label })}
              value={row.label}
            />
            <TextField
              label="Value/key"
              onChange={(value) => updateOption(row.id, { value })}
              value={row.value}
            />
            <CheckboxField
              checked={row.active}
              label="Active"
              onChange={(active) => updateOption(row.id, { active })}
            />
            <TextField
              label="Color"
              onChange={(color) => updateOption(row.id, { color })}
              value={row.color}
            />
            <TextField
              disabled={editor.choiceType !== "subStatus"}
              label="Parent Status"
              onChange={(parentStatus) =>
                updateOption(row.id, { parentStatus })
              }
              value={row.parentStatus}
            />
            <Button
              onClick={() =>
                updateEditor({
                  options: editor.options.filter((item) => item.id !== row.id),
                })
              }
              size="sm"
              type="button"
              variant="ghost"
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function RelationshipEditor({
  editor,
  lookupTables,
  table,
  updateEditor,
}: {
  editor: EditorState;
  lookupTables: CustomizationTable[];
  table: CustomizationTable;
  updateEditor: (patch: Partial<EditorState>) => void;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-slate-50 p-3 md:grid-cols-2">
      <TextField
        disabled
        label="Source Module"
        onChange={() => undefined}
        value={table.displayName}
      />
      <SelectField
        label="Target Module"
        onChange={(targetModuleKey) => updateEditor({ targetModuleKey })}
        options={lookupTables.map((item) => ({
          label: item.pluralDisplayName,
          value: item.tableKey,
        }))}
        value={editor.targetModuleKey}
      />
      <SelectField
        label="Relationship type"
        onChange={(relationshipType) => updateEditor({ relationshipType })}
        options={[
          { value: "oneToMany", label: "One-to-many" },
          { value: "manyToOne", label: "Many-to-one" },
          { value: "manyToMany", label: "Many-to-many metadata-ready" },
        ]}
        value={editor.relationshipType}
      />
      <TextField
        label="Reference field"
        onChange={(referenceField) => updateEditor({ referenceField })}
        value={editor.referenceField}
      />
      <SelectField
        label="Cascade behavior"
        onChange={(cascadeBehavior) => updateEditor({ cascadeBehavior })}
        options={[
          { value: "none", label: "None" },
          { value: "restrict", label: "Restrict" },
          { value: "cascade", label: "Cascade metadata-ready" },
        ]}
        value={editor.cascadeBehavior}
      />
      <CheckboxField
        checked={editor.generateRelatedList}
        label="Generate Related List"
        onChange={(generateRelatedList) =>
          updateEditor({ generateRelatedList })
        }
      />
    </div>
  );
}

function ActionBarEditor({
  editor,
  updateEditor,
}: {
  editor: EditorState;
  updateEditor: (patch: Partial<EditorState>) => void;
}) {
  function updateAction(id: string, patch: Partial<ActionRow>) {
    updateEditor({
      actions: editor.actions.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    });
  }

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-slate-50 p-3">
      <SelectField
        label="Scope"
        onChange={(actionScope) => updateEditor({ actionScope })}
        /*
         * "Module" is included because runtime-registered bars are stored with
         * that scope. Without it the select fell back to another option, so
         * opening a system bar and saving silently rescoped it.
         */
        options={[
          { value: "module", label: "Module" },
          { value: "list", label: "List" },
          { value: "recordRead", label: "Record Read" },
          { value: "recordEdit", label: "Record Edit" },
          { value: "recordCreate", label: "Record Create" },
          { value: "relatedList", label: "Related List" },
        ]}
        value={editor.actionScope}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">Actions</p>
        <Button
          onClick={() =>
            updateEditor({
              actions: [
                ...editor.actions,
                {
                  id: crypto.randomUUID(),
                  label: "",
                  command: "",
                  group: "",
                  icon: "",
                  permissionKey: "",
                  order: String((editor.actions.length + 1) * 10),
                },
              ],
            })
          }
          size="sm"
          type="button"
          variant="secondary"
        >
          Add action
        </Button>
      </div>
      <div className="grid gap-2">
        {editor.actions.map((row) => (
          <div
            className="grid gap-2 rounded-md border border-border bg-white p-2 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_80px_auto]"
            key={row.id}
          >
            <TextField
              label="Label"
              onChange={(label) => updateAction(row.id, { label })}
              value={row.label}
            />
            <TextField
              label="Command"
              onChange={(command) => updateAction(row.id, { command })}
              value={row.command}
            />
            <TextField
              label="Group"
              onChange={(group) => updateAction(row.id, { group })}
              value={row.group}
            />
            <TextField
              label="Icon key"
              onChange={(icon) => updateAction(row.id, { icon })}
              value={row.icon}
            />
            <TextField
              label="Permission"
              onChange={(permissionKey) =>
                updateAction(row.id, { permissionKey })
              }
              value={row.permissionKey}
            />
            <TextField
              label="Order"
              onChange={(order) => updateAction(row.id, { order })}
              value={row.order}
            />
            <Button
              onClick={() =>
                updateEditor({
                  actions: editor.actions.filter((item) => item.id !== row.id),
                })
              }
              size="sm"
              type="button"
              variant="ghost"
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">
        Standard system actions: {SYSTEM_ACTIONS.join(", ")}.
      </p>
    </div>
  );
}

function buildMetadata(
  editor: EditorState,
  componentType: MetadataComponentType,
  sourceModuleKey: string,
) {
  const base = {
    displayName: editor.displayName.trim(),
    logicalName: editor.logicalName,
    isActive: editor.isActive,
    notes: editor.notes.trim() || undefined,
  };
  if (componentType === "choiceList") {
    return {
      ...base,
      type: editor.choiceType,
      options: editor.options
        .filter((row) => row.label.trim() && row.value.trim())
        .map((row, index) => ({
          label: row.label.trim(),
          value: row.value.trim(),
          active: row.active,
          color: row.color.trim() || undefined,
          parentStatus: row.parentStatus.trim() || undefined,
          order: index * 10,
        })),
    };
  }
  if (componentType === "relationship") {
    return {
      ...base,
      sourceModuleKey,
      targetModuleKey: editor.targetModuleKey,
      relationshipType: editor.relationshipType,
      referenceField: editor.referenceField.trim(),
      generateRelatedList: editor.generateRelatedList,
      cascadeBehavior: editor.cascadeBehavior,
    };
  }
  return {
    ...base,
    scope: editor.actionScope,
    actions: editor.actions
      .filter((row) => row.label.trim() && row.command.trim())
      .map((row) => ({
        label: row.label.trim(),
        command: row.command.trim(),
        group: row.group.trim() || undefined,
        icon: row.icon.trim() || undefined,
        permissionKey: row.permissionKey.trim() || undefined,
        order: Number(row.order) || 0,
      })),
  };
}

function validateEditor(
  editor: EditorState,
  rows: MetadataComponentRow[],
  componentType: MetadataComponentType,
) {
  if (!editor.displayName.trim()) return "Display name is required.";
  if (!/^([a-z]{2,8})_[a-z][a-zA-Z0-9]*$/.test(editor.logicalName)) {
    return "Logical name must use a publisher prefix and camelCase, for example dp_passportExpiryDate.";
  }
  if (
    editor.mode === "create" &&
    rows.some((row) => row.logicalName === editor.logicalName)
  ) {
    return "A metadata component with this logical name already exists.";
  }
  if (componentType === "choiceList") {
    const activeOptions = editor.options.filter(
      (row) => row.active && row.label.trim() && row.value.trim(),
    );
    if (activeOptions.length === 0) return "Add at least one active option.";
  }
  if (componentType === "relationship") {
    if (!editor.targetModuleKey) return "Target Module is required.";
    if (!editor.referenceField.trim()) return "Reference field is required.";
  }
  if (componentType === "actionBar") {
    const actions = editor.actions.filter(
      (row) => row.label.trim() && row.command.trim(),
    );
    if (actions.length === 0) return "Add at least one action.";
  }
  return null;
}

function optionRows(value: unknown): OptionRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const record = isRecord(item) ? item : {};
    const label = stringValue(record.label, "");
    return {
      id: `${index}-${stringValue(record.value, label)}`,
      label,
      value: stringValue(record.value, toCamelCase(label)),
      active: record.active !== false,
      color: stringValue(record.color, ""),
      parentStatus: stringValue(record.parentStatus, ""),
    };
  });
}

/*
 * Action bars registered by the runtime store `actions` as a flat list of
 * command keys — ["system.new", "record.share", …] — while ones authored here
 * store an object per action. Reading only the object form left every field in
 * the editor blank for the system bars, so a bar with twelve commands opened
 * as twelve empty rows and could not be saved.
 */
function actionRows(value: unknown, componentType: MetadataComponentType) {
  if (!Array.isArray(value)) return defaultActionRows(componentType);
  return value.map((item, index) => {
    if (typeof item === "string") {
      return {
        id: `${index}-${item}`,
        label: commandLabel(item),
        command: item,
        group: item.startsWith("record.") ? "Record" : "Primary",
        icon: "",
        permissionKey: "",
        order: String(index * 10),
      };
    }
    const record = isRecord(item) ? item : {};
    const command = stringValue(record.command, "");
    return {
      id: `${index}-${command || "action"}`,
      label: stringValue(record.label, "") || commandLabel(command),
      command,
      group: stringValue(record.group, ""),
      icon: stringValue(record.icon, ""),
      permissionKey: stringValue(record.permissionKey, ""),
      order: String(record.order ?? index * 10),
    };
  });
}

/* "record.assignOwner" reads as "Assign Owner". */
function commandLabel(command: string): string {
  const leaf = command.split(".").pop() ?? command;
  if (!leaf) return "";
  return leaf
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

function defaultActionRows(componentType: MetadataComponentType): ActionRow[] {
  if (componentType !== "actionBar") return [];
  return ["New", "Edit", "Delete", "Refresh", "Export"].map((label, index) => ({
    id: crypto.randomUUID(),
    label,
    command: toCamelCase(label),
    group: label === "Export" ? "Data Transfer" : "Primary",
    icon: "",
    permissionKey: "",
    order: String(index * 10),
  }));
}

function packagePrefix(item?: CustomizationPackage) {
  const value = item?.prefix || item?.publisher?.prefix || "dp_";
  const cleaned = value
    .replace(/_+$/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();

  return cleaned ? `${cleaned}_` : "";
}

function generatedLogicalName(displayName: string, prefix: string) {
  const base = toCamelCase(displayName);
  return base ? `${prefix}${base}` : "";
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

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stateLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function choiceTypeLabel(value: string) {
  const labels: Record<string, string> = {
    global: "Global",
    local: "Local",
    status: "Status",
    subStatus: "Sub Status",
  };
  return labels[value] ?? value;
}

function relationshipTypeLabel(value: string) {
  const labels: Record<string, string> = {
    oneToMany: "One-to-many",
    manyToOne: "Many-to-one",
    manyToMany: "Many-to-many",
  };
  return labels[value] ?? value;
}

function actionScopeLabel(value: string) {
  const labels: Record<string, string> = {
    list: "List",
    recordRead: "Record Read",
    recordEdit: "Record Edit",
    recordCreate: "Record Create",
    relatedList: "Related List",
  };
  return labels[value] ?? value;
}
