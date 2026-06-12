"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ConfirmationDialog } from "@/app/components/notifications";
import {
  buildAdapterCommandHandlers,
  executeRuntimeCommand,
  type RuntimeCommandExecutionResult,
} from "@/lib/runtime";
import { getCommandPayloadSchema } from "@/lib/runtime/command-payload-schema";
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
      const href = shareHref(context, runtime);
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
          back: () => router.push(runtime.module.routeBase),
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
            hrefTemplate: `${runtime.module.routeBase}/new`,
          },
          "system.edit": {
            kind: "edit",
            hrefTemplate: `${runtime.module.routeBase}/{recordId}/edit`,
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
) {
  const recordId = context.recordId ?? runtime.recordId;
  if (!recordId) return "";

  return `${window.location.origin}${runtime.module.routeBase}/${recordId}`;
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
