"use client";

import { Edit, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import { CommandBar } from "@/app/components/command-bar/command-bar";
import type { CommandBarItem } from "@/app/components/command-bar/types";
import type { DataTableColumn } from "@/app/components/data-table/types";
import type {
  EntityMetadata,
  FieldDataType,
  FormMetadata,
  RelatedSubgridMetadata,
} from "../../../lib/runtime/metadata-runtime.types";
import type { ModuleDataAdapter } from "../../../lib/runtime/module-data-adapter.types";
import type { ModuleRuntimeContext } from "../../../lib/runtime/module-runtime.types";
import { ModuleEmptyState } from "./module-empty-state";
import { ModuleQuickCreatePanel } from "./module-quick-create-panel";
import type { RuntimeRecordData } from "./module-runtime-ui.types";
import { formatRuntimeFieldValue } from "@/lib/runtime/runtime-value-formatter";

export function ModuleRelatedSubgrid({
  dataAdapter,
  onEditSelected,
  onNew,
  onRefresh,
  onDeleteSelected,
  parentBinding,
  quickCreateForm,
  records = [],
  runtime,
  selectedRecordIds = [],
  subgrid,
}: {
  readonly dataAdapter?: ModuleDataAdapter;
  readonly onEditSelected?: () => void;
  readonly onNew?: () => void;
  readonly onRefresh?: () => void;
  readonly onDeleteSelected?: () => void;
  readonly parentBinding?: {
    readonly fieldLogicalName: string;
    readonly recordId: string;
  };
  readonly quickCreateForm?: FormMetadata | null;
  readonly records?: readonly RuntimeRecordData[];
  readonly runtime?: ModuleRuntimeContext;
  readonly selectedRecordIds?: readonly string[];
  readonly subgrid: RelatedSubgridMetadata;
}) {
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<RuntimeRecordData | null>(
    null,
  );
  const [currentRecords, setCurrentRecords] = useState(
    filterRenderableRecords(records, subgrid),
  );
  const [currentSelectedRecordIds, setCurrentSelectedRecordIds] = useState<
    string[]
  >([...selectedRecordIds]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [genericMetadata, setGenericMetadata] =
    useState<GenericEntityMetadata | null>(null);
  const generatedQuickCreate = useMemo(
    () =>
      genericMetadata
        ? buildGenericQuickCreate(
            genericMetadata,
            parentBinding?.fieldLogicalName,
          )
        : subgrid.quickCreateFields?.length
          ? buildSubgridQuickCreate(subgrid)
          : null,
    [genericMetadata, parentBinding?.fieldLogicalName, subgrid],
  );
  const effectiveQuickCreateForm =
    quickCreateForm ?? generatedQuickCreate?.form ?? null;
  const effectiveRelatedEntity = generatedQuickCreate?.entity;
  const refreshRelatedRecords = useCallback(async () => {
    if (!runtime || !parentBinding || !dataAdapter?.getRelatedRecords) {
      return false;
    }

    try {
      const result = await dataAdapter.getRelatedRecords({
        parentRecordId: parentBinding.recordId,
        runtime,
        subgrid,
        parentLookupField: parentBinding.fieldLogicalName,
      });
      setCurrentRecords(filterRenderableRecords(result.records, subgrid));
      setCurrentSelectedRecordIds([]);
      setLoadError(null);
      return true;
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Unable to refresh related records.",
      );
      return false;
    }
  }, [dataAdapter, parentBinding, runtime, subgrid]);

  const columns = useMemo<DataTableColumn<RuntimeRecordData>[]>(
    () =>
      (subgrid.columns?.length
        ? subgrid.columns
        : [{ fieldLogicalName: "id", order: 10 }]
      )
        .filter((column) => !column.isHidden)
        .sort((left, right) => left.order - right.order)
        .map((column) => {
          const field =
            effectiveRelatedEntity?.fields.find(
              (candidate) => candidate.logicalName === column.fieldLogicalName,
            ) ??
            runtime?.metadata.entity.fields.find(
              (candidate) => candidate.logicalName === column.fieldLogicalName,
            );
          return {
            key: column.fieldLogicalName,
            entityField: column.fieldLogicalName,
            header:
              column.label ?? field?.displayName ?? column.fieldLogicalName,
            render: (row) =>
              formatRuntimeFieldValue({
                field,
                fieldLogicalName: column.fieldLogicalName,
                tenant: runtime?.tenant,
                value: row[column.fieldLogicalName],
              }),
            sortable: column.isSortable,
          };
        }),
    [effectiveRelatedEntity?.fields, runtime, subgrid.columns],
  );
  const canCreate =
    (subgrid.api
      ? Boolean(subgrid.api.createPath)
      : genericMetadata?.capabilities.create === true) &&
    hasRelatedPermission(runtime, subgrid.api?.permissions?.create);
  const canUpdate =
    (subgrid.api
      ? Boolean(subgrid.api.updatePath)
      : genericMetadata?.capabilities.update === true) &&
    hasRelatedPermission(runtime, subgrid.api?.permissions?.update);
  const canDelete =
    (subgrid.api
      ? Boolean(subgrid.api.deletePath)
      : genericMetadata?.capabilities.delete === true) &&
    hasRelatedPermission(runtime, subgrid.api?.permissions?.delete);
  const canOpenQuickCreate = Boolean(
    runtime &&
    effectiveQuickCreateForm &&
    dataAdapter?.createRelatedRecord &&
    canCreate,
  );
  const resolvedOnNew =
    onNew ??
    (canOpenQuickCreate
      ? () => {
          setEditingRecord(null);
          setQuickCreateOpen(true);
        }
      : undefined);
  const resolvedOnEdit =
    onEditSelected ??
    (runtime &&
    parentBinding &&
    effectiveQuickCreateForm &&
    dataAdapter?.updateRelatedRecord &&
    canUpdate
      ? () => {
          const record = currentRecords.find(
            (item) => String(item.id ?? "") === currentSelectedRecordIds[0],
          );
          if (!record) return;
          setEditingRecord(record);
          setQuickCreateOpen(true);
        }
      : undefined);
  const resolvedOnRefresh =
    onRefresh ??
    (runtime && parentBinding && dataAdapter?.getRelatedRecords
      ? refreshRelatedRecords
      : undefined);
  const resolvedOnDelete =
    onDeleteSelected ??
    (runtime && parentBinding && dataAdapter?.deleteRelatedRecord && canDelete
      ? async () => {
          if (!currentSelectedRecordIds.length) return;
          try {
            await dataAdapter.deleteRelatedRecord({
              parentRecordId: parentBinding.recordId,
              recordIds: currentSelectedRecordIds,
              runtime,
              subgrid,
              parentLookupField: parentBinding.fieldLogicalName,
            });
            const refreshed = await refreshRelatedRecords();
            if (!refreshed) {
              setCurrentRecords((items) =>
                items.filter(
                  (item) =>
                    !currentSelectedRecordIds.includes(String(item.id ?? "")),
                ),
              );
              setCurrentSelectedRecordIds([]);
            }
            setLoadError(null);
          } catch (error) {
            setLoadError(
              error instanceof Error
                ? error.message
                : "Unable to delete related records.",
            );
          }
        }
      : undefined);
  const actionItems: CommandBarItem[] = [
    ...(resolvedOnNew
      ? [{ key: "new", label: "New", icon: Plus, onClick: resolvedOnNew }]
      : []),
    ...(resolvedOnEdit
      ? [{ key: "edit", label: "Edit", icon: Edit, onClick: resolvedOnEdit }]
      : []),
    ...(resolvedOnDelete
      ? [
          {
            key: "delete",
            label: "Delete",
            icon: Trash2,
            danger: true,
            requiresSelection: true,
            onClick: resolvedOnDelete,
          },
        ]
      : []),
    ...(resolvedOnRefresh
      ? [
          {
            key: "refresh",
            label: "Refresh",
            icon: RefreshCw,
            onClick: resolvedOnRefresh,
          },
        ]
      : []),
  ];

  useEffect(() => {
    if (!runtime || !parentBinding || !dataAdapter?.getRelatedRecords) return;
    let active = true;

    void refreshRelatedRecords().then((ok) => {
      if (!active || ok) return;
    });

    return () => {
      active = false;
    };
  }, [dataAdapter, parentBinding, refreshRelatedRecords, runtime]);

  useEffect(() => {
    if (subgrid.api || !subgrid.relatedEntityLogicalName) return;
    let active = true;
    fetch(
      `/api/metadata/entities/${encodeURIComponent(subgrid.relatedEntityLogicalName)}`,
    )
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(body?.message ?? "Unable to load related metadata.");
        return body as GenericEntityMetadata;
      })
      .then((metadata) => {
        if (active) setGenericMetadata(metadata);
      })
      .catch((error: unknown) => {
        if (active)
          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to load related metadata.",
          );
      });
    return () => {
      active = false;
    };
  }, [subgrid.api, subgrid.relatedEntityLogicalName]);

  return (
    <>
      <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base font-semibold text-foreground">
            {subgrid.title}
          </h3>
          <CommandBar
            className="min-w-0 rounded-lg bg-transparent"
            items={actionItems}
            selectedCount={currentSelectedRecordIds.length}
            selectedIds={currentSelectedRecordIds}
            variant="list"
          />
        </div>

        <DataTable
          columns={columns}
          emptyState={
            <ModuleEmptyState
              description={
                subgrid.emptyStateDescription ??
                "No related records are available for this tab yet."
              }
              title={subgrid.emptyStateTitle ?? `No ${subgrid.title}`}
            />
          }
          enableSelection={Boolean(resolvedOnDelete || resolvedOnEdit)}
          enableSearch={false}
          getRowKey={(row) => String(row.id ?? "")}
          onSelectedRowKeysChange={setCurrentSelectedRecordIds}
          onRowClick={(row) => {
            const id = String(row.id ?? "");
            setCurrentSelectedRecordIds(id ? [id] : []);
            if (resolvedOnEdit && canUpdate) {
              setEditingRecord(row);
              setQuickCreateOpen(true);
            }
          }}
          rows={currentRecords}
          selectedRowKeys={currentSelectedRecordIds}
        />
        {loadError ? (
          <p className="mt-3 text-sm text-danger">{loadError}</p>
        ) : null}
      </section>
      {runtime ? (
        <ModuleQuickCreatePanel
          form={effectiveQuickCreateForm}
          entity={effectiveRelatedEntity}
          key={editingRecord ? String(editingRecord.id ?? "edit") : "new"}
          onClose={() => setQuickCreateOpen(false)}
          onSave={async (values, closeAfterSave) => {
            const editingRecordId = String(editingRecord?.id ?? "");
            const mutationValues = parentBinding
              ? omitRuntimeField(values, parentBinding.fieldLogicalName)
              : values;
            try {
              if (
                editingRecordId &&
                dataAdapter?.updateRelatedRecord &&
                parentBinding
              ) {
                const updatedRecord = await dataAdapter.updateRelatedRecord({
                  parentRecordId: parentBinding.recordId,
                  recordId: editingRecordId,
                  runtime,
                  subgrid,
                  parentLookupField: parentBinding.fieldLogicalName,
                  values: mutationValues,
                });
                const refreshed = await refreshRelatedRecords();
                if (!refreshed) {
                  setCurrentRecords((items) =>
                    items.map((item) =>
                      String(item.id ?? "") === editingRecordId
                        ? updatedRecord
                        : item,
                    ),
                  );
                }
              } else if (dataAdapter?.createRelatedRecord && parentBinding) {
                const createdRecord = await dataAdapter.createRelatedRecord({
                  parentRecordId: parentBinding.recordId,
                  runtime,
                  subgrid,
                  parentLookupField: parentBinding.fieldLogicalName,
                  values: mutationValues,
                });
                const refreshed = await refreshRelatedRecords();
                if (!refreshed) {
                  setCurrentRecords((items) => [...items, createdRecord]);
                }
              }
              setLoadError(null);
              if (closeAfterSave) setQuickCreateOpen(false);
            } catch (error) {
              setLoadError(
                error instanceof Error
                  ? error.message
                  : "Unable to save related record.",
              );
            }
          }}
          open={quickCreateOpen}
          parentBinding={parentBinding}
          record={editingRecord ?? {}}
          runtime={runtime}
          title={`${editingRecord ? "Edit" : "New"} ${subgrid.title}`}
          error={loadError}
        />
      ) : null}
    </>
  );
}

