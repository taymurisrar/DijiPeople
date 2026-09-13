"use client";

import { Edit3, GripVertical, Plus, RotateCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { useSideToast } from "@/app/components/notifications/use-side-toast";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import {
  CheckboxField,
  SelectField,
  TextAreaField,
  TextField,
  useListboxEscape,
} from "@/app/components/ui/form-control";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { PermissionGate } from "@/app/(authenticated)/_components/permission-gate";
import {
  CustomizationColumn,
  CustomizationPackage,
  CustomizationTable,
} from "../types";
import { customizationComponentWriteKey } from "../_lib/customization-keys";
import {
  COMMAND_ICON_CHOICES,
  COMMAND_PLACEMENTS,
  commandsForPlacement,
  findCommand,
  COMMAND_CATALOG,
} from "@/lib/runtime/command-catalog";
import {
  EMPTY_AUDIENCE_OPTIONS,
  VisibilityRulesEditor,
  type AudienceOptions,
} from "@/app/components/runtime/visibility-rules-editor";
import type { VisibilityRule } from "@/lib/runtime/visibility.resolver";
import { useDialogBehavior } from "@/app/components/ui/dialog";

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
  /*
   * Order is no longer edited. It is the row's position in the list, set by
   * dragging, so the numbers cannot disagree with what the screen shows.
   */
  visibilityRules: VisibilityRule[];
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

/* The legacy holding package is never offered (BUG-3493). */
const UNASSIGNED_PACKAGE_KEY = "unassigned-draft-customizations";

const componentConfig: Record<
  MetadataComponentType,
  {
    title: string;
    apiType: string;
    addLabel: string;
    emptyTitle: string;
    itemLabel: string;
  }
> = {
  choiceList: {
    title: "Choice Lists",
    apiType: "choiceList",
    addLabel: "Add choice list",
    emptyTitle: "No choice lists",
    itemLabel: "Choice list",
  },
  relationship: {
    title: "Relationships",
    apiType: "relationship",
    addLabel: "Add relationship",
    emptyTitle: "No relationships",
    itemLabel: "Relationship",
  },
  actionBar: {
    title: "Action Bars",
    apiType: "actionBar",
    addLabel: "Add action bar",
    emptyTitle: "No action bars",
    itemLabel: "Action bar",
  },
  widget: {
    title: "Widgets",
    apiType: "widget",
    addLabel: "Add widget",
    emptyTitle: "No widgets",
    itemLabel: "Widget",
  },
};

export function MetadataComponentsManagement({
  audiences = EMPTY_AUDIENCE_OPTIONS,
  columns = [],
  componentType,
  lookupTables,
  onCountChange,
  packages,
  readOnly = false,
  table,
}: {
  /* Dimensions an action's visibility rules can be written against. */
  audiences?: AudienceOptions;
  /* This module's fields; a relationship's reference field is picked from them. */
  columns?: CustomizationColumn[];
  componentType: MetadataComponentType;
  lookupTables: CustomizationTable[];
  onCountChange?: (count: number) => void;
  packages: CustomizationPackage[];
  readOnly?: boolean;
  table: CustomizationTable;
}) {
  /*
   * Permission keys offered on an action, loaded from the tenant rather than
   * typed. A key that does not exist guards nothing while looking as if it
   * does — the same trap that had `customization.update` protecting a route no
   * role could reach.
   */
  const [permissionOptions, setPermissionOptions] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadPermissions() {
      const response = await fetch("/api/permissions?pageSize=500").catch(
        () => null,
      );
      if (!response?.ok) return;
      const payload = (await response.json().catch(() => null)) as
        | { items?: Array<{ key?: string }> }
        | Array<{ key?: string }>
        | null;
      const rows = Array.isArray(payload) ? payload : (payload?.items ?? []);
      const keys = rows
        .map((row) => row?.key)
        .filter((key): key is string => Boolean(key))
        .sort();
      if (!cancelled) setPermissionOptions(keys);
    }
    void loadPermissions();
    return () => {
      cancelled = true;
    };
  }, []);
  const config = componentConfig[componentType];
  const writeKey =
    componentType === "widget"
      ? null
      : customizationComponentWriteKey(componentType);
  const router = useRouter();
  const { notifySuccess, toast } = useSideToast();
  const [rows, setRows] = useState<MetadataComponentRow[]>([]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  /*
   * BUG-3493 — every writable Custom Package, and never the legacy holding
   * package. A blank choice is allowed: the API places the draft in the
   * tenant's own Custom Package, so creating no longer depends on a package
   * existing first.
   */
  const editablePackages = packages.filter(
    (item) =>
      !item.isDefault &&
      !item.isReadOnly &&
      item.packageKey !== UNASSIGNED_PACKAGE_KEY,
  );
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
      packageId: editablePackages[0]?.id ?? "",
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
      packageId: row.packageId,
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
      message?: string | string[];
    };
    setIsSaving(false);
    if (!response.ok) {
      setError(
        (Array.isArray(data.message) ? data.message.join(" ") : data.message) ??
          `Unable to save the ${config.itemLabel.toLowerCase()}.`,
      );
      return;
    }
    notifySuccess(
      `${editor.displayName.trim()} ${editor.mode === "create" ? "created" : "saved"}`,
    );
    setEditor(null);
    await loadRows();
    router.refresh();
  }

  async function deactivateRow(row: MetadataComponentRow) {
    if (row.isSystem) {
      setError("System components cannot be deleted.");
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
      setError(data.message ?? "Unable to deactivate this component.");
      return;
    }
    notifySuccess(`${row.displayName} deactivated`);
    await loadRows();
    router.refresh();
  }

  // BUG-0043: this modal kept its own layout and gained the guarantees
  // it never had - focus containment, Escape, focus restore and dialog
  // semantics. See useDialogBehavior.
  const editorDialog = useDialogBehavior({
    open: Boolean(editor),
    onClose: () => setEditor(null),
  });

  const addButton = (variant: "primary" | "secondary") =>
    !readOnly && writeKey ? (
      <PermissionGate anyOf={[writeKey]}>
        <Button
          leftIcon={variant === "primary" ? <Plus className="h-4 w-4" /> : undefined}
          onClick={openCreate}
          size="sm"
          type="button"
          variant={variant}
        >
          {config.addLabel}
        </Button>
      </PermissionGate>
    ) : null;

  return (
    <SectionCard title={config.title}>
      {toast}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {rows.length} {config.title.toLowerCase()}
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
          {addButton("primary")}
        </div>
      </div>

      {error && !editor ? (
        <div
          className="mb-4 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger"
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
            action={addButton("secondary")}
            description={
              isLoading
                ? "Loading..."
                : `This module has no ${config.title.toLowerCase()} yet.`
            }
            title={config.emptyTitle}
          />
        }
        getRowKey={(row) => row.id}
        initialSort={{ columnKey: "displayName", direction: "asc" }}
        pagination={{ page: 1, pageSize: 10, total: rows.length }}
        rows={rows}
        searchPlaceholder={`Search ${config.title.toLowerCase()}`}
        tableClassName="min-w-[820px] divide-y divide-border text-xs"
      />

      {editor ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"
          {...editorDialog.backdropProps}
        >
          <form
            {...editorDialog.panelProps}
            className="grid max-h-[92vh] w-full max-w-4xl gap-4 overflow-y-auto rounded-lg border border-border bg-white p-5 shadow-xl"
            onSubmit={handleSubmit}
          >
            <h3
              className="text-base font-semibold text-foreground"
              id={editorDialog.titleId}
            >
              {editor.mode === "create"
                ? config.addLabel
                : `Edit ${config.itemLabel.toLowerCase()}`}
            </h3>

            {/*
              ITEM-0183 / BUG-3495 — the logical name's hint ("Generated with
              publisher prefix dd__. Locked after creation.") rendered twice and
              doubled the underscore; the dialog's own paragraph explained draft
              publishing. Both are gone.
            */}
            <div className="grid gap-3 md:grid-cols-2">
              <TextField
                label="Display name"
                onChange={updateDisplayName}
                required
                value={editor.displayName}
              />
              <TextField
                disabled={editor.mode === "edit"}
                label="Logical name"
                onChange={(logicalName) => updateEditor({ logicalName })}
                required
                value={editor.logicalName}
              />
              {editablePackages.length > 0 ? (
                <SelectField
                  disabled={editor.mode === "edit"}
                  label="Package"
                  onChange={(packageId) => updateEditor({ packageId })}
                  options={editablePackages.map((item) => ({
                    label: item.displayName,
                    value: item.id,
                  }))}
                  placeholder="Default custom package"
                  value={editor.packageId}
                />
              ) : null}
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
                columns={columns}
                editor={editor}
                lookupTables={lookupTables}
                table={table}
                updateEditor={updateEditor}
              />
            ) : null}
            {componentType === "actionBar" ? (
              <ActionBarEditor
                audiences={audiences}
                editor={editor}
                permissionOptions={permissionOptions}
                updateEditor={updateEditor}
              />
            ) : null}

            <TextAreaField
              label="Notes"
              onChange={(notes) => updateEditor({ notes })}
              value={editor.notes}
            />

            {error ? (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}

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
              <Button
                loading={isSaving}
                loadingText={
                  editor.mode === "create" ? "Creating..." : "Saving..."
                }
                type="submit"
              >
                {editor.mode === "create" ? "Create" : "Save"}
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
              header: "Widget",
              render: (row) => stringValue(row.metadataJson.widgetType, "System"),
            }
          : {
              key: "actionScope",
              header: "Placement / Actions",
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
              aria-label={`Edit ${row.displayName}`}
              leftIcon={<Edit3 className="h-4 w-4" />}
              onClick={() => openEdit(row)}
              size="icon-sm"
              title="Edit"
              type="button"
              variant="secondary"
            />
            <Button
              aria-label={`Deactivate ${row.displayName}`}
              disabled={row.isSystem || !row.isActive}
              leftIcon={<Trash2 className="h-4 w-4" />}
              onClick={() => deactivateRow(row)}
              size="icon-sm"
              title="Deactivate"
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
        label="Choice list type"
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
              label="Value"
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
            {editor.choiceType === "subStatus" ? (
              <TextField
                label="Parent status"
                onChange={(parentStatus) =>
                  updateOption(row.id, { parentStatus })
                }
                value={row.parentStatus}
              />
            ) : (
              <span />
            )}
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
  columns,
  editor,
  lookupTables,
  table,
  updateEditor,
}: {
  columns: CustomizationColumn[];
  editor: EditorState;
  lookupTables: CustomizationTable[];
  table: CustomizationTable;
  updateEditor: (patch: Partial<EditorState>) => void;
}) {
  /*
   * BUG-3495 — the reference field is picked from this module's real reference
   * fields. It was free text, so a relationship could name a field that did not
   * exist and save without complaint; the API now refuses that as well.
   */
  const referenceColumns = columns.filter(
    (column) =>
      (column.fieldType === "lookup" || column.dataType === "lookup") &&
      (!editor.targetModuleKey ||
        !column.lookupTargetTableKey ||
        column.lookupTargetTableKey === editor.targetModuleKey),
  );
  const referenceOptions = referenceColumns.map((column) => ({
    value: column.columnKey,
    label: column.displayName,
  }));
  if (
    editor.referenceField &&
    !referenceOptions.some((option) => option.value === editor.referenceField)
  ) {
    referenceOptions.push({
      value: editor.referenceField,
      label: editor.referenceField,
    });
  }

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-slate-50 p-3 md:grid-cols-2">
      <TextField
        disabled
        label="Source module"
        onChange={() => undefined}
        value={table.displayName}
      />
      <SelectField
        label="Target module"
        onChange={(targetModuleKey) => updateEditor({ targetModuleKey })}
        options={lookupTables.map((item) => ({
          label: item.pluralDisplayName,
          value: item.tableKey,
        }))}
        required
        value={editor.targetModuleKey}
      />
      <SelectField
        label="Relationship type"
        onChange={(relationshipType) => updateEditor({ relationshipType })}
        options={[
          { value: "oneToMany", label: "One-to-many" },
          { value: "manyToOne", label: "Many-to-one" },
          { value: "manyToMany", label: "Many-to-many" },
        ]}
        value={editor.relationshipType}
      />
      <SelectField
        label="Reference field"
        onChange={(referenceField) => updateEditor({ referenceField })}
        options={referenceOptions}
        placeholder={
          referenceOptions.length ? "Select a field" : "No reference fields"
        }
        required
        value={editor.referenceField}
      />
      <SelectField
        label="When a record is deleted"
        onChange={(cascadeBehavior) => updateEditor({ cascadeBehavior })}
        options={[
          { value: "none", label: "Do nothing" },
          { value: "restrict", label: "Prevent deletion" },
          { value: "cascade", label: "Delete related records" },
        ]}
        value={editor.cascadeBehavior}
      />
      <CheckboxField
        checked={editor.generateRelatedList}
        label="Show related list"
        onChange={(generateRelatedList) =>
          updateEditor({ generateRelatedList })
        }
      />
    </div>
  );
}

