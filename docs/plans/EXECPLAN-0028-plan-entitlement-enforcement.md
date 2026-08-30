# ExecPlan — Plan entitlement enforcement (BUG-1952)

```
CONTEXT_FILES_REQUIRED:
  - .agent/context/auth-rbac.md
  - .agent/context/backend-architecture.md
  - .agent/context/tenant-context.md
  - .agent/context/api-contracts.md
  - .agent/context/frontend-architecture.md
  - .agent/context/testing-architecture.md

SPECIALIST_AGENTS_REQUIRED:
  - backend-api      — the guard, the resolver, the error-catalog entry, the controller wiring
  - frontend         — the sidebar mirror and the client error catalog entry
  - security         — the fail-open/fail-closed decision and the elevated-role carve-out
  - qa               — retest of the acceptance criteria once enforcement is switched on
DELIBERATELY_NOT_USED:
  - database         — no schema change; the enforcement flag reuses the existing
                       `PlatformSetting` row `module-settings`
  - integration      — the .NET gateway and desktop-agent surfaces are deliberately
                       out of the gated set, so no external contract moves

SINGLE_WRITER_FILES:
  - services/api/src/app.module.ts
  - services/api/src/common/guards/**

QA_REQUIRED: yes

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - docs/qa/known-bug-patterns/defined-but-unwired-permission.md
  - docs/qa/known-bug-patterns/fail-open-scope.md
  - docs/qa/known-bug-patterns/ui-permission-backend-mismatch.md
  - docs/qa/known-bug-patterns/read-filter-without-a-write-check.md
  - docs/qa/known-bug-patterns/silent-degradation.md

REGRESSION_ENTRIES_IN_SCOPE:
  - none — the regression id for this fix is allocated centrally by the burndown
    session, not by this plan.

TARGET_BRANCH:            develop
TARGET_ENVIRONMENT:       LOCAL
DEPLOYMENT_REQUIRED:      no
DEPLOYMENT_COMPONENTS:    api | web
DEPLOYMENT_ORDER:         api -> web
ROLLBACK_CLASS:           CODE_ONLY
INTEGRATOR_REQUIRED:      yes
RELEASE_DEVOPS_REQUIRED:  no
POST_DEPLOY_QA_REQUIRED:  yes
MERGE_STRATEGY:           merge --no-ff
KNOWN_CONCURRENT_WORK:    SESSION-0076 burndown branches; this branch is the only
                          one touching `common/guards/` and `app.module.ts`.
ENVIRONMENT_DEPENDENCIES: none — no new environment variable. The enforcement mode
                          is data, not configuration, and lives in the existing
                          `module-settings` platform setting.
```

---

## Objective

Plan entitlements stop being a presentation detail. A tenant request to a module
its subscription plan does not include is refused by the API itself, with a
documented error code, for every role including the tenant's own administrators —
and the tenant sidebar becomes a mirror of that server decision rather than the
decision itself. Because switching this on cuts off tenants who are using modules
they never bought, the enforcement layer ships complete and correct but in
**report-only** mode, so the cutover is one platform-setting change made
deliberately by the platform owner rather than a side effect of a deploy.

## Business requirement

DijiPeople sells four plans that differ from one another only by which modules
they enable. Today that difference is advertised and never enforced, so the plan
tiers describe nothing the product does and the upgrade path has no mechanical
basis. The requirement is that a capability the tenant has not bought is refused
by the API.

`TODO: Confirm product/business rule.` — what a tenant sees for data it already
entered into a module that is later un-entitled (read-only access versus complete
refusal) is a product decision. This plan refuses both reads and writes, which is
what BUG-1952's acceptance criteria demand; the report-only default is what makes
that decision reversible before it reaches a customer.

## Existing behavior

**FACT** — the entitlement primitive exists and nothing calls it.
`services/api/src/modules/tenant-settings/feature-access.service.ts:78-86`
defines `assertFeatureEnabled()`. A repository-wide search for that identifier
returns exactly one line — its own definition. There is no guard, decorator,
interceptor or domain service that consults plan entitlement on a request path.

