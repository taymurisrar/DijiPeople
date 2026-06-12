export type PermissionScope =
  | "none"
  | "self"
  | "own"
  | "owned"
  | "team"
  | "department"
  | "businessUnit"
  | "business-unit"
  | "organization"
  | "tenant"
  | "global";

export type PermissionOperation =
  | "read"
  | "create"
  | "update"
  | "delete"
  | "restore"
  | "purge"
  | "assign"
  | "export"
  | "import"
  | "publish"
  | "execute"
  | "manage";

export type FieldSecurityOperation =
  | "read"
  | "create"
  | "update"
  | "export"
  | "import"
  | "command";

export type FieldSecurityEffect = "allow" | "deny" | "mask" | "readonly";

export type DataAccessScope = PermissionScope;

export type RuntimeRoleValue =
  | string
  | readonly RuntimeRoleValue[]
  | {
      readonly id?: string;
      readonly name?: string;
      readonly displayName?: string;
      readonly slug?: string;
      readonly key?: string;
      readonly roles?: readonly RuntimeRoleValue[];
    };

export interface RuntimePrincipal {
  readonly userId: string;
  readonly tenantId: string;
  readonly displayName?: string | null;
  readonly name?: string | null;
  readonly email?: string | null;
  readonly roleKeys: readonly string[];
  readonly roles?: readonly RuntimeRoleValue[];
  readonly permissionKeys: readonly string[];
  readonly teamIds?: readonly string[];
  readonly businessUnitIds?: readonly string[];
}

export interface PermissionRequirement {
  readonly permissionKey: string;
  readonly operation?: PermissionOperation;
  readonly scope?: PermissionScope;
}

export interface FieldSecurityRule {
  readonly id: string;
  readonly entityLogicalName: string;
  readonly fieldLogicalName: string;
  readonly operation: FieldSecurityOperation;
  readonly effect: FieldSecurityEffect;
  readonly permissionKey?: string;
  readonly roleKeys?: readonly string[];
  readonly scope?: PermissionScope;
  readonly reason?: string;
}

export interface DataAccessRule {
  readonly entityLogicalName: string;
  readonly operation: PermissionOperation;
  readonly scope: DataAccessScope;
  readonly permissionKey?: string;
}

export interface SecurityRuntimeContext {
  readonly principal: RuntimePrincipal;
  readonly fieldSecurityRules: readonly FieldSecurityRule[];
  readonly dataAccessRules: readonly DataAccessRule[];
}
