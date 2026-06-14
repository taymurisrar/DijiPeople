"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RuntimeMetadataFormRenderer } from "@/app/components/metadata/runtime-metadata-form-renderer";
import type { LookupOption } from "@/app/components/ui/form-control";
import {
  groupCommands,
  resolveCommandsForSurface,
} from "@/lib/runtime/command-runtime.resolver";
import type { FormMetadata } from "@/lib/runtime/metadata-runtime.types";
import type {
  ModuleDataAdapter,
  ModuleOwnerOption,
} from "@/lib/runtime/module-data-adapter.types";
import type { ModuleRuntimeContext } from "@/lib/runtime/module-runtime.types";
import {
  normalizeOwnerOption,
  principalDisplayName,
  resolveOwnerDisplayName,
} from "@/lib/runtime/owner-display.resolver";
import {
  mapBackendFieldErrors,
  validateRuntimeForm,
} from "@/lib/runtime/runtime-form-validation";
import {
  flattenRuntimeRoles,
  hasAnyRuntimeRole,
  normalizeRuntimeRole,
} from "@/lib/runtime/role-runtime";
import { debugRuntime } from "@/lib/runtime/runtime-debug";
import { ModuleDetailShell } from "./module-detail-shell";
import { ModuleRefreshOverlay } from "./module-refresh-overlay";
import { ModuleRuntimeCommandHandler } from "./module-runtime-command-handler";
import { ModuleRuntimeProvider } from "./module-runtime-provider";
import type {
  RuntimeCommandEventContext,
  RuntimeCommandHandler,
  RuntimeRecordData,
} from "./module-runtime-ui.types";
import { TenantRuntimeStyleProvider } from "./tenant-runtime-style-provider";

export type ModuleRecordPageMode = "create" | "read" | "edit";