function ActionBarEditor({
  audiences,
  editor,
  permissionOptions,
  updateEditor,
}: {
  audiences: AudienceOptions;
  editor: EditorState;
  permissionOptions: readonly string[];
  updateEditor: (patch: Partial<EditorState>) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const placement = COMMAND_PLACEMENTS.find(
    (entry) => entry.key === editor.actionScope,
  );
  const available = commandsForPlacement(placement?.key);

  /*
   * A stored scope this list does not know — "module" on the runtime-registered
   * bars, or an older "recordRead" — is offered as its own option rather than
   * dropped. Without it the select falls back to the first entry and merely
   * opening the dialog and saving would rescope the bar.
   */
  const placementOptions = [
    ...COMMAND_PLACEMENTS.map((entry) => ({
      value: entry.key as string,
      label: entry.label,
    })),
    ...(editor.actionScope && !placement
      ? [
          {
            value: editor.actionScope,
            label: actionScopeLabel(editor.actionScope),
          },
        ]
      : []),
  ];

  function updateAction(id: string, patch: Partial<ActionRow>) {
    updateEditor({
      actions: editor.actions.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    });
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= editor.actions.length || from === to) return;
    const next = [...editor.actions];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    updateEditor({ actions: next });
  }

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-slate-50 p-3">
      <SelectField
        label="Placement"
        onChange={(actionScope) => updateEditor({ actionScope })}
        options={placementOptions}
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
                  visibilityRules: [],
                },
              ],
            })
          }
          size="xs"
          type="button"
          variant="secondary"
        >
          Add action
        </Button>
      </div>

      <div className="grid gap-2" role="list">
        {editor.actions.map((row, index) => {
          const catalogEntry = findCommand(row.command);
          const isUnknown = Boolean(row.command) && !catalogEntry;

          return (
            <div
              className={
                dragIndex === index
                  ? "grid gap-2 rounded-lg border border-accent bg-white p-2"
                  : "grid gap-2 rounded-lg border border-border bg-white p-2"
              }
              draggable
              key={row.id}
              /*
               * A row in a reorderable list. `draggable` is a pointer
               * affordance, not a control — the row activates nothing, and every
               * field in it is separately reachable. Keyboard reordering is
               * ITEM-0080. BUG-0043.
               */
              role="listitem"
              onDragEnd={() => setDragIndex(null)}
              onDragOver={(event) => event.preventDefault()}
              onDragStart={() => setDragIndex(index)}
              onDrop={() => {
                if (dragIndex !== null) move(dragIndex, index);
                setDragIndex(null);
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <GripVertical
                  aria-hidden
                  className="h-4 w-4 shrink-0 cursor-grab text-muted"
                />
                <span className="w-5 shrink-0 text-xs text-muted">
                  {index + 1}
                </span>

                <SearchableSelect
                  ariaLabel={`Action ${index + 1} command`}
                  invalid={!row.command}
                  onChange={(command) => {
                    const entry = findCommand(command);
                    updateAction(row.id, {
                      command,
                      /* Keep any label the administrator typed themselves. */
                      label: row.label.trim() || entry?.label || "",
                      icon: row.icon || entry?.icon || "",
                    });
                  }}
                  options={available.map((entry) => ({
                    value: entry.key,
                    label: entry.label,
                    hint: entry.description,
                  }))}
                  placeholder="Choose a command"
                  value={row.command}
                />

                <input
                  aria-label={`Action ${index + 1} label`}
                  className="w-36 rounded-md border border-border px-2 py-1 text-xs"
                  onChange={(event) =>
                    updateAction(row.id, { label: event.target.value })
                  }
                  placeholder={catalogEntry?.label ?? "Button label"}
                  value={row.label}
                />

                <button
                  aria-label={`Remove action ${index + 1}`}
                  className="ml-auto shrink-0 rounded p-1 text-muted transition hover:bg-danger/10 hover:text-danger"
                  onClick={() =>
                    updateEditor({
                      actions: editor.actions.filter(
                        (item) => item.id !== row.id,
                      ),
                    })
                  }
                  type="button"
                >
                  <Trash2 aria-hidden className="h-3.5 w-3.5" />
                </button>
              </div>

              {isUnknown ? (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                  Unknown command <code>{row.command}</code>.
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 pl-6">
                <SearchableSelect
                  ariaLabel={`Action ${index + 1} icon`}
                  onChange={(icon) => updateAction(row.id, { icon })}
                  options={COMMAND_ICON_CHOICES.map((name) => ({
                    value: name,
                    label: name,
                  }))}
                  placeholder="Icon"
                  value={row.icon}
                />
                <SearchableSelect
                  ariaLabel={`Action ${index + 1} permission`}
                  onChange={(permissionKey) =>
                    updateAction(row.id, { permissionKey })
                  }
                  options={permissionOptions.map((key) => ({
                    value: key,
                    label: key,
                  }))}
                  placeholder="Permission"
                  value={row.permissionKey}
                />
                <input
                  aria-label={`Action ${index + 1} group`}
                  className="w-28 rounded-md border border-border px-2 py-1 text-xs"
                  onChange={(event) =>
                    updateAction(row.id, { group: event.target.value })
                  }
                  placeholder="Group"
                  value={row.group}
                />
              </div>

              <div className="pl-6">
                <VisibilityRulesEditor
                  audiences={audiences}
                  emptyLabel="everyone who can use this bar"
                  onChange={(visibilityRules) =>
                    updateAction(row.id, { visibilityRules })
                  }
                  rules={row.visibilityRules}
                  title="Who sees this button"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/*
 * A select with a filter box. Long option lists — every permission key in the
 * tenant, every icon — are unusable as a plain dropdown, and these were free
 * text before, so a typo produced a button that looked configured and did
 * nothing.
 */
function SearchableSelect({
  ariaLabel,
  invalid = false,
  onChange,
  options,
  placeholder,
  value,
}: {
  ariaLabel: string;
  invalid?: boolean;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string; hint?: string }>;
  placeholder: string;
  value: string;
}) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  /* BUG-3495 — Escape closes this list, not the dialog it sits in. */
  useListboxEscape(isOpen, () => setIsOpen(false));

  const trimmed = query.trim().toLowerCase();
  const visible = trimmed
    ? options.filter(
        (option) =>
          option.label.toLowerCase().includes(trimmed) ||
          option.value.toLowerCase().includes(trimmed),
      )
    : options;

  const selected = options.find((option) => option.value === value);

  return (
    <div className="relative">
      <button
        aria-expanded={isOpen}
        aria-label={invalid ? `${ariaLabel}, not chosen` : ariaLabel}
        className={[
          "w-44 truncate rounded-md border bg-white px-2 py-1 text-left text-xs",
          invalid ? "border-danger" : "border-border",
        ].join(" ")}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        {selected?.label ?? <span className="text-muted">{placeholder}</span>}
      </button>

      {isOpen ? (
        <div className="absolute z-30 mt-1 w-64 rounded-lg border border-border bg-white shadow-lg">
          <input
            aria-label={"Search " + ariaLabel.toLowerCase()}
            autoFocus
            className="w-full border-b border-border px-2 py-1.5 text-xs outline-none"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            value={query}
          />
          <div className="max-h-52 overflow-y-auto p-1">
            {value ? (
              <button
                className="w-full rounded px-2 py-1 text-left text-xs text-muted hover:bg-muted/20"
                onClick={() => {
                  onChange("");
                  setIsOpen(false);
                }}
                type="button"
              >
                Clear
              </button>
            ) : null}
            {visible.length ? (
              visible.map((option) => (
                <button
                  className={
                    option.value === value
                      ? "w-full rounded bg-accent-soft px-2 py-1 text-left text-xs font-semibold hover:bg-accent-soft"
                      : "w-full rounded px-2 py-1 text-left text-xs hover:bg-accent-soft"
                  }
                  key={option.value}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                    setQuery("");
                  }}
                  type="button"
                >
                  <span className="block truncate text-foreground">
                    {option.label}
                  </span>
                  {option.hint ? (
                    <span className="block truncate text-[10px] text-muted">
                      {option.hint}
                    </span>
                  ) : null}
                </button>
              ))
            ) : (
              <p className="px-2 py-2 text-xs text-muted">No matches.</p>
            )}
          </div>
        </div>
      ) : null}
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
  /*
   * BUG-3495 — rows are no longer filtered here. A row with no command used to
   * be dropped silently on save; validation now refuses it by position, so what
   * is saved is exactly what the administrator saw.
   */
  return {
    ...base,
    scope: editor.actionScope,
    actions: editor.actions.map((row, index) => ({
      label:
        row.label.trim() ||
        findCommand(row.command)?.label ||
        commandLabel(row.command),
      command: row.command.trim(),
      group: row.group.trim() || undefined,
      icon: row.icon.trim() || undefined,
      permissionKey: row.permissionKey.trim() || undefined,
      /* Position is the order; dragging a row is what changes it. */
      order: index * 10,
      visibilityRules: row.visibilityRules.length
        ? row.visibilityRules
        : undefined,
    })),
  };
}

function validateEditor(
  editor: EditorState,
  rows: MetadataComponentRow[],
  componentType: MetadataComponentType,
) {
  if (!editor.displayName.trim()) return "Enter a display name.";
  if (!/^([a-z]{2,8})_[a-z][a-zA-Z0-9]*$/.test(editor.logicalName)) {
    return "Use the publisher prefix followed by a name, for example dp_passportExpiry.";
  }
  if (
    editor.mode === "create" &&
    rows.some((row) => row.logicalName === editor.logicalName)
  ) {
    return "A component with this logical name already exists.";
  }
  if (componentType === "choiceList") {
    const activeOptions = editor.options.filter(
      (row) => row.active && row.label.trim() && row.value.trim(),
    );
    if (activeOptions.length === 0) return "Add at least one active option.";
  }
  if (componentType === "relationship") {
    if (!editor.targetModuleKey) return "Choose the target module.";
    if (!editor.referenceField.trim()) return "Choose the reference field.";
  }
  if (componentType === "actionBar") {
    if (editor.actions.length === 0) return "Add at least one action.";
    const missing = editor.actions.findIndex((row) => !row.command.trim());
    if (missing >= 0) {
      return `Action ${missing + 1} needs a command. Choose one or remove the action.`;
    }
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
        label: findCommand(item)?.label ?? commandLabel(item),
        command: item,
        group: item.startsWith("record.") ? "Record" : "Primary",
        icon: findCommand(item)?.icon ?? "",
        permissionKey: "",
        visibilityRules: [],
      };
    }
    const record = isRecord(item) ? item : {};
    const command = stringValue(record.command, "");
    return {
      id: `${index}-${command || "action"}`,
      label:
        stringValue(record.label, "") ||
        findCommand(command)?.label ||
        commandLabel(command),
      command,
      group: stringValue(record.group, ""),
      icon: stringValue(record.icon, "") || findCommand(command)?.icon || "",
      permissionKey: stringValue(record.permissionKey, ""),
      visibilityRules: Array.isArray(record.visibilityRules)
        ? (record.visibilityRules as VisibilityRule[])
        : [],
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
  /*
   * Seeded from the catalog rather than invented labels. The old default
   * produced commands like `new` and `export`, which the runtime does not
   * register, so every seeded button was inert.
   */
  return COMMAND_CATALOG.filter((entry) =>
    [
      "system.new",
      "system.edit",
      "system.delete",
      "system.refresh",
      "system.export",
    ].includes(entry.key),
  ).map((entry) => ({
    id: crypto.randomUUID(),
    label: entry.label,
    command: entry.key,
    group: entry.key.startsWith("record.") ? "Record" : "Primary",
    icon: entry.icon,
    permissionKey: "",
    visibilityRules: [],
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
    module: "Module",
    recordRead: "Record",
    recordEdit: "Record edit",
    recordCreate: "New record",
    relatedList: "Related list",
  };
  return labels[value] ?? value;
}
