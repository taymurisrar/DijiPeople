"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  RuntimeMetadataFormRenderer,
  type FieldValueMap,
  type RuntimeTabContent,
} from "@/app/components/metadata/runtime-metadata-form-renderer";
import { SideToast } from "@/app/components/notifications";
import type { LookupOption } from "@/app/components/ui/form-control";
import {
  groupCommands,
  resolveCommandsForSurface,
} from "@/lib/runtime/command-runtime.resolver";
import type {
  EntityMetadata,
  FieldMetadata,
  FormFieldMetadata,
  FormMetadata,
} from "@/lib/runtime/metadata-runtime.types";
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
import { normalizeRuntimeDateValue } from "@/lib/runtime/runtime-date-value";
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
  tabContent,
  sectionContent,
  tabsSlot,
  title,
  deriveValuesOnChange,
  resolveFieldEditable,
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
  readonly tabContent?: Readonly<Record<string, RuntimeTabContent>>;
  readonly sectionContent?: Readonly<Record<string, RuntimeTabContent>>;
  readonly tabsSlot?: ReactNode;
  readonly title?: string;
  readonly deriveValuesOnChange?: (input: {
    readonly changedField: FieldMetadata;
    readonly lookupOptions: Record<string, readonly LookupOption[]>;
    readonly nextValues: FieldValueMap;
    readonly previousValues: FieldValueMap;
  }) => FieldValueMap;
  readonly resolveFieldEditable?: (input: {
    readonly defaultEditable: boolean;
    readonly field: FieldMetadata;
    readonly formField: FormFieldMetadata;
    readonly values: FieldValueMap;
  }) => boolean;
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
  const effectiveRecordResetKey = runtimeRecordResetKey(
    effectiveRecord,
    effectiveRuntime.recordId,
    mode,
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
  const [actionNotice, setActionNotice] = useState<{
    readonly title: string;
    readonly description?: string;
    readonly variant: "success" | "error";
  } | null>(null);

  useEffect(() => {
    const storedNotice = readStoredRuntimeSaveNotice();
    if (!storedNotice) return;
    if (
      storedNotice.moduleKey &&
      storedNotice.moduleKey !== effectiveRuntime.module.key
    ) {
      return;
    }
    setActionNotice({
      title: storedNotice.title,
      description: storedNotice.description,
      variant: "success",
    });
  }, [effectiveRuntime.module.key]);

  useEffect(() => {
    const updateDraft = window.setTimeout(() => {
      setDraftRecord((current) =>
        mode === "create"
          ? mergeCreateRecordDefaults(effectiveRecord, current)
          : effectiveRecord,
      );
    }, 0);
    return () => window.clearTimeout(updateDraft);
  }, [effectiveRecordResetKey]);

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
            if (isEmployeeAccountAction(result.command?.key)) {
              setActionNotice({
                title:
                  result.status === "failure"
                    ? "Record action failed"
                    : "Record action complete",
                description:
                  result.message ??
                  (result.status === "failure"
                    ? "The action could not be completed."
                    : "The action completed successfully."),
                variant: result.status === "failure" ? "error" : "success",
              });
            }

            if (result.status !== "failure") {
              setValidationSummary(null);
              if (isSaveCommand(result.command?.key ?? "")) {
                const notice = {
                  title: "Saved.",
                };
                setActionNotice({ ...notice, variant: "success" });
                storeRuntimeSaveNotice({
                  ...notice,
                  moduleKey: effectiveRuntime.module.key,
                });
              }
              const nextRecord = readResultRecord(result.data);
              if (nextRecord) {
                setDraftRecord((current) => ({ ...current, ...nextRecord }));
                if (
                  mode === "create" &&
                  result.command?.key === "system.save" &&
                  typeof nextRecord.id === "string" &&
                  nextRecord.id.trim()
                ) {
                  const params = new URLSearchParams(searchParams.toString());
                  const query = params.toString();
                  router.replace(
                    `${effectiveRuntime.module.routeBase}/${encodeURIComponent(nextRecord.id)}${query ? `?${query}` : ""}`,
                  );
                }
              }
              return;
            }

            const backendErrors = mapBackendFieldErrors({
              errors: readResultFieldErrors(result.data),
              fieldMap: { ownerUserId: "ownerId" },
            });

            /*
             * A save that fails only marked the fields or wrote an inline
             * summary, which is easy to miss on a long form. Every module using
             * this runtime now also gets a toast, matching the success path.
             */
            if (Object.keys(backendErrors).length) {
              setFieldErrors(backendErrors);
              setTouchedFields(new Set(Object.keys(backendErrors)));
              setValidationSummary(null);
              setActionNotice({
                title: "Check the highlighted fields",
                description: result.message ?? undefined,
                variant: "error",
              });
              return;
            }

            const failureMessage = result.message ?? "Save failed.";
            setValidationSummary(failureMessage);
            setActionNotice({
              title: "Not saved",
              description: failureMessage,
              variant: "error",
            });
          }}
          runtime={effectiveRuntime}
        >
          {({ isRefreshing, onCommand }) => (
            <>
              <ModuleRefreshOverlay active={isRefreshing} />
              <SideToast
                autoCloseMs={3000}
                description={actionNotice?.description}
                isOpen={Boolean(actionNotice)}
                onClose={() => setActionNotice(null)}
                placement="bottom-center"
                title={actionNotice?.title ?? ""}
                variant={actionNotice?.variant ?? "success"}
              />
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
                        deriveValuesOnChange={deriveValuesOnChange}
                        fieldErrors={fieldErrors}
                        onValuesChange={(values) =>
                          setDraftRecord((current) => {
                            setValidationSummary(null);
                            return { ...current, ...values };
                          })
                        }
                        runtime={effectiveRuntime}
                        resolveFieldEditable={resolveFieldEditable}
                        touchedFields={touchedFields}
                        values={toFieldValueMap(
                          draftRecord,
                          effectiveRuntime.metadata.entity,
                        )}
                        tabContent={tabContent}
                        sectionContent={sectionContent}
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
      values: toFieldValueMap(
        draftRecord,
        effectiveRuntime.metadata.entity,
      ),
    });

    if (!validation.isValid) {
      setFieldErrors(validation.errors);
      setTouchedFields(new Set(Object.keys(validation.errors)));
      setValidationSummary(null);
      /*
       * Field highlighting alone is easy to miss when the offending field is
       * scrolled out of view, so the block is announced as well.
       */
      const fieldCount = Object.keys(validation.errors).length;
      setActionNotice({
        title: "Check the highlighted fields",
        description: `${fieldCount} field${fieldCount === 1 ? "" : "s"} need${
          fieldCount === 1 ? "s" : ""
        } attention before saving.`,
        variant: "error",
      });
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
    onCommand(commandKey, {
      ...context,
      record: draftRecord,
      value: draftRecord,
    });
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
    "employees.resetPassword",
    "employees.sendInvitation",
    "employeeBankAccounts.submitVerification",
    "employeeBankAccounts.verify",
    "employeeBankAccounts.setPayroll",
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
    "employees.resetPassword",
    "employees.sendInvitation",
    "employeeBankAccounts.submitVerification",
    "employeeBankAccounts.verify",
    "employeeBankAccounts.setPayroll",
  ],
  edit: ["system.back", "system.save", "system.saveAndClose", "system.refresh"],
  create: ["system.back", "system.save", "system.saveAndClose"],
};

