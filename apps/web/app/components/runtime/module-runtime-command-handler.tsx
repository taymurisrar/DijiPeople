"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ConfirmationDialog } from "@/app/components/notifications";
import {
  apiErrorEventName,
  INLINE_ERROR_HANDLING_HEADERS,
} from "@/lib/api-error";
import {
  buildAdapterCommandHandlers,
  executeRuntimeCommand,
  type RuntimeCommandExecutionResult,
} from "@/lib/runtime";
import {
  getCommandPayloadSchema,
  type CommandPayloadSchema,
} from "@/lib/runtime/command-payload-schema";
import {
  classifyAttendanceFailure,
  classifyLocationCaptureFailure,
  type AttendanceOutcome,
} from "@/lib/attendance/attendance-outcome";
import {
  buildLocationPayload,
  captureDeviceLocation,
} from "@/lib/location/location-capture";
import { AttendanceActionFeedback } from "./attendance-action-feedback";
import { debugRuntime } from "@/lib/runtime/runtime-debug";
import type { CommandDefinition } from "@/lib/runtime/command-runtime.types";
import type {
  FormMetadata,
  ViewMetadata,
} from "@/lib/runtime/metadata-runtime.types";
import type {
  ModuleDataAdapter,
  ModuleOwnerOption,
} from "@/lib/runtime/module-data-adapter.types";
import type { ModuleRuntimeContext } from "@/lib/runtime/module-runtime.types";
import {
  normalizeOwnerOption,
  resolveOwnerDisplayName,
} from "@/lib/runtime/owner-display.resolver";
import { ModuleAssignDialog } from "./module-assign-dialog";
import { ModuleCommandActionDialog } from "./module-command-action-dialog";
import { ModuleShareDialog } from "./module-share-dialog";
import type {
  RuntimeCommandEventContext,
  RuntimeCommandHandler,
  RuntimeRecordData,
} from "./module-runtime-ui.types";

