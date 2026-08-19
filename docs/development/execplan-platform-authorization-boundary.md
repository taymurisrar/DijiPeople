# ExecPlan — the platform authorization boundary (BUG-0071, BUG-0072)

```
CONTEXT_FILES_REQUIRED:
  - .agent/context/task-completion-contract.md
  - .agent/context/branch-model.md

SPECIALIST_AGENTS_REQUIRED:
  - Backend/API                        — the guard, the resolver and the controller boundary
  - QA                                 — live re-verification of the reproduction, both subjects
  - Reviewer                           — authorization change on a shared guard
DELIBERATELY_NOT_USED:
  - Database                           — no schema, migration or query shape changes
  - Frontend                           — Platform Admin consumes the same contract; the fix
                                         restores three routes rather than changing any payload
  - Integration                        — no third-party surface touched

SINGLE_WRITER_FILES:
  - services/api/src/common/guards/**   (RolesGuard is read, not written; the lease still applies)

QA_REQUIRED: yes

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - docs/qa/known-bug-patterns/mocked-proof-of-a-database-guarantee.md
    (the reproduction must be re-run against a live stack, not asserted from a double)

REGRESSION_ENTRIES_IN_SCOPE:
  - REG-nnn — assigned when the fix lands; see Testing strategy

TARGET_BRANCH:            develop
TARGET_ENVIRONMENT:       LOCAL
DEPLOYMENT_REQUIRED:      no
DEPLOYMENT_COMPONENTS:    api
DEPLOYMENT_ORDER:         api
ROLLBACK_CLASS:           CODE_ONLY
INTEGRATOR_REQUIRED:      yes
RELEASE_DEVOPS_REQUIRED:  no
POST_DEPLOY_QA_REQUIRED:  no
MERGE_STRATEGY:           merge --no-ff
KNOWN_CONCURRENT_WORK:    none touching services/api/src/modules/platform-auth/
ENVIRONMENT_DEPENDENCIES: none
```

## Objective

Close [[BUG-0071]] and [[BUG-0072]]. Both live in one resolver and one guard,
and a partial fix to either leaves the other reachable:

- **BUG-0071** — make platform identity a precondition for every platform
  endpoint, so a tenant user cannot reach the `super-admin` surface whatever
  roles or permission keys their tenant grants them.
- **BUG-0072** — make every branch of the permission map method-aware, so a
  mutating request can never be satisfied by a read permission.

## Business requirement

DijiPeople is a multi-tenant SaaS platform whose operator console runs on the
same API as the tenant product. A tenant administrator must never be able to
read the platform's customer list, billing data, staff directory or outbound
email configuration. **FACT:** today they can, and the reproduction is in
[[BUG-0071]].

## Existing behavior

**FACT**, all verified live on 2026-08-18:

- `PlatformPermissionsGuard.canActivate` returns `true` when
  `request.user.platform.role` is absent — a subject with no platform identity
  is waved through rather than refused.
- `userHasPlatformPermission` falls back to `user.permissionKeys`. For a tenant
  subject those are tenant keys, and six tenant key names
  (`onboarding.create`, `onboarding.read`, `settings.read`, `settings.manage`,
  `roles.manage`, `billing.manage`) collide exactly with platform permission
  names.
- `SuperAdminController` gates on `@RequireRoles(SYSTEM_ADMIN, SYSTEM_CUSTOMIZER)`
  through `RolesGuard`, and `system-admin` is a **tenant** role key seeded by
  `seed-demo.ts`.
- Net effect: a tenant `system-admin` receives `200` from every `super-admin`
  GET route and passes authorization on the `PATCH` routes.
- The same guard is inverted on unmapped routes: `resolvePlatformPermission`
  returns `null` for `/operators`, `/feature-catalog` and `/lifecycle-options`,
  so a genuine platform SUPER_ADMIN receives `403` there while a tenant user
  receives `200`. Three routes are unusable by the people they were built for.

## Existing architecture

**FACT:** `PlatformPermissionsGuard` is used by exactly three controllers —
`super-admin`, `demo-data` and `admin-leads`. All three are platform surfaces
end to end. **INFERENCE:** there is therefore no mixed tenant/platform
controller whose behaviour a stricter guard could break, which is what makes a
guard-level fix safe rather than sweeping.