type GenericEntityMetadata = {
  logicalName: string;
  capabilities: { create: boolean; update: boolean; delete: boolean };
  fields: Record<
    string,
    {
      logicalName: string;
      displayName: string;
      type: string;
      required?: boolean;
      readOnly?: boolean;
      maxLength?: number | null;
    }
  >;
};

function buildGenericQuickCreate(
  metadata: GenericEntityMetadata,
  parentLookupField?: string,
): { entity: EntityMetadata; form: FormMetadata } {
  const fields = Object.values(metadata.fields).map((field) => ({
    id: `${metadata.logicalName}.${field.logicalName}`,
    logicalName: field.logicalName,
    displayName: field.displayName,
    version: "1.0.0",
    lifecycleState: "published" as const,
    layer: "unmanaged" as const,
    entityLogicalName: metadata.logicalName,
    dataType: mapCustomFieldType(field.type),
    requirementLevel: field.required
      ? ("required" as const)
      : ("none" as const),
    behavior: field.readOnly ? ("readonly" as const) : ("normal" as const),
    maxLength: field.maxLength ?? undefined,
  }));
  const editable = fields.filter(
    (field) =>
      field.logicalName !== parentLookupField && field.behavior !== "readonly",
  );
  const entity: EntityMetadata = {
    id: `entity:${metadata.logicalName}`,
    logicalName: metadata.logicalName,
    displayName: metadata.logicalName,
    collectionName: metadata.logicalName,
    version: "1.0.0",
    lifecycleState: "published",
    layer: "unmanaged",
    primaryIdField: "id",
    primaryNameField: editable[0]?.logicalName ?? "id",
    fields,
  };
  const form: FormMetadata = {
    id: `quick:${metadata.logicalName}`,
    logicalName: `${metadata.logicalName}.quickCreate`,
    displayName: `New ${metadata.logicalName}`,
    version: "1.0.0",
    lifecycleState: "published",
    layer: "unmanaged",
    entityLogicalName: metadata.logicalName,
    mode: "edit",
    formType: "quickCreate",
    columns: 1,
    sections: [
      {
        id: `quick:${metadata.logicalName}:section`,
        label: "Details",
        order: 10,
        layout: "single-column",
        columns: 1,
        fields: editable.map((field, index) => ({
          fieldLogicalName: field.logicalName,
          order: (index + 1) * 10,
          requirementLevel: field.requirementLevel,
        })),
      },
    ],
  };
  return { entity, form };
}