export function ModuleRuntimeCommandHandler({
  activeForm,
  activeView,
  children,
  dataAdapter,
  listRecords = [],
  navigationCommands,
  onResult,
  runtime,
}: {
  readonly activeForm?: FormMetadata | null;
  readonly activeView?: ViewMetadata | null;
  readonly children: (input: {
    readonly isRefreshing: boolean;
    readonly lastResult: RuntimeCommandExecutionResult | null;
    readonly onCommand: RuntimeCommandHandler;
  }) => ReactNode;
  readonly dataAdapter?: ModuleDataAdapter;
  readonly listRecords?: readonly RuntimeRecordData[];
  readonly navigationCommands?: Record<
    string,
    {
      readonly kind: "new" | "edit" | "back" | "refresh" | "openRecord";
      readonly hrefTemplate?: string;
    }
  >;
  readonly onResult?: (result: RuntimeCommandExecutionResult) => void;
  readonly runtime: ModuleRuntimeContext;
}) {
  const router = useRouter();
  const [lastResult, setLastResult] =
    useState<RuntimeCommandExecutionResult | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    readonly command: CommandDefinition;
    readonly context: RuntimeCommandEventContext;
  } | null>(null);
  const [assignContext, setAssignContext] =
    useState<RuntimeCommandEventContext | null>(null);
  const [ownerOptions, setOwnerOptions] = useState<
    readonly ModuleOwnerOption[]
  >([]);
  const [shareLink, setShareLink] = useState("");
  /*
   * The one-click attendance flow. `busyLabel` narrates the location capture,
   * `outcome` holds the contextual answer that replaced the technical error
   * dialog for expected refusals, and `retry` re-runs the exact same attempt.
   */
  const [attendanceBusyLabel, setAttendanceBusyLabel] = useState<string | null>(
    null,
  );
  const [attendanceOutcome, setAttendanceOutcome] =
    useState<AttendanceOutcome | null>(null);
  const [attendanceRetry, setAttendanceRetry] = useState<(() => void) | null>(
    null,
  );

  const [actionContext, setActionContext] = useState<{
    readonly command: CommandDefinition;
    readonly context: RuntimeCommandEventContext;
  } | null>(null);
  const [isDialogLoading, setIsDialogLoading] = useState(false);

  async function handleCommand(
    commandKey: string,
    context: RuntimeCommandEventContext,
  ) {
    const command = resolveRuntimeCommand(commandKey, runtime);

    debugRuntime("Command clicked", {
      commandKey,
      mode: runtime.pageKind,
      recordId: runtime.recordId,
      selectedRecordIds: context.selectedRecordIds,
      adapterMethods: dataAdapter ? Object.keys(dataAdapter) : [],
    });

    if (!command) {
      setLastResult({
        status: "failure",
        message: `Command ${commandKey} was not found.`,
      });
      return;
    }

    if (command.isDisabled) {
      setLastResult({
        status: "failure",
        command,
        message:
          command.disabledReason ?? `Command ${command.key} is disabled.`,
      });
      return;
    }

    if (commandKey === "record.share") {
      const href = shareHref(context, runtime, activeForm);
      if (!href) {
        setLastResult({
          status: "failure",
          command,
          message: "Share requires a record route.",
        });
        return;
      }

      setShareLink(href);
      return;
    }

    if (
      commandKey === "selection.assignOwner" ||
      commandKey === "record.assignOwner"
    ) {
      debugRuntime("Assign command clicked", {
        commandKey,
        moduleKey: runtime.module.key,
        recordId: context.recordId ?? runtime.recordId,
        selectedRecordIds: context.selectedRecordIds,
        currentOwnerId: currentOwnerId(context.record, runtime),
      });

      if (!dataAdapter?.assignOwner) {
        setLastResult({
          status: "failure",
          command,
          message: "Owner assignment is not supported by this module adapter.",
        });
        return;
      }

      setIsDialogLoading(true);
      try {
        await loadOwnerOptions(context, "");
        setAssignContext(context);
      } catch (error) {
        debugRuntime("Assign owner options failed", { commandKey, error });
        setLastResult({
          status: "failure",
          command,
          message:
            error instanceof Error
              ? error.message
              : "Unable to load owner options.",
        });
      } finally {
        setIsDialogLoading(false);
      }
      return;
    }

    if (command.payloadSchemaKey) {
      const schema = getCommandPayloadSchema(command.payloadSchemaKey);
      /*
       * A schema with nothing to ask opens no drawer. Check-in used to present a
       * form whose only required field was the one claim the server must decide
       * for itself, so the employee's answer was collected and then discarded.
       */
      if (schema?.autoSubmit) {
        await runAutoSubmitCommand(command.key, context, schema);
        return;
      }
      setActionContext({ command, context });
      return;
    }

    if (command.requiresConfirmation || command.confirmation) {
      setPendingConfirmation({ command, context });
      return;
    }

    await executeCommand(commandKey, context);
  }

  async function executeCommand(
    commandKey: string,
    context: RuntimeCommandEventContext,
  ) {
    debugRuntime("Command execution started", {
      commandKey,
      recordId: context.recordId ?? runtime.recordId,
      selectedRecordIds: context.selectedRecordIds,
      payload: context.value,
      recordSystemFields: readSystemFieldDebug(context.record, runtime),
    });

    if (commandKey === "system.refresh") {
      setIsRefreshing(true);
      window.setTimeout(() => setIsRefreshing(false), 650);
    }

    const result = await executeRuntimeCommand(
      {
        commandKey,
        runtime,
        form: activeForm,
        payload: context.value,
        record: context.record,
        selectedRecordIds: context.selectedRecordIds,
        view: activeView,
      },
      {
        commandHandlers: buildAdapterCommandHandlers({
          dataAdapter,
          downloadFile,
          form: activeForm,
          listRecords,
          navigate: (href) => {
            if (isSafeModuleHref(href, runtime.module.routeBase)) {
              router.push(href);
            }
          },
          refresh: () => router.refresh(),
          view: activeView,
        }),
        navigation: {
          back: () => router.push(resolveBackHref(runtime)),
          navigate: (href) => {
            if (isSafeModuleHref(href, runtime.module.routeBase)) {
              router.push(href);
            }
          },
          refresh: () => router.refresh(),
        },
      },
      {
        navigationCommands: navigationCommands ?? {
          "system.new": {
            kind: "new",
            hrefTemplate: appendFormIdToHrefTemplate(
              `${runtime.module.routeBase}/new`,
              activeForm,
            ),
          },
          "system.edit": {
            kind: "edit",
            hrefTemplate: appendFormIdToHrefTemplate(
              `${runtime.module.routeBase}/{recordId}/edit`,
              activeForm,
            ),
          },
          "system.back": { kind: "back" },
          "system.refresh": { kind: "refresh" },
        },
      },
    );

    debugRuntime("Command result", {
      commandKey,
      status: result.status,
      message: result.message,
      data: result.data,
    });

    setLastResult(result);
    onResult?.(result);

    if (result.status === "failure" && !hasFieldValidationErrors(result.data)) {
      /*
       * Expected attendance outcomes are answered in place; only genuine
       * defects reach the platform's technical dialog. Routing a
       * device-required refusal into that dialog showed an employee
       * "ERROR VALIDATION_FAILED", a reference id and a log download for the
       * system working exactly as configured.
       */
      const outcome = isAttendanceCommand(result.command?.key)
        ? classifyAttendanceFailure(readCommandFailureError(result))
        : null;

      if (outcome && !outcome.useTechnicalErrorModal) {
        setAttendanceOutcome(outcome);
      } else {
        dispatchCommandFailure(result, runtime);
      }
    }

    if (
      (result.status === "success" || result.status === "refreshRequired") &&
      result.command?.key !== "system.refresh"
    ) {
      router.refresh();
    }

    if (result.status === "navigation" && result.href) {
      if (isSafeModuleHref(result.href, runtime.module.routeBase)) {
        router.push(result.href);
      }
    }
  }

  /**
   * Runs a command whose payload the client assembles by itself.
   *
   * The position is captured on every attempt, unconditionally, because whether
   * the employee is inside a work site is exactly what the server needs in order
   * to decide the work mode — the old rule captured a position only once the
   * mode was already known, which could never be true on the first punch.
   */
  async function runAutoSubmitCommand(
    commandKey: string,
    context: RuntimeCommandEventContext,
    schema: CommandPayloadSchema,
  ) {
    const attempt = () => void runAutoSubmitCommand(commandKey, context, schema);
    setAttendanceOutcome(null);
    setAttendanceRetry(null);

    if (!schema.geolocation) {
      await executeCommand(commandKey, { ...context, value: {} });
      return;
    }

    setAttendanceBusyLabel("Checking your location…");
    try {
      const policy = await loadCommandPolicy(schema.contextPath);
      const location = await captureDeviceLocation({
        timeoutSeconds: policy.timeoutSeconds,
        highAccuracy: policy.highAccuracy,
      });

      if (!location.ok) {
        setAttendanceOutcome(
          classifyLocationCaptureFailure({
            reason: location.reason,
            message: location.message,
          }),
        );
        setAttendanceRetry(() => attempt);
        return;
      }

      await executeCommand(commandKey, {
        ...context,
        value: buildLocationPayload(location, {
          userAgent:
            policy.storeUserAgent && typeof navigator !== "undefined"
              ? navigator.userAgent
              : undefined,
        }),
      });
      setAttendanceRetry(() => attempt);
    } finally {
      setAttendanceBusyLabel(null);
    }
  }

  async function confirmPendingCommand() {
    if (!pendingConfirmation) return;
    const pending = pendingConfirmation;
    setPendingConfirmation(null);
    setIsDialogLoading(true);
    await executeCommand(pending.command.key, pending.context);
    setIsDialogLoading(false);
  }

  async function confirmAssign(ownerId: string) {
    if (!assignContext) return;
    const commandKey =
      assignContext.selectedRecordIds?.length || !runtime.recordId
        ? "selection.assignOwner"
        : "record.assignOwner";

    setIsDialogLoading(true);
    debugRuntime("Assign adapter payload", {
      commandKey,
      moduleKey: runtime.module.key,
      recordId: runtime.recordId,
      selectedRecordIds: assignContext.selectedRecordIds,
      ownerId,
    });
    await executeCommand(commandKey, {
      ...assignContext,
      value: { ownerId },
    });
    debugRuntime("Assign adapter execution finished", {
      commandKey,
      moduleKey: runtime.module.key,
      ownerId,
    });
    setAssignContext(null);
    setIsDialogLoading(false);
  }

  async function loadOwnerOptions(
    context: RuntimeCommandEventContext | null,
    search: string,
  ) {
    const options = dataAdapter?.getOwnerOptions
      ? await dataAdapter.getOwnerOptions(runtime, search)
      : readOwnerOptionsFromRuntime(context?.record, runtime);
    debugRuntime("Assign owner options loaded", {
      search,
      optionCount: options.length,
    });
    setOwnerOptions(withCurrentOwnerOption(options, context?.record, runtime));
  }

  return (
    <>
      {children({ isRefreshing, lastResult, onCommand: handleCommand })}
      <ConfirmationDialog
        confirmLabel={
          confirmationConfig(pendingConfirmation?.command).confirmLabel
        }
        description={confirmationDescription(
          pendingConfirmation?.command,
          pendingConfirmation?.context,
        )}
        isLoading={isDialogLoading}
        isOpen={Boolean(pendingConfirmation)}
        onCancel={() => setPendingConfirmation(null)}
        onConfirm={confirmPendingCommand}
        title={confirmationConfig(pendingConfirmation?.command).title}
        variant={
          confirmationConfig(pendingConfirmation?.command).destructive
            ? "danger"
            : "warning"
        }
      />
      <ModuleAssignDialog
        currentOwnerId={currentOwnerId(assignContext?.record, runtime)}
        isLoading={isDialogLoading}
        key={assignContext ? "assign-open" : "assign-closed"}
        onCancel={() => setAssignContext(null)}
        onConfirm={confirmAssign}
        onOwnerSearch={(query) => {
          if (!assignContext || !dataAdapter?.getOwnerOptions) return;
          void loadOwnerOptions(assignContext, query);
        }}
        open={Boolean(assignContext)}
        ownerOptions={ownerOptions}
        selectedCount={selectedRecordCount(assignContext, runtime)}
      />
      <ModuleCommandActionDialog
        onCancel={() => setActionContext(null)}
        onSubmit={async (payload) => {
          if (!actionContext) return;
          const pending = actionContext;
          await executeCommand(pending.command.key, {
            ...pending.context,
            value: payload,
          });
          setActionContext(null);
        }}
        open={Boolean(actionContext)}
        schema={getCommandPayloadSchema(
          actionContext?.command.payloadSchemaKey,
        )}
      />
      <AttendanceActionFeedback
        busyLabel={attendanceBusyLabel}
        onDismiss={() => {
          setAttendanceOutcome(null);
          setAttendanceRetry(null);
        }}
        onRetry={
          attendanceRetry
            ? () => {
                setAttendanceOutcome(null);
                attendanceRetry();
              }
            : undefined
        }
        outcome={attendanceOutcome}
      />
      <ModuleShareDialog
        link={shareLink}
        onClose={() => setShareLink("")}
        open={Boolean(shareLink)}
      />
    </>
  );
}