**FACT:** every other cross-tenant service already asserts platform identity
before checking a permission — `platform-runtime`, `partners`, `support-cases`,
`contracts`, `partner-experience`, `platform-events`, `platform-monitoring`, and
`tenant-control-plane` through `assertTenantPlatformAccess`. The pattern this
plan enforces is the codebase's own, not a new one.

**FACT:** for a genuine platform user, `loadPlatformAccessContext` sets
`platform.id`, `platform.role` and derives `permissionKeys` from
`platformAccessForRole(user.role)`. Platform permissions are therefore reachable
through the role path alone, so scoping the `permissionKeys` fallback to
platform subjects changes nothing for them.

## Requirements

1. A subject with no `platform.id` is refused by `PlatformPermissionsGuard`.
2. `userHasPlatformPermission` returns `false` for a subject with no
   `platform.id`, whatever `permissionKeys` contains.
3. A platform user with the required permission keeps working, unchanged.
4. The three currently-broken routes become reachable by platform users.
5. `PlatformEmailSettingsService` asserts platform identity itself, so it is
   safe independently of the guard.
6. A route added to `super-admin` later cannot silently land outside the
   permission map.

## Dependencies

None external. Requires the `permissions` lease for the duration, because
`services/api/src/common/guards/**` is a `SINGLE_WRITER_FILES` path.

## Files / modules affected

- `services/api/src/modules/platform-auth/platform-permissions.ts` — the guard
  and the permission helper
- `services/api/src/modules/platform-communications/platform-email-settings.service.ts`
  — the missing service-level assertion
- `services/api/src/modules/platform-auth/platform-permissions.spec.ts` — new
- `services/api/test/platform-authorization-boundary.e2e-spec.ts` — new

## Database impact

None. No schema, migration, index or query-shape change.

## Backend impact

`PlatformPermissionsGuard.canActivate` is rewritten to fail closed, with **no
permissive branch**:

1. Require `user.platform?.id`; refuse otherwise.
2. Resolve the route's platform permission and require it. An unresolved
   permission is refused, exactly as before.

**PROPOSAL, revised during implementation.** The first draft of this plan had
the guard *allow* a route that resolved no permission, on the grounds that
refusing is what left `/operators`, `/feature-catalog` and `/lifecycle-options`
returning 403. Completing the map while writing the enumeration test showed why
that was the wrong trade: `actionFor` returned `null` for `DELETE`, so
`DELETE /customers/:id` and `DELETE /customer-onboarding/:id` resolved nothing
— and a permissive branch would have handed those deletes to every platform
role, including `READ_ONLY_AUDITOR`. The broken routes are fixed by completing
the map instead, which costs nothing and leaves the guard with no way to say
yes by accident.

`resolvePlatformPermission` therefore changes too:

- `plans`, `invoices`, `subscriptions` and `payments` become method-aware,
  returning the new `*.manage` permissions for mutations (BUG-0072).
- `billing/stripe-webhook-events` becomes method-aware: listing events reads,
  but retrying one re-drives a payment side effect and now needs
  `billing.manage`.
- `actionFor` gains a `DELETE` mapping to `<domain>.update`.
- `operators`, `lifecycle-options`, `feature-catalog` and
  `tenant-slug/availability` are mapped explicitly.

## Frontend impact

None to the contract. Platform Admin gains back three routes that currently
return `403`. No payload shape changes.

## Permission / RBAC impact

**Four new platform permissions** — `plans.manage`, `invoices.manage`,
`subscriptions.manage`, `payments.manage` — added to the `PlatformPermission`
union and granted to `PLATFORM_ADMIN`. `SUPER_ADMIN` and `PLATFORM_OWNER` hold
`platform.*` and are covered already.

**Deliberately not granted** to `READ_ONLY_AUDITOR` or `MEMBER`. Both hold only
the `.read` variants of these domains, which is the intent their lists already
express; before this fix that intent was unenforced. **This is a behaviour
change:** a `MEMBER` who was creating plans through the console will now be
refused. That is the correction, not a regression — but it is the one change
here a platform operator could notice, so it is called out rather than buried.