const runtimeSaveNoticeStorageKey = "dp.runtime.recordSaveNotice";

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

type StoredRuntimeSaveNotice = {
  readonly title: string;
  readonly description?: string;
  readonly moduleKey?: string;
  readonly expiresAt: number;
};

function storeRuntimeSaveNotice(
  notice: Omit<StoredRuntimeSaveNotice, "expiresAt">,
) {
  if (typeof window === "undefined") return;

  window.sessionStorage.setItem(
    runtimeSaveNoticeStorageKey,
    JSON.stringify({
      ...notice,
      expiresAt: Date.now() + 15_000,
    } satisfies StoredRuntimeSaveNotice),
  );
}

function readStoredRuntimeSaveNotice(): StoredRuntimeSaveNotice | null {
  if (typeof window === "undefined") return null;

  const storedValue = window.sessionStorage.getItem(
    runtimeSaveNoticeStorageKey,
  );
  if (!storedValue) return null;

  window.sessionStorage.removeItem(runtimeSaveNoticeStorageKey);

  try {
    const parsed = JSON.parse(storedValue) as Partial<StoredRuntimeSaveNotice>;
    if (
      !parsed.title ||
      typeof parsed.title !== "string" ||
      !parsed.expiresAt ||
      Date.now() > parsed.expiresAt
    ) {
      return null;
    }

    return {
      title: parsed.title,
      description:
        typeof parsed.description === "string" ? parsed.description : undefined,
      moduleKey:
        typeof parsed.moduleKey === "string" ? parsed.moduleKey : undefined,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

function isEmployeeAccountAction(commandKey: string | undefined) {
  return (
    commandKey === "employees.resetPassword" ||
    commandKey === "employees.sendInvitation" ||
    commandKey === "employeeBankAccounts.submitVerification" ||
    commandKey === "employeeBankAccounts.verify" ||
    commandKey === "employeeBankAccounts.setPayroll"
  );
}

function readResultFieldErrors(data: unknown) {
  if (!data || typeof data !== "object") return undefined;
  const record = data as {
    readonly fieldErrors?: unknown;
    readonly fields?: unknown;
    readonly details?: unknown;
  };
  if (record.fieldErrors) return record.fieldErrors;
  if (record.fields) return record.fields;

  if (
    record.details &&
    typeof record.details === "object" &&
    !Array.isArray(record.details)
  ) {
    const details = record.details as {
      readonly fieldErrors?: unknown;
      readonly fields?: unknown;
    };
    return details.fieldErrors ?? details.fields;
  }

  return undefined;
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

  if (!statusFieldName) return null;

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
      ownerFieldName ?? "",
      ownerFieldName ? readRecordStringValue(record, ownerFieldName) : "",
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
  if (!fieldLogicalName) return options;

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

function runtimeRecordResetKey(
  record: RuntimeRecordData,
  recordId: string | null | undefined,
  mode: ModuleRecordPageMode,
) {
  try {
    return `${mode}:${recordId ?? "new"}:${JSON.stringify(record)}`;
  } catch {
    return `${mode}:${recordId ?? "new"}:${String(
      record.id ?? record.value ?? record.name ?? "record",
    )}`;
  }
}

function mergeCreateRecordDefaults(
  defaults: RuntimeRecordData,
  current: RuntimeRecordData,
) {
  const merged: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(current)) {
    if (hasMeaningfulDraftValue(value)) merged[key] = value;
  }
  return merged;
}

function hasMeaningfulDraftValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function toFieldValueMap(record: RuntimeRecordData, entity: EntityMetadata) {
  const values: Record<
    string,
    | string
    | number
    | boolean
    | readonly string[]
    | readonly Record<string, unknown>[]
    | Record<string, unknown>
    | null
    | undefined
  > = {};

  const fieldsByName = new Map(
    entity.fields.map((field) => [field.logicalName, field]),
  );

  for (const [key, value] of Object.entries(record)) {
    if (fieldsByName.get(key)?.dataType === "date") {
      values[key] = value == null ? null : normalizeRuntimeDateValue(value);
      continue;
    }
    values[key] = isFieldValue(value)
      ? value
      : value == null
        ? null
        : readableObjectValue(value) || String(value);
  }

  return values;
}

function readableObjectValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  for (const key of ["name", "fullName", "displayName", "label"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return "";
}

function isFieldValue(
  value: unknown,
): value is
  | string
  | number
  | boolean
  | readonly string[]
  | readonly Record<string, unknown>[]
  | Record<string, unknown>
  | null
  | undefined {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (Array.isArray(value) &&
      value.every(
        (item) =>
          typeof item === "string" ||
          (Boolean(item) && typeof item === "object" && !Array.isArray(item)),
      )) ||
    (Boolean(value) && typeof value === "object" && !Array.isArray(value))
  );
}