function downloadFile(file: Blob | string, filename: string) {
  const blob =
    typeof file === "string" ? new Blob([file], { type: "text/csv" }) : file;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function isSafeModuleHref(href: string, routeBase: string) {
  if (!href.startsWith(routeBase)) return false;
  if (href.includes("..")) return false;
  if (
    href.includes("/auth") ||
    href.includes("logout") ||
    href.includes("sign-out")
  ) {
    return false;
  }

  return true;
}

function resolveBackHref(runtime: ModuleRuntimeContext) {
  if (runtime.pageKind !== "list") {
    return runtime.module.routeBase;
  }

  if (typeof window === "undefined") {
    return parentPath(runtime.module.routeBase);
  }

  return parentPath(window.location.pathname);
}

function parentPath(pathname: string) {
  const normalized = pathname.replace(/\/+$/, "");
  const lastSlashIndex = normalized.lastIndexOf("/");

  if (lastSlashIndex <= 0) return "/";

  return normalized.slice(0, lastSlashIndex);
}

function resolveRuntimeCommand(
  commandKey: string,
  runtime: ModuleRuntimeContext,
) {
  return (
    runtime.metadata.commands.find((command) => command.key === commandKey) ??
    null
  );
}

function selectedRecordCount(
  context: RuntimeCommandEventContext | null,
  runtime: ModuleRuntimeContext,
) {
  return context?.selectedRecordIds?.length || (runtime.recordId ? 1 : 0);
}

function currentOwnerId(
  record: RuntimeRecordData | null | undefined,
  runtime: ModuleRuntimeContext,
) {
  const ownerField = runtime.metadata.entity.ownerField;
  if (!ownerField) return "";
  const value = record?.[ownerField];
  return typeof value === "string" ? value : "";
}

/** Commands whose refusals are business answers rather than defects. */
function isAttendanceCommand(commandKey: string | undefined) {
  return (
    commandKey === "attendance.checkIn" || commandKey === "attendance.checkOut"
  );
}

/**
 * Location-capture policy for this command.
 *
 * Best effort by design: the timeouts are a tuning detail, and failing the whole
 * check-in because a context fetch was slow would be a worse outcome than
 * capturing with the defaults.
 */
async function loadCommandPolicy(contextPath: string | undefined) {
  const defaults = {
    timeoutSeconds: 15,
    highAccuracy: true,
    storeUserAgent: false,
  };
  if (!contextPath) return defaults;

  try {
    const response = await fetch(contextPath, {
      cache: "no-store",
      headers: { ...INLINE_ERROR_HANDLING_HEADERS },
    });
    if (!response.ok) return defaults;
    const payload = (await response.json()) as {
      policy?: {
        locationTimeoutSeconds?: unknown;
        highAccuracyLocation?: unknown;
        storeUserAgent?: unknown;
      };
    };
    const policy = payload.policy ?? {};
    return {
      timeoutSeconds:
        typeof policy.locationTimeoutSeconds === "number"
          ? policy.locationTimeoutSeconds
          : defaults.timeoutSeconds,
      highAccuracy:
        typeof policy.highAccuracyLocation === "boolean"
          ? policy.highAccuracyLocation
          : defaults.highAccuracy,
      storeUserAgent: policy.storeUserAgent === true,
    };
  } catch {
    return defaults;
  }
}

function dispatchCommandFailure(
  result: RuntimeCommandExecutionResult,
  runtime: ModuleRuntimeContext,
) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent(apiErrorEventName(), {
      detail: {
        error: {
          success: false,
          ...readCommandFailureError(result),
          path:
            typeof window.location?.pathname === "string"
              ? window.location.pathname
              : runtime.module.routeBase,
          method: result.command?.key,
          details: {
            commandKey: result.command?.key,
            moduleKey: runtime.module.key,
            errors: result.errors,
            data: result.data,
          },
        },
      },
    }),
  );
}

