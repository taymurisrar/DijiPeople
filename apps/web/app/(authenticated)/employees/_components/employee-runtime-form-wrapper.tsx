"use client";

import type { ReactNode } from "react";
import { ModuleRecordPage } from "@/app/components/runtime";
import type { FormMetadata } from "@/lib/runtime/metadata-runtime.types";
import type { ModuleRuntimeContext } from "@/lib/runtime/module-runtime.types";
import type { EmployeeRuntimeFormValues } from "@/lib/runtime/modules/employee-metadata.adapter";
import { employeeModuleDataAdapter } from "@/lib/runtime/modules/employee-data.adapter";
import type { LookupOption } from "@/app/components/ui/form-control";
import { useEmployeeLookups } from "./use-employee-lookups";

export type EmployeeRuntimeFormMode = "detail" | "edit" | "new";

export function EmployeeRuntimeFormWrapper({
  activeForm,
  lookupDisplayValues = {},
  lookupOptions = {},
  mode,
  record,
  runtime,
  tabsSlot,
}: {
  readonly activeForm: FormMetadata | null;
  readonly lookupDisplayValues?: Record<string, string>;
  readonly lookupOptions?: Record<string, readonly LookupOption[]>;
  readonly mode: EmployeeRuntimeFormMode;
  readonly record: EmployeeRuntimeFormValues;
  readonly runtime: ModuleRuntimeContext;
  readonly tabsSlot?: ReactNode;
}) {
  const employeeLookups = useEmployeeLookups({
    countryId: stringValue(record.countryId),
    enabled: mode !== "detail",
    stateProvinceId: stringValue(record.stateProvinceId),
  });
  const resolvedLookupOptions: Record<string, readonly LookupOption[]> = {
    ...lookupOptions,
    departmentId: mergeLookupOptions(
      lookupOptions.departmentId,
      employeeLookups.departments,
    ),
    designationId: mergeLookupOptions(
      lookupOptions.designationId,
      employeeLookups.designations,
    ),
    employeeLevelId: mergeLookupOptions(
      lookupOptions.employeeLevelId,
      employeeLookups.employeeLevels,
    ),
    locationId: mergeLookupOptions(
      lookupOptions.locationId,
      employeeLookups.locations,
    ),
    officialJoiningLocationId: mergeLookupOptions(
      lookupOptions.officialJoiningLocationId,
      employeeLookups.locations,
    ),
    defaultWorkScheduleId: mergeLookupOptions(
      lookupOptions.defaultWorkScheduleId,
      employeeLookups.workSchedules,
    ),
    countryId: mergeLookupOptions(
      lookupOptions.countryId,
      employeeLookups.countries,
    ),
    nationalityCountryId: mergeLookupOptions(
      lookupOptions.nationalityCountryId,
      employeeLookups.countries,
    ),
    stateProvinceId: mergeLookupOptions(
      lookupOptions.stateProvinceId,
      employeeLookups.states,
    ),
    cityId: mergeLookupOptions(lookupOptions.cityId, employeeLookups.cities),
    emergencyContactRelationTypeId: mergeLookupOptions(
      lookupOptions.emergencyContactRelationTypeId,
      employeeLookups.relationTypes,
    ),
  };
  return (
    <ModuleRecordPage
      activeForm={activeForm}
      dataAdapter={employeeModuleDataAdapter}
      lookupDisplayValues={lookupDisplayValues}
      lookupOptions={resolvedLookupOptions}
      mode={mode === "new" ? "create" : mode === "detail" ? "read" : "edit"}
      moduleKey="employees"
      record={record}
      recordId={runtime.recordId}
      runtime={runtime}
      tabsSlot={tabsSlot}
      title={titleByMode[mode]}
    />
  );
}

const titleByMode: Record<EmployeeRuntimeFormMode, string> = {
  detail: "Employee",
  edit: "Edit Employee",
  new: "New Employee",
};

function mergeLookupOptions(
  first: readonly LookupOption[] | undefined,
  second: readonly LookupOption[],
) {
  const seen = new Set<string>();
  const merged: LookupOption[] = [];

  for (const option of [...(first ?? []), ...second]) {
    if (seen.has(option.id)) continue;
    seen.add(option.id);
    merged.push(option);
  }

  return merged;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}
