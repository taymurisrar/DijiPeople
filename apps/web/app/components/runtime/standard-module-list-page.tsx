"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { DataTableFilterState } from "@/app/components/data-table/types";
import type { ViewMetadata } from "@/lib/runtime/metadata-runtime.types";
import type { ModuleDataAdapter } from "@/lib/runtime/module-data-adapter.types";
import type { ModuleRuntimeContext } from "@/lib/runtime/module-runtime.types";
import { createStandardModuleDataAdapter } from "@/lib/runtime/modules/standard-module-data.adapter";
import type { StandardModuleRuntimeSpec } from "@/lib/runtime/modules/standard-module-runtime";
import { ModuleDataTable } from "./module-data-table";
import { ModuleListPage } from "./module-list-page";
import type { RuntimeRecordData } from "./module-runtime-ui.types";

export type StandardModuleListActionBarContext = {
  readonly activeView: ViewMetadata | null;
  readonly selectedRecordIds: readonly string[];
  readonly visibleRecords: readonly RuntimeRecordData[];
};

export function StandardModuleListPage({
  activeView,
  dataAdapter,
  formatting,
  initialFilters = [],
  pagination,
  paginationMode = "server",
  records,
  runtime,
  spec,
  title,
  commandRecord,
  renderActionBar,
}: {
  readonly activeView?: ViewMetadata | null;
  readonly dataAdapter?: ModuleDataAdapter;
  readonly formatting?: {
    readonly dateFormat: string;
    readonly locale: string;
    readonly timezone: string;
  };
  readonly initialFilters?: readonly DataTableFilterState[];
  readonly pagination?: {
    readonly page: number;
    readonly pageSize: number;
    readonly totalItems: number;
    readonly pathname: string;
    readonly searchParams: Record<string, string | undefined>;
  };
  readonly paginationMode?: "client" | "server";
  readonly records: readonly RuntimeRecordData[];
  readonly runtime: ModuleRuntimeContext;
  readonly spec?: StandardModuleRuntimeSpec;
  readonly title?: string;
  readonly commandRecord?: Readonly<Record<string, unknown>>;
  readonly renderActionBar?: (
    context: StandardModuleListActionBarContext,
  ) => ReactNode;
}) {
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [activeViewId, setActiveViewId] = useState(
    activeView?.viewId ?? activeView?.id ?? "",
  );
  const resolvedActiveView = useMemo(
    () =>
      runtime.metadata.views.find(
        (view) => (view.viewId ?? view.id) === activeViewId,
      ) ??
      activeView ??
      runtime.metadata.views.find((view) => view.isDefault) ??
      runtime.metadata.views[0] ??
      null,
    [activeView, activeViewId, runtime.metadata.views],
  );
  const filteredRecords = useMemo(
    () => applyRuntimeViewFilters(records, resolvedActiveView),
    [records, resolvedActiveView],
  );
  const effectivePagination = useMemo(() => {
    if (!pagination || paginationMode !== "client") return pagination;

    const pageSize = Math.max(1, pagination.pageSize);
    const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
    const page = Math.min(Math.max(1, pagination.page), totalPages);

    return {
      ...pagination,
      page,
      pageSize,
      totalItems: filteredRecords.length,
    };
  }, [filteredRecords.length, pagination, paginationMode]);
  const visibleRecords = useMemo(() => {
    if (!effectivePagination || paginationMode !== "client") {
      return filteredRecords;
    }

    const start = (effectivePagination.page - 1) * effectivePagination.pageSize;
    return filteredRecords.slice(start, start + effectivePagination.pageSize);
  }, [effectivePagination, filteredRecords, paginationMode]);
  const resolvedDataAdapter = useMemo(
    () =>
      dataAdapter ?? (spec ? createStandardModuleDataAdapter(spec) : undefined),
    [dataAdapter, spec],
  );

  return (
    <ModuleListPage
      activeView={resolvedActiveView}
      commandBarAddon={renderActionBar?.({
        activeView: resolvedActiveView,
        selectedRecordIds,
        visibleRecords,
      })}
      commandRecord={commandRecord}
      dataAdapter={resolvedDataAdapter}
      listRecords={filteredRecords}
      moduleKey={runtime.module.key}
      onActiveViewChange={(view) => {
        setActiveViewId(view.viewId ?? view.id);
        setSelectedRecordIds([]);
      }}
      onSelectionReset={() => setSelectedRecordIds([])}
      runtime={runtime}
      selectedRecordIds={selectedRecordIds}
      tableSlot={
        <ModuleDataTable
          enableSelection
          formatting={formatting}
          initialFilters={[...initialFilters]}
          onSelectedRecordIdsChange={setSelectedRecordIds}
          pagination={effectivePagination ? { ...effectivePagination } : undefined}
          records={visibleRecords}
          runtime={runtime}
          selectedRecordIds={selectedRecordIds}
          view={resolvedActiveView}
        />
      }
      title={title}
    />
  );
}

function applyRuntimeViewFilters(
  records: readonly RuntimeRecordData[],
  view: ViewMetadata | null,
) {
  if (!view?.filters?.length) return records;

  return records.filter((record) =>
    view.filters?.every((filter) => {
      const value = record[filter.fieldLogicalName];

      if (filter.operator === "eq") return value === filter.value;
      if (filter.operator === "neq") return value !== filter.value;
      if (filter.operator === "in" && Array.isArray(filter.value)) {
        return filter.value.includes(value);
      }

      return true;
    }),
  );
}
