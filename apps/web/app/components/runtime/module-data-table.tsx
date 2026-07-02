"use client";

import { useMemo } from "react";
import Link from "next/link";
import { DataTable } from "@/app/components/data-table/data-table";
import { DataTablePagination } from "@/app/components/data-table/data-table-pagination";
import type {
  DataTableColumn,
  DataTableFilterState,
} from "@/app/components/data-table/types";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDateWithTenantSettings } from "@/lib/date-format";
import type {
  FieldMetadata,
  ViewMetadata,
} from "@/lib/runtime/metadata-runtime.types";
import { getEntityMetadata } from "@/lib/runtime/metadata-registry";
import type { ModuleRuntimeContext } from "@/lib/runtime/module-runtime.types";
import type { RuntimeRecordData } from "./module-runtime-ui.types";

export function ModuleDataTable({
  enableSelection = false,
  formatting,
  initialFilters = [],
  onSelectedRecordIdsChange,
  pagination,
  records,
  runtime,
  selectedRecordIds = [],
  view,
  lookupDisplayValues = {},
}: {
  readonly enableSelection?: boolean;
  readonly formatting?: {
    readonly dateFormat: string;
    readonly locale: string;
    readonly timezone: string;
  };
  readonly initialFilters?: readonly DataTableFilterState[];
  readonly lookupDisplayValues?: Record<string, Record<string, string>>;
  readonly onSelectedRecordIdsChange?: (recordIds: string[]) => void;
  readonly pagination?: {
    readonly page: number;
    readonly pageSize: number;
    readonly totalItems: number;
    readonly pathname: string;
    readonly searchParams: Record<string, string | undefined>;
  };
  readonly records: readonly RuntimeRecordData[];
  readonly runtime: ModuleRuntimeContext;
  readonly selectedRecordIds?: readonly string[];
  readonly view: ViewMetadata | null;
}) {
  const fieldsByName = new Map(
    runtime.metadata.entity.fields.map((field) => [field.logicalName, field]),
  );
  const resolvedLookupDisplayValues = useMemo(
    () => ({
      ...deriveLookupDisplayValues(runtime, records),
      ...lookupDisplayValues,
    }),
    [lookupDisplayValues, records, runtime],
  );
  const columns = buildColumns({
    fieldsByName,
    formatting,
    lookupDisplayValues: resolvedLookupDisplayValues,
    runtime,
    view,
  });
  const initialSort = view?.defaultSort?.[0]
    ? {
        columnKey: view.defaultSort[0].fieldLogicalName,
        direction: view.defaultSort[0].direction,
      }
    : null;

  return (
    <DataTable
      columns={columns}
      enableSelection={enableSelection}
      footer={
        pagination ? (
          <DataTablePagination
            {...pagination}
            searchParams={{
              ...pagination.searchParams,
              view: undefined,
              viewId: view?.viewId ?? view?.id,
            }}
          />
        ) : undefined
      }
      getRowKey={(record) =>
        String(record[runtime.metadata.entity.primaryIdField] ?? record.id)
      }
      initialFilters={[...initialFilters]}
      initialSort={initialSort}
      mode={pagination ? "server" : "client"}
      pagination={
        pagination
          ? {
              page: pagination.page,
              pageSize: pagination.pageSize,
              totalItems: pagination.totalItems,
            }
          : undefined
      }
      rows={[...records]}
      selectedRowKeys={[...selectedRecordIds]}
      onSelectedRowKeysChange={onSelectedRecordIdsChange}
    />
  );
}

