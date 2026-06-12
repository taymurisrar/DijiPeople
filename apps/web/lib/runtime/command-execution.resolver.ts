import type { CommandDefinition } from "./command-runtime.types";
import type {
  RuntimeApiCommandConfig,
  RuntimeNavigationCommandConfig,
} from "./command-execution.types";
import type { ModuleRuntimeContext } from "./module-runtime.types";
import {
  filterCommandsByPermission,
  filterCommandsByVisibility,
} from "./command-runtime.resolver";

export const STANDARD_SOFT_DELETE_COMMANDS = {
  delete: {
    key: "system.delete",
    label: "Delete",
    description: "Soft delete the current record.",
    scope: "system",
    placement: "detail-command-bar",
    executionMode: "api",
    handlerKey: "system.delete",
    isDestructive: true,
    requiresConfirmation: true,
  },
  restore: {
    key: "system.restore",
    label: "Restore",
    description: "Restore a soft-deleted record.",
    scope: "system",
    placement: "detail-command-bar",
    executionMode: "api",
    handlerKey: "system.restore",
  },
  purge: {
    key: "system.purge",
    label: "Purge",
    description: "Hard delete a record from a future maintenance surface only.",
    scope: "system",
    placement: "global-command-bar",
    executionMode: "api",
    handlerKey: "system.purge",
    isDestructive: true,
    requiresConfirmation: true,
  },
} as const satisfies Record<string, CommandDefinition>;

export function resolveExecutableCommand(
  commandKey: string,
  runtime: ModuleRuntimeContext,
) {
  return (
    runtime.metadata.commands.find((command) => command.key === commandKey) ??
    null
  );
}

export function validateCommandExecutable({
  command,
  metadataState,
  record,
  runtime,
  selectedRecordIds,
}: {
  readonly command: CommandDefinition;
  readonly metadataState?: string;
  readonly record?: Readonly<Record<string, unknown>> | null;
  readonly runtime: ModuleRuntimeContext;
  readonly selectedRecordIds?: readonly string[];
}) {
  const permissionAllowed =
    filterCommandsByPermission([command], runtime.security.principal).length ===
    1;
  const visible =
    filterCommandsByVisibility([command], {
      principal: runtime.security.principal,
      record,
      selectedRecordIds,
      metadataState,
    }).length === 1;
  const enabled = !command.isDisabled;

  return {
    ok: permissionAllowed && visible && enabled,
    errors: [
      ...(permissionAllowed ? [] : [`Permission denied for ${command.key}.`]),
      ...(visible
        ? []
        : [`Command ${command.key} is not currently available.`]),
      ...(enabled
        ? []
        : [command.disabledReason ?? `Command ${command.key} is disabled.`]),
    ],
  };
}

export function expandRuntimeEndpointTemplate(
  endpointTemplate: string,
  runtime: ModuleRuntimeContext,
) {
  return endpointTemplate
    .replace(/\{entityLogicalName\}/g, runtime.metadata.entity.logicalName)
    .replace(/\{recordId\}/g, runtime.recordId ?? "")
    .replace(/\{moduleKey\}/g, runtime.module.key)
    .replace(/\{tenantId\}/g, runtime.tenant.tenantId);
}

export function resolveNavigationHref(
  config: RuntimeNavigationCommandConfig,
  runtime: ModuleRuntimeContext,
) {
  if (!config.hrefTemplate) return null;

  return expandRuntimeEndpointTemplate(config.hrefTemplate, runtime);
}

export function resolveApiCommandRequest({
  command,
  config,
  payload,
  runtime,
}: {
  readonly command: CommandDefinition;
  readonly config: RuntimeApiCommandConfig;
  readonly payload?: unknown;
  readonly runtime: ModuleRuntimeContext;
}) {
  return {
    method: config.method,
    endpoint: expandRuntimeEndpointTemplate(config.endpointTemplate, runtime),
    payload,
    command,
    runtime,
  };
}
