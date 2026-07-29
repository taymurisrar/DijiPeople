import type {
  EntityMetadata,
  FormMetadata,
  ViewMetadata,
} from "./metadata-runtime.types";
import type { ModuleRuntimeContext } from "./module-runtime.types";
import type { PermissionRequirement } from "./security-runtime.types";

export type CommandScope =
  | "system"
  | "module"
  | "entity"
  | "list"
  | "detail"
  | "create"
  | "edit"
  | "subgrid"
  | "view"
  | "record"
  | "selection"
  | "form";

export type CommandPlacement =
  | "global-command-bar"
  | "module-command-bar"
  | "list-command-bar"
  | "row-menu"
  | "bulk-menu"
  | "detail-command-bar"
  | "detail-status-group"
  | "form-footer";

export type CommandExecutionMode =
  | "client"
  | "server"
  | "server-action"
  | "api"
  | "navigation"
  | "background-job"
  | "noop";

export type CommandVisibilityOperator =
  | "has-permission"
  | "has-any-permission"
  | "has-all-permissions"
  | "field-equals"
  | "field-not-equals"
  | "field-in"
  | "record-selected"
  | "record-not-deleted"
  | "metadata-state";

export interface CommandVisibilityRule {
  readonly operator: CommandVisibilityOperator;
  readonly permissionKeys?: readonly string[];
  readonly fieldLogicalName?: string;
  readonly expectedValue?: unknown;
  readonly expectedValues?: readonly unknown[];
  readonly metadataState?: string;
  readonly invert?: boolean;
}

export interface StatusGroupConfig {
  readonly ownerFieldLogicalName?: string;
  readonly statusFieldLogicalName: string;
  readonly subStatusFieldLogicalName?: string;
  readonly ownerCommandKey?: string;
  readonly statusCommandKey?: string;
  readonly subStatusCommandKey?: string;
  readonly placement: Extract<CommandPlacement, "detail-status-group">;
}

export interface CommandConfirmationDefinition {
  readonly title: string;
  readonly description?: string;
  readonly confirmLabel?: string;
  readonly destructive?: boolean;
}

export interface CommandDynamicDisabledDefinition {
  readonly fieldLogicalName: string;
  readonly enabledValue: unknown;
  readonly reasonFieldLogicalName?: string;
  readonly fallbackReason?: string;
}

export interface CommandExecutionContext<TPayload = unknown> {
  readonly runtime: ModuleRuntimeContext;
  readonly command: CommandDefinition<TPayload>;
  readonly entity?: EntityMetadata;
  readonly form?: FormMetadata;
  readonly view?: ViewMetadata;
  readonly record?: Readonly<Record<string, unknown>> | null;
  readonly recordId?: string;
  readonly selectedRecordIds?: readonly string[];
  readonly payload?: TPayload;
}

export interface CommandResult<TData = unknown> {
  readonly ok: boolean;
  readonly message?: string;
  readonly data?: TData;
  readonly invalidateCacheKeys?: readonly string[];
  readonly redirectTo?: string;
}

export type CommandHandler<TPayload = unknown, TResult = unknown> = (
  context: CommandExecutionContext<TPayload>,
) => Promise<CommandResult<TResult>> | CommandResult<TResult>;

export interface CommandDefinition<TPayload = unknown> {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly scope: CommandScope;
  readonly placement: CommandPlacement;
  readonly executionMode: CommandExecutionMode;
  readonly handlerKey: string;
  readonly iconName?: string;
  readonly order?: number;
  readonly isDestructive?: boolean;
  readonly requiresConfirmation?: boolean;
  readonly confirmation?: CommandConfirmationDefinition;
  readonly isDisabled?: boolean;
  readonly disabledReason?: string;
  readonly dynamicDisabled?: CommandDynamicDisabledDefinition;
  readonly permission?: PermissionRequirement;
  readonly visibilityRules?: readonly CommandVisibilityRule[];
  readonly dependencies?: readonly string[];
  readonly statusGroup?: StatusGroupConfig;
  readonly groupKey?: string;
  readonly groupLabel?: string;
  readonly payloadSchemaKey?: string;
  readonly defaultPayload?: TPayload;
}