function buildColumns({
  fieldsByName,
  formatting,
  lookupDisplayValues,
  runtime,
  view,
}: {
  readonly fieldsByName: ReadonlyMap<string, FieldMetadata>;
  readonly formatting?: {
    readonly dateFormat: string;
    readonly locale: string;
    readonly timezone: string;
  };
  readonly lookupDisplayValues: Record<string, Record<string, string>>;
  readonly runtime: ModuleRuntimeContext;
  readonly view: ViewMetadata | null;
}): DataTableColumn<RuntimeRecordData>[] {
  const viewColumns =
    view?.columns
      .filter((column) => !column.isHidden)
      .sort((left, right) => left.order - right.order) ?? [];

  return viewColumns.map((column) => {
    const field = fieldsByName.get(column.fieldLogicalName);
    const header =
      column.label ?? field?.displayName ?? column.fieldLogicalName;
    const filterType = filterTypeForField(field);

    return {
      key: column.fieldLogicalName,
      entityField: column.fieldLogicalName,
      header,
      sortable: column.isSortable ?? field?.isSortable ?? true,
      filterable: field?.isSearchable ?? true,
      filterOptions: field?.options?.map((option) => ({
        label: option.label,
        value: option.value,
      })),
      filterType,
      sortAccessor: (record) =>
        comparableValue(
          record,
          column.fieldLogicalName,
          field,
          lookupDisplayValues,
        ),
      filterAccessor: (record) =>
        displayValue(
          record,
          column.fieldLogicalName,
          field,
          lookupDisplayValues,
        ),
      searchAccessor: (record) =>
        displayValue(
          record,
          column.fieldLogicalName,
          field,
          lookupDisplayValues,
        ),
      render: (record) => (
        <RuntimeCell
          field={field}
          fieldLogicalName={column.fieldLogicalName}
          formatting={formatting}
          lookupDisplayValues={lookupDisplayValues}
          record={record}
          runtime={runtime}
        />
      ),
    };
  });
}

function RuntimeCell({
  field,
  fieldLogicalName,
  formatting,
  lookupDisplayValues,
  record,
  runtime,
}: {
  readonly field?: FieldMetadata;
  readonly fieldLogicalName: string;
  readonly formatting?: {
    readonly dateFormat: string;
    readonly locale: string;
    readonly timezone: string;
  };
  readonly lookupDisplayValues: Record<string, Record<string, string>>;
  readonly record: RuntimeRecordData;
  readonly runtime: ModuleRuntimeContext;
}) {
  const value = displayValue(
    record,
    fieldLogicalName,
    field,
    lookupDisplayValues,
  );
  const recordId = String(
    record[runtime.metadata.entity.primaryIdField] ?? record.id ?? "",
  );

  if (
    fieldLogicalName === runtime.metadata.entity.primaryNameField &&
    runtime.module.recordNavigation !== false &&
    recordId
  ) {
    return (
      <Link
        className="font-semibold text-foreground transition hover:text-accent"
        href={`${runtime.module.routeBase}/${recordId}`}
      >
        {value}
      </Link>
    );
  }

  if (field?.dataType === "optionset") {
    return (
      <StatusPill tone={statusTone(String(record[fieldLogicalName] ?? ""))}>
        {value}
      </StatusPill>
    );
  }

  if (field?.dataType === "date" || field?.dataType === "datetime") {
    return formatDateValue(record[fieldLogicalName], formatting);
  }

  if (field?.dataType === "url" && typeof record[fieldLogicalName] === "string") {
    return (
      <Link className="font-semibold text-accent hover:underline" href={String(record[fieldLogicalName])}>
        Open record
      </Link>
    );
  }

  return value;
}

