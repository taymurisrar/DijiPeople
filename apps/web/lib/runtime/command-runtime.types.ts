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
  /*
   * Role operators complement the permission ones. A permission answers "may
   * they do this"; a role answers "is this surface meant for them". Hiding the
   * Compensation tab from everyone but HR is the second question, and
   * expressing it as a permission would invent one that guards nothing.
   */
  | "has-role"
  | "has-any-role"
  | "not-has-role"
  /*
   * Placement operators. Each asks whether the viewer sits somewhere in the
   * organization, so a surface can be shown to one department or hidden from
   * one business unit without inventing a role for it.
   */
  | "in-team"
  | "in-department"
  | "in-business-unit"
  | "in-organization"
  | "has-designation"
  | "not-in-team"
  | "not-in-department"
  | "not-in-business-unit"
  | "not-in-organization"
  | "not-has-designation"
  | "field-equals"
  | "field-not-equals"
  | "field-in"
  | "record-selected"
  | "record-not-deleted"
  | "metadata-state";

export interface CommandVisibilityRule {
  readonly operator: CommandVisibilityOperator;
  readonly permissionKeys?: readonly string[];
  readonly roleKeys?: readonly string[];
  /* Ids for the placement operators above. Any match passes. */
  readonly teamIds?: readonly string[];
  readonly departmentIds?: readonly string[];
  readonly businessUnitIds?: readonly string[];
  readonly organizationIds?: readonly string[];
  readonly designationIds?: readonly string[];
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