function hasFieldValidationErrors(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const record = data as {
    readonly fieldErrors?: unknown;
    readonly fields?: unknown;
    readonly details?: unknown;
  };

  if (
    hasFieldErrorEntries(record.fieldErrors) ||
    hasFieldErrorEntries(record.fields)
  ) {
    return true;
  }

  if (
    record.details &&
    typeof record.details === "object" &&
    !Array.isArray(record.details)
  ) {
    const details = record.details as {
      readonly fieldErrors?: unknown;
      readonly fields?: unknown;
    };
    return (
      hasFieldErrorEntries(details.fieldErrors) ||
      hasFieldErrorEntries(details.fields)
    );
  }

  return false;
}

function hasFieldErrorEntries(value: unknown) {
  if (!value) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

function readCommandFailureError(result: RuntimeCommandExecutionResult) {
  const data = result.data;
  const dataRecord =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const responseRecord =
    dataRecord.response &&
    typeof dataRecord.response === "object" &&
    !Array.isArray(dataRecord.response)
      ? (dataRecord.response as Record<string, unknown>)
      : null;
  const record = responseRecord ?? dataRecord;
  const statusCode =
    typeof record.statusCode === "number"
      ? record.statusCode
      : typeof record.status === "number"
        ? record.status
        : 500;
  const errorCode =
    typeof record.errorCode === "string"
      ? record.errorCode
      : typeof record.code === "string"
        ? record.code
        : statusCode >= 500
          ? "SYSTEM_UNEXPECTED_ERROR"
          : statusCode === 403
            ? "ACCESS_DENIED"
            : statusCode === 404
              ? "DATABASE_RECORD_NOT_FOUND"
              : "VALIDATION_FAILED";

  return {
    errorCode,
    message:
      typeof record.message === "string"
        ? record.message
        : result.message || "Command failed",
    description:
      typeof record.description === "string"
        ? record.description
        : result.errors?.join(" ") ||
          "The requested action could not be completed.",
    statusCode,
    details: record.details ?? dataRecord,
  };
}

function readSystemFieldDebug(
  record: RuntimeRecordData | null | undefined,
  runtime: ModuleRuntimeContext,
) {
  const ownerField = runtime.metadata.entity.ownerField;
  const statusField = runtime.metadata.entity.statusField;
  const subStatusField = runtime.metadata.entity.subStatusField;

  return {
    ownerId: ownerField ? record?.[ownerField] : undefined,
    status: statusField ? record?.[statusField] : undefined,
    subStatus: subStatusField ? record?.[subStatusField] : undefined,
  };
}

function readOwnerOptionsFromRuntime(
  record: RuntimeRecordData | null | undefined,
  runtime: ModuleRuntimeContext,
) {
  const ownerId = currentOwnerId(record, runtime);
  if (!ownerId) return [];

  return [
    {
      id: ownerId,
      name: resolveOwnerDisplayName({
        ownerId,
        principal: runtime.security.principal,
        record,
      }),
    },
  ];
}

function withCurrentOwnerOption(
  options: readonly ModuleOwnerOption[],
  record: RuntimeRecordData | null | undefined,
  runtime: ModuleRuntimeContext,
) {
  const ownerId = currentOwnerId(record, runtime);
  if (
    !ownerId ||
    options.some((option) => normalizeOwnerOption(option).id === ownerId)
  )
    return options;

  return [...readOwnerOptionsFromRuntime(record, runtime), ...options];
}

function shareHref(
  context: RuntimeCommandEventContext,
  runtime: ModuleRuntimeContext,
  activeForm: FormMetadata | null | undefined,
) {
  const recordId = context.recordId ?? runtime.recordId;
  if (!recordId) return "";

  return `${window.location.origin}${appendFormIdToHrefTemplate(
    `${runtime.module.routeBase}/${recordId}`,
    activeForm,
  )}`;
}

function appendFormIdToHrefTemplate(
  hrefTemplate: string,
  activeForm: FormMetadata | null | undefined,
) {
  if (!activeForm?.id || hrefTemplate.includes("formId=")) {
    return hrefTemplate;
  }

  const separator = hrefTemplate.includes("?") ? "&" : "?";
  return `${hrefTemplate}${separator}formId=${encodeURIComponent(
    activeForm.id,
  )}`;
}

function confirmationConfig(command: CommandDefinition | null | undefined) {
  return {
    title: command?.confirmation?.title ?? "Confirm action",
    description: command?.confirmation?.description,
    confirmLabel: command?.confirmation?.confirmLabel ?? "Confirm",
    destructive:
      command?.confirmation?.destructive ?? command?.isDestructive ?? false,
  };
}

function confirmationDescription(
  command: CommandDefinition | null | undefined,
  context: RuntimeCommandEventContext | null | undefined,
) {
  const description =
    confirmationConfig(command).description ?? command?.description;
  if (!description) return undefined;

  const selectedCount = context?.selectedRecordIds?.length ?? 0;
  return description.replace(/\{selectedCount\}/g, String(selectedCount));
}
