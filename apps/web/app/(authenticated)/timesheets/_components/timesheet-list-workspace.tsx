"use client";

import { StandardModuleListPage } from "@/app/components/runtime";
import type { ComponentProps } from "react";
import {
  TimesheetExportActions,
  type TimesheetCurrentExportFilters,
  type TimesheetExportLookupOption,
} from "./timesheet-export-panel";

type StandardListProps = Omit<
  ComponentProps<typeof StandardModuleListPage>,
  "renderActionBar"
>;

type TimesheetListWorkspaceProps = StandardListProps & {
  readonly exportOptions: {
    readonly businessUnits: TimesheetExportLookupOption[];
    readonly currentEmployeeId?: string | null;
    readonly departments: TimesheetExportLookupOption[];
    readonly employees: TimesheetExportLookupOption[];
    readonly filters: TimesheetCurrentExportFilters;
    readonly organizations: TimesheetExportLookupOption[];
    readonly projects: TimesheetExportLookupOption[];
    readonly timezone: string;
  };
};

export function TimesheetListWorkspace({
  exportOptions,
  ...listProps
}: TimesheetListWorkspaceProps) {
  return (
    <StandardModuleListPage
      {...listProps}
      renderActionBar={({ activeView, selectedRecordIds }) => (
        <TimesheetExportActions
          activeView={activeView}
          businessUnits={[...exportOptions.businessUnits]}
          currentEmployeeId={exportOptions.currentEmployeeId}
          departments={[...exportOptions.departments]}
          employees={[...exportOptions.employees]}
          filters={exportOptions.filters}
          key={`${activeView?.viewId ?? activeView?.id ?? "default"}:${JSON.stringify(exportOptions.filters)}`}
          organizations={[...exportOptions.organizations]}
          projects={[...exportOptions.projects]}
          selectedRecordIds={selectedRecordIds}
          timezone={exportOptions.timezone}
        />
      )}
    />
  );
}
