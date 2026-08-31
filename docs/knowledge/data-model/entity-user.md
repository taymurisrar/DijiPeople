---
aliases: [User]
type: entity
model: User
last_verified: 2026-08-30
---

# User

## Purpose

**One person's membership of one tenant.** `User` is what carries roles,
permissions, business-unit placement and sign-in state *within* a workspace. The
person themself is [[entity-identity|Identity]]; their employment record is
[[entity-employee|Employee]].

`@@unique([tenantId, email])` — not a bare unique on email. The same address is
legitimately a `User` in several tenants, and each of those rows is a separate
membership with its own roles and its own status.

## What it is not

- **Not the person.** That is `Identity`, which is global and holds the
  authoritative password.
- **Not the employee.** An `Employee` can exist with no `User` — somebody on the
  payroll who never signs in — and a `User` can exist with no `Employee`, which
  is what every service account is.

`Employee.userId` is optional in exactly this direction, and any code that
assumes the link exists will fail on both populations.

## Status answers a narrower question than it looks

`status` is `ACTIVE | INVITED | DISABLED`, and it is scoped to **this tenant**.
It cannot express "this person may not sign in anywhere" — that is
`Identity.status: SUSPENDED`, and login checks both. Disabling a `User` in one
tenant leaves the person's other memberships untouched, which is correct and is
frequently mistaken for a bug.

`INVITED` is a real state, not a placeholder: the row exists, carries roles, and
cannot yet sign in. It is what `user-invitations.service.ts` creates.

## Service accounts

`isServiceAccount` and `serviceAccountPurpose` mark non-human users. They still
carry `tenantId` and still go through the same guard, which is the point — a
service account is not an isolation escape hatch. `serviceAccountPurpose` is free
text and is documentation, not a control.

## Business unit is on the User, not only on the Employee

`businessUnitId` is **required** here. That is what makes row-level scoping
possible for a signed-in user with no employee record, and it is the field the
`$use` middleware in `PrismaService` was built to filter on — the middleware that
is inert on `@prisma/client@7.8.0` and must never be relied on. See
[[tenant-isolation]].

Row-level access is resolved explicitly instead, through
`buildScopedAccessWhere()` and `resolveEffectiveAccessLevel()` in
`common/security/rbac-query-scope.ts`. Holding a permission is not the same as
reaching a record; see [[rbac]].

## Lockout state

`failedLoginAttempts` and `lockedUntil` are the **tenant-scoped** half of the
two-lock scheme described in [[entity-identity|Identity]]. Both locks are checked
and both must pass. When a login looks broken in a test environment, check both
tables and the public-route rate limiter before concluding the product is at
fault.

## Security

`passwordHash` is present but not authoritative — see
[[entity-identity|Identity]]. Never return it, `preferencesJson` aside, and use
an explicit `select` rather than returning the row: the model carries credential
and lockout state that no client needs.

<!-- GENERATED:schema-facts -->

> Generated from `services/api/prisma/schema.prisma` by `scripts/generate-data-model.mjs`. Do not hand-edit this region.

### Ownership and access

| Property | Value |
|---|---|
| Tenant-scoped | **yes** — carries `tenantId` |
| Primary key | `id` |
| Prisma accessor | `prisma.user` |
| Owning module | `services/api/src/modules/users` |
| Domain | Identity |
| Also touched by | `tenant-control-plane`, `super-admin`, `auth`, `tenant-settings`, `employees` (reads), `organization` (reads), `approvals` (reads), `payroll` (reads), and 17 more |

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `identityId` | `String` | yes | — |
| `businessUnitId` | `String` | yes | — |
| `firstName` | `String` | yes | — |
| `lastName` | `String` | yes | — |
| `email` | `String` | yes | — |
| `passwordHash` | `String` | yes | — |
| `status` | `UserStatus` (enum) | yes | default `ACTIVE` |
| `isServiceAccount` | `Boolean` | yes | default `false` |
| `serviceAccountPurpose` | `String` | no | — |
| `preferencesJson` | `Json` | no | — |
| `lastLoginAt` | `DateTime` | no | — |
| `failedLoginAttempts` | `Int` | yes | default `0` |
| `lockedUntil` | `DateTime` | no | — |
| `passwordChangedAt` | `DateTime` | no | — |

### States

- `status` — `UserStatus`: `ACTIVE`, `INVITED`, `DISABLED`

### Relationships

**Belongs to** — this model holds the foreign key

- [[entity-identity|Identity]] via `identity` — `onDelete: Restrict`
- [[entity-business-unit|BusinessUnit]] via `businessUnit` — `onDelete: Restrict`
- [[entity-tenant|Tenant]] — the isolation owner

**Owns** — the foreign key lives on the other side

- **53 child relations** — too many to list usefully. See [[domain-map]] for the full model inventory, grouped by domain.

### Constraints and indexes

- Unique: `@@unique([tenantId, email])`
- Indexes: 5
<!-- /GENERATED:schema-facts -->

## Related

[[entity-identity|Identity]] · [[entity-employee|Employee]] ·
[[entity-tenant|Tenant]] · [[entity-role|Role]] · [[auth]] · [[rbac]] ·
[[tenant-isolation]] · [[data-model-overview]] · [[domain-map]]