function buildSubgridQuickCreate(subgrid: RelatedSubgridMetadata): {
  entity: EntityMetadata;
  form: FormMetadata;
} {
  const fields = (subgrid.quickCreateFields ?? []).map((field) => ({
    id: `${subgrid.relatedEntityLogicalName}.${field.fieldLogicalName}`,
    logicalName: field.fieldLogicalName,
    displayName: field.label ?? field.fieldLogicalName,
    version: "1.0.0",
    lifecycleState: "published" as const,
    layer: "system" as const,
    entityLogicalName:
      subgrid.relatedEntityLogicalName ?? subgrid.relationshipName,
    dataType: field.dataType,
    requirementLevel: field.required
      ? ("required" as const)
      : ("none" as const),
    behavior: "normal" as const,
    maxLength: field.maxLength,
  }));
  const entityLogicalName =
    subgrid.relatedEntityLogicalName ?? subgrid.relationshipName;
  const entity: EntityMetadata = {
    id: `entity:${entityLogicalName}`,
    logicalName: entityLogicalName,
    displayName: subgrid.title,
    collectionName: entityLogicalName,
    version: "1.0.0",
    lifecycleState: "published",
    layer: "system",
    primaryIdField: "id",
    primaryNameField: fields[0]?.logicalName ?? "id",
    fields,
  };
  const form: FormMetadata = {
    id: `quick:${entityLogicalName}`,
    logicalName: `${entityLogicalName}.quickCreate`,
    displayName: `New ${subgrid.title}`,
    version: "1.0.0",
    lifecycleState: "published",
    layer: "system",
    entityLogicalName,
    mode: "edit",
    formType: "quickCreate",
    columns: 1,
    sections: [
      {
        id: `quick:${entityLogicalName}:section`,
        label: "Details",
        order: 10,
        layout: "single-column",
        columns: 1,
        fields: fields.map((field, index) => ({
          fieldLogicalName: field.logicalName,
          order: (index + 1) * 10,
          requirementLevel: field.requirementLevel,
        })),
      },
    ],
  };

  return { entity, form };
}