**FACT** — `FeatureAccessService` is injected in three places, none of which
enforce anything:
`services/api/src/modules/super-admin/super-admin.service.ts:295`,
`services/api/src/modules/tenant-control-plane/tenant-modules.service.ts:40`
(reads entitlement to *render* the platform-admin module screen and to reject a
tenant override that would enable an unsold module —
`tenant-modules.service.ts:72-81`), and
`services/api/src/modules/tenant-settings/tenant-settings.service.ts:95`
(serves `/tenant-settings/features/availability` to the web shell).

**FACT** — the resolution rule itself is correct.
`feature-access.service.ts:12-71` resolves
`plan entitlement AND tenant override`, with a missing override meaning "follow
the plan", and treats a subscription that is neither `ACTIVE` nor `TRIALING` as
entitling nothing (`feature-access.service.ts:21-29`). The defect is that nobody
asks it.

**FACT** — the one consumer is the tenant web sidebar, and it fails open twice.
The record cites `apps/web/lib/navigation.ts`; that path does not exist on
`develop`. The file is
`apps/web/app/(authenticated)/_components/navigation.ts`. The three cited
behaviours are all present at the new path:

- `apps/web/app/(authenticated)/_components/navigation.ts:266-268` returns the
  item on `hasPrivilegedSidebar` — `global-admin`, `system-admin`,
  `system-customizer` — **before** the feature check, so a tenant administrator
  sees every module regardless of the plan.
- `apps/web/app/(authenticated)/_components/navigation.ts:292-295` treats a null
  `enabledFeatureKeys` as allow-all.
- `apps/web/app/(authenticated)/layout.tsx:96-98` catches the availability fetch
  to `null`, which is what produces that null.

**FACT** — the plan catalog
(`services/api/src/modules/super-admin/plans.catalog.ts:21-72`) differentiates
the four plans on exactly five keys: `timesheets`, `projects`, `recruitment`,
`onboarding`, `payroll`. `employees`, `organization`, `leave`, `attendance`,
`documents`, `notifications` and `branding` are enabled on every plan including
Starter.

**FACT** — what must keep working: `PermissionsGuard`
(`services/api/src/common/guards/permissions.guard.ts`) and its elevated-role
bypass at line 51; the platform path, which reaches tenant data through
`super-admin`, `platform-*` and `tenants` controllers; the .NET gateway surfaces
`attendance-integrations/gateways/gateway-runtime.controller.ts` (guarded by
`GatewayAuthGuard`) and `gateway-service.controller.ts` (`PublicRateLimitGuard`),
neither of which carries an `AuthenticatedUser`; and the desktop agent's own
`modules/agent` surface.

## Existing architecture

- **Guards are per-controller.** `services/api/AGENTS.md:32-33` says so in as
  many words, and a search for `APP_GUARD` across `services/api/src` returns
  nothing. The house shape is
  `@UseGuards(JwtAuthGuard, PermissionsGuard)` on the class, permission
  decorators on the method.
- **Declarative metadata + a guard that reads it** is the established pattern:
  `common/decorators/require-permissions.decorator.ts` sets
  `REQUIRED_PERMISSIONS_KEY` / `REQUIRED_RBAC_PERMISSIONS_KEY`, and
  `common/guards/permissions.guard.ts:22-39` returns `true` when neither is
  present. A third gate follows the same shape exactly.
- **Errors** are catalog codes: `common/errors/error-catalog.ts`, thrown as
  `AppError` (`common/errors/app-error.ts`) and rendered by
  `common/filters/http-exception.filter.ts:164-176`, which handles `AppError`
  first-class.
- **Global modules exist** and are the way a service is made injectable
  everywhere: `common/prisma/prisma.module.ts:4`, `common/mailer/mailer.module.ts:5`,
  `common/storage/storage.module.ts:5`, `common/request-context/request-context.module.ts:4`,
  plus `auth`, `outbox`, `platform-events` and `tenant-domains`.
