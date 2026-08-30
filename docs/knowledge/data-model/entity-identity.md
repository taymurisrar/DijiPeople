---
aliases: [Identity]
type: entity
model: Identity
last_verified: 2026-08-30
---

# Identity

## Purpose

**One person, once, across the whole platform.** `Identity` is the global
credential: a unique email, a password hash, and a platform-level suspension and
lockout state that no individual workspace can override.

It is one of the few models in the tenant half of the schema that is **not**
tenant-scoped, and that is the entire point. A person who works for two tenants
has one `Identity` and two [[entity-user|User]] rows.

## The three-way split nobody guesses correctly

| Model | Answers | Scope |
|---|---|---|
| `Identity` | Who is this person, and may they sign in **at all**? | Global |
| [[entity-user|User]] | May they sign in to **this tenant**, and as what? | One tenant |
| [[entity-employee|Employee]] | What is their employment record? | One tenant |

An `Employee` may exist with no `User` — a person on the payroll who never signs
in. A `User` always has an `Identity`. Conflating any two of these is the most
expensive modelling mistake available in this codebase, because each carries a
different status field and all three are consulted on a single login.

## Both locks must pass

`Identity` and `User` each carry `failedLoginAttempts` and `lockedUntil`, and
login checks **both** — `auth.service.ts` around the `identityLocked` test. This
is not redundancy:

- The **tenant** lock is governed by that tenant's own password policy and stops
  sign-ins to that workspace.
- The **global** lock exists so that naming a different tenant cannot be a way
  around a platform-level lock, and so a sign-in that names no tenant at all can
  still be stopped.

`status: SUSPENDED` is the stronger form — a hard "this person may not sign in
anywhere", which `User.status` structurally cannot express because it is scoped
to one tenant.

The global lock's breadth is also its hazard, and it has already been exploited
once: [[ITEM-0069]] — `POST /auth/discover-workspaces` is public and counted its
failures against the same global counter, so an unauthenticated attacker could
lock any person out of every workspace by knowing only their email address.
`discoveryFailedAttempts` and `discoveryBlockedUntil` exist as a **separate
counter** because of it. Do not merge them back.

## Credentials live in two places

`passwordHash` exists on both `Identity` and `User`. `Identity` is authoritative:
`resolveLoginCredential` (`modules/users/identity.service.ts:133`) returns the
identity's hash whenever an identity exists, and `mirrorPasswordToIdentity` keeps
the two in step on a password change.

The `User.passwordHash` fallback below it is **deliberately-kept dead code** —
the contract phase (TASK-0009 WP-09, 2026-08-29) made `User.identityId` NOT NULL,
so the branch is unreachable. It is annotated as such in the source. Do not
"clean it up" without reading the comment; and do not treat `User.passwordHash`
as a second source of truth, because it is not one.

## Lifecycle

Created alongside the first `User` for that email — `users` module, guarded by
`user-creation-links-identity.invariant.spec.ts`, which exists to stop a `User`
being created without one. `lastUsedTenantId` records where the person signed in
most recently and drives workspace discovery; it is a convenience pointer, never
an authorization input.

## Security

Never return `passwordHash`, and never expose `Identity` on a tenant-facing
route: it spans tenants by construction, so leaking it leaks the existence of a
person's accounts in other workspaces. Workspace discovery is the one public
surface that touches it, and it is rate-limited and separately counted for
exactly that reason.

<!-- GENERATED:schema-facts -->

> Generated from `services/api/prisma/schema.prisma` by `scripts/generate-data-model.mjs`. Do not hand-edit this region.

### Ownership and access

| Property | Value |
|---|---|
| Tenant-scoped | **no** — platform-owned or global reference data |
| Primary key | `id` |
| Prisma accessor | `prisma.identity` |
| Owning module | `services/api/src/modules/users` |
| Domain | Identity |
| Also touched by | — |

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | `String` | yes | unique |
| `passwordHash` | `String` | yes | — |
| `passwordChangedAt` | `DateTime` | no | — |
| `emailVerifiedAt` | `DateTime` | no | — |
| `status` | `IdentityStatus` (enum) | yes | default `ACTIVE` |
| `failedLoginAttempts` | `Int` | yes | default `0` |
| `lockedUntil` | `DateTime` | no | — |
| `discoveryFailedAttempts` | `Int` | yes | default `0` |
| `discoveryBlockedUntil` | `DateTime` | no | — |
| `lastUsedTenantId` | `String` | no | — |

### States

- `status` — `IdentityStatus`: `ACTIVE`, `SUSPENDED`

### Relationships

**Belongs to** — this model holds the foreign key

- [[entity-tenant|Tenant]] — the isolation owner

**Owns** — the foreign key lives on the other side

- [[entity-user|User]] via `users`[]

### Constraints and indexes

- Unique: `email`
- Indexes: 1
<!-- /GENERATED:schema-facts -->

## Related

[[entity-user|User]] · [[entity-employee|Employee]] · [[entity-tenant|Tenant]] ·
[[auth]] · [[rbac]] · [[decision-platform-admin-is-a-separate-identity]] ·
[[ITEM-0069]] · [[data-model-overview]] · [[domain-map]]
