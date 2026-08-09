import type {
  CommandDefinition,
  CommandPlacement,
  CommandVisibilityRule,
  StatusGroupConfig,
} from "./command-runtime.types";
import type { EntityMetadata } from "./metadata-runtime.types";
import { flattenRuntimeRoles, normalizeRuntimeRole } from "./role-runtime";
import type { RuntimePrincipal } from "./security-runtime.types";
import {
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
} from "./security-runtime.resolver";

export type CommandSurface = "list" | "detail" | "create" | "edit" | "subgrid";

export interface CommandVisibilityContext {
  readonly principal: RuntimePrincipal;
  readonly record?: Readonly<Record<string, unknown>> | null;
  readonly selectedRecordIds?: readonly string[];
  readonly metadataState?: string;
}

export interface CommandGroups {
  readonly primary: readonly CommandDefinition[];
  readonly secondary: readonly CommandDefinition[];
  readonly overflow: readonly CommandDefinition[];
  readonly destructive: readonly CommandDefinition[];
  readonly statusGroup: readonly CommandDefinition[];
}

export interface CommandGroupingOptions {
  readonly primaryCommandKeys?: readonly string[];
  readonly secondaryCommandKeys?: readonly string[];
}

const SURFACE_PLACEMENTS: Record<CommandSurface, readonly CommandPlacement[]> =
  {
    list: ["list-command-bar", "row-menu", "bulk-menu"],
    detail: ["detail-command-bar", "detail-status-group"],
    create: ["form-footer", "detail-command-bar"],
    edit: ["form-footer", "detail-command-bar"],
    subgrid: ["list-command-bar", "row-menu", "bulk-menu"],
  };

export function resolveSystemCommands(commands: readonly CommandDefinition[]) {
  return commands.filter((command) => command.scope === "system");
}

export function resolveModuleCommands(commands: readonly CommandDefinition[]) {
  return commands.filter((command) => command.scope !== "system");
}

export function mergeCommands(
  systemCommands: readonly CommandDefinition[],
  moduleCommands: readonly CommandDefinition[],
) {
  const merged = new Map<string, CommandDefinition>();
  for (const command of [...systemCommands, ...moduleCommands]) {
    merged.set(command.key, command);
  }

  return sortCommands(Array.from(merged.values()));
}

export function filterCommandsByScope(
  commands: readonly CommandDefinition[],
  surface: CommandSurface,
) {
  const placements = SURFACE_PLACEMENTS[surface];
  return commands.filter((command) => placements.includes(command.placement));
}

export function filterCommandsByPermission(
  commands: readonly CommandDefinition[],
  principal: RuntimePrincipal,
) {
  if (hasElevatedRuntimePrincipal(principal)) {
    return commands;
  }

  return commands.filter(
    (command) =>
      !command.permission ||
      hasAnyPermission(
        principal.permissionKeys,
        command.permission.anyPermissionKeys?.length
          ? command.permission.anyPermissionKeys
          : [command.permission.permissionKey],
      ),
  );
}

export function filterCommandsByVisibility(
  commands: readonly CommandDefinition[],
  context: CommandVisibilityContext,
) {
  return commands.filter((command) =>
    (command.visibilityRules ?? []).every((rule) =>
      evaluateVisibilityRule(rule, context),
    ),
  );
}

export function resolveCommandsForSurface(
  commands: readonly CommandDefinition[],
  surface: CommandSurface,
  context: CommandVisibilityContext,
) {
  return sortCommands(
    filterCommandsByVisibility(
      filterCommandsByPermission(
        filterCommandsByScope(commands, surface),
        context.principal,
      ),
      context,
    ),
  );
}

export function groupCommands(
  commands: readonly CommandDefinition[],
  options: CommandGroupingOptions = {},
): CommandGroups {
  const primaryKeys = new Set(options.primaryCommandKeys ?? []);
  const secondaryKeys = new Set(options.secondaryCommandKeys ?? []);

  return {
    primary: sortCommands(
      commands.filter(
        (command) =>
          !command.isDestructive &&
          command.placement !== "detail-status-group" &&
          (primaryKeys.has(command.key) ||
            (!secondaryKeys.has(command.key) &&
              command.placement.endsWith("command-bar"))),
      ),
    ),
    secondary: sortCommands(
      commands.filter(
        (command) =>
          !command.isDestructive &&
          command.placement !== "detail-status-group" &&
          secondaryKeys.has(command.key),
      ),
    ),
    overflow: sortCommands(
      commands.filter(
        (command) =>
          !command.isDestructive &&
          command.placement !== "detail-status-group" &&
          !primaryKeys.has(command.key) &&
          !secondaryKeys.has(command.key) &&
          !command.placement.endsWith("command-bar"),
      ),
    ),
    destructive: sortCommands(
      commands.filter((command) => command.isDestructive),
    ),
    statusGroup: sortCommands(
      commands.filter((command) => command.placement === "detail-status-group"),
    ),
  };
}

export function resolveDetailStatusGroupConfig(
  entity: EntityMetadata,
  commands: readonly CommandDefinition[],
): StatusGroupConfig | null {
  const explicitConfig = commands.find(
    (command) => command.statusGroup,
  )?.statusGroup;

  if (explicitConfig) {
    return explicitConfig;
  }

  if (!entity.ownerField || !entity.statusField) {
    return null;
  }

  return {
    ownerFieldLogicalName: entity.ownerField,
    statusFieldLogicalName: entity.statusField,
    subStatusFieldLogicalName: entity.subStatusField,
    ownerCommandKey: findStatusCommand(commands, entity.ownerField)?.key,
    statusCommandKey: findStatusCommand(commands, entity.statusField)?.key,
    subStatusCommandKey: entity.subStatusField
      ? findStatusCommand(commands, entity.subStatusField)?.key
      : undefined,
    placement: "detail-status-group",
  };
}