- **Platform-wide switches are `PlatformSetting` rows**, keyed by string with a
  JSON value (`services/api/prisma/schema.prisma:8199-8210`), read with
  `prisma.platformSetting.findUnique` — the pattern in
  `partners.service.ts:481`, `platform-fx.service.ts:112`,
  `notifications/email/platform-email-provider.resolver.ts:80`. The platform
  owner edits them through `PATCH /api/super-admin/platform-settings`
  (`super-admin.controller.ts:772`, `super-admin.service.ts:3678-3745`).
- **The web client has its own error catalog**: `apps/web/lib/api-error.ts:22-78`
  maps an API `errorCode` to a message and description the UI can present.

## Requirements

1. A tenant request to an endpoint declared as belonging to a feature key the
   tenant's plan does not enable is refused, with error code
   `TENANT_FEATURE_NOT_ENTITLED`.
2. The refusal happens in a guard, so it precedes DTO validation: a malformed
   body and a well-formed one both fail on entitlement, never on field names.
3. The refusal applies to reads and writes alike.
4. **Elevated tenant roles do not bypass it.** `hasElevatedTenantRole` is not
   consulted by the entitlement gate, deliberately and with a comment saying why.
5. **Platform users are exempt.** A caller carrying `user.platform` passes the
   gate unconditionally.
6. An entitlement lookup that cannot be resolved denies rather than allows —
   bounded by a cache, so a transient database fault cannot black out a tenant
   that was resolving a moment ago.
7. Enforcement is governed by a platform-level mode with three values —
   `OFF`, `REPORT_ONLY`, `ENFORCE` — defaulting to `REPORT_ONLY`, in which a
   refusal is logged and the request proceeds.
8. The tenant sidebar hides an un-entitled module for administrator roles too.
9. No new environment variable, no schema migration, no change to any existing
   response shape, permission key, enum value or settings key.
10. The entitlement rule has exactly one implementation, shared by
    `FeatureAccessService` and the new resolver.

## Dependencies

None blocking. The regression id and the QA scenario for this fix are allocated
centrally by the SESSION-0076 burndown, not by this plan.

## Files / modules affected

**`services/api` (new)**

- `src/common/constants/tenant-features.ts` — the typed feature-key union, the
  gated-module map, and the ungated-module register with a reason per entry.
- `src/common/decorators/require-entitlement.decorator.ts` — `@RequireEntitlement`
  and `REQUIRED_ENTITLEMENTS_KEY`.
- `src/common/security/tenant-entitlement.rule.ts` — the pure resolution rule.
- `src/common/security/tenant-entitlement.service.ts` — resolver, cache,
  enforcement mode.
- `src/common/security/tenant-entitlement.module.ts` — `@Global()`, provides and
  exports the service and the guard.
- `src/common/guards/entitlement.guard.ts` — the gate.
- `src/common/security/tenant-entitlement.service.spec.ts`,
  `src/common/guards/entitlement.guard.spec.ts`,
  `src/common/constants/tenant-features.spec.ts`,
  `src/common/constants/entitlement-wiring.invariants.spec.ts` — tests.

**`services/api` (changed)**

- `src/common/errors/error-catalog.ts` — two entries. **SINGLE_WRITER-adjacent**;
  additive only.
- `src/app.module.ts` — one import. **SINGLE_WRITER.**
- `src/modules/tenant-settings/feature-access.service.ts` — calls the shared rule
  instead of inlining it. No behaviour change.
- `src/modules/tenant-control-plane/tenant-modules.service.ts` — invalidates the
  entitlement cache after a module override is written.
- Twenty-seven controllers across thirteen modules — class-level
  `@RequireEntitlement(...)`
  and `EntitlementGuard` appended to `@UseGuards`.

**`apps/web` (changed)**

- `app/(authenticated)/_components/navigation.ts` — the feature check moves ahead
  of the privileged-role shortcut.
