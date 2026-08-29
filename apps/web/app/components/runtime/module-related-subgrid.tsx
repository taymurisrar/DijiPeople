"use client";

import { Download, Edit, Eye, Link2Off, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DocumentUploadForm } from "@/app/(authenticated)/_components/documents/document-upload-form";
import type { SharedLookupOption } from "@/app/(authenticated)/_components/documents/types";
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
import { humanizeFieldKey, singularize } from "@/lib/text/inflection";
import { useDialogBehavior } from "@/app/components/ui/dialog";

export function ModuleRelatedSubgrid({
  dataAdapter,
  onEditSelected,
  onNew,
  onRefresh,
  onDeleteSelected,
  parentBinding,
  parentRecord,
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
  readonly parentRecord?: RuntimeRecordData;
  readonly quickCreateForm?: FormMetadata | null;
  readonly records?: readonly RuntimeRecordData[];
  readonly runtime?: ModuleRuntimeContext;
  readonly selectedRecordIds?: readonly string[];
  readonly subgrid: RelatedSubgridMetadata;
}) {
  const router = useRouter();
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [assignmentOptions, setAssignmentOptions] = useState<
    AssignmentOption[]
  >([]);
  const [assignmentSelectedValues, setAssignmentSelectedValues] = useState<
    string[]
  >([]);
  const [assignmentExtraValues, setAssignmentExtraValues] = useState<
    Record<string, unknown>
  >({});
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
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
  const [rowActionBusyId, setRowActionBusyId] = useState<string | null>(null);
  const [documentUploadOpen, setDocumentUploadOpen] = useState(false);
  const [documentEditRecord, setDocumentEditRecord] =
    useState<RuntimeRecordData | null>(null);
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
          ? buildSubgridQuickCreate(subgrid, runtime?.metadata.entity)
          : null,
    [genericMetadata, parentBinding?.fieldLogicalName, runtime, subgrid],
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

  const openRecord = useCallback(
    (row: RuntimeRecordData) => {
      const id = String(row.id ?? "");
      const routeBase =
        subgrid.relatedEntityLogicalName === "payslip" &&
        hasRelatedPermission(runtime, "payslips.read-own") &&
        !hasRelatedPermission(runtime, "payslips.read-all")
          ? "/me/payslips"
          : subgrid.routeBase;
      if (!id || !routeBase) return;
      router.push(`${routeBase}/${encodeURIComponent(id)}`);
    },
    [router, runtime, subgrid.relatedEntityLogicalName, subgrid.routeBase],
  );
  const canOpenRecord = Boolean(subgrid.routeBase);
  const isEmployeeDocumentsSubgrid =
    subgrid.relationshipName === "employee_documents" &&
    Boolean(parentBinding?.recordId);
  const canUploadEmployeeDocuments = isEmployeeDocumentsSubgrid;
  const canManageEmployeeDocuments = isEmployeeDocumentsSubgrid;
  const canVerifyBankAccounts =
    subgrid.relatedEntityLogicalName === "employee-bank-accounts" &&
    hasRelatedPermission(runtime, "employee-bank-accounts.verify");
  const canDownloadPayslips = subgrid.relatedEntityLogicalName === "payslip";
  const ownPayslipDownloadOnly =
    canDownloadPayslips &&
    hasRelatedPermission(runtime, "payslips.read-own") &&
    !hasRelatedPermission(runtime, "payslips.read-all");
  const verifyBankAccount = useCallback(
    async (row: RuntimeRecordData) => {
      const id = String(row.id ?? "");
      if (!id) return;
      setRowActionBusyId(id);
      setLoadError(null);
      try {
        const response = await fetch(
          `/api/employee-bank-accounts/${encodeURIComponent(id)}/verify`,
          {
            body: JSON.stringify({ verificationStatus: "VERIFIED" }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          },
        );
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            message?: string;
          } | null;
          throw new Error(body?.message ?? "Unable to verify bank account.");
        }
        await refreshRelatedRecords();
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Unable to verify bank account.",
        );
      } finally {
        setRowActionBusyId(null);
      }
    },
    [refreshRelatedRecords],
  );

  const deleteEmployeeDocument = useCallback(
    async (row: RuntimeRecordData) => {
      const id = String(row.id ?? "");
      if (!id || !parentBinding?.recordId) return;
      if (!window.confirm("Delete this document?")) return;
      setRowActionBusyId(id);
      setLoadError(null);
      try {
        const deleteUrl = resolveSubgridApiPath(
          subgrid.api?.deletePath,
          parentBinding.recordId,
          id,
        );
        if (!deleteUrl) throw new Error("Document delete route is unavailable.");
        const response = await fetch(deleteUrl, { method: "DELETE" });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            message?: string;
          } | null;
          throw new Error(body?.message ?? "Unable to delete document.");
        }
        const refreshed = await refreshRelatedRecords();
        if (!refreshed) {
          setCurrentRecords((items) =>
            items.filter((item) => String(item.id ?? "") !== id),
          );
        }
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Unable to delete document.",
        );
      } finally {
        setRowActionBusyId(null);
      }
    },
    [parentBinding, refreshRelatedRecords, subgrid.api],
  );

  const columns = useMemo<DataTableColumn<RuntimeRecordData>[]>(() => {
    const dataColumns: DataTableColumn<RuntimeRecordData>[] = (
      subgrid.columns?.length
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
          /*
           * BUG-2009 — the final fallback was the raw field key, so the
           * Attendance tab on an employee record was headed `attendanceDate`,
           * `attendanceStatus`, `checkInAt`, `checkOutAt` while the standalone
           * `/attendance` list over the same data was headed properly. A
           * declared label and the entity's display name still win; this only
           * replaces printing the column of a database table at the reader.
           */
          header:
            column.label ??
            field?.displayName ??
            humanizeFieldKey(column.fieldLogicalName),
          render: (row: RuntimeRecordData) =>
            formatRuntimeFieldValue({
              field,
              fieldLogicalName: column.fieldLogicalName,
              lookupDisplayValue: resolveRelatedLookupDisplayValue(
                field,
                column.fieldLogicalName,
                row,
              ),
              tenant: runtime?.tenant,
              value: row[column.fieldLogicalName],
            }),
          sortable: column.isSortable,
        };
      });

    if (
      !canOpenRecord &&
      !canVerifyBankAccounts &&
      !canDownloadPayslips &&
      !canManageEmployeeDocuments
    ) {
      return dataColumns;
    }

    return [
      ...dataColumns,
      {
        key: "__actions",
        header: "Actions",
        cellClassName: "whitespace-nowrap text-right",
        render: (row) => {
          const id = String(row.id ?? "");
          const canVerifyRow =
            canVerifyBankAccounts &&
            row.isActive === true &&
            row.verificationStatus !== "VERIFIED";
          const viewPath =
            typeof row.viewPath === "string" ? row.viewPath : undefined;
          const downloadPath =
            typeof row.downloadPath === "string"
              ? row.downloadPath
              : undefined;
          return (
            <div className="flex justify-end gap-2">
              {canManageEmployeeDocuments && viewPath ? (
                <a
                  aria-label="View document"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground hover:border-accent/30 hover:text-accent"
                  href={viewPath}
                  onClick={(event) => event.stopPropagation()}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Eye className="h-4 w-4" />
                </a>
              ) : null}
              {canManageEmployeeDocuments && downloadPath ? (
                <a
                  aria-label="Download document"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground hover:border-accent/30 hover:text-accent"
                  href={downloadPath}
                  onClick={(event) => event.stopPropagation()}
                >
                  <Download className="h-4 w-4" />
                </a>
              ) : null}
              {canManageEmployeeDocuments && id ? (
                <button
                  aria-label="Edit document"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground hover:border-accent/30 hover:text-accent"
                  onClick={(event) => {
                    event.stopPropagation();
                    setDocumentEditRecord(row);
                  }}
                  type="button"
                >
                  <Edit className="h-4 w-4" />
                </button>
              ) : null}
              {canManageEmployeeDocuments && id ? (
                <button
                  aria-label="Delete document"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-danger/30 text-danger hover:bg-danger/5"
                  disabled={rowActionBusyId === id}
                  onClick={(event) => {
                    event.stopPropagation();
                    void deleteEmployeeDocument(row);
                  }}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
              {canOpenRecord ? (
                <button
                  className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:border-accent/30 hover:text-accent"
                  onClick={(event) => {
                    event.stopPropagation();
                    openRecord(row);
                  }}
                  type="button"
                >
                  Open
                </button>
              ) : null}
              {canDownloadPayslips && id ? (
                <a
                  className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:border-accent/30 hover:text-accent"
                  href={`${
                    ownPayslipDownloadOnly ? "/api/me/payslips" : "/api/payslips"
                  }/${encodeURIComponent(id)}/download`}
                  onClick={(event) => event.stopPropagation()}
                >
                  Download PDF
                </a>
              ) : null}
              {canVerifyRow ? (
                <button
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                  disabled={rowActionBusyId === id}
                  onClick={(event) => {
                    event.stopPropagation();
                    void verifyBankAccount(row);
                  }}
                  type="button"
                >
                  {rowActionBusyId === id ? "Verifying" : "Verify"}
                </button>
              ) : null}
            </div>
          );
        },
      },
    ];
  }, [
    canOpenRecord,
    canDownloadPayslips,
    canManageEmployeeDocuments,
    canVerifyBankAccounts,
    deleteEmployeeDocument,
    effectiveRelatedEntity?.fields,
    openRecord,
    ownPayslipDownloadOnly,
    rowActionBusyId,
    runtime,
    subgrid.columns,
    verifyBankAccount,
  ]);
  const canCreate =
    (subgrid.api
      ? Boolean(subgrid.api.createPath)
      : genericMetadata?.capabilities.create === true) ||
    canUploadEmployeeDocuments;
  const canUpdate =
    canManageEmployeeDocuments ||
    ((subgrid.api
      ? Boolean(subgrid.api.updatePath)
      : genericMetadata?.capabilities.update === true) &&
      hasRelatedPermission(runtime, subgrid.api?.permissions?.update));
  const canDelete =
    canManageEmployeeDocuments ||
    ((subgrid.api
      ? Boolean(subgrid.api.deletePath)
      : genericMetadata?.capabilities.delete === true) &&
      hasRelatedPermission(runtime, subgrid.api?.permissions?.delete));
  const isAssignmentSubgrid = Boolean(subgrid.assignment);
  const canAssign = Boolean(
    isAssignmentSubgrid &&
    runtime &&
    dataAdapter?.createRelatedRecord &&
    canCreate,
  );
  const canOpenQuickCreate = Boolean(
    runtime &&
    !isAssignmentSubgrid &&
    effectiveQuickCreateForm &&
    dataAdapter?.createRelatedRecord &&
    canCreate,
  );
  const createActionLabel = isAssignmentSubgrid ? "Assign" : "New";
  const removeActionLabel = isAssignmentSubgrid ? "Remove" : "Delete";
  const openAssignmentPanel = useCallback(() => {
    const assignment = subgrid.assignment;
    const extraBooleanField = assignment?.extraBooleanField;
    const extraFields = assignment?.extraFields ?? [];
      setAssignmentSelectedValues([]);
      setAssignmentError(null);
      setAssignmentLoading(true);
    setAssignmentExtraValues(
      Object.fromEntries([
        ...(extraBooleanField
          ? [
              [
                extraBooleanField.fieldLogicalName,
                extraBooleanField.defaultValue ?? false,
              ] as const,
            ]
          : []),
        ...extraFields.map(
          (field) =>
            [
              field.fieldLogicalName,
              field.defaultValue ?? (field.dataType === "boolean" ? false : ""),
            ] as const,
        ),
      ]),
    );
    setAssignmentOpen(true);
  }, [subgrid.assignment]);
  const resolvedOnNew =
    onNew ??
    (canUploadEmployeeDocuments
      ? () => setDocumentUploadOpen(true)
      : canAssign
      ? openAssignmentPanel
      : canOpenQuickCreate
        ? () => {
            setEditingRecord(null);
            setQuickCreateOpen(true);
          }
        : undefined);
  const resolvedOnEdit =
    onEditSelected ??
    (canManageEmployeeDocuments
      ? () => {
          const record = currentRecords.find(
            (item) => String(item.id ?? "") === currentSelectedRecordIds[0],
          );
          if (!record) return;
          setDocumentEditRecord(record);
        }
      : runtime &&
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
                : isAssignmentSubgrid
                  ? "Unable to remove related records."
                  : "Unable to delete related records.",
            );
          }
        }
      : undefined);
  const actionItems: CommandBarItem[] = [
    ...(resolvedOnNew
      ? [
          {
            key: "new",
            label: createActionLabel,
            icon: Plus,
            onClick: resolvedOnNew,
          },
        ]
      : []),
    ...(resolvedOnEdit
      ? [{ key: "edit", label: "Edit", icon: Edit, onClick: resolvedOnEdit }]
      : []),
    ...(resolvedOnDelete
      ? [
          {
            key: "delete",
            label: removeActionLabel,
            icon: Link2Off,
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
    const timer = window.setTimeout(() => {
      void refreshRelatedRecords().then((ok) => {
        if (!active || ok) return;
      });
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
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

  useEffect(() => {
    const assignment = subgrid.assignment;
    if (!assignmentOpen || !assignment) return;
    let active = true;

    fetch(assignment.optionsPath)
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            body?.message ?? "Unable to load assignable records.",
          );
        }
        return normalizeAssignmentOptions(body, assignment);
      })
      .then((options) => {
        if (active) setAssignmentOptions(options);
      })
      .catch((error: unknown) => {
        if (active) {
          setAssignmentError(
            error instanceof Error
              ? error.message
              : "Unable to load assignable records.",
          );
        }
      })
      .finally(() => {
        if (active) setAssignmentLoading(false);
      });

    return () => {
      active = false;
    };
  }, [assignmentOpen, subgrid.assignment]);

  const availableAssignmentOptions = useMemo(() => {
    const assignment = subgrid.assignment;
    if (!assignment) return assignmentOptions;
    const assignedValueField =
      assignment.assignedValueField ?? assignment.lookupFieldLogicalName;
    const assignedValues = new Set(
      currentRecords
        .map((record) => record[assignedValueField])
        .filter((value) => value !== null && value !== undefined)
        .map((value) => String(value)),
    );

    return assignmentOptions.filter(
      (option) => !assignedValues.has(option.value),
    );
  }, [assignmentOptions, currentRecords, subgrid.assignment]);

  async function saveAssignments(closeAfterSave: boolean) {
    const assignment = subgrid.assignment;
    if (!assignment || !runtime || !dataAdapter?.createRelatedRecord) {
      return;
    }
    if (!parentBinding) {
      setAssignmentError("Save the project before assigning employees.");
      return;
    }
    if (!assignmentSelectedValues.length) {
      setAssignmentError("Select at least one record to assign.");
      return;
    }
    const validationError = validateAssignmentExtraFields(
      assignment,
      assignmentExtraValues,
    );
    if (validationError) {
      setAssignmentError(validationError);
      return;
    }

    setAssignmentSaving(true);
    setAssignmentError(null);
    try {
      for (const selectedValue of assignmentSelectedValues) {
        const values = withAssignmentParentDefaults(
          subgrid.relatedEntityLogicalName,
          assignmentExtraValues,
          parentRecord,
        );
        await dataAdapter.createRelatedRecord({
          parentRecordId: parentBinding.recordId,
          runtime,
          subgrid,
          parentLookupField: parentBinding.fieldLogicalName,
          values: {
            [assignment.lookupFieldLogicalName]: selectedValue,
            ...values,
          },
        });
      }
      await refreshRelatedRecords();
      setAssignmentSelectedValues([]);
      if (closeAfterSave) setAssignmentOpen(false);
    } catch (error) {
      setAssignmentError(
        error instanceof Error ? error.message : "Unable to assign records.",
      );
    } finally {
      setAssignmentSaving(false);
    }
  }

  return (
    <>
      <section className="w-full min-w-0 overflow-hidden rounded-lg border border-border bg-surface p-5 shadow-sm">
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
            if (canManageEmployeeDocuments) {
              setDocumentEditRecord(row);
              return;
            }
            if (resolvedOnEdit && canUpdate) {
              setEditingRecord(row);
              setQuickCreateOpen(true);
              return;
            }
            openRecord(row);
          }}
          rows={currentRecords}
          selectedRowKeys={currentSelectedRecordIds}
          pagination={
            currentRecords.length > 0
              ? {
                  page: 1,
                  pageSize: subgrid.pageSize ?? 5,
                  totalItems: currentRecords.length,
                  pageSizeOptions: [5, 10, 25],
                }
              : undefined
          }
        />
        {loadError ? (
          <p className="mt-3 text-sm text-danger">{loadError}</p>
        ) : null}
      </section>
      {runtime ? (
        <ModuleQuickCreatePanel
          contextValues={parentRecord}
          dataAdapter={dataAdapter}
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
      {documentUploadOpen && parentBinding ? (
        <EmployeeDocumentUploadPanel
          employeeId={parentBinding.recordId}
          uploadUrl={
            resolveSubgridApiPath(
              subgrid.api?.createPath,
              parentBinding.recordId,
            ) ?? ""
          }
          onClose={() => setDocumentUploadOpen(false)}
          onUploaded={async () => {
            await refreshRelatedRecords();
            setDocumentUploadOpen(false);
          }}
        />
      ) : null}
      {documentEditRecord && parentBinding ? (
        <EmployeeDocumentEditPanel
          document={documentEditRecord}
          updateUrl={
            resolveSubgridApiPath(
              subgrid.api?.updatePath,
              parentBinding.recordId,
              String(documentEditRecord.id ?? ""),
            ) ?? ""
          }
          onClose={() => setDocumentEditRecord(null)}
          onUpdated={async () => {
            await refreshRelatedRecords();
            setDocumentEditRecord(null);
          }}
        />
      ) : null}
      {subgrid.assignment ? (
        <AssignmentPanel
          error={assignmentError}
          extraValues={assignmentExtraValues}
          loading={assignmentLoading}
          onClose={() => setAssignmentOpen(false)}
          onSave={saveAssignments}
          onSelectedValuesChange={setAssignmentSelectedValues}
          onExtraValueChange={(fieldLogicalName, value) =>
            setAssignmentExtraValues((current) => ({
              ...current,
              [fieldLogicalName]: value,
            }))
          }
          open={assignmentOpen}
          options={availableAssignmentOptions}
          saving={assignmentSaving}
          selectedValues={assignmentSelectedValues}
          subgrid={subgrid}
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

type AssignmentOption = {
  value: string;
  label: string;
  description?: string | null;
  meta: readonly string[];
};

function AssignmentPanel({
  error,
  extraValues,
  loading,
  onClose,
  onExtraValueChange,
  onSave,
  onSelectedValuesChange,
  open,
  options,
  saving,
  selectedValues,
  subgrid,
}: {
  readonly error?: string | null;
  readonly extraValues: Readonly<Record<string, unknown>>;
  readonly loading: boolean;
  readonly onClose: () => void;
  readonly onExtraValueChange: (
    fieldLogicalName: string,
    value: unknown,
  ) => void;
  readonly onSave: (closeAfterSave: boolean) => void | Promise<void>;
  readonly onSelectedValuesChange: (values: string[]) => void;
  readonly open: boolean;
  readonly options: readonly AssignmentOption[];
  readonly saving: boolean;
  readonly selectedValues: readonly string[];
  readonly subgrid: RelatedSubgridMetadata;
}) {
  const assignment = subgrid.assignment;

  // BUG-0043: kept its own layout, gained the guarantees it never had - focus
  // containment, Escape, focus restore and dialog semantics. Called before the
  // early return: hooks run in the same order on every render, closed or open.
  const dialog = useDialogBehavior({ open, onClose });

  if (!open || !assignment) return null;

  const selectedSet = new Set(selectedValues);
  const allSelected =
    options.length > 0 &&
    options.every((option) => selectedSet.has(option.value));

  function toggleValue(value: string) {
    if (selectedSet.has(value)) {
      onSelectedValuesChange(selectedValues.filter((item) => item !== value));
      return;
    }
    onSelectedValuesChange([...selectedValues, value]);
  }

  function toggleAll() {
    if (allSelected) {
      onSelectedValuesChange([]);
      return;
    }
    onSelectedValuesChange(options.map((option) => option.value));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/35"
      {...dialog.backdropProps}
    >
      <div
        {...dialog.panelProps}
        className="flex h-full w-full max-w-2xl flex-col bg-surface shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div>
            <h2
              className="text-xl font-semibold text-foreground"
              id={dialog.titleId}
            >
              {assignment.title ?? `Assign ${subgrid.title}`}
            </h2>
            <p className="mt-1 text-sm text-muted">
              Select one or more employees and apply the same allocation,
              billing, and approval details in one go.
            </p>
          </div>
          <button
            aria-label="Close"
            className="rounded-lg px-2 py-1 text-xl text-muted transition hover:bg-surface-strong hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            x
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {assignment.extraBooleanField ? (
            <label className="mb-4 flex items-center gap-3 rounded-lg border border-border bg-surface-strong px-4 py-3 text-sm text-foreground">
              <input
                checked={Boolean(
                  extraValues[assignment.extraBooleanField.fieldLogicalName] ??
                  false,
                )}
                className="h-4 w-4 rounded border-border"
                onChange={(event) =>
                  onExtraValueChange(
                    assignment.extraBooleanField?.fieldLogicalName ?? "",
                    event.target.checked,
                  )
                }
                type="checkbox"
              />
              {assignment.extraBooleanField.label}
            </label>
          ) : null}

          {assignment.extraFields?.length ? (
            <div className="mb-4 grid gap-4 rounded-lg border border-border bg-surface-strong p-4 sm:grid-cols-2">
              {assignment.extraFields.map((field) => (
                <AssignmentExtraFieldControl
                  field={field}
                  key={field.fieldLogicalName}
                  onChange={(value) =>
                    onExtraValueChange(field.fieldLogicalName, value)
                  }
                  value={extraValues[field.fieldLogicalName]}
                />
              ))}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border bg-surface-strong px-4 py-3">
              <label className="flex items-center gap-3 text-sm font-medium text-foreground">
                <input
                  checked={allSelected}
                  className="h-4 w-4 rounded border-border"
                  disabled={!options.length || loading}
                  onChange={toggleAll}
                  type="checkbox"
                />
                Available records
              </label>
              <span className="text-xs text-muted">
                {selectedValues.length} selected
              </span>
            </div>

            <div className="max-h-[520px] divide-y divide-border overflow-y-auto">
              {loading ? (
                <p className="px-4 py-8 text-center text-sm text-muted">
                  Loading records...
                </p>
              ) : options.length ? (
                options.map((option) => {
                  const checked = selectedSet.has(option.value);
                  return (
                    <label
                      className="flex cursor-pointer items-start gap-3 px-4 py-3 transition hover:bg-accent-soft/25"
                      key={option.value}
                    >
                      <input
                        checked={checked}
                        className="mt-1 h-4 w-4 rounded border-border"
                        onChange={() => toggleValue(option.value)}
                        type="checkbox"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-foreground">
                          {option.label}
                        </span>
                        {option.description ? (
                          <span className="mt-1 block text-sm text-muted">
                            {option.description}
                          </span>
                        ) : null}
                        {option.meta.length ? (
                          <span className="mt-2 flex flex-wrap gap-2">
                            {option.meta.map((item) => (
                              <span
                                className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-foreground"
                                key={`${option.value}:${item}`}
                              >
                                {item}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })
              ) : (
                <p className="px-4 py-8 text-center text-sm text-muted">
                  No available records to assign.
                </p>
              )}
            </div>
          </div>

          {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-surface-strong"
            disabled={saving}
            onClick={() => void onSave(false)}
            type="button"
          >
            Save
          </button>
          <button
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-strong disabled:opacity-60"
            disabled={saving}
            onClick={() => void onSave(true)}
            type="button"
          >
            {saving ? "Saving..." : "Save & Close"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignmentExtraFieldControl({
  field,
  onChange,
  value,
}: {
  readonly field: NonNullable<
    NonNullable<RelatedSubgridMetadata["assignment"]>["extraFields"]
  >[number];
  readonly onChange: (value: unknown) => void;
  readonly value: unknown;
}) {
  const label = `${field.label}${field.required ? " *" : ""}`;
  const stringValue =
    value === null || value === undefined ? "" : String(value);

  if (field.dataType === "boolean") {
    return (
      <label className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-foreground">
        <input
          checked={Boolean(value)}
          className="h-4 w-4 rounded border-border"
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        {label}
      </label>
    );
  }

  if (field.dataType === "optionset") {
    return (
      <label className="block text-sm font-medium text-foreground">
        <span>{label}</span>
        <select
          className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent"
          onChange={(event) => onChange(event.target.value)}
          value={stringValue}
        >
          <option value="">Select an option</option>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.dataType === "multiline-string") {
    return (
      <label className="block text-sm font-medium text-foreground sm:col-span-2">
        <span>{label}</span>
        <textarea
          className="mt-2 min-h-24 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent"
          maxLength={field.maxLength}
          onChange={(event) => onChange(event.target.value)}
          value={stringValue}
        />
      </label>
    );
  }

  const inputType =
    field.dataType === "date"
      ? "date"
      : field.dataType === "number" ||
          field.dataType === "decimal" ||
          field.dataType === "currency"
        ? "number"
        : "text";

  return (
    <label className="block text-sm font-medium text-foreground">
      <span>{label}</span>
      <input
        className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent"
        maxLength={field.maxLength}
        onChange={(event) => onChange(event.target.value)}
        step={
          field.dataType === "decimal" || field.dataType === "currency"
            ? "0.01"
            : undefined
        }
        type={inputType}
        value={stringValue}
      />
    </label>
  );
}

function validateAssignmentExtraFields(
  assignment: NonNullable<RelatedSubgridMetadata["assignment"]>,
  values: Readonly<Record<string, unknown>>,
) {
  for (const field of assignment.extraFields ?? []) {
    const value = values[field.fieldLogicalName];
    if (
      field.required &&
      (value === null || value === undefined || String(value).trim() === "")
    ) {
      return `${field.label} is required.`;
    }
  }

  const allocationType = String(values.allocationType ?? "");
  if (
    allocationType === "PERCENTAGE" &&
    !String(values.allocationPercent ?? "").trim()
  ) {
    return "Allocation % is required for percentage allocation.";
  }
  if (
    allocationType === "HOURS" &&
    !String(values.allocationHours ?? "").trim()
  ) {
    return "Allocation hours are required for hourly allocation.";
  }
  if (
    values.billableFlag === true &&
    !String(values.billingRateAmount ?? "").trim()
  ) {
    return "Billing rate per hour is required for billable assignments.";
  }

  return null;
}

function withAssignmentParentDefaults(
  relatedEntityLogicalName: string | undefined,
  values: Readonly<Record<string, unknown>>,
  parentRecord?: RuntimeRecordData,
) {
  if (relatedEntityLogicalName !== "projectAssignment") return values;
  const parentCurrencyCode = parentRecord?.currencyCode;
  if (
    values.currencyCode !== undefined ||
    typeof parentCurrencyCode !== "string" ||
    !parentCurrencyCode.trim()
  ) {
    return values;
  }

  return {
    ...values,
    currencyCode: parentCurrencyCode,
  };
}

function normalizeAssignmentOptions(
  body: unknown,
  assignment: NonNullable<RelatedSubgridMetadata["assignment"]>,
): AssignmentOption[] {
  const rows = extractRecords(body);
  const valueField = assignment.optionValueField ?? "id";
  const labelField = assignment.optionLabelField ?? "name";
  const descriptionField = assignment.optionDescriptionField ?? "description";
  const metaFields = assignment.optionMetaFields ?? [];

  return rows.flatMap((row) => {
    const value = getRecordValue(row, valueField);
    if (value === null || value === undefined || value === "") return [];
    const label =
      getRecordValue(row, labelField) ??
      getRecordValue(row, "name") ??
      getRecordValue(row, "label") ??
      getRecordValue(row, "key") ??
      value;
    const description = getRecordValue(row, descriptionField);
    const meta = metaFields
      .map((fieldName) => getRecordValue(row, fieldName))
      .filter((item) => item !== null && item !== undefined && item !== "")
      .map((item) => String(item));

    return {
      value: String(value),
      label: String(label),
      description:
        description === null || description === undefined
          ? null
          : String(description),
      meta,
    };
  });
}

function extractRecords(body: unknown): RuntimeRecordData[] {
  if (Array.isArray(body)) return body.filter(isRuntimeRecord);
  if (!isRuntimeRecord(body)) return [];

  const candidates = [
    body.records,
    body.items,
    body.data,
    isRuntimeRecord(body.data) ? body.data.records : undefined,
    isRuntimeRecord(body.data) ? body.data.items : undefined,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter(isRuntimeRecord);
  }

  return [];
}

function isRuntimeRecord(value: unknown): value is RuntimeRecordData {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getRecordValue(record: RuntimeRecordData, path: string) {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!isRuntimeRecord(current)) return undefined;
    return current[segment];
  }, record);
}

function resolveRelatedLookupDisplayValue(
  field: EntityMetadata["fields"][number] | undefined,
  fieldLogicalName: string,
  record: RuntimeRecordData,
) {
  if (field?.dataType !== "lookup") return null;

  const baseName = fieldLogicalName.endsWith("Id")
    ? fieldLogicalName.slice(0, -2)
    : fieldLogicalName;
  const candidateValues = [
    { value: record[`${baseName}Name`], allowString: true },
    { value: record[`${baseName}Label`], allowString: true },
    { value: record[`${baseName}DisplayName`], allowString: true },
    { value: record[baseName], allowString: false },
    { value: record[fieldLogicalName], allowString: false },
  ];

  for (const { value, allowString } of candidateValues) {
    const label = readableLookupValue(value, allowString);
    if (label) return label;
  }

  return null;
}

function readableLookupValue(value: unknown, allowString: boolean) {
  if (typeof value === "string") return allowString ? value : "";
  if (!isRuntimeRecord(value)) return "";

  for (const key of ["name", "label", "displayName", "fullName", "email"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }

  return "";
}

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
  /*
   * BUG-1964 / BUG-2009 — a generic entity carries no display name, only its
   * logical name, and both the entity's label and the quick-create dialog's
   * title were rendering that key: "New leave_entitlements". Humanised and
   * singularised here, once, so the two cannot disagree.
   */
  const entityLabel = humanizeFieldKey(metadata.logicalName);
  const entity: EntityMetadata = {
    id: `entity:${metadata.logicalName}`,
    logicalName: metadata.logicalName,
    displayName: entityLabel,
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
    displayName: `New ${singularize(entityLabel)}`,
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

function buildSubgridQuickCreate(
  subgrid: RelatedSubgridMetadata,
  parentEntity?: EntityMetadata,
): {
  entity: EntityMetadata;
  form: FormMetadata;
} {
  const parentFieldsByName = new Map(
    (parentEntity?.fields ?? []).map((field) => [field.logicalName, field]),
  );
  const fields = (subgrid.quickCreateFields ?? []).map((field) => {
    const sourceField = parentFieldsByName.get(field.fieldLogicalName);
    return {
      id: `${subgrid.relatedEntityLogicalName}.${field.fieldLogicalName}`,
      logicalName: field.fieldLogicalName,
      displayName:
        field.label ?? sourceField?.displayName ?? field.fieldLogicalName,
      version: "1.0.0",
      lifecycleState: "published" as const,
      layer: "system" as const,
      entityLogicalName:
        subgrid.relatedEntityLogicalName ?? subgrid.relationshipName,
      dataType: field.dataType ?? sourceField?.dataType,
      requirementLevel: field.required
        ? ("required" as const)
        : (sourceField?.requirementLevel ?? ("none" as const)),
      behavior: sourceField?.behavior ?? ("normal" as const),
      maxLength: field.maxLength ?? sourceField?.maxLength,
      minLength: sourceField?.minLength,
      min: sourceField?.min,
      max: sourceField?.max,
      pattern: sourceField?.pattern,
      lookupTargets: sourceField?.lookupTargets,
      options: field.options ?? sourceField?.options,
      dependsOnFieldId: sourceField?.dependsOnFieldId,
      dependencyFilterKey: sourceField?.dependencyFilterKey,
      resetOnParentChange: sourceField?.resetOnParentChange,
    };
  });
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
    /*
     * BUG-1964 — a dialog that creates one record was titled with the tab's
     * plural: "New Entitlements", "New Assignments". The record header and
     * this title were two mechanisms — one singularised badly, the other not
     * at all — so they could disagree about the same entity on the same
     * screen. Both read `singularize` now.
     */
    displayName: `New ${singularize(subgrid.title)}`,
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
  permissionKey: string | readonly string[] | undefined,
) {
  if (!permissionKey) return true;
  if (
    runtime?.security.principal.roleKeys.some(
      (roleKey) => roleKey === "global-admin" || roleKey === "system-admin",
    )
  ) {
    return true;
  }
  const permissionKeys = Array.isArray(permissionKey)
    ? permissionKey
    : [permissionKey];
  return permissionKeys.some((key) =>
    Boolean(runtime?.security.principal.permissionKeys.includes(key)),
  );
}

function EmployeeDocumentUploadPanel({
  employeeId,
  onClose,
  onUploaded,
  uploadUrl,
}: {
  readonly employeeId: string;
  readonly onClose: () => void;
  readonly onUploaded: () => void | Promise<void>;
  readonly uploadUrl: string;
}) {
  const [documentTypes, setDocumentTypes] = useState<SharedLookupOption[]>([]);
  const [documentCategories, setDocumentCategories] = useState<
    SharedLookupOption[]
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/lookups/document-types").then(readLookupResponse),
      fetch("/api/lookups/document-categories").then(readLookupResponse),
    ])
      .then(([types, categories]) => {
        if (!active) return;
        setDocumentTypes(types);
        setDocumentCategories(categories);
      })
      .catch((lookupError: unknown) => {
        if (!active) return;
        setError(
          lookupError instanceof Error
            ? lookupError.message
            : "Unable to load document lookups.",
        );
      });

    return () => {
      active = false;
    };
  }, []);

  // BUG-0043: kept its own layout, gained the guarantees it never had -
  // focus containment, Escape, focus restore and dialog semantics.
  const dialog = useDialogBehavior({ open: true, onClose });

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/20"
      {...dialog.backdropProps}
    >
      <aside
        {...dialog.panelProps}
        className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2
            className="text-lg font-semibold text-foreground"
            id={dialog.titleId}
          >
            New Document
          </h2>
          <button
            aria-label="Close document upload"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition hover:bg-muted/20 hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          {error ? (
            <p className="mb-4 rounded-lg border border-danger/20 bg-danger/5 p-3 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <DocumentUploadForm
            documentCategories={documentCategories}
            documentTypes={documentTypes}
            entityId={employeeId}
            entityType="EMPLOYEE"
            includeEntityFields={false}
            onUploaded={onUploaded}
            submitLabel="Upload employee document"
            uploadUrl={uploadUrl}
          />
        </div>
      </aside>
    </div>
  );
}

function EmployeeDocumentEditPanel({
  document,
  onClose,
  onUpdated,
  updateUrl,
}: {
  readonly document: RuntimeRecordData;
  readonly onClose: () => void;
  readonly onUpdated: () => void | Promise<void>;
  readonly updateUrl: string;
}) {
  const [documentTypes, setDocumentTypes] = useState<SharedLookupOption[]>([]);
  const [documentCategories, setDocumentCategories] = useState<
    SharedLookupOption[]
  >([]);
  const [documentTypeId, setDocumentTypeId] = useState(
    String(document.documentTypeId ?? ""),
  );
  const [documentCategoryId, setDocumentCategoryId] = useState(
    String(document.documentCategoryId ?? ""),
  );
  const [title, setTitle] = useState(String(document.title ?? ""));
  const [description, setDescription] = useState(
    String(document.description ?? ""),
  );
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/lookups/document-types").then(readLookupResponse),
      fetch("/api/lookups/document-categories").then(readLookupResponse),
    ])
      .then(([types, categories]) => {
        if (!active) return;
        setDocumentTypes(types);
        setDocumentCategories(categories);
        if (!documentTypeId && types[0]?.id) {
          setDocumentTypeId(types[0].id);
        }
      })
      .catch((lookupError: unknown) => {
        if (!active) return;
        setError(
          lookupError instanceof Error
            ? lookupError.message
            : "Unable to load document lookups.",
        );
      });

    return () => {
      active = false;
    };
  }, [documentTypeId]);

  async function saveDocument() {
    const documentId = String(document.id ?? "");
    if (!documentId) return;
    if (!documentTypeId) {
      setError("Select a document type.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("documentTypeId", documentTypeId);
      if (documentCategoryId) formData.append("documentCategoryId", documentCategoryId);
      formData.append("title", title);
      formData.append("description", description);
      if (file) formData.append("file", file);

      if (!updateUrl) throw new Error("Document update route is unavailable.");
      const response = await fetch(updateUrl, {
        body: formData,
        method: "PATCH",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message ?? "Unable to update document.");
      }
      await onUpdated();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update document.",
      );
    } finally {
      setSaving(false);
    }
  }

  // BUG-0043: kept its own layout, gained the guarantees it never had -
  // focus containment, Escape, focus restore and dialog semantics.
  const dialog = useDialogBehavior({ open: true, onClose });

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/20"
      {...dialog.backdropProps}
    >
      <aside
        {...dialog.panelProps}
        className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2
            className="text-lg font-semibold text-foreground"
            id={dialog.titleId}
          >
            Edit Document
          </h2>
          <button
            aria-label="Close document editor"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition hover:bg-muted/20 hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-4 p-5">
          {error ? (
            <p className="rounded-lg border border-danger/20 bg-danger/5 p-3 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <label className="grid gap-2 text-sm font-medium text-foreground">
            Document type
            <select
              className="h-11 rounded-md border border-border bg-surface px-3 text-sm"
              onChange={(event) => setDocumentTypeId(event.target.value)}
              value={documentTypeId}
            >
              <option value="">Select document type</option>
              {documentTypes.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium text-foreground">
            Category
            <select
              className="h-11 rounded-md border border-border bg-surface px-3 text-sm"
              onChange={(event) => setDocumentCategoryId(event.target.value)}
              value={documentCategoryId}
            >
              <option value="">No category</option>
              {documentCategories.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium text-foreground">
            Title
            <input
              className="h-11 rounded-md border border-border bg-surface px-3 text-sm"
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-foreground">
            Description
            <textarea
              className="min-h-24 rounded-md border border-border bg-surface px-3 py-2 text-sm"
              onChange={(event) => setDescription(event.target.value)}
              value={description}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-foreground">
            Replace file
            <input
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              type="file"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              className="rounded-md border border-border px-4 py-2 text-sm font-semibold"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={saving}
              onClick={() => void saveDocument()}
              type="button"
            >
              {saving ? "Saving" : "Save changes"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

async function readLookupResponse(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message ?? "Unable to load lookup options.");
  }
  const rows: unknown[] = Array.isArray(body)
    ? body
    : Array.isArray(body?.items)
      ? body.items
      : Array.isArray(body?.data)
        ? body.data
        : [];
  return rows
    .filter((row: unknown): row is Record<string, unknown> =>
      Boolean(row && typeof row === "object" && !Array.isArray(row)),
    )
    .map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? row.displayName ?? row.label ?? ""),
      key: row.key == null ? null : String(row.key),
      code: row.code == null ? null : String(row.code),
    }))
    .filter((option: SharedLookupOption) => option.id && option.name);
}

function omitRuntimeField(record: RuntimeRecordData, fieldLogicalName: string) {
  const { [fieldLogicalName]: _omitted, ...rest } = record;
  void _omitted;
  return rest;
}

function resolveSubgridApiPath(
  template: string | undefined,
  parentId: string,
  recordId?: string,
) {
  if (!template) return null;
  return template
    .replaceAll("{parentId}", encodeURIComponent(parentId))
    .replaceAll("{recordId}", encodeURIComponent(recordId ?? ""));
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
