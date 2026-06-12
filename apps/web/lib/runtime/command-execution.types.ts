import type {
  CommandDefinition,
  CommandHandler,
} from "./command-runtime.types";
import type { FormMetadata, ViewMetadata } from "./metadata-runtime.types";
import type { ModuleRuntimeContext } from "./module-runtime.types";

export type RuntimeCommandExecutionMode =
  | "client"
  | "server"
  | "navigation"
  | "api"
  | "noop";

export type RuntimeCommandResultStatus =
  | "success"
  | "failure"
  | "cancelled"
  | "navigation"
  | "refreshRequired";

export type RuntimeHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RuntimeNavigationAdapter {
  readonly back?: () => void;
  readonly navigate?: (href: string) => void;
  readonly refresh?: () => void;
}

export interface RuntimeApiAdapter {
  readonly request: (request: RuntimeApiCommandRequest) => Promise<unknown>;
}

export interface RuntimeApiCommandConfig {
  readonly method: RuntimeHttpMethod;
  readonly endpointTemplate: string;
  readonly successMessage?: string;
  readonly errorMessage?: string;
  readonly requiresConfirmation?: boolean;
}

export interface RuntimeApiCommandRequest {
  readonly method: RuntimeHttpMethod;
  readonly endpoint: string;
  readonly payload?: unknown;
  readonly command: CommandDefinition;
  readonly runtime: ModuleRuntimeContext;
}

export interface RuntimeNavigationCommandConfig {
  readonly kind: "back" | "new" | "edit" | "openRecord" | "refresh";
  readonly hrefTemplate?: string;
}

export interface RuntimeCommandExecutionRequest<TPayload = unknown> {
  readonly commandKey: string;
  readonly runtime: ModuleRuntimeContext;
  readonly payload?: TPayload;
  readonly form?: FormMetadata | null;
  readonly view?: ViewMetadata | null;
  readonly record?: Readonly<Record<string, unknown>> | null;
  readonly selectedRecordIds?: readonly string[];
  readonly metadataState?: string;
}

export interface RuntimeCommandExecutionAdapters {
  readonly handlers?: Readonly<Record<string, CommandHandler>>;
  readonly commandHandlers?: Readonly<Record<string, CommandHandler>>;
  readonly navigation?: RuntimeNavigationAdapter;
  readonly api?: RuntimeApiAdapter;
}

export interface RuntimeCommandExecutionOptions {
  readonly apiCommands?: Readonly<Record<string, RuntimeApiCommandConfig>>;
  readonly navigationCommands?: Readonly<
    Record<string, RuntimeNavigationCommandConfig>
  >;
}

export interface RuntimeCommandExecutionResult<TData = unknown> {
  readonly status: RuntimeCommandResultStatus;
  readonly command?: CommandDefinition;
  readonly message?: string;
  readonly data?: TData;
  readonly href?: string;
  readonly refreshRequired?: boolean;
  readonly errors?: readonly string[];
}