- `app/(authenticated)/_components/navigation.spec.ts` — coverage for that.
- `lib/api-error.ts` — two client catalog entries.

## Database impact

None. No model added or changed, no migration. The enforcement mode is a JSON
field inside the existing `PlatformSetting` row keyed `module-settings`, which
`super-admin.service.ts:3673` already reads and `:3729` already writes, and which
is currently `{}` with no consumer.

## Backend impact

**Where the gate sits.** A third guard, `EntitlementGuard`, applied per
controller in the position the repository already uses for guards:

```ts
@UseGuards(JwtAuthGuard, PermissionsGuard, EntitlementGuard)
@RequireEntitlement(TENANT_FEATURE_KEYS.PAYROLL)
export class PayrollController { … }
```

**PROPOSAL** — it runs *after* `PermissionsGuard`, not before. A caller who
cannot use the module at all should keep receiving the authorization answer;
resolving entitlement only for callers who already passed authorization also
keeps the lookup off every rejected request. It is still a guard, so it precedes
every pipe, which is what requirement 2 needs.

**PROPOSAL** — it is a separate guard class, never a branch inside
`PermissionsGuard`. Entitlement is a commercial boundary and permission is an
authorization boundary; entangling them is how the elevated-role bypass would
leak into the commercial decision.

**No global guard.** `EntitlementGuard` is inert without metadata — it returns
`true` when no `@RequireEntitlement` is present, exactly as `PermissionsGuard`
does — but it is still wired per controller, because
`services/api/AGENTS.md:32-33` states there are no global guards and changing
that is a larger architectural decision than this bug needs. Coverage is held by
an invariant spec instead (below), so a gated module that loses its decorator
fails a test rather than silently opening.

**How entitlements resolve.** `TenantEntitlementService.resolve(tenantId)`:

1. Reads the tenant's `Subscription` (with its plan's `PlanFeature` rows) and its
   `TenantFeature` override rows.
2. Applies `resolveTenantFeatureState()` from
   `common/security/tenant-entitlement.rule.ts` — the same function
   `FeatureAccessService` is refactored to call, so requirement 10 holds by
   construction rather than by review.
3. Returns `{ enabledKeys: Set<string>, subscriptionLive: boolean }`.

**How it caches.** An in-process `Map<tenantId, { snapshot, expiresAt }>` with a
60-second TTL — the same shape as the per-request settings lookups already in the
codebase, kept deliberately simple because there is no shared cache tier to
extend. Consequences, stated rather than discovered later:

- A plan change or subscription lapse takes effect within 60 seconds. That is an
  accepted bound, not an oversight; billing state is not a security boundary.
- A tenant module override takes effect immediately, because
  `TenantModulesService.update()` calls `invalidate(tenantId)` after it writes.
- The cache is per API process. With more than one process the bound above is
  still 60 seconds; nothing about correctness depends on processes agreeing.

**The fail-closed decision, in three parts.** This is the part of the design most
likely to take the product down if it is got wrong, so each case is separate:

| Case | Decision | Why |
|---|---|---|
| Plan excludes the module, subscription live | **DENY** `TENANT_FEATURE_NOT_ENTITLED` (403) | The bug. |
| Lookup throws and a cached snapshot exists | **Serve the stale snapshot** | A database blip must not convert a paying tenant into an unentitled one. The snapshot was true 60 seconds ago; the commercial answer does not change that fast. |
| Lookup throws with a cold cache | **DENY** `TENANT_ENTITLEMENT_UNAVAILABLE` (503, retryable) | Requirement 6 and BUG-1952's acceptance criterion: a lookup that fails denies. 503 rather than 403 because the honest statement is "the platform could not answer", not "you did not buy this" — and a retryable 503 is what a client should back off on. |
| No subscription row, or status not `ACTIVE`/`TRIALING` | **ALLOW**, logged | Deliberate carve-out. `feature-access.service.ts:21-29` resolves a lapsed subscription to *nothing entitled*, so denying here would lock a whole tenant out of every gated module over an unpaid invoice or a data gap. Dunning is a separate product decision with its own notice period and its own record; this gate answers "did they buy this module", not "is their invoice paid". |

