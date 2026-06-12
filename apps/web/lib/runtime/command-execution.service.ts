import type { CommandHandler, CommandResult } from "./command-runtime.types";
import type {
  RuntimeCommandExecutionAdapters,
  RuntimeCommandExecutionOptions,
  RuntimeCommandExecutionRequest,
  RuntimeCommandExecutionResult,
} from "./command-execution.types";
import {
  resolveApiCommandRequest,
  resolveExecutableCommand,
  resolveNavigationHref,
  validateCommandExecutable,
} from "./command-execution.resolver";
import { getCommandHandler, getCommandKeyHandler } from "./command-registry";

export async function executeRuntimeCommand<TPayload = unknown>(
  request: RuntimeCommandExecutionRequest<TPayload>,
  adapters: RuntimeCommandExecutionAdapters = {},
  options: RuntimeCommandExecutionOptions = {},
): Promise<RuntimeCommandExecutionResult> {
  const command = resolveExecutableCommand(request.commandKey, request.runtime);

  if (!command) {
    return {
      status: "failure",
      message: `Command ${request.commandKey} was not found.`,
      errors: [`Command ${request.commandKey} was not found.`],
    };
  }

  const availability = validateCommandExecutable({
    command,
    metadataState: request.metadataState,
    record: request.record,
    runtime: request.runtime,
    selectedRecordIds: request.selectedRecordIds,
  });

  if (!availability.ok) {
    return {
      status: "failure",
      command,
      message: "Command is not available.",
      errors: availability.errors,
    };
  }

  const injectedHandler =
    adapters.commandHandlers?.[command.key] ??
    adapters.handlers?.[command.handlerKey] ??
    getCommandKeyHandler(command.key) ??
    getCommandHandler(command.handlerKey);

  if (injectedHandler) {
    return executeInjectedHandler(injectedHandler, command, request);
  }

  if (command.executionMode === "navigation") {
    return executeNavigationCommand(command.key, request, adapters, options);
  }

  if (command.executionMode === "api") {
    return executeApiCommand(command.key, request, adapters, options);
  }

  if (command.executionMode === "noop") {
    return {
      status: "success",
      command,
      message: command.description,
    };
  }

  return {
    status: "failure",
    command,
    message: `No handler is registered for ${command.key}.`,
    errors: [`No handler is registered for ${command.key}.`],
  };
}

async function executeInjectedHandler<TPayload>(
  handler: CommandHandler,
  command: NonNullable<ReturnType<typeof resolveExecutableCommand>>,
  request: RuntimeCommandExecutionRequest<TPayload>,
): Promise<RuntimeCommandExecutionResult> {
  const result = await Promise.resolve(
    handler({
      runtime: request.runtime,
      command,
      entity: request.runtime.metadata.entity,
      form: request.form ?? undefined,
      view: request.view ?? undefined,
      record: request.record,
      recordId: request.runtime.recordId,
      selectedRecordIds: request.selectedRecordIds,
      payload: request.payload,
    }),
  ).catch(
    (error: unknown): CommandResult => ({
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : `Command ${command.key} failed.`,
      data: readErrorData(error),
    }),
  );

  if (!result.ok) {
    return {
      status: "failure",
      command,
      message: result.message,
      data: result.data,
    };
  }

  if (result.redirectTo) {
    return {
      status: "navigation",
      command,
      href: result.redirectTo,
      message: result.message,
      data: result.data,
    };
  }

  return {
    status: result.invalidateCacheKeys?.length ? "refreshRequired" : "success",
    command,
    message: result.message,
    data: result.data,
    refreshRequired: Boolean(result.invalidateCacheKeys?.length),
  };
}

function readErrorData(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  return (error as { data?: unknown }).data;
}

function executeNavigationCommand<TPayload>(
  commandKey: string,
  request: RuntimeCommandExecutionRequest<TPayload>,
  adapters: RuntimeCommandExecutionAdapters,
  options: RuntimeCommandExecutionOptions,
): RuntimeCommandExecutionResult {
  const command = resolveExecutableCommand(commandKey, request.runtime);
  const config =
    options.navigationCommands?.[commandKey] ??
    inferNavigationConfig(commandKey);

  if (!command || !config) {
    return {
      status: "failure",
      command: command ?? undefined,
      message: `No navigation configuration is registered for ${commandKey}.`,
    };
  }

  if (config.kind === "back") {
    adapters.navigation?.back?.();
    return { status: "navigation", command };
  }

  if (config.kind === "refresh") {
    adapters.navigation?.refresh?.();
    return { status: "refreshRequired", command, refreshRequired: true };
  }

  const href = resolveNavigationHref(config, request.runtime);

  if (!href) {
    return {
      status: "failure",
      command,
      message: `Navigation command ${commandKey} has no href.`,
    };
  }

  adapters.navigation?.navigate?.(href);
  return { status: "navigation", command, href };
}

async function executeApiCommand<TPayload>(
  commandKey: string,
  request: RuntimeCommandExecutionRequest<TPayload>,
  adapters: RuntimeCommandExecutionAdapters,
  options: RuntimeCommandExecutionOptions,
): Promise<RuntimeCommandExecutionResult> {
  const command = resolveExecutableCommand(commandKey, request.runtime);
  const config = options.apiCommands?.[commandKey];

  if (!command || !config) {
    return {
      status: "failure",
      command: command ?? undefined,
      message: `No API configuration is registered for ${commandKey}.`,
    };
  }

  if (!adapters.api) {
    return {
      status: "failure",
      command,
      message: `No API adapter is registered for ${commandKey}.`,
    };
  }

  try {
    const data = await adapters.api.request(
      resolveApiCommandRequest({
        command,
        config,
        payload: request.payload,
        runtime: request.runtime,
      }),
    );

    return {
      status: "success",
      command,
      data,
      message: config.successMessage,
      refreshRequired: true,
    };
  } catch {
    return {
      status: "failure",
      command,
      message: config.errorMessage ?? `Command ${commandKey} failed.`,
    };
  }
}

function inferNavigationConfig(commandKey: string) {
  const normalized = commandKey.split(".").at(-1);

  if (normalized === "back") return { kind: "back" } as const;
  if (normalized === "refresh") return { kind: "refresh" } as const;
  if (normalized === "new") {
    return { kind: "new", hrefTemplate: "/{moduleKey}/new" } as const;
  }
  if (normalized === "edit") {
    return {
      kind: "edit",
      hrefTemplate: "/{moduleKey}/{recordId}/edit",
    } as const;
  }
  if (normalized === "openRecord") {
    return {
      kind: "openRecord",
      hrefTemplate: "/{moduleKey}/{recordId}",
    } as const;
  }

  return null;
}