No change to the tenant catalogs `permissions.ts` or `rbac-matrix.ts`. The
change is to *who* a platform permission can be satisfied by: only a platform
subject, never a tenant subject whose tenant key happens to share the name.

**FACT:** six tenant key names collide today. This plan does not rename them —
renaming tenant permission keys would break three frontends and the seeds. It
makes the collision harmless instead, which is the smaller and safer change.

## Tenant-isolation impact

This is the point of the plan. After it, no tenant subject can reach a platform
endpoint. The invariant `AGENTS.md` names as the most important in the codebase
is restored on the `super-admin` surface.

## Audit / event / logging impact

None required. The refusal path throws `ForbiddenException` and is recorded by
`HttpExceptionFilter` through `ErrorLogsService` like any other 403.

## Integration impact

None. No third-party surface.

## Migration / data compatibility

None. No stored data encodes this decision.

## Parallel-safe tasks

- Writing `platform-permissions.spec.ts` — `PARALLEL_SAFE`
- Writing the e2e boundary spec — `PARALLEL_SAFE`

## Dependency-blocked tasks

- The guard change — `DEPENDENCY_BLOCKED` on the `permissions` lease
- The service assertion — `DEPENDENCY_BLOCKED` on the guard change landing
  first, so the e2e proves the guard rather than the service

## Integration tasks

- `INTEGRATION` — run the full API e2e suite, since the guard is shared

## Testing strategy

Unit (`platform-permissions.spec.ts`):

- `userHasPlatformPermission` refuses a subject with no `platform.id` while its
  `permissionKeys` contain the exact permission name.
- It still accepts a platform subject by role, and by explicit key.
- Every `super-admin` route resolves a non-null platform permission, and no
  route whose verb is not `GET` resolves a permission ending in `.read`. Both
  are enumerated from the controller's own `PATH_METADATA` / `METHOD_METADATA`,
  not hand-listed, so requirement 6 holds for routes added later. Each route is
  tested with its real verb — asserting a GET-only route's POST mapping would
  be asserting something about a request that cannot be made.
- `READ_ONLY_AUDITOR` is refused `plans.manage`; `PLATFORM_ADMIN` still holds
  it, so the fix denies the auditor without disarming the administrator.

E2E, DB-backed (`platform-authorization-boundary.e2e-spec.ts`), against a live
Nest application and a real PostgreSQL:

- A tenant `system-admin` receives `403` from a representative `super-admin`
  read and a representative write. **Must fail without the fix** — this is the
  regression entry.
- A platform user receives `200` from those same routes.
- A platform user receives `200` from `/operators` — the currently-broken route.

The reproduction is re-run live rather than asserted from a double, per the
`mocked-proof-of-a-database-guarantee` pattern.

## Risks

- **A platform role that relies on the `permissionKeys` fallback loses access.**
  *Mitigated:* **FACT** — `permissionKeys` for a platform user are derived from
  the role by `platformAccessForRole`, so the role path already covers them. The
  e2e asserts a platform user still gets `200`.
- **A route added later lands unmapped and becomes unreachable.** *Mitigated:*
  the enumeration test reads the controller's own route metadata and fails on
  any route that resolves `null`, so the gap is caught at test time rather than
  by an operator hitting a 403.
- **A `MEMBER` or `READ_ONLY_AUDITOR` loses console actions they were using.**
  *Accepted, deliberately:* those actions were mutations authorized by a read
  permission. See Permission / RBAC impact.
- **`demo-data` and `admin-leads` share the guard.** *Mitigated:* both are
  platform-only; the full e2e suite runs as an integration task.

## Rollback considerations

`ROLLBACK_CLASS: CODE_ONLY`. Reverting the commit restores the previous
behaviour exactly; nothing is persisted and no migration is involved. Rolling
back re-opens BUG-0071, so a rollback is an incident, not a tidy-up.

## Definition of Done

- Every acceptance criterion in [[BUG-0071]] and [[BUG-0072]] is demonstrated.
- The live reproduction returns `403` for the tenant subject and `200` for the
  platform subject, re-run on a running stack.
- Unit and e2e specs pass; the regression entry exists and fails without the fix.
- `npm --workspace api run test` and the API e2e suite pass.
- BUG-0071 and BUG-0072 move to `RESOLVED` with Resolution and QA Retest filled
  in.
