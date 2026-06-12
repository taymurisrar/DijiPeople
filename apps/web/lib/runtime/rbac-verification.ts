export interface RbacRoleDefinition {
  readonly roleName: string;
  readonly permissionKeys: readonly string[];
}

export type ExpectedRolePermissionMatrix = Readonly<
  Record<string, readonly string[]>
>;

export interface RbacRoleCoverage {
  readonly roleName: string;
  readonly expectedPermissions: readonly string[];
  readonly actualPermissions: readonly string[];
  readonly missingPermissions: readonly string[];
  readonly extraPermissions: readonly string[];
}

export interface RbacVerificationReport {
  readonly missingPermissions: readonly string[];
  readonly unknownPermissions: readonly string[];
  readonly duplicatePermissions: readonly string[];
  readonly inconsistentNamingWarnings: readonly string[];
  readonly roleCoverage: readonly RbacRoleCoverage[];
}

const INCONSISTENT_NAME_PAIRS = [
  ["update", "write"],
  ["read", "view"],
  ["manage", "admin"],
  ["delete", "remove"],
  ["purge", "hardDelete"],
] as const;

export const EXPECTED_RUNTIME_ADMIN_ROLES = [
  "Global Admin",
  "System Admin",
  "System Customizer",
] as const;

export const RUNTIME_ADMIN_PERMISSION_EXAMPLE_MATRIX = {
  "Global Admin": [
    "customization.read",
    "customization.publish",
    "solutions.import",
    "solutions.export",
    "branding.update",
    "fonts.update",
    "records.delete",
    "records.restore",
    "records.purge",
    "field-security.manage",
  ],
  "System Admin": [
    "customization.read",
    "solutions.import",
    "solutions.export",
    "branding.update",
    "fonts.update",
    "records.delete",
    "records.restore",
    "field-security.manage",
  ],
  "System Customizer": [
    "customization.read",
    "customization.publish",
    "solutions.export",
    "branding.read",
    "fonts.read",
    "field-security.read",
  ],
} as const satisfies ExpectedRolePermissionMatrix;

export function verifyRbacConfiguration(
  permissionKeys: readonly string[],
  roles: readonly RbacRoleDefinition[],
  expectedMatrix: ExpectedRolePermissionMatrix,
): RbacVerificationReport {
  const permissionSet = new Set(permissionKeys);
  const allRolePermissions = roles.flatMap((role) => role.permissionKeys);
  const expectedPermissions = Object.values(expectedMatrix).flat();

  return {
    missingPermissions: unique(
      expectedPermissions.filter(
        (permissionKey) => !permissionSet.has(permissionKey),
      ),
    ),
    unknownPermissions: unique(
      allRolePermissions.filter(
        (permissionKey) => !permissionSet.has(permissionKey),
      ),
    ),
    duplicatePermissions: findDuplicates(permissionKeys),
    inconsistentNamingWarnings: resolveNamingWarnings(permissionKeys),
    roleCoverage: resolveRoleCoverage(roles, expectedMatrix),
  };
}

export function createRuntimeAdminRbacVerificationExample(
  permissionKeys: readonly string[],
  roles: readonly RbacRoleDefinition[],
) {
  return verifyRbacConfiguration(
    permissionKeys,
    roles,
    RUNTIME_ADMIN_PERMISSION_EXAMPLE_MATRIX,
  );
}

function resolveRoleCoverage(
  roles: readonly RbacRoleDefinition[],
  expectedMatrix: ExpectedRolePermissionMatrix,
) {
  return Object.entries(expectedMatrix).map(
    ([roleName, expectedPermissions]) => {
      const role = roles.find((candidate) => candidate.roleName === roleName);
      const actualPermissions = role?.permissionKeys ?? [];
      const expectedSet = new Set(expectedPermissions);
      const actualSet = new Set(actualPermissions);

      return {
        roleName,
        expectedPermissions,
        actualPermissions,
        missingPermissions: expectedPermissions.filter(
          (permissionKey) => !actualSet.has(permissionKey),
        ),
        extraPermissions: actualPermissions.filter(
          (permissionKey) => !expectedSet.has(permissionKey),
        ),
      };
    },
  );
}

function resolveNamingWarnings(permissionKeys: readonly string[]) {
  const warnings: string[] = [];

  for (const [left, right] of INCONSISTENT_NAME_PAIRS) {
    const leftMatches = permissionKeys.filter((permissionKey) =>
      containsToken(permissionKey, left),
    );
    const rightMatches = permissionKeys.filter((permissionKey) =>
      containsToken(permissionKey, right),
    );

    if (leftMatches.length > 0 && rightMatches.length > 0) {
      warnings.push(
        `Permission names mix "${left}" and "${right}" semantics: ${[
          ...leftMatches,
          ...rightMatches,
        ].join(", ")}`,
      );
    }
  }

  return warnings;
}

function containsToken(permissionKey: string, token: string) {
  return permissionKey
    .split(/[.:_-]/)
    .some((part) => part.toLowerCase() === token.toLowerCase());
}

function findDuplicates(values: readonly string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }

  return Array.from(duplicates);
}

function unique(values: readonly string[]) {
  return Array.from(new Set(values));
}