export function ModuleRecordPage({
  activeForm,
  dataAdapter,
  formSlot,
  lookupDisplayValues = {},
  lookupOptions = {},
  mode,
  moduleKey,
  record,
  recordId,
  runtime,
  tabsSlot,
  title,
}: {
  readonly activeForm: FormMetadata | null;
  readonly dataAdapter?: ModuleDataAdapter;
  readonly formSlot?: ReactNode;
  readonly lookupDisplayValues?: Record<string, string>;
  readonly lookupOptions?: Record<string, readonly LookupOption[]>;
  readonly mode: ModuleRecordPageMode;
  readonly moduleKey: string;
  readonly record: RuntimeRecordData;
  readonly recordId?: string;
  readonly runtime: ModuleRuntimeContext;
  readonly tabsSlot?: ReactNode;
  readonly title?: string;
}) {
  void moduleKey;
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const effectiveRuntime = useMemo(
    () => ({ ...runtime, recordId: recordId ?? runtime.recordId }),
    [recordId, runtime],
  );
  const effectiveRecord = useMemo(
    () => withCreateDefaults(record, effectiveRuntime, mode),
    [effectiveRuntime, mode, record],
  );
  const [draftRecord, setDraftRecord] =
    useState<RuntimeRecordData>(effectiveRecord);
  const [adapterOwnerOptions, setAdapterOwnerOptions] = useState<
    readonly ModuleOwnerOption[]
  >([]);
  const [ownerOptionsError, setOwnerOptionsError] = useState<string | null>(
    null,
  );
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, readonly string[]>
  >({});
  const [touchedFields, setTouchedFields] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [validationSummary, setValidationSummary] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const updateDraft = window.setTimeout(() => {
      setDraftRecord(effectiveRecord);
    }, 0);
    return () => window.clearTimeout(updateDraft);
  }, [effectiveRecord]);

  useEffect(() => {
    const firstField = Object.keys(fieldErrors)[0];
    if (!firstField) return;
    const timer = window.setTimeout(() => {
      const container = document.querySelector<HTMLElement>(
        `[data-runtime-field="${CSS.escape(firstField)}"]`,
      );
      container?.scrollIntoView({ behavior: "smooth", block: "center" });
      container
        ?.querySelector<HTMLElement>(
          "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])",
        )
        ?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fieldErrors]);

  const requestedFormId = searchParams.get("formId");

  useEffect(() => {
    const forms = effectiveRuntime.metadata.forms.filter(
      (form) =>
        form.lifecycleState === "published" ||
        form.lifecycleState === "deprecated",
    );
    const requestedFormExists =
      requestedFormId && forms.some((form) => form.id === requestedFormId);
    const fallbackForm =
      forms.find(
        (form) =>
          form.logicalName ===
          effectiveRuntime.metadata.entity.defaultFormLogicalName,
      ) ??
      forms[0] ??
      null;
    const hasLegacyFormKey = searchParams.has("form");

    if (requestedFormExists && !hasLegacyFormKey) return;

    const params = new URLSearchParams(searchParams.toString());
    params.delete("form");
    if ((!requestedFormId || !requestedFormExists) && fallbackForm?.id) {
      params.set("formId", fallbackForm.id);
    } else if (!requestedFormId || !requestedFormExists) {
      params.delete("formId");
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }, [
    effectiveRuntime.metadata.entity.defaultFormLogicalName,
    effectiveRuntime.metadata.forms,
    pathname,
    requestedFormId,
    router,
    searchParams,
  ]);

  const surface =
    mode === "create" ? "create" : mode === "read" ? "detail" : "edit";
  const commands = resolveCommandsForSurface(
    runtime.metadata.commands,
    surface,
    { principal: runtime.security.principal, record: draftRecord },
  ).filter(
    (command) =>
      allowedCommandKeysByMode[mode].has(command.key) ||
      (mode === "read" &&
        !command.key.startsWith("system.") &&
        !command.key.startsWith("record.") &&
        !command.key.startsWith("selection.")),
  );
  const commandGroups = groupCommands(commands, {
    primaryCommandKeys: primaryCommandKeysByMode[mode],
  });
  const loadOwnerOptions = useCallback(
    async (query: string) => {
      if (!dataAdapter?.getOwnerOptions) return;

      try {
        const options = await dataAdapter.getOwnerOptions(
          effectiveRuntime,
          query,
        );
        debugRuntime("Status Group owner options loaded", {
          moduleKey: effectiveRuntime.module.key,
          recordId: effectiveRuntime.recordId,
          query,
          ownerOptionsCount: options.length,
        });
        setOwnerOptionsError(null);
        setAdapterOwnerOptions((current) =>
          mergeModuleOwnerOptions(current, options),
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to load owner options.";
        setOwnerOptionsError(message);
        debugRuntime("Status Group owner options error", {
          moduleKey: effectiveRuntime.module.key,
          recordId: effectiveRuntime.recordId,
          query,
          error: message,
        });
      }
    },
    [dataAdapter, effectiveRuntime],
  );
  const statusGroupEditable = canEditStatusGroup(mode, effectiveRuntime);
  const canAssignOwner =
    effectiveRuntime.security.principal.permissionKeys.includes(
      "employees.assign",
    );
  const statusGroupConfig = buildStatusGroupConfig(
    effectiveRuntime,
    draftRecord,
    lookupDisplayValues,
    mergeOwnerOptions(
      lookupOptions[effectiveRuntime.metadata.entity.ownerField ?? ""]?.map(
        (option) => ({
          value: option.id,
          label: option.name,
          email: option.subtitle,
        }),
      ) ?? [],
      adapterOwnerOptions.map(toStatusOwnerOption),
    ),
    ownerOptionsError,
    !statusGroupEditable,
    (fieldLogicalName, value) =>
      setDraftRecord((current) => ({
        ...current,
        [fieldLogicalName]: value,
      })),
    (query) => {
      void loadOwnerOptions(query);
    },
  );
  const statusGroupOwnerField = statusGroupConfig?.ownerFieldLogicalName;

  useEffect(() => {
    if (!statusGroupOwnerField || (!statusGroupEditable && !canAssignOwner)) {
      return;
    }
    const loadOptions = window.setTimeout(() => {
      void loadOwnerOptions("");
    }, 0);
    return () => window.clearTimeout(loadOptions);
  }, [
    canAssignOwner,
    loadOwnerOptions,
    statusGroupEditable,
    statusGroupOwnerField,
  ]);

  debugRuntime("ModuleRecordPage rendered", {
    mode,
    moduleKey: runtime.module.key,
    recordId: effectiveRuntime.recordId,
    currentPrincipal: effectiveRuntime.security.principal,
    roleKeys: effectiveRuntime.security.principal.roleKeys,
    rawRoles: effectiveRuntime.security.principal.roles,
    normalizedRoles: flattenRuntimeRoles(
      getRuntimePrincipalRoles(effectiveRuntime),
    ).map(normalizeRuntimeRole),
    canEditStatusGroup: !statusGroupConfig?.disabled,
    ownerField: effectiveRuntime.metadata.entity.ownerField,
    statusField: effectiveRuntime.metadata.entity.statusField,
    subStatusField: effectiveRuntime.metadata.entity.subStatusField,
    currentOwnerId: effectiveRuntime.metadata.entity.ownerField
      ? draftRecord[effectiveRuntime.metadata.entity.ownerField]
      : undefined,
    status: effectiveRuntime.metadata.entity.statusField
      ? draftRecord[effectiveRuntime.metadata.entity.statusField]
      : undefined,
    subStatus: effectiveRuntime.metadata.entity.subStatusField
      ? draftRecord[effectiveRuntime.metadata.entity.subStatusField]
      : undefined,
    ownerOptionsCount: statusGroupConfig?.ownerOptions?.length ?? 0,
  });

  function handleFormChange(formId: string) {
    const params = new URLSearchParams(searchParams.toString());

    params.delete("form");
    if (formId) {
      params.set("formId", formId);
    } else {
      params.delete("formId");
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  return (
    <TenantRuntimeStyleProvider tenant={runtime.tenant}>
      <ModuleRuntimeProvider
        activeForm={activeForm}
        record={draftRecord}
        runtime={effectiveRuntime}
      >
        <ModuleRuntimeCommandHandler
          activeForm={activeForm}
          dataAdapter={dataAdapter}
          onResult={(result) => {
            if (result.status !== "failure") {
              setValidationSummary(null);
              const nextRecord = readResultRecord(result.data);
              if (nextRecord) {
                setDraftRecord((current) => ({ ...current, ...nextRecord }));
              }
              return;
            }

            const backendErrors = mapBackendFieldErrors({
              errors: readResultFieldErrors(result.data),
              fieldMap: { ownerUserId: "ownerId" },
            });

            if (Object.keys(backendErrors).length) {
              setFieldErrors(backendErrors);
              setTouchedFields(new Set(Object.keys(backendErrors)));
              setValidationSummary(null);
              return;
            }
            setValidationSummary(result.message ?? "Save failed.");
          }}
          runtime={effectiveRuntime}
        >
          {({ isRefreshing, onCommand }) => (
            <>
              <ModuleRefreshOverlay active={isRefreshing} />
              <ModuleDetailShell
                activeFormId={activeForm?.id}
                commands={commandGroups}
                error={validationSummary}
                formSlot={
                  formSlot ??
                  (activeForm ? (
                    <RuntimeMetadataFormRenderer
                      entity={runtime.metadata.entity}
                      form={activeForm}
                      lookupDisplayValues={lookupDisplayValues}
                      lookupOptions={lookupOptions}
                      mode={
                        mode === "create"
                          ? "new"
                          : mode === "read"
                            ? "detail"
                            : "edit"
                      }
                      dataAdapter={dataAdapter}
                      fieldErrors={fieldErrors}
                      onValuesChange={(values) =>
                        setDraftRecord((current) => {
                          setValidationSummary(null);
                          return { ...current, ...values };
                        })
                      }
                      runtime={effectiveRuntime}
                      touchedFields={touchedFields}
                      values={toFieldValueMap(draftRecord)}
                    />
                  ) : (
                    <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
                      Form metadata is unavailable.
                    </div>
                  ))
                }
                loading={isRefreshing}
                onCommand={(commandKey, context) =>
                  handleRecordCommand(commandKey, context, onCommand)
                }
                onFormChange={handleFormChange}
                record={draftRecord}
                runtime={effectiveRuntime}
                statusGroupConfig={statusGroupConfig}
                tabsSlot={tabsSlot}
                title={title ?? titleByMode[mode](runtime.module.label)}
              />
            </>
          )}
        </ModuleRuntimeCommandHandler>
      </ModuleRuntimeProvider>
    </TenantRuntimeStyleProvider>
  );

  function handleRecordCommand(
    commandKey: string,
    context: RuntimeCommandEventContext,
    onCommand: RuntimeCommandHandler,
  ) {
    if (!isSaveCommand(commandKey) || !activeForm) {
      onCommand(commandKey, context);
      return;
    }

    const validation = validateRuntimeForm({
      entity: effectiveRuntime.metadata.entity,
      form: activeForm,
      values: toFieldValueMap(draftRecord),
    });

    if (!validation.isValid) {
      setFieldErrors(validation.errors);
      setTouchedFields(new Set(Object.keys(validation.errors)));
      setValidationSummary(null);
      debugRuntime("Save blocked by runtime validation", {
        commandKey,
        moduleKey: effectiveRuntime.module.key,
        recordId: effectiveRuntime.recordId,
        errors: validation.errors,
      });
      return;
    }

    setFieldErrors({});
    setTouchedFields(new Set());
    setValidationSummary(null);
    onCommand(commandKey, context);
  }
}

const allowedCommandKeysByMode: Record<
  ModuleRecordPageMode,
  ReadonlySet<string>
> = {
  read: new Set([
    "system.back",
    "system.new",
    "system.edit",
    "system.refresh",
    "system.delete",
    "record.assignOwner",
    "record.export",
    "record.share",
  ]),
  edit: new Set([
    "system.back",
    "system.save",
    "system.saveAndClose",
    "system.refresh",
  ]),
  create: new Set(["system.back", "system.save", "system.saveAndClose"]),
};

const primaryCommandKeysByMode: Record<
  ModuleRecordPageMode,
  readonly string[]
> = {
  read: [
    "system.back",
    "system.new",
    "system.edit",
    "system.refresh",
    "record.assignOwner",
    "record.export",
    "record.share",
  ],
  edit: ["system.back", "system.save", "system.saveAndClose", "system.refresh"],
  create: ["system.back", "system.save", "system.saveAndClose"],
};

const titleByMode: Record<
  ModuleRecordPageMode,
  (moduleLabel: string) => string
> = {
  read: (moduleLabel) => moduleLabel,
  edit: (moduleLabel) => `Edit ${moduleLabel}`,
  create: (moduleLabel) => `New ${moduleLabel}`,
};

function isSaveCommand(commandKey: string) {
  return commandKey === "system.save" || commandKey === "system.saveAndClose";
}

function readResultFieldErrors(data: unknown) {
  if (!data || typeof data !== "object") return undefined;
  return (data as { fieldErrors?: unknown }).fieldErrors;
}

function readResultRecord(data: unknown): RuntimeRecordData | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as RuntimeRecordData & {
    readonly data?: unknown;
    readonly record?: unknown;
  };
  if (
    record.data &&
    typeof record.data === "object" &&
    !Array.isArray(record.data)
  ) {
    return record.data as RuntimeRecordData;
  }
  if (
    record.record &&
    typeof record.record === "object" &&
    !Array.isArray(record.record)
  ) {
    return record.record as RuntimeRecordData;
  }
  return record;
}

function buildStatusGroupConfig(
  runtime: ModuleRuntimeContext,
  record: RuntimeRecordData,
  lookupDisplayValues: Readonly<Record<string, string>>,
  ownerOptions: readonly {
    readonly value: string;
    readonly label: string;
    readonly email?: string | null;
  }[],
  ownerOptionsError: string | null,
  disabled: boolean,
  onValueChange: (fieldLogicalName: string, value: string) => void,
  onOwnerSearch?: (query: string) => void,
) {
  const ownerFieldName = runtime.metadata.entity.ownerField;
  const statusFieldName = runtime.metadata.entity.statusField;

  if (!ownerFieldName || !statusFieldName) return null;

  return {
    ownerFieldLogicalName: ownerFieldName,
    statusFieldLogicalName: statusFieldName,
    subStatusFieldLogicalName: runtime.metadata.entity.subStatusField,
    placement: "detail-status-group" as const,
    enabled: true,
    disabled,
    disabledReason: disabled
      ? "Owner, Status, and Sub Status can be edited only by Global Administrator, System Administrator, HR, or HR Manager."
      : undefined,
    onValueChange,
    onOwnerSearch,
    ownerField: runtime.metadata.entity.fields.find(
      (field) => field.logicalName === ownerFieldName,
    ),
    ownerOptions: withCurrentLookupOption(
      ownerOptions,
      ownerFieldName,
      readRecordStringValue(record, ownerFieldName),
      lookupDisplayValues,
      record,
      runtime,
    ),
    ownerOptionsError,
    lookupDisplayValues,
    statusField: runtime.metadata.entity.fields.find(
      (field) => field.logicalName === statusFieldName,
    ),
    subStatusField: runtime.metadata.entity.subStatusField
      ? runtime.metadata.entity.fields.find(
          (field) =>
            field.logicalName === runtime.metadata.entity.subStatusField,
        )
      : null,
  };
}

function withCurrentLookupOption(
  options: readonly {
    readonly value: string;
    readonly label: string;
    readonly email?: string | null;
  }[],
  fieldLogicalName: string,
  fieldValue: string,
  lookupDisplayValues: Readonly<Record<string, string>>,
  record: RuntimeRecordData,
  runtime: ModuleRuntimeContext,
) {
  const displayValue = resolveOwnerDisplayName({
    lookupDisplayValue: lookupDisplayValues[fieldLogicalName],
    ownerId: fieldValue,
    ownerOptions: options.map((option) => ({
      id: option.value,
      name: option.label,
      email: option.email,
    })),
    principal: runtime.security.principal,
    record,
  });

  if (!displayValue || !fieldValue) return options;
  if (options.some((option) => option.value === fieldValue)) return options;

  return [{ value: fieldValue, label: displayValue }, ...options];
}

function readRecordStringValue(
  record: RuntimeRecordData,
  fieldLogicalName: string,
) {
  const value = record[fieldLogicalName];
  return typeof value === "string" ? value : "";
}

function mergeOwnerOptions(
  first: readonly {
    readonly value: string;
    readonly label: string;
    readonly email?: string | null;
  }[],
  second: readonly {
    readonly value: string;
    readonly label: string;
    readonly email?: string | null;
  }[],
) {
  const seen = new Set<string>();
  const merged: Array<{
    readonly value: string;
    readonly label: string;
    readonly email?: string | null;
  }> = [];

  for (const option of [...first, ...second]) {
    if (!option.value || seen.has(option.value)) continue;
    seen.add(option.value);
    merged.push(option);
  }

  return merged;
}

function mergeModuleOwnerOptions(
  first: readonly ModuleOwnerOption[],
  second: readonly ModuleOwnerOption[],
) {
  const seen = new Set<string>();
  const merged: ModuleOwnerOption[] = [];

  for (const option of [...first, ...second]) {
    const normalized = normalizeOwnerOption(option);
    if (!normalized.id || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    merged.push(normalized);
  }

  return merged;
}

function toStatusOwnerOption(option: ModuleOwnerOption) {
  const normalized = normalizeOwnerOption(option);

  return {
    value: normalized.id,
    label: normalized.name,
    email: normalized.email,
  };
}

const STATUS_GROUP_EDITOR_ROLES = [
  "global-admin",
  "global admin",
  "global administrator",
  "global-administrator",
  "system-admin",
  "system admin",
  "system administrator",
  "system-administrator",
  "hr",
  "hr manager",
] as const;

function canEditStatusGroup(
  mode: ModuleRecordPageMode,
  runtime: ModuleRuntimeContext,
) {
  const rawRoles = getRuntimePrincipalRoles(runtime);
  const result =
    (mode === "edit" || mode === "create") &&
    hasAnyRuntimeRole(rawRoles, STATUS_GROUP_EDITOR_ROLES);

  debugRuntime("Status Group editability", {
    mode,
    rawRoles,
    roleKeys: runtime.security.principal.roleKeys,
    normalizedRoles: flattenRuntimeRoles(rawRoles).map(normalizeRuntimeRole),
    allowedRoles: STATUS_GROUP_EDITOR_ROLES,
    canEditStatusGroup: result,
  });

  return result;
}

function getRuntimePrincipalRoles(runtime: ModuleRuntimeContext) {
  return [
    ...runtime.security.principal.roleKeys,
    ...(runtime.security.principal.roles ?? []),
  ];
}

function withCreateDefaults(
  record: RuntimeRecordData,
  runtime: ModuleRuntimeContext,
  mode: ModuleRecordPageMode,
) {
  if (mode !== "create") return record;

  const ownerField = runtime.metadata.entity.ownerField;
  if (!ownerField || record[ownerField]) return record;
  const ownerName = principalDisplayName(runtime.security.principal);

  return {
    ...record,
    [ownerField]: runtime.security.principal.userId,
    ownerDisplayName: ownerName,
    ownerName,
    ownerEmail: runtime.security.principal.email,
  };
}

function toFieldValueMap(record: RuntimeRecordData) {
  const values: Record<
    string,
    string | number | boolean | readonly string[] | null | undefined
  > = {};

  for (const [key, value] of Object.entries(record)) {
    values[key] = isFieldValue(value)
      ? value
      : value == null
        ? null
        : String(value);
  }

  return values;
}

function isFieldValue(
  value: unknown,
): value is string | number | boolean | readonly string[] | null | undefined {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}
