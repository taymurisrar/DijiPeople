# tenant-control-plane

Durable rules for `services/api/src/modules/tenant-control-plane/` and the
Platform Admin tenant record. Evergreen — update in place.

Design narrative: [`docs/architecture/tenant-control-plane.md`](../../architecture/tenant-control-plane.md).

---

## Authorization is in the services, and that is deliberate

`DOMAIN_RULE` · `SECURITY_RULE`

This is a **cross-tenant** control plane, so the repository's primary control —
filter every query by `request.user.tenantId` — cannot apply. What replaces it:

- `tenant-control-plane.controller.ts` carries **only** `JwtAuthGuard`. There are
  no `@Permissions` / `@RequirePermission` decorators, and that is not an
  oversight.
- Every reachable service method calls `assertTenantPlatformAccess(user, perm)`
  from `tenant-control-plane.guard.ts`, which requires a platform identity
  (`user.platform?.id`) **and** the named platform permission.
- Irreversible operations additionally call `assertPlatformAdministrator`,
  restricting them to `SUPER_ADMIN`, `PLATFORM_OWNER`, `PLATFORM_ADMIN`.
- Every `:tenantId` is `ParseUUIDPipe`-validated and resolved through
  `loadTenantOrThrow` before use — never trusted from the request.

**The rule a future change must respect:** a new handler here is unauthorized
until its service method asserts. The guard chain will not catch the omission,
and neither will `PermissionsGuard`, which returns `true` when a handler declares
no permission family. This is the
[`service-authorization-hidden`](../../qa/known-bug-patterns/service-authorization-hidden.md)
pattern operating as an intentional design, which makes it *more* important to
audit, not less.

**Known soft spot:** `TenantControlPlaneService.readiness` has no inline
assertion — it delegates to `overview()`, which asserts. Correct today; a
refactor that stops it delegating would silently remove its only check, and no
test would fail.

## An override cannot grant what the plan does not sell

`DOMAIN_RULE`

Effective module state reuses `FeatureAccessService.getResolvedTenantFeatures`
rather than reimplementing entitlement:

```
plan entitlement AND tenant override = effective state
```

A missing override means "follow the plan". `TenantModulesService.update`
**rejects** enabling a module the plan excludes, rather than writing a row that
would resolve to disabled anyway. A lapsed subscription removes entitlement
outright.

## Suspend, decommission and erase are three different things

`DOMAIN_RULE`

Not one overloaded flag:

- **Suspend** — temporary, reversible. Blocks sign-in, revokes live refresh
  tokens immediately, preserves everything.
- **Decommission** — business retirement. Data preserved.
- **Erase** — permanently destroys tenant-scoped data. Not a lifecycle state; it
  removes the row.

`TENANT_STATUS_TRANSITIONS` in `tenant-control-plane.constants.ts` is the
authority, re-checked server-side in `changeStatus`. Hiding an invalid action in
the menu is an affordance, never the control. Activation requires at least one
active Tenant Owner, so a workspace cannot go live with nobody able to
administer it. Every transition requires a reason, written to the tenant audit
log and `PlatformEvent`.

## Cascade delete does not work on this schema

`ARCHITECTURE_CHANGE` · applies far beyond this module

Most tenant-owned models cascade from `Tenant`, but foreign keys **between**
tenant-owned models are frequently `Restrict` (142 `onDelete: Restrict`
declarations schema-wide). PostgreSQL enforces RESTRICT immediately — it does
not care that the referencing row is about to be removed by the same cascade.
**A single `prisma.tenant.delete()` fails part-way through.**

Erasure is therefore an ordered sequence inside one transaction:

1. Detach and keep — `Contract`, `SupportCase`, `CustomerOnboarding` have
   `tenantId` nulled, so the legal and support trail outlives the workspace.
2. Null the self-referencing `Restrict` FKs that would block a table's own
   delete.
3. Delete every remaining tenant-owned model in dependency order.
4. Delete the tenant row.

One transaction, so a failure erases nothing.

`tenant-erasure.constants.spec.ts` **re-derives the order from
`schema.prisma` on every test run** rather than asserting a frozen list. A new
tenant-owned model, or an FK that changes the ordering, fails there instead of
half-way through a live erasure. Copy this technique before hand-maintaining any
other schema-derived list.

## The erasure receipt must not reference the tenant

`ARCHITECTURE_CHANGE`

`TenantErasureReceipt.tenantId` is a **plain column, not a foreign key**
(`schema.prisma:2301-2304`). Erasure destroys the tenant's own audit log, so a
receipt joined to `Tenant` would be destroyed alongside the thing it exists to
evidence. It holds identifiers, actors, reason, timings and per-model row counts
— never tenant HR or business content. `PlatformEvent` rows are preserved for
the same reason.

The general rule: **evidence of a deletion cannot have a foreign key to what was
deleted.**

## Provisioning telemetry must never fail the operation it describes

`DOMAIN_RULE`

`TenantProvisioningRunService` swallows its own failures. Steps declare their own
retry safety, and `retryProvisioning` replays only the retryable ones — marking
the rest `SKIPPED`. `identities-and-billing` is **not** retryable: replaying it
would create a second owner, subscription and invoice.

## A tenant's audit rows are written under that tenant's id

`BUG_LESSON`

Not the platform operator's. Reading them with `user.tenantId` matched nothing,
which is why the tenant timeline previously returned empty however much had
happened — see `PlatformRuntimeService.timeline`. Any future cross-tenant read of
audit data must scope by the **subject** tenant, not the caller's.

## Presentation metadata is a layer above the schema

`UI_PATTERN`

```
Prisma schema → runtime metadata → business presentation metadata → shared components
```

`RuntimeFieldDefinition` carries `displayValueField`, `displayHref` and
`renderAs`. The schema says `customerAccountId` is a required string; only
presentation metadata says it should read as a customer name and link to that
record. Read-only fields render as **values, not disabled inputs** — which is
what fixed blank dates (an ISO string is invalid in a `datetime-local` input),
raw enum values, and lookups falling back to their id.