export function evaluateVisibilityRule(
  rule: CommandVisibilityRule,
  context: CommandVisibilityContext,
) {
  const result = evaluateVisibilityRuleValue(rule, context);
  return rule.invert ? !result : result;
}

function evaluateVisibilityRuleValue(
  rule: CommandVisibilityRule,
  context: CommandVisibilityContext,
) {
  switch (rule.operator) {
    case "has-permission":
      return hasPermission(
        context.principal.permissionKeys,
        rule.permissionKeys?.[0],
      );
    case "has-any-permission":
      return hasAnyPermission(
        context.principal.permissionKeys,
        rule.permissionKeys ?? [],
      );
    case "has-all-permissions":
      return hasAllPermissions(
        context.principal.permissionKeys,
        rule.permissionKeys ?? [],
      );
    case "has-role":
    case "has-any-role":
      return hasAnyRole(context.principal.roleKeys, rule.roleKeys ?? []);
    case "not-has-role":
      return !hasAnyRole(context.principal.roleKeys, rule.roleKeys ?? []);
    case "in-team":
      return intersects(context.principal.teamIds, rule.teamIds);
    case "not-in-team":
      return !intersects(context.principal.teamIds, rule.teamIds);
    case "in-department":
      return intersects(context.principal.departmentIds, rule.departmentIds);
    case "not-in-department":
      return !intersects(context.principal.departmentIds, rule.departmentIds);
    case "in-business-unit":
      return intersects(
        context.principal.businessUnitIds,
        rule.businessUnitIds,
      );
    case "not-in-business-unit":
      return !intersects(
        context.principal.businessUnitIds,
        rule.businessUnitIds,
      );
    case "in-organization":
      return intersects(
        context.principal.organizationIds,
        rule.organizationIds,
      );
    case "not-in-organization":
      return !intersects(
        context.principal.organizationIds,
        rule.organizationIds,
      );
    case "has-designation":
      return intersects(context.principal.designationIds, rule.designationIds);
    case "not-has-designation":
      return !intersects(context.principal.designationIds, rule.designationIds);
    case "field-equals":
      return (
        context.record?.[rule.fieldLogicalName ?? ""] === rule.expectedValue
      );
    case "field-not-equals":
      return (
        context.record?.[rule.fieldLogicalName ?? ""] !== rule.expectedValue
      );
    case "field-in":
      return (rule.expectedValues ?? []).includes(
        context.record?.[rule.fieldLogicalName ?? ""],
      );
    case "record-selected":
      return Boolean(context.selectedRecordIds?.length);
    case "record-not-deleted":
      return (
        context.record?.deletedAt == null && context.record?.isDeleted !== true
      );
    case "metadata-state":
      return context.metadataState === rule.metadataState;
    default:
      return false;
  }
}

function findStatusCommand(
  commands: readonly CommandDefinition[],
  fieldLogicalName: string,
) {
  return commands.find(
    (command) =>
      command.placement === "detail-status-group" &&
      command.dependencies?.includes(fieldLogicalName),
  );
}

function sortCommands(commands: readonly CommandDefinition[]) {
  return [...commands].sort(
    (left, right) =>
      (left.order ?? Number.MAX_SAFE_INTEGER) -
        (right.order ?? Number.MAX_SAFE_INTEGER) ||
      left.label.localeCompare(right.label),
  );
}

function hasElevatedRuntimePrincipal(principal: RuntimePrincipal) {
  return elevatedRoleValues([
    ...(principal.roleKeys ?? []),
    ...flattenRuntimeRoles(principal.roles),
  ]).some(
    (roleKey) =>
      roleKey === "global-admin" ||
      roleKey === "global-administrator" ||
      roleKey === "system-admin" ||
      roleKey === "system-administrator",
  );
}

function elevatedRoleValues(values: readonly string[] | undefined) {
  return (values ?? []).map(normalizeRuntimeRole);
}

/*
 * Role keys are compared case-insensitively because they are authored by hand
 * in module specs and in the seed data, and a casing mismatch would silently
 * hide a surface from everyone rather than fail loudly.
 *
 * An empty rule list matches nobody: a rule that names no role is a mistake,
 * and hiding is the safe direction to fail.
 */
function hasAnyRole(
  principalRoleKeys: readonly string[],
  requiredRoleKeys: readonly string[],
) {
  if (requiredRoleKeys.length === 0) return false;

  const held = new Set(principalRoleKeys.map((key) => key.toLowerCase()));
  return requiredRoleKeys.some((key) => held.has(key.toLowerCase()));
}

/*
 * True when the viewer's placement overlaps the ids the rule names.
 *
 * An empty rule list matches nobody, matching the role behaviour: a rule that
 * names no target is a mistake, and hiding is the safe way to fail. Absent
 * placement on the principal likewise cannot match, so a surface gated on a
 * department stays hidden until the placement is actually known.
 */
function intersects(
  held: readonly string[] | undefined,
  required: readonly string[] | undefined,
) {
  if (!required?.length) return false;
  if (!held?.length) return false;

  const owned = new Set(held);
  return required.some((id) => owned.has(id));
}