function displayValue(
  record: RuntimeRecordData,
  fieldLogicalName: string,
  field: FieldMetadata | undefined,
  lookupDisplayValues: Record<string, Record<string, string>>,
) {
  const recordId = String(record.id ?? "");

  if (field?.dataType === "lookup") {
    return lookupDisplayValues[recordId]?.[fieldLogicalName] || "Not set";
  }

  if (field?.dataType === "optionset") {
    const value = String(record[fieldLogicalName] ?? "");
    return (
      field.options?.find((option) => option.value === value)?.label ??
      (value || "Not set")
    );
  }

  const value = record[fieldLogicalName];
  if (Array.isArray(value)) return value.length ? value.join(", ") : "Not set";
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function comparableValue(
  record: RuntimeRecordData,
  fieldLogicalName: string,
  field: FieldMetadata | undefined,
  lookupDisplayValues: Record<string, Record<string, string>>,
) {
  const value = displayValue(
    record,
    fieldLogicalName,
    field,
    lookupDisplayValues,
  );
  if (field?.dataType === "number" || field?.dataType === "decimal") {
    const numberValue = Number(record[fieldLogicalName]);
    return Number.isFinite(numberValue) ? numberValue : 0;
  }

  if (field?.dataType === "date" || field?.dataType === "datetime") {
    const time = new Date(String(record[fieldLogicalName] ?? "")).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  return value;
}

function deriveLookupDisplayValues(
  runtime: ModuleRuntimeContext,
  records: readonly RuntimeRecordData[],
) {
  const displayValues: Record<string, Record<string, string>> = {};
  const lookupFields = runtime.metadata.entity.fields.filter(
    (field) => field.dataType === "lookup",
  );
  const primaryIdField = runtime.metadata.entity.primaryIdField;

  for (const record of records) {
    const recordId = String(record[primaryIdField] ?? record.id ?? "");
    if (!recordId) continue;

    const recordDisplayValues: Record<string, string> = {};

    for (const field of lookupFields) {
      const directValue = record[field.logicalName];
      const directDisplay = readableLookupDisplayValue(field, directValue);
      if (directDisplay) {
        recordDisplayValues[field.logicalName] = directDisplay;
        continue;
      }

      const relationKey = relationKeyForLookupField(field.logicalName);
      const relationValue = relationKey ? record[relationKey] : null;
      const relationDisplay = readableLookupDisplayValue(field, relationValue);
      if (relationDisplay) {
        recordDisplayValues[field.logicalName] = relationDisplay;
      }
    }

    if (Object.keys(recordDisplayValues).length) {
      displayValues[recordId] = recordDisplayValues;
    }
  }

  return displayValues;
}

function relationKeyForLookupField(fieldLogicalName: string) {
  if (fieldLogicalName.endsWith("Id")) {
    return fieldLogicalName.slice(0, -"Id".length);
  }

  if (fieldLogicalName.endsWith("Code")) {
    return fieldLogicalName.slice(0, -"Code".length);
  }

  return "";
}

function readableLookupDisplayValue(field: FieldMetadata, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  const displayField = lookupPrimaryNameField(field);

  return stringValue(record[displayField]);
}

function lookupPrimaryNameField(field: FieldMetadata) {
  const targetEntityLogicalName = field.lookupTargets?.[0]?.entityLogicalName;
  if (!targetEntityLogicalName) return "name";

  return getEntityMetadata(targetEntityLogicalName)?.primaryNameField ?? "name";
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function formatDateValue(
  value: unknown,
  formatting?: {
    readonly dateFormat: string;
    readonly locale: string;
    readonly timezone: string;
  },
) {
  if (!value) return "Not set";
  if (!formatting) return String(value).slice(0, 10);
  return formatDateWithTenantSettings(String(value), formatting);
}

function filterTypeForField(field: FieldMetadata | undefined) {
  if (field?.dataType === "date" || field?.dataType === "datetime")
    return "date" as const;
  if (field?.dataType === "number" || field?.dataType === "decimal")
    return "number" as const;
  if (field?.dataType === "optionset") return "multiSelect" as const;
  return "text" as const;
}

function statusTone(value: string) {
  if (["ACTIVE", "OPEN", "COMPLETED"].includes(value)) return "good";
  if (["INACTIVE", "TERMINATED", "ARCHIVED"].includes(value)) return "muted";
  if (["NOTICE", "PENDING_REVIEW", "DRAFT"].includes(value)) return "warning";
  return "neutral";
}
