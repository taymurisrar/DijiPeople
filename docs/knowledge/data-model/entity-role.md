---
aliases: [Role]
type: entity
model: Role
last_verified: 2026-08-30
---

# Role

## Purpose

A named bundle of authority within one tenant. `Role` carries **two independent
things** that are easy to conflate:

- **`key`** — what the role *is*, consulted by name in code.
- **`accessLevel`** — how far it *reaches*, resolved against
  [[entity-business-unit|BusinessUnit]].

Permissions themselves are not on this model; they hang off it through
`RolePermission`, `RolePrivilege` and `RoleMiscPermission`.

## Two permission systems run at once

DijiPeople evaluates **both** a legacy key list and a matrix privilege, and
`PermissionsGuard` requires *all* declared legacy keys **and** *at least one*
matrix privilege. Both decorators are normally present:

```ts
@Permissions('employees.read')                      // common/constants/permissions.ts
@RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')   // common/constants/rbac-matrix.ts
```

A new permission has to be registered in the right one — or both — or it silently
grants nothing, or silently grants everything the other system already allowed.
See [[rbac]].

## `accessLevel` is a third, separate step

```
USER  <  BUSINESS_UNIT  <  PARENT_BU  <  ORGANIZATION  <  TENANT
```

Passing the guard is not reaching the record. Row scope is applied inside the
service by `buildScopedAccessWhere()` / `resolveEffectiveAccessLevel()` in
`common/security/rbac-query-scope.ts`.

This is the most common authorization mistake available here: a correctly
decorated controller with an unscoped query underneath it. The guard says the
caller may read employees; only the query decides *which*.

## `key` is load-bearing, and two roles bypass the guard entirely

`ELEVATED_TENANT_ROLE_KEYS` in `common/security/elevated-tenant-roles.ts`
contains exactly **`GLOBAL_ADMIN` and `SYSTEM_ADMIN`**. `hasElevatedTenantRole()`
tests membership by `roleKeys`, and where it is consulted it bypasses the
permission check.

**Adding a key to that set is a security decision, not a configuration change.**
The file already records the reasoning for the roles kept out: System Customizer
and Recruiter are capability roles that must earn access through explicit
privileges rather than inherit tenant-wide visibility.

Three narrower sets sit beside it and are worth knowing before assuming a single
admin concept:

| Set | Contains | Grants |
|---|---|---|
| `ELEVATED_TENANT_ROLE_KEYS` | `GLOBAL_ADMIN`, `SYSTEM_ADMIN` | Bypasses the permission guard |
| `CORE_EMPLOYEE_PROFILE_EDITOR_ROLE_KEYS` | those two plus `HR` | HR-level profile editing, tenant-wide |
| `EMPLOYEE_RECORD_EDITOR_ROLE_KEYS` | those three plus `MANAGER` | Opens the update path only — scope still decides which records |

A manager is deliberately in the third and not the second: holding the HR set
would present them as an administrator of every record rather than of their own
reporting line.

## System roles

`roleType: SYSTEM` with `isSystem`, `isEditable` and `isCloneable` marks roles
the platform ships. `isEditable: false` is what stops a tenant editing a role the
code consults by `key` — if a tenant could rename or re-scope `GLOBAL_ADMIN`,
every `hasElevatedTenantRole()` call site would change meaning.

Seeded by `seed-config`. A new system role must be added there and verified by
`verify-seed-config`, or fresh deploys come up without it.

## Tenant-scoped, both ways

`@@unique([tenantId, key])` and `@@unique([tenantId, name])` — never bare. Each
tenant has its own `GLOBAL_ADMIN` row, and they are different records with the
same key.

## Security

Everything about this model is a security surface. Changes to permission keys,
role keys, `accessLevel` or the elevated sets should extend the existing
invariant tests — `common/constants/wiring-invariants.spec.ts`,
`rbac-matrix.*.spec.ts`, `test/permission-propagation.e2e-spec.ts` — rather than
be verified by hand.

Frontend permission checks (`apps/web/lib/permissions.ts`) are **cosmetic**. They
gate navigation for usability; every gated action must also be enforced
server-side.

<!-- GENERATED:schema-facts -->

> Generated from `services/api/prisma/schema.prisma` by `scripts/generate-data-model.mjs`. Do not hand-edit this region.

### Ownership and access

| Property | Value |
|---|---|
| Tenant-scoped | **yes** — carries `tenantId` |
| Primary key | `id` |
| Prisma accessor | `prisma.role` |
| Owning module | `services/api/src/modules/roles` |
| Domain | Identity |
| Also touched by | `permissions`, `approvals` (reads), `dashboard` (reads), `tenant-settings` (reads) |

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | `String` | yes | — |
| `key` | `String` | yes | — |
| `roleType` | `RoleType` (enum) | yes | default `CUSTOM` |
| `accessLevel` | `RoleAccessLevel` (enum) | yes | default `USER` |
| `description` | `String` | no | — |
| `isSystem` | `Boolean` | yes | default `false` |
| `isEditable` | `Boolean` | yes | default `true` |
| `isCloneable` | `Boolean` | yes | default `true` |
| `isActive` | `Boolean` | yes | default `true` |

### States

- `roleType` — `RoleType`: `SYSTEM`, `CUSTOM`
- `accessLevel` — `RoleAccessLevel`: `USER`, `BUSINESS_UNIT`, `PARENT_BU`, `ORGANIZATION`, `TENANT`

### Relationships

**Belongs to** — this model holds the foreign key

- [[entity-tenant|Tenant]] — the isolation owner

**Owns** — the foreign key lives on the other side

- `UserRole` via `userRoles`[]
- `ApprovalAssignment` via `approvalAssignments`[]
- `ApprovalMatrix` via `approvalMatrices`[]
- `LeaveApprovalStep` via `leaveApprovalSteps`[]
- `RolePermission` via `rolePermissions`[]
- `RolePrivilege` via `rolePrivileges`[]
- `RoleMiscPermission` via `miscPermissions`[]
- `TeamRole` via `teamRoles`[]
- `FieldSecurityPolicyRole` via `fieldSecurityPolicies`[]

### Constraints and indexes

- Unique: `@@unique([tenantId, key])`, `@@unique([tenantId, name])`
- Indexes: 4
<!-- /GENERATED:schema-facts -->

## Related

[[entity-user|User]] · [[entity-business-unit|BusinessUnit]] ·
[[entity-tenant|Tenant]] · [[rbac]] · [[tenant-isolation]] · [[auth]] ·
[[data-model-overview]] · [[domain-map]]
