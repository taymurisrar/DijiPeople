"use client";

import { StandardModuleListPage } from "@/app/components/runtime";
import type { ReactNode } from "react";
import type { DataTableFilterState } from "@/app/components/data-table/types";
import type { ModuleRuntimeContext } from "@/lib/runtime/module-runtime.types";
import type { ViewMetadata } from "@/lib/runtime/metadata-runtime.types";
import { employeeModuleDataAdapter } from "@/lib/runtime/modules/employee-data.adapter";
import type { EmployeeListItem } from "../types";

export function EmployeeRuntimeListWrapper({
  activeView,
  employees = [],
  formatting,
  initialFilters,
  pagination,
  runtime,
}: {
  readonly activeView?: ViewMetadata | null;
  readonly canAssignEmployee?: boolean;
  readonly canDeleteEmployee?: boolean;
  readonly children?: ReactNode;
  readonly employees?: readonly EmployeeListItem[];
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
  readonly runtime: ModuleRuntimeContext;
  readonly visibleColumnKeys?: readonly string[];
}) {
  return (
    <StandardModuleListPage
      activeView={activeView}
      dataAdapter={employeeModuleDataAdapter}
      formatting={formatting}
      initialFilters={initialFilters}
      pagination={pagination}
      records={employees}
      runtime={runtime}
      title="Employees"
    />
  );
}
