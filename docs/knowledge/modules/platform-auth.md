# Platform Auth

> Generated from repository evidence at `ac17223`, plus the live reproduction
> that produced [[BUG-0071]] and [[BUG-0072]] on 2026-08-18.

## Purpose

The authorization boundary between **DijiPeople the platform** and the tenants
it hosts. It answers one question — *is this subject a platform operator, and
may it do this?* — for the three controllers that serve the operator console:
`super-admin`, `demo-data` and `admin-leads`.

## The two subjects, and why they must never be confused

A request arrives carrying one of two kinds of authenticated subject:

| | Tenant subject | Platform subject |
|---|---|---|
| `tenantId` | the tenant's id | the literal `'platform'` |
| `platform` | absent | `{ id, role, status }` |
| `permissionKeys` | tenant keys from the tenant RBAC catalog | derived from the platform role by `platformAccessForRole` |
| May read | its own tenant | every tenant |

**`platform.id` is the boundary.** Not the role, not the permission keys, not
the tenant id — those are all satisfiable by accident. `platform.id` is present
only for a subject loaded through `loadPlatformAccessContext`, and it is what
every check here asks for first.

## Why identity is checked before permission

Six permission key names exist in **both** catalogs:

```
onboarding.create   onboarding.read   settings.read
settings.manage     roles.manage      billing.manage
```

A tenant administrator legitimately holds `settings.read` inside their tenant.
If a platform permission check reads `permissionKeys` without first establishing
that the subject is a platform user, that tenant key satisfies the *platform*
permission of the same name — and the tenant administrator is inside the
operator console. That is exactly what happened in [[BUG-0071]].

The keys are not renamed, and should not be: tenant permission keys are consumed
by three frontends and the seeds. The collision is made **harmless** instead.
`userHasPlatformPermission` returns `false` for any subject without
`platform.id`, whatever its keys contain — including the `platform.*` wildcard.

This costs genuine platform users nothing. Their `permissionKeys` are derived
from their role, so the role path already covers everything the key fallback
could match.

## `PlatformPermissionsGuard` fails closed

Two rules, in this order:

1. No `platform.id` → `PLATFORM_ACCESS_REQUIRED`.
2. Resolve the route's permission and require it. An unresolved permission is
   **refused**.

There is no permissive branch, and adding one is a mistake that has already been
made twice in different directions:

- The guard used to open with `if (!role) return true`, reading "no platform
  role" as "not a platform request, nothing to check". Every controller using
  this guard is a platform surface end to end, so that early exit did not mean
  harmless — it meant unguarded.
- The same line was **inverted** for routes the resolver did not map: a genuine
  platform operator fell through to the throw and got `403` from `/operators`,
  `/feature-catalog` and `/lifecycle-options`, while a tenant user had already
  returned `true` above. The people the console was built for were the only ones
  locked out of it.

A later draft of the fix proposed *allowing* unmapped routes, to repair those
403s. Completing the map showed why that was wrong: `actionFor` returned `null`
for `DELETE`, so `DELETE /customers/:id` resolved nothing — and a permissive
branch would have handed customer deletion to every platform role, auditors
included. **The map was completed instead.**

## `resolvePlatformPermission` — the map, and its two failure modes

A path-substring matcher, extended domain by domain. Both ways it has gone wrong
are structural, not typos:

**Method-blindness.** Branches added through `actionFor` consider the HTTP
method. Branches added as a bare `return '<domain>.read'` did not, so every verb
on `/plans*` resolved `plans.read` — which `READ_ONLY_AUDITOR` holds. A role
named for not writing could create, update and delete the commercial plan
catalog ([[BUG-0072]]). Every branch is now method-aware, and
`plans.manage`, `invoices.manage`, `subscriptions.manage` and `payments.manage`
were added to the union because there had been no mutating permission to return.

**Gaps.** A route that matches nothing resolves `null` and is refused, so a gap
is a route nobody can reach. `platform-permissions.spec.ts` enumerates
`SuperAdminController`'s own `PATH_METADATA` and `METHOD_METADATA` and fails if
any route resolves `null`, or if any non-`GET` route resolves a `.read`
permission. **Enumerate; never hand-list** — the hand-written list is the thing
that goes stale.

Order matters. Specific paths come before the domain prefixes that would swallow
them, and `tenant-slug` needs its own line because it does not contain the
substring `tenants`.

## Grants that are deliberate omissions

`READ_ONLY_AUDITOR` and `MEMBER` hold only the `.read` variants of plans,
invoices, subscriptions and payments, and were **not** given the new `.manage`
permissions. Their lists already expressed read-only intent; before the fix that
intent was simply unenforced. A `MEMBER` who was creating plans through the
console is now refused — a real behaviour change, and the correction rather than
a regression.

## Defence in depth is the house pattern

Every cross-tenant service asserts platform identity **itself**, rather than
trusting a guard: `platform-runtime`, `partners`, `support-cases`, `contracts`,
`partner-experience`, `platform-events`, `platform-monitoring`, and
`tenant-control-plane` through `assertTenantPlatformAccess`.
`PlatformEmailSettingsService` was the one that did not, which is why nothing
downstream caught the guard failing open. It does now.

**When you write a service that reads across tenants, assert
`user.platform?.id` in the service.** The guard is not a substitute; it is the
first of two.

## Related

- [[BUG-0071]] — the guard failing open, and the collision it let through
- [[BUG-0072]] — mutations satisfied by read permissions
- [[super-admin]] — the surface this protects
- [[platform-admin]] — the console that consumes it
- [[tenant-control-plane]] — `assertTenantPlatformAccess`, the same pattern