That last row is the single most important thing a reviewer should push back on
if they disagree with it. It is tested explicitly rather than left implicit.

**The enforcement mode.** `TenantEntitlementService.mode()` reads
`PlatformSetting` row `module-settings`, field `entitlementEnforcement`, cached
on the same 60-second TTL:

- `OFF` — the guard returns `true` without resolving anything. The kill switch.
- `REPORT_ONLY` — **the default when the row or the field is absent.** A refusal
  is logged at `warn` with a stable prefix and the request proceeds.
- `ENFORCE` — the refusal is thrown.

The platform owner flips it through the existing
`PATCH /api/super-admin/platform-settings` with
`{"moduleSettings":{"entitlementEnforcement":"ENFORCE"}}`. No new endpoint, no
new DTO field, no deploy.

**Modules gated**, module directory to feature key:

| Feature key | API modules |
|---|---|
| `payroll` | `payroll`, `payslips`, `pay-components`, `compensation`, `tax-rules`, `time-payroll` |
| `timesheets` | `timesheets` |
| `projects` | `projects` |
| `recruitment` | `recruitment` |
| `onboarding` | `onboarding` |
| `leave` | `leave` |
| `attendance` | `attendance`, `attendance-engine` |

**Modules deliberately NOT gated**, each with its reason, recorded in
`ENTITLEMENT_UNGATED_MODULES` so the omission is a decision rather than an
oversight:

- `employees`, `organization` — enabled on every plan
  (`plans.catalog.ts:29-36`), and the substrate every other module reads through.
  Gating them buys no revenue enforcement and converts any resolver wobble into a
  total outage.
- `documents`, `notifications` — cross-cutting. `documents` holds references
  owned by other modules; `notifications` is delivery infrastructure invoked
  *by* modules rather than bought by a tenant.
- `branding` — a settings surface, not a route module. It is enforced where
  settings are resolved, not by a route gate.
- `attendance-integrations` — the .NET gateway contract. Two of its controllers
  (`gateway-runtime`, `gateway-service`) do not carry an `AuthenticatedUser` at
  all, and refusing a deployed on-premise gateway is an integration break, not a
  commercial one. `attendance` is enabled on every plan today, so nothing is lost.
- `agent` — the desktop agent's own surface, same reasoning.
- `loans`, `claims`, `benefits`, `business-trips` — **changed during
  implementation.** The plan first put these under the `payroll` key because
  the settings tree files them under Payroll & Finance. No feature key sells
  them, and only the Enterprise plan carries `payroll`, so gating them would
  have silently withdrawn four modules from every Starter and Growth tenant on
  a key that was never meant to cover them. That is a product decision this
  record did not make, so they are recorded as ungated instead.
- Everything with no feature key — `auth`, `users`, `settings*`, `approvals`,
  `dashboard`, `reports`, `super-admin`, `platform-*`, `tenants` and the rest.

**Coverage invariant.** `entitlement-wiring.invariants.spec.ts` loads every
`*.controller.ts` through the same Nest-metadata harness
`wiring-invariants.spec.ts` uses (`collectRouteHandlers`, reading
`GUARDS_METADATA` and `PATH_METADATA` off the real classes rather than parsing
source), and asserts that every controller under a module named in
`ENTITLEMENT_GATED_MODULES` carries both `EntitlementGuard` and a
`@RequireEntitlement` naming that module's key — and that no controller outside
that map carries the decorator by accident.

## Frontend impact

`apps/web`, no new screen, no bespoke page.

