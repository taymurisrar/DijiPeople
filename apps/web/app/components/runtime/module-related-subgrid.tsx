"use client";

import { Edit, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import type {
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
  disabledReason = "Related records are not wired to a data adapter yet.",
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
  readonly disabledReason?: string;
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
  const [currentRecords, setCurrentRecords] = useState([...records]);
  const [currentSelectedRecordIds, setCurrentSelectedRecordIds] = useState<
    string[]
  >([...selectedRecordIds]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const columns = useMemo<DataTableColumn<RuntimeRecordData>[]>(
    () =>
      (subgrid.columns?.length
        ? subgrid.columns
        : [{ fieldLogicalName: "id", order: 10 }]
      )
        .filter((column) => !column.isHidden)
        .sort((left, right) => left.order - right.order)
        .map((column) => {
          const field = runtime?.metadata.entity.fields.find(
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
    [runtime, subgrid.columns],
  );
  const canOpenQuickCreate = Boolean(
    runtime && quickCreateForm && dataAdapter?.createRelatedRecord,
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
    quickCreateForm &&
    dataAdapter?.updateRelatedRecord
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
      ? async () => {
          const result = await dataAdapter.getRelatedRecords({
            parentRecordId: parentBinding.recordId,
            runtime,
            subgrid,
          });
          setCurrentRecords([...result.records]);
          setCurrentSelectedRecordIds([]);
        }
      : undefined);
  const resolvedOnDelete =
    onDeleteSelected ??
    (runtime && parentBinding && dataAdapter?.deleteRelatedRecord
      ? async () => {
          if (!currentSelectedRecordIds.length) return;
          await dataAdapter.deleteRelatedRecord({
            parentRecordId: parentBinding.recordId,
            recordIds: currentSelectedRecordIds,
            runtime,
            subgrid,
          });
          setCurrentRecords((items) =>
            items.filter(
              (item) =>
                !currentSelectedRecordIds.includes(String(item.id ?? "")),
            ),
          );
          setCurrentSelectedRecordIds([]);
        }
      : undefined);

  useEffect(() => {
    if (!runtime || !parentBinding || !dataAdapter?.getRelatedRecords) return;
    let active = true;

    dataAdapter
      .getRelatedRecords({
        parentRecordId: parentBinding.recordId,
        runtime,
        subgrid,
      })
      .then((result) => {
        if (!active) return;
        setCurrentRecords([...result.records]);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(
          error instanceof Error
            ? error.message
            : "Unable to load related records.",
        );
      });

    return () => {
      active = false;
    };
  }, [dataAdapter, parentBinding, runtime, subgrid]);

  return (
    <>
      <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base font-semibold text-foreground">
            {subgrid.title}
          </h3>
          <div className="flex flex-wrap gap-1">
            <SubgridAction
              disabled={!resolvedOnNew}
              icon={<Plus className="h-4 w-4" />}
              label="New"
              onClick={resolvedOnNew}
              title={
                resolvedOnNew
                  ? "New related record"
                  : "Quick Create is unavailable until related metadata and adapter support are connected."
              }
            />
            <SubgridAction
              disabled={
                !resolvedOnEdit || currentSelectedRecordIds.length !== 1
              }
              icon={<Edit className="h-4 w-4" />}
              label="Edit"
              onClick={resolvedOnEdit}
              title={
                resolvedOnEdit ? "Edit selected related record" : disabledReason
              }
            />
            <SubgridAction
              disabled={
                !resolvedOnDelete || currentSelectedRecordIds.length === 0
              }
              icon={<Trash2 className="h-4 w-4" />}
              label="Delete"
              onClick={resolvedOnDelete}
              title={
                resolvedOnDelete
                  ? "Soft delete selected related records"
                  : disabledReason
              }
            />
            <SubgridAction
              disabled={!resolvedOnRefresh}
              icon={<RefreshCw className="h-4 w-4" />}
              label="Refresh"
              onClick={resolvedOnRefresh}
              title={
                resolvedOnRefresh ? "Refresh related list" : disabledReason
              }
            />
          </div>
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
          enableSelection={Boolean(dataAdapter?.deleteRelatedRecord)}
          enableSearch={false}
          getRowKey={(row) => String(row.id ?? "")}
          onSelectedRowKeysChange={setCurrentSelectedRecordIds}
          rows={currentRecords}
          selectedRowKeys={currentSelectedRecordIds}
        />
        {loadError ? (
          <p className="mt-3 text-sm text-danger">{loadError}</p>
        ) : null}
      </section>
      {runtime ? (
        <ModuleQuickCreatePanel
          form={quickCreateForm ?? null}
          key={editingRecord ? String(editingRecord.id ?? "edit") : "new"}
          onClose={() => setQuickCreateOpen(false)}
          onSave={(values, closeAfterSave) => {
            const editingRecordId = String(editingRecord?.id ?? "");

            if (
              editingRecordId &&
              dataAdapter?.updateRelatedRecord &&
              parentBinding
            ) {
              void dataAdapter
                .updateRelatedRecord({
                  parentRecordId: parentBinding.recordId,
                  recordId: editingRecordId,
                  runtime,
                  subgrid,
                  values,
                })
                .then((updatedRecord) => {
                  setCurrentRecords((items) =>
                    items.map((item) =>
                      String(item.id ?? "") === editingRecordId
                        ? updatedRecord
                        : item,
                    ),
                  );
                });
            } else if (dataAdapter?.createRelatedRecord && parentBinding) {
              void dataAdapter
                .createRelatedRecord({
                  parentRecordId: parentBinding.recordId,
                  runtime,
                  subgrid,
                  values,
                })
                .then((createdRecord) => {
                  setCurrentRecords((items) => [...items, createdRecord]);
                });
            }
            if (closeAfterSave) setQuickCreateOpen(false);
          }}
          open={quickCreateOpen}
          parentBinding={parentBinding}
          record={editingRecord ?? {}}
          runtime={runtime}
          title={`${editingRecord ? "Edit" : "New"} ${subgrid.title}`}
        />
      ) : null}
    </>
  );
}

function SubgridAction({
  disabled,
  icon,
  label,
  onClick,
  title,
}: {
  readonly disabled: boolean;
  readonly icon: ReactNode;
  readonly label: string;
  readonly onClick?: () => void;
  readonly title: string;
}) {
  return (
    <button
      className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-foreground transition hover:bg-muted/20 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled}
      onClick={onClick}
      title={title}
      type="button"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