function hasRelatedPermission(
  runtime: ModuleRuntimeContext | undefined,
  permissionKey: string | undefined,
) {
  if (!permissionKey) return true;
  return Boolean(
    runtime?.security.principal.permissionKeys.includes(permissionKey),
  );
}

function omitRuntimeField(record: RuntimeRecordData, fieldLogicalName: string) {
  const { [fieldLogicalName]: _omitted, ...rest } = record;
  void _omitted;
  return rest;
}

function filterRenderableRecords(
  records: readonly RuntimeRecordData[],
  subgrid: RelatedSubgridMetadata,
) {
  const visibleFieldNames = (subgrid.columns ?? [])
    .filter((column) => !column.isHidden)
    .map((column) => column.fieldLogicalName);

  return records.filter((record) => {
    if (!record || typeof record !== "object") return false;

    const valuesToCheck = visibleFieldNames.length
      ? visibleFieldNames.map((fieldName) => record[fieldName])
      : Object.values(record);

    return valuesToCheck.some(hasRenderableValue);
  });
}

function hasRenderableValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function mapCustomFieldType(value: string): FieldDataType {
  const types: Record<string, FieldDataType> = {
    text: "string",
    textarea: "multiline-string",
    number: "number",
    decimal: "decimal",
    date: "date",
    datetime: "datetime",
    boolean: "boolean",
    select: "optionset",
    multiselect: "multi-optionset",
    lookup: "lookup",
    email: "email",
    phone: "phone",
    url: "url",
    currency: "currency",
  };
  return types[value] ?? "string";
}