- **Sidebar.** In
  `app/(authenticated)/_components/navigation.ts:resolveVisibleDashboardNavItems`,
  the `requiredFeatureKey` check moves above the `hasPrivilegedSidebar`
  shortcut, joining the visibility-rule check that is already deliberately
  ordered ahead of it for the same reason ("an admin bypass would make it
  unenforceable", `navigation.ts:264-266`). Requirement 8.
- **A null `enabledFeatureKeys` still allows.** **PROPOSAL, and deliberate.**
  The API is now the access boundary, and root `AGENTS.md` is explicit that
  permissions in the UI are cosmetic. When the availability fetch fails there is
  no server decision to mirror; hiding the entire sidebar on a transient blip is
  a worse failure than showing a link whose endpoint answers
  `TENANT_FEATURE_NOT_ENTITLED`. The comment at `layout.tsx:110-113` already
  makes exactly this argument for navigation overrides.
- **Error presentation.** `lib/api-error.ts` gains `TENANT_FEATURE_NOT_ENTITLED`
  ("Not included in your plan" / "This module is not part of your current
  subscription plan. Ask your administrator to upgrade the plan to use it.") and
  `TENANT_ENTITLEMENT_UNAVAILABLE` ("Plan check unavailable" / retryable), so a
  refusal reads as a commercial answer and not as a permissions bug. Every
  surface that already routes through `normalizeApiError` — the runtime pages,
  the data tables, the forms — picks this up with no further change.
- **Out of scope, recorded as follow-up:** the Settings tree
  (`app/(authenticated)/settings/_lib/settings-navigation.ts`) carries no feature
  keys at all, so an un-entitled tenant still sees the Payroll & Finance branch.
  The pages behind it call gated endpoints and will be refused, so this is
  cosmetic. It is a separate frontend item, not a hole in enforcement.
- Loading / error / empty states: unchanged; the refusal renders through the
  existing error boundaries. Accessibility and responsiveness: unchanged, no new
  markup.

## Permission / RBAC impact

- **No new or changed permission key.** `common/constants/permissions.ts` is
  untouched.
- **No new or changed entity or privilege.** `common/constants/rbac-matrix.ts` is
  untouched.
- No role gains or loses anything; no seed change.
- Endpoint decorators: both existing decorators stay exactly as they are on every
  controller. `@RequireEntitlement` is added alongside them, never in place of
  one.
- Row-level access levels: unaffected. Entitlement is an all-or-nothing module
  decision and never narrows or widens a `where`.
- **Elevated-role bypass: explicitly not applied.** `hasElevatedTenantRole` is
  not imported by the entitlement guard. This is the intended difference from
  `PermissionsGuard` and is asserted by a test, not just by a comment.
- Nothing needs mirroring into `apps/web/lib/security-keys.ts`; `FEATURE_KEYS`
  already exists there (`security-keys.ts:312-321`) and is unchanged.

## Tenant-isolation impact

The gate reads `tenantId` from `request.user.tenantId` and from nowhere else —
never from a body, query, param or header. It is a read of the caller's own
subscription and its own override rows, both filtered on that `tenantId`, and it
writes nothing.

A reviewer can confirm no cross-tenant read is possible by checking that
`TenantEntitlementService.resolve` takes a single `tenantId` argument, that the
guard's only source for it is `request.user.tenantId`, and that both Prisma
queries filter on it. The cache is keyed by `tenantId`, so one tenant's snapshot
cannot be served to another.

Platform-path access is explicit: `user.platform` present returns `true` before
any resolution, because a platform administrator acting across tenants is not
subject to a tenant's plan. That is the same subject distinction
`jwt-auth.guard.ts:101` already makes.

## Audit / event / logging impact

- No `AuditService.log()` call. The gate changes no state.
- No platform event, no notification.
- One `Logger.warn` per refusal, from `EntitlementGuard`, carrying tenant id,
  feature key, route, HTTP method and the mode that produced the decision. In
  `REPORT_ONLY` this log *is* the deliverable: it is how the platform owner
  measures who would be cut off before switching to `ENFORCE`.
- Never logged: tokens, request bodies, email addresses, or anything beyond the
  five fields above.

## Integration impact

None. No contract to the .NET gateway, the desktop agent, Stripe, email or
storage changes. The gateway and agent surfaces are outside the gated set by
design, and no gated endpoint changes its request or response shape — the only
new observable is an additional 403 or 503, and only once the mode is switched.

## Migration / data compatibility

- **Already-stored data**: untouched. Nothing is deleted, hidden or migrated. A
  tenant with payroll rows it was never entitled to keeps them; under `ENFORCE`
  it loses the route that reads them, not the rows.
- **Already-deployed clients**: unaffected while the mode is `REPORT_ONLY`,
  which is the default. Under `ENFORCE` an older web bundle shows the generic
  error message instead of the tailored one — degraded copy, not a break.
- **Old and new run simultaneously**: yes. The API change is additive and inert
  by default; the web change is independent of it.

## Parallel-safe tasks

- `PARALLEL_SAFE` — `lib/api-error.ts` client catalog entries.
- `PARALLEL_SAFE` — the `navigation.ts` ordering fix and its spec.

## Dependency-blocked tasks

- `DEPENDENCY_BLOCKED` — the guard, blocked on the service and the decorator.
- `DEPENDENCY_BLOCKED` — the twenty controller edits, blocked on the guard and
  the feature-key constants.
- `DEPENDENCY_BLOCKED` — the wiring invariant, blocked on the controller edits.

## Integration tasks

- `INTEGRATION` — registering `TenantEntitlementModule` in `app.module.ts`.
- `INTEGRATION` — the full API unit suite, the web typecheck and lint.

## Testing strategy

Commands, all from root `AGENTS.md`:

```
cd services/api && ../../node_modules/.bin/tsc --noEmit -p tsconfig.build.json
npm --workspace api run test
npm --workspace web run check-types
npm --workspace web run test
```

New colocated specs:

- `common/guards/entitlement.guard.spec.ts` — entitled module allowed;
  un-entitled module refused with `TENANT_FEATURE_NOT_ENTITLED`; an elevated
  tenant role (`global-admin`, `system-admin`) still refused; a platform user
  exempt; no decorator means the guard is inert; `OFF` allows; `REPORT_ONLY`
  logs and allows.
- `common/security/tenant-entitlement.service.spec.ts` — resolution matches the
  plan; a tenant override cannot grant what the plan excludes; a lookup failure
  over a warm cache serves the stale snapshot; a lookup failure over a cold cache
  denies with `TENANT_ENTITLEMENT_UNAVAILABLE`; a lapsed subscription allows and
  says so; the cache expires; `invalidate()` drops the entry; mode parsing
  defaults to `REPORT_ONLY` for an absent row, an absent field and an unknown
  string.
- `common/constants/tenant-features.spec.ts` — the typed key union is exactly
  `TENANT_FEATURE_DEFINITIONS`; every gated module directory exists; no module is
  in both the gated and the ungated map.
- `common/constants/entitlement-wiring.invariants.spec.ts` — every controller in
  a gated module carries the guard and the right key; no controller outside the
  map carries the decorator.

Extended: `apps/web/app/(authenticated)/_components/navigation.spec.ts` — a
`global-admin` on a plan without `payroll` does not see the Payroll link.

`wiring-invariants.spec.ts` and `rbac-matrix.*.spec.ts` are **not** extended:
this change adds no permission key and no privilege, so there is nothing there to
assert. Both must stay green, and both are covered by the full suite run.

Manual verification, after the flag is switched in a non-production tenant:
sign in to a Starter tenant as `global-admin`; confirm Timesheets, Projects,
Payroll, Recruitment and Onboarding are absent from the sidebar; call
`GET /api/payroll/cycles`, `GET /api/payroll/runs`, `GET /api/projects` and
`POST /api/projects` with a deliberately malformed body, and confirm all four
answer `TENANT_FEATURE_NOT_ENTITLED` rather than 200, 201 or a field-name 400.

## Risks

1. **Cutting off live tenants — likelihood: certain if switched on blind;
   impact: severe.** Every deployed tenant is today using whatever it likes. The
   whole mitigation is the mode: it ships `REPORT_ONLY`, the refusals are logged
   with a stable prefix, and the platform owner reads those logs to learn exactly
   which tenants and which modules are affected before deciding. Switching to
   `ENFORCE` is a data change the owner makes, reversible in seconds, with `OFF`
   as a further kill switch.
2. **Data becomes unreachable rather than deleted — likelihood: certain under
   `ENFORCE`; impact: high.** A tenant that entered payroll data it never bought
   loses the route to it. The rows survive; this is a commercial decision to take
   consciously, per tenant, and it is why risk 1's report-only period exists.
   `TODO: Confirm product/business rule.` on whether un-entitled modules should
   degrade to read-only instead — ITEM-0110 asks the adjacent question.
3. **A stale cache serves the wrong commercial answer for up to 60 seconds —
   likelihood: routine; impact: low.** Bounded and deliberate. Module overrides
   invalidate immediately; plan and subscription changes wait out the TTL.
4. **Cold-cache lookup failure denies a paying tenant — likelihood: low; impact:
   moderate.** Only when the database is unreachable on that tenant's first
   gated request in a process, which is a state in which most other requests are
   failing anyway. It answers 503 retryable, not 403.
5. **A new controller in a gated module ships without the decorator —
   likelihood: moderate over time; impact: moderate.** This is exactly the
   `defined-but-unwired-permission` pattern that produced BUG-1952. Mitigated by
   the wiring invariant, which reads real Nest metadata off the loaded classes
   rather than scanning source.
6. **Tenant isolation — not in scope.** The gate reads only the caller's own
   tenant and writes nothing.

## Rollback considerations

`ROLLBACK_CLASS: CODE_ONLY`, and reversible in three widening steps:

1. Set `moduleSettings.entitlementEnforcement` to `OFF`. Instant, no deploy, no
   restart; the guard stops resolving anything.
2. Revert the commits. No migration to undo, no data written, no response shape
   changed, no permission key added.
3. Nothing partial breaks: the web change is independent of the API change in
   both directions. Web without API means a sidebar that hides links whose
   endpoints still answer — the state before this plan, minus the admin bypass.
   API without web means an accurate refusal shown with generic copy.

## Definition of Done

- [ ] `assertFeatureEnabled` is no longer the only entitlement primitive, and the
      new gate has real call sites.
- [ ] API typecheck passes.
- [ ] Full API unit suite passes; no pre-existing failure newly introduced.
- [ ] `npm --workspace web run check-types` passes.
- [ ] ESLint with `--fix` run on both changed workspaces.
- [ ] Elevated tenant roles are refused, proven by a test and not by a comment.
- [ ] Platform users are exempt, proven by a test.
- [ ] Cold-cache resolver failure denies; warm-cache resolver failure serves
      stale — both proven by tests.
- [ ] `REPORT_ONLY` logs and allows, proven by a test.
- [ ] The wiring invariant fails when a gated controller loses its decorator.
- [ ] No permission key, RBAC entry, enum value, settings key, response shape or
      environment variable changed.
- [ ] Tenant scoping verified: `tenantId` comes only from `request.user`.
- [ ] `docs/bugs/BUG-1952-*.md` updated with a Resolution section carrying the
      rollout caveat.
- [ ] No unrelated change in the diff.

## Related

[[BUG-1952]] — the defect this plan addresses.

> **Numbering caveat.** This file and
> `EXECPLAN-0028-bug-0084-missing-unique-constraints.md` both carry
> `EXECPLAN-0028` in their filename, and neither carries the `ID:` / `aliases:`
> frontmatter its sibling plans use. See [[BUG-2413]] — `allocate-id.mjs` scans
> `docs/qa/test-plans` for the `plan` kind and never sees `docs/plans`, so the
> two families share one number space and only one of them is allocated.
> Renumbering is left to the owning session; this section exists so the plan is
> reachable in the graph.
