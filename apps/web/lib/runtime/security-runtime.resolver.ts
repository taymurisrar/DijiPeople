import type { FieldMetadata } from "./metadata-runtime.types";
import type {
  DataAccessRule,
  FieldSecurityEffect,
  FieldSecurityOperation,
  FieldSecurityRule,
  PermissionOperation,
  PermissionRequirement,
  PermissionScope,
  RuntimePrincipal,
  SecurityRuntimeContext,
} from "./security-runtime.types";

export interface FieldAccessMetadata {
  readonly fieldLogicalName: string;
  readonly canRead: boolean;
  readonly canWrite: boolean;
  readonly isMasked: boolean;
  readonly isReadonly: boolean;
  readonly effect?: FieldSecurityEffect;
  readonly reason?: string;
}

export function hasPermission(
  permissionKeys: readonly string[] | undefined,
  permissionKey: string | undefined,
) {
  return Boolean(permissionKey && permissionKeys?.includes(permissionKey));
}

export function restrictRuntimePermissionKeysToReadOnly(
  permissionKeys: readonly string[],
  moduleKey: string,
) {
  const normalizedModuleKey = moduleKey.trim().toLowerCase();
  const blockedOperations = new Set([
    "assign",
    "create",
    "delete",
    "manage",
    "remove",
    "restore",
    "update",
    "write",
  ]);

  return permissionKeys.filter((permissionKey) => {
    const [permissionModule, ...operationParts] = permissionKey
      .trim()
      .toLowerCase()
      .split(".");
    if (
      permissionModule !== normalizedModuleKey &&
      permissionModule !== normalizedModuleKey.replace(/s$/, "")
    ) {
      return true;
    }

    return !operationParts.some((operation) =>
      blockedOperations.has(operation),
    );
  });
}

export function hasAnyPermission(
  permissionKeys: readonly string[] | undefined,
  permissionCandidates: readonly string[],
) {
  return permissionCandidates.some((permissionKey) =>
    hasPermission(permissionKeys, permissionKey),
  );
}

export function hasAllPermissions(
  permissionKeys: readonly string[] | undefined,
  permissionCandidates: readonly string[],
) {
  return permissionCandidates.every((permissionKey) =>
    hasPermission(permissionKeys, permissionKey),
  );
}

export function satisfiesPermissionRequirement(
  principal: RuntimePrincipal,
  requirement?: PermissionRequirement,
) {
  return (
    !requirement ||
    hasPermission(principal.permissionKeys, requirement.permissionKey)
  );
}

export function resolveDataAccessScope(
  context: SecurityRuntimeContext,
  entityLogicalName: string,
  operation: PermissionOperation,
): PermissionScope {
  const matchingRules = context.dataAccessRules.filter(
    (rule) =>
      rule.entityLogicalName === entityLogicalName &&
      rule.operation === operation &&
      (!rule.permissionKey ||
        hasPermission(context.principal.permissionKeys, rule.permissionKey)),
  );

  return (
    matchingRules
      .map((rule) => normalizeScope(rule.scope))
      .sort(compareScopes)[0] ?? "none"
  );
}

export function resolveFieldAccess(
  context: SecurityRuntimeContext,
  entityLogicalName: string,
  fieldLogicalName: string,
): FieldAccessMetadata {
  const readEffect = resolveFieldSecurityEffect(
    context,
    entityLogicalName,
    fieldLogicalName,
    "read",
  );
  const updateEffect = resolveFieldSecurityEffect(
    context,
    entityLogicalName,
    fieldLogicalName,
    "update",
  );
  const canRead = readEffect?.effect !== "deny";
  const canWrite =
    canRead &&
    updateEffect?.effect !== "deny" &&
    updateEffect?.effect !== "readonly";

  return {
    fieldLogicalName,
    canRead,
    canWrite,
    isMasked: readEffect?.effect === "mask",
    isReadonly: !canWrite,
    effect: updateEffect?.effect ?? readEffect?.effect,
    reason: updateEffect?.reason ?? readEffect?.reason,
  };
}

export function canReadField(
  context: SecurityRuntimeContext,
  entityLogicalName: string,
  fieldLogicalName: string,
) {
  return resolveFieldAccess(context, entityLogicalName, fieldLogicalName)
    .canRead;
}

export function canWriteField(
  context: SecurityRuntimeContext,
  entityLogicalName: string,
  fieldLogicalName: string,
) {
  return resolveFieldAccess(context, entityLogicalName, fieldLogicalName)
    .canWrite;
}

export function shouldMaskField(
  context: SecurityRuntimeContext,
  entityLogicalName: string,
  fieldLogicalName: string,
) {
  return resolveFieldAccess(context, entityLogicalName, fieldLogicalName)
    .isMasked;
}

export function resolveSafeFieldMetadata(
  context: SecurityRuntimeContext,
  field: FieldMetadata,
): FieldAccessMetadata {
  const fieldAccess = resolveFieldAccess(
    context,
    field.entityLogicalName,
    field.logicalName,
  );
  const canRead =
    fieldAccess.canRead &&
    satisfiesPermissionRequirement(context.principal, field.readPermission);
  const canWrite =
    fieldAccess.canWrite &&
    field.behavior === "normal" &&
    satisfiesPermissionRequirement(context.principal, field.writePermission);

  return {
    ...fieldAccess,
    canRead,
    canWrite,
    isReadonly: !canWrite,
  };
}

function resolveFieldSecurityEffect(
  context: SecurityRuntimeContext,
  entityLogicalName: string,
  fieldLogicalName: string,
  operation: FieldSecurityOperation,
): FieldSecurityRule | null {
  return (
    context.fieldSecurityRules.find(
      (rule) =>
        rule.entityLogicalName === entityLogicalName &&
        rule.fieldLogicalName === fieldLogicalName &&
        rule.operation === operation &&
        ruleMatchesPrincipal(context.principal, rule),
    ) ?? null
  );
}

function ruleMatchesPrincipal(
  principal: RuntimePrincipal,
  rule: FieldSecurityRule | DataAccessRule,
) {
  if (
    rule.permissionKey &&
    !hasPermission(principal.permissionKeys, rule.permissionKey)
  ) {
    return false;
  }

  if ("roleKeys" in rule && rule.roleKeys?.length) {
    return rule.roleKeys.some((roleKey) =>
      principal.roleKeys.includes(roleKey),
    );
  }

  return true;
}

function normalizeScope(scope: PermissionScope): PermissionScope {
  if (scope === "own") return "owned";
  if (scope === "department") return "business-unit";
  if (scope === "businessUnit") return "business-unit";
  if (scope === "organization") return "tenant";
  return scope;
}

function compareScopes(left: PermissionScope, right: PermissionScope) {
  return scopeRank(right) - scopeRank(left);
}

function scopeRank(scope: PermissionScope) {
  const normalized = normalizeScope(scope);
  const ranks: Record<PermissionScope, number> = {
    none: 0,
    self: 1,
    own: 2,
    owned: 2,
    team: 3,
    department: 4,
    businessUnit: 4,
    "business-unit": 4,
    organization: 5,
    tenant: 5,
    global: 6,
  };

  return ranks[normalized];
}
