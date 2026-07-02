"use client";

import type { ReactNode } from "react";
import type { FieldValueMap } from "@/app/components/metadata/runtime-metadata-form-renderer";
import { ModuleRecordPage } from "@/app/components/runtime";
import type { CommandDefinition } from "@/lib/runtime/command-runtime.types";
import type { FormMetadata } from "@/lib/runtime/metadata-runtime.types";
import type { ModuleDataAdapter } from "@/lib/runtime/module-data-adapter.types";
import type { ModuleRuntimeContext } from "@/lib/runtime/module-runtime.types";
import type { EmployeeRuntimeFormValues } from "@/lib/runtime/modules/employee-metadata.adapter";
import { employeeModuleDataAdapter } from "@/lib/runtime/modules/employee-data.adapter";
import { canManageEmployeeAccountActions } from "@/lib/employee-account-actions";
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
  const runtimeWithEmployeeCommands = useEmployeeAccountActionRuntime(runtime);

  return (
    <ModuleRecordPage
      activeForm={activeForm}
      dataAdapter={employeeAccountActionAdapter}
      lookupDisplayValues={lookupDisplayValues}
      lookupOptions={resolvedLookupOptions}
      mode={mode === "new" ? "create" : mode === "detail" ? "read" : "edit"}
      moduleKey="employees"
      record={record}
      recordId={runtime.recordId}
      deriveValuesOnChange={({ changedField, lookupOptions, nextValues }) =>
        deriveEmployeeLevelFromDesignation({
          changedFieldLogicalName: changedField.logicalName,
          designationOptions: mergeLookupOptions(
            lookupOptions.designationId,
            resolvedLookupOptions.designationId ?? [],
          ),
          nextValues,
        })
      }
      resolveFieldEditable={({ defaultEditable, field, values }) => {
        if (field.logicalName !== "employeeLevelId") {
          return defaultEditable;
        }

        return (
          defaultEditable &&
          !designationHasEmployeeLevel(
            resolvedLookupOptions.designationId ?? [],
            stringValue(values.designationId),
          )
        );
      }}
      runtime={runtimeWithEmployeeCommands}
      tabsSlot={tabsSlot}
      title={titleByMode[mode]}
    />
  );
}

function deriveEmployeeLevelFromDesignation({
  changedFieldLogicalName,
  designationOptions,
  nextValues,
}: {
  readonly changedFieldLogicalName: string;
  readonly designationOptions: readonly LookupOption[];
  readonly nextValues: FieldValueMap;
}) {
  if (changedFieldLogicalName !== "designationId") {
    return nextValues;
  }

  const designationId = stringValue(nextValues.designationId);
  const employeeLevelId =
    designationOptions.find((option) => option.id === designationId)
      ?.employeeLevelId ?? "";

  return {
    ...nextValues,
    employeeLevelId,
  };
}

function designationHasEmployeeLevel(
  designationOptions: readonly LookupOption[],
  designationId: string,
) {
  if (!designationId) return false;

  return Boolean(
    designationOptions.find((option) => option.id === designationId)
      ?.employeeLevelId,
  );
}

const employeeAccountActionCommands: readonly CommandDefinition[] = [
  {
    key: "employees.resetPassword",
    label: "Reset Password",
    description: "Send a reset password link to this employee's work email.",
    scope: "record",
    placement: "detail-command-bar",
    executionMode: "client",
    handlerKey: "employees.resetPassword",
    order: 32,
  },
  {
    key: "employees.sendInvitation",
    label: "Send Invitation",
    description:
      "Send an activation invitation to a new employee who has not logged in yet.",
    scope: "record",
    placement: "detail-command-bar",
    executionMode: "client",
    handlerKey: "employees.sendInvitation",
    order: 33,
  },
];

const employeeAccountActionAdapter: ModuleDataAdapter = {
  ...employeeModuleDataAdapter,
  commandHandlers: {
    ...employeeModuleDataAdapter.commandHandlers,
    "employees.resetPassword": async (context) => {
      if (!context.recordId) {
        return { ok: false, message: "Employee record is required." };
      }

      const payload = await postEmployeeAction(
        context.recordId,
        "send-reset-password-link",
      );
      return {
        ok: true,
        data: payload,
        message:
          readRecordString(payload, "recipientEmail") !== ""
            ? `Reset password link sent to ${readRecordString(payload, "recipientEmail")}.`
            : readRecordString(payload, "message") ||
              "Reset password link sent.",
        invalidateCacheKeys: context.runtime.cacheKeys,
      };
    },
    "employees.sendInvitation": async (context) => {
      if (!context.recordId) {
        return { ok: false, message: "Employee record is required." };
      }

      const payload = await postEmployeeAction(
        context.recordId,
        "resend-invite",
      );
      const activationLink = readNestedString(payload, [
        "access",
        "invitation",
        "activationLink",
      ]);
      return {
        ok: true,
        data: payload,
        message: activationLink
          ? `Invitation created. Activation link: ${activationLink}`
          : readRecordString(payload, "message") || "Invitation sent.",
        invalidateCacheKeys: context.runtime.cacheKeys,
      };
    },
  },
};

function useEmployeeAccountActionRuntime(runtime: ModuleRuntimeContext) {
  const canManage = canManageEmployeeAccountActions([
    ...runtime.security.principal.roleKeys,
    ...(runtime.security.principal.roles ?? []),
  ]);
  const commands = employeeAccountActionCommands.map((command) => ({
    ...command,
    isDisabled: !canManage,
    disabledReason: !canManage
      ? "Only Global Admin, System Admin, and HR can run this employee account action."
      : undefined,
  }));

  return {
    ...runtime,
    metadata: {
      ...runtime.metadata,
      commands: mergeCommands(runtime.metadata.commands, commands),
    },
  };
}

function mergeCommands(
  existing: readonly CommandDefinition[],
  additions: readonly CommandDefinition[],
) {
  const commands = new Map<string, CommandDefinition>();
  for (const command of [...existing, ...additions]) {
    commands.set(command.key, command);
  }
  return [...commands.values()];
}

async function postEmployeeAction(employeeId: string, action: string) {
  const response = await fetch(
    `/api/employees/${encodeURIComponent(employeeId)}/${action}`,
    { method: "POST" },
  );
  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(
      readString(
        payload && typeof payload === "object"
          ? (payload as Record<string, unknown>).message
          : null,
      ) || "Employee account action failed.",
    );
  }

  return payload;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readRecordString(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }
  return readString((value as Record<string, unknown>)[key]);
}

function readNestedString(value: unknown, path: readonly string[]) {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return "";
    }
    current = (current as Record<string, unknown>)[key];
  }
  return readString(current);
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
    if (seen.has(option.id)) {
      const existingIndex = merged.findIndex(
        (candidate) => candidate.id === option.id,
      );
      const existing = merged[existingIndex];
      if (existing) {
        merged[existingIndex] = {
          ...option,
          ...existing,
          code: existing.code ?? option.code,
          employeeLevelId: existing.employeeLevelId ?? option.employeeLevelId,
          key: existing.key ?? option.key,
          subtitle: existing.subtitle ?? option.subtitle,
        };
      }
      continue;
    }
    seen.add(option.id);
    merged.push(option);
  }

  return merged;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}
