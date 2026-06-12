"use client";

import { useMemo, useState } from "react";
import type { DataTableFilterState } from "@/app/components/data-table/types";
import type { ViewMetadata } from "@/lib/runtime/metadata-runtime.types";
import type { ModuleDataAdapter } from "@/lib/runtime/module-data-adapter.types";
import type { ModuleRuntimeContext } from "@/lib/runtime/module-runtime.types";
import { createStandardModuleDataAdapter } from "@/lib/runtime/modules/standard-module-data.adapter";
import type { StandardModuleRuntimeSpec } from "@/lib/runtime/modules/standard-module-runtime";
import { ModuleDataTable } from "./module-data-table";
import { ModuleListPage } from "./module-list-page";
import type { RuntimeRecordData } from "./module-runtime-ui.types";

export function StandardModuleListPage({
  activeView,
  dataAdapter,
  formatting,
  initialFilters = [],
  pagination,
  records,
  runtime,
  spec,
  title,
  commandRecord,
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
  readonly records: readonly RuntimeRecordData[];
  readonly runtime: ModuleRuntimeContext;
  readonly spec?: StandardModuleRuntimeSpec;
  readonly title?: string;
  readonly commandRecord?: Readonly<Record<string, unknown>>;
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
  const resolvedDataAdapter = useMemo(
    () =>
      dataAdapter ?? (spec ? createStandardModuleDataAdapter(spec) : undefined),
    [dataAdapter, spec],
  );

  return (
    <ModuleListPage
      activeView={resolvedActiveView}
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
          pagination={
            pagination
              ? {
                  ...pagination,
                  totalItems: filteredRecords.length,
                }
              : undefined
          }
          records={filteredRecords}
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
