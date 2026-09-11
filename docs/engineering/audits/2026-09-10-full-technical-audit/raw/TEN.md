# TEN — Multi-Tenant Isolation and IDOR/BOLA

Audit area: cross-tenant data access, IDOR/BOLA, platform/tenant boundary.
Commit: `f55cf4b2` (`origin/develop`). Static tracing only, read-only.

## Method

1. Read the intended isolation mechanism end to end (guard → access-context →
   query-scope helpers → Prisma middleware).
2. Extracted the 261 tenant-owned Prisma models (models with a `tenantId
   String` field) out of 325 total models in `schema.prisma`.
3. Mechanically scanned all 830 non-spec `.ts` files under `services/api/src`
   for `prisma.<model>.<method>(` / `tx.<model>.<method>(` calls against those
   261 models, for `findUnique/findFirst/findMany/count/aggregate/groupBy/
   update/delete/upsert/updateMany/deleteMany/create/createMany`. Found 2,394
   such calls; 753 had no literal `tenantId` inside the call's own argument
   block.
4. Re-ran with a 60-line-backward lookback per hit (catches `tenantId` set via
   an enclosing `where` variable a few lines above) and a nearby-platform-guard
   keyword check. This narrowed the list to 194 (181 with no nearby platform
   keyword either).
5. Manually traced a stratified sample of that shortlist across every module
   family (payroll, timesheets, dashboard, contracts, notifications, inbox,
   audit, reports, error-logs, lookups, settings-runtime, customization,
   tax-rules, super-admin, platform-*, tenant-control-plane, background
   workers) back to either (a) a tenant-scoping helper the literal-string scan
   can't see, (b) a prior tenant-verified fetch (`findXOrThrow(tenantId, id)`)
   whose result's `id` is reused in the later bare-id `update`/`delete`, or (c)
   a platform-only guard. Two genuine gaps survived this process — both in
   `modules/lookups/lookups.service.ts` — and are written up below.
6. Checked raw SQL, the generic data API, cross-cutting stores, the platform
   path, and background workers directly per the briefing's sections 4–8.

Scripts used are throwaway (scratchpad only, not committed).

---

## Section 1 — Intended mechanism

`services/api/src/common/guards/jwt-auth.guard.ts` (`JwtAuthGuard.canActivate`):

- Verifies the JWT signature with a **per-client secret**
  (`getClientAccessTokenSecret(configService, clientId)`, `clientId` read from
  a request header) and confirms `payload.appClientId`/`aud` match that
  client — a `web`-signed token cannot be replayed against the `admin` secret.
- Confirms the session is live: `refreshToken.findFirst({ sessionId, userId,
  tenantId, appClientId, revokedAt: null, expiresAt: { gt: now } })` (or the
  `platformRefreshToken`/`agentRefreshToken` equivalents).
- Calls `AuthAccessService.loadAccessContext(payload.sub, payload.tenantId)`
  (`services/api/src/modules/auth/auth-access.service.ts:71-154`):
  ```
  auth-access.service.ts:72   const user = await this.prisma.user.findUnique({ where: { id: userId }, ... });
  auth-access.service.ts:146  (expectedTenantId && user.tenantId !== expectedTenantId) ... throw new UnauthorizedException(...)
  ```
  `request.user.tenantId` is **re-derived from the `User` row in the
  database**, not copied from the JWT claim, and is rejected if it disagrees
  with the claim. A forged or stale `tenantId` claim cannot survive this step.
- `request.user: AuthenticatedUser` (`common/interfaces/authenticated-request.
  interface.ts`) is what every downstream service reads `tenantId` from.

`common/security/rbac-query-scope.ts` supplies the second, row-level step:
`resolveEffectiveAccessLevel` + `buildBusinessUnitScopeWhere` /
`buildOwnedRecordWhere` (`buildScopedAccessWhere`, used from many services)
narrow a tenant-scoped query further to OWN/TEAM/BUSINESS_UNIT/ORGANIZATION,
after tenant scope is already applied.

**The Prisma `$use` middleware is confirmed inert.**
`common/prisma/prisma.service.ts:31-34`:
```
const middlewareRegistrar = (this as any).$use;
if (typeof middlewareRegistrar !== 'function') {
  this.logger.debug('Prisma middleware registration skipped because PrismaClient.$use is unavailable...');
  return;
}
```
Checked the generated client directly: `@prisma/client@7.8.0`'s
`node_modules/.prisma/client/client.d.ts` and `client.js` declare **no `$use`
method at all** — `grep -n '\$use'` against both returns nothing. So
`middlewareRegistrar` is `undefined`, the `if` is always true, and the
middleware body (which — confirmed by reading it — only scopes by
**business unit** for a fixed list of models such as `Employee`,
`AttendanceEntry`, `Timesheet`, never by tenant) never registers. **Confidence:
CONFIRMED.** This matches AGENTS.md's own claim; it is re-verified here against
the actual installed client, not assumed.

**Conclusion:** the only thing standing between one tenant's data and another's
is `request.user.tenantId` being threaded into every `where` by hand, exactly
as the briefing states. There is no framework-level backstop.

---

## Findings

### TEN-01 — Any tenant admin can read cross-tenant employee counts through the geography "usage" endpoints

- **Category:** Tenant Isolation
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/lookups/lookups.service.ts`,
  `services/api/src/modules/lookups/lookups.controller.ts`
- **Evidence:**
  `services/api/src/modules/lookups/lookups.service.ts:108` —
  `this.prisma.employee.count({ where: { countryId: country.id } })`
  `services/api/src/modules/lookups/lookups.service.ts:145` —
  `this.prisma.employee.count({ where: { stateProvinceId: id } })`
  `services/api/src/modules/lookups/lookups.service.ts:211` —
  `this.prisma.employee.count({ where: { cityId: id } })`
  `services/api/src/modules/lookups/lookups.controller.ts:46-53` —
  ```
  @Get('countries/:id/usage')
  @Permissions('settings.read')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.BRANDING, action: 'read' },
    { entityKey: ENTITY_KEYS.TENANT_ADMINISTRATION, action: 'read' },
  )
  getCountryUsage(@Param('id') id: string) { ... }
  ```
  (same shape at `states/:id/usage` line 86 and `cities/:id/usage` line 147).
  `Employee` is confirmed tenant-owned (`tenantId String` in
  `services/api/prisma/schema.prisma`). `Country`/`StateProvince`/`City`
  themselves are legitimately global/shared reference tables (no `tenantId`
  field, `schema.prisma:3864-3913`) — that part is fine by design.
- **Current behaviour:** `@Controller('lookups') @UseGuards(JwtAuthGuard,
  PermissionsGuard)` — an ordinary tenant-scoped controller. Any user holding
  `settings.read` + (`branding.read` or `tenant-administration.read`) — a
  routine tenant System Administrator permission, not a platform permission —
  can call `GET /api/lookups/countries/:id/usage` (and the state/city
  equivalents) and receive an `Employee` count filtered only by
  `countryId`/`stateProvinceId`/`cityId`, with **no `tenantId` in the `where`
  clause at all**. The count is the number of employees across **every
  tenant on the platform** that reference that location, not the caller's own
  tenant.
- **Expected behaviour:** matches the pattern used everywhere else in this
  codebase for an identical "can I delete this because X still references it"
  check — e.g. `enterprise-configuration.service.ts:1125`
  (`getFiscalYearUsage(tenantId, id)` → `count({ where: { tenantId,
  fiscalYearId: id } })`) or `leave.service.ts:165`
  (`listLeaveTypeUsage(tenantId, id)`), both of which thread `tenantId`
  through. `lookups.service.ts` is the one place in the module family that
  does not.
- **Risk:** A tenant's own System Administrator (not a platform user) learns
  how many employees other tenants have in a given country/state/city by
  probing `/lookups/*/usage` across ids — a direct cross-tenant data
  disclosure reachable by a large, ordinary role, no platform access required.
  Repeated probing across every seeded country/state/city can build a coarse
  cross-tenant headcount-by-geography profile of the whole platform.
- **Remediation:** Add `tenantId` to all `Employee.count()` calls inside
  `getCountryUsage`, `getStateUsage`, `getCityUsage`,`deleteState`, and
  `deleteCity` in `lookups.service.ts`, taking `tenantId` from
  `AuthenticatedUser` (thread it through the controller methods, which
  currently only pass `id`/`body`). If the intent is genuinely to block
  deletion of a shared reference row while *any* tenant uses it (see TEN-02),
  that platform-wide check belongs behind a platform permission, not exposed
  to a tenant-scoped `/usage` endpoint — split the two concerns.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

### TEN-02 — Any tenant admin can create, edit or delete the platform's shared Country/State/City reference data

- **Category:** Tenant Isolation / Authorization
- **Severity:** CRITICAL
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/lookups/lookups.controller.ts`,
  `services/api/src/modules/lookups/lookups.service.ts`
- **Evidence:**
  `services/api/src/modules/lookups/lookups.controller.ts:66-72` —
  ```
  @Post('states')
  @Permissions('settings.update')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.SETTINGS, action: 'configure' },
    { entityKey: ENTITY_KEYS.TENANT_ADMINISTRATION, action: 'write' },
  )
  createState(@Body() body: Record<string, unknown>) { ... }
  ```
  Same shape (`settings.update` + `SETTINGS.configure`/
  `TENANT_ADMINISTRATION.write`, no platform gate) for `PATCH states/:id`
  (line 96), `DELETE states/:id` (line 106), `POST cities` (line 127),
  `PATCH cities/:id` (line 157), `DELETE cities/:id` (line 167).
  `services/api/src/modules/lookups/lookups.service.ts:227-238` (deleteState) —
  ```
  const [cityCount, employeeCount] = await Promise.all([
    this.prisma.city.count({ where: { stateProvinceId: id } }),
    this.prisma.employee.count({ where: { stateProvinceId: id } }),
  ]);
  if (cityCount || employeeCount) { throw new ConflictException(...); }
  await this.prisma.stateProvince.update({ where: { id }, data: { isActive: false } });
  ```
  `Country`/`StateProvince`/`City` have no `tenantId` column — they are the
  single global copy every tenant's UI reads from (`schema.prisma:3864-3913`).
- **Current behaviour:** The permission gating these mutation endpoints
  (`settings.update`, `TENANT_ADMINISTRATION.write`) is an ordinary
  tenant-scoped permission that any tenant's System/HR Administrator role can
  hold within their own tenant. There is no `user.platform` check anywhere in
  `lookups.controller.ts` or `lookups.service.ts` for these handlers (compare
  with `modules/contracts/contracts.service.ts` or
  `modules/tenant-control-plane/tenant-control-plane.guard.ts`'s
  `assertTenantPlatformAccess`, which this file has no equivalent of). Because
  `StateProvince`/`City` are genuinely shared singletons, a write from any one
  tenant's admin is visible to and affects **every other tenant on the
  platform** immediately — renaming, deactivating, or (if the block condition
  in `deleteState`/`deleteCity` happens to read zero cross-tenant usage —
  itself the TEN-01 count) deleting a location every other tenant's employee
  records, address forms and dropdowns depend on.
- **Expected behaviour:** Mutating shared, non-tenant-owned reference data
  should require a platform permission (e.g. `assertPlatformAdministrator` /
  `assertTenantPlatformAccess`-style gate, as `tenant-control-plane` and
  `contracts` do for their platform-only mutations), not a tenant-scoped
  permission. If tenant-level curation of the location list is actually
  intended product behaviour, it needs tenant-scoped data (a `tenantId` on
  these models, or a tenant-specific override/exclusion table) rather than a
  shared table with tenant-gated writes.
- **Risk:** Any tenant's System Administrator (an ordinary, non-platform,
  commonly-granted role) can silently corrupt or remove geography data relied
  on by every other tenant — e.g. `DELETE /api/lookups/states/:id` on a state
  with zero employees platform-wide today succeeds permanently for
  everyone, or `PATCH /api/lookups/cities/:id` renaming a city changes what
  every other tenant's employee address, onboarding and payroll forms display.
  This is a cross-tenant integrity/availability break, not merely a read leak.
- **Remediation:** Gate `createState/updateState/deleteState/createCity/
  updateCity/deleteCity` (and the `Country` equivalents if they exist outside
  read) behind a platform-only permission check, mirroring
  `assertTenantPlatformAccess`/`assertPlatformAdministrator` from
  `tenant-control-plane.guard.ts`. Fix TEN-01's count query alongside this,
  since the delete-block check becomes platform-legitimate once the endpoint
  itself is platform-gated.
- **Difficulty:** LOW–MEDIUM (permission gate change + regression tests for
  the small number of tenants that may currently rely on self-service
  geography edits — check whether this is exercised in any tenant onboarding
  flow before flipping the gate)
- **Regression risk:** MEDIUM (if any tenant-facing UI currently depends on
  self-service create/edit of countries/states/cities, that flow needs to move
  to a platform-mediated request instead)
- **Fix now:** YES

### TEN-03 — Several platform-only controllers rely entirely on per-method service checks, not a shared guard

- **Category:** Tenant Isolation / Defense-in-depth
- **Severity:** LOW
- **Confidence:** CONFIRMED (pattern), NOT OBSERVED (no actual missing check found)
- **Known:** NEW
- **Component:** `modules/platform-events/platform-events.controller.ts`,
  `modules/platform-monitoring/platform-monitoring.controller.ts`,
  `modules/platform-runtime/platform-runtime.controller.ts`,
  `modules/platform-users/platform-users.controller.ts`,
  `modules/tenant-control-plane/tenant-control-plane.controller.ts`
- **Evidence:** All five controllers declare only
  `@UseGuards(JwtAuthGuard)` at the class level (grepped directly, e.g.
  `platform-events.controller.ts:8`, `tenant-control-plane.controller.ts:48`)
  — no `PermissionsGuard`, no dedicated `PlatformGuard`, and no per-handler
  `@Permissions`/`@RequirePermission` decorators. Every handler therefore
  depends on the injected service calling something like `assertPlatform`,
  `assertRead`, `assertMonitoring`, or (in `tenant-control-plane`)
  `assertTenantPlatformAccess`/`assertPlatformAdministrator` internally.
  I traced every handler in `platform-events.controller.ts` (4/4 call
  `assertRead`/check `user.platform`), sampled `platform-monitoring`
  (`assertMonitoring`), `platform-users` (8/11 call `assertPlatformUser`; the
  3 that don't are `me/*` self-service routes scoped to the caller's own
  identity, which is safe regardless), and all of
  `tenant-access.service.ts`/`tenant-erasure.service.ts` under
  `tenant-control-plane` (every method calls `assertTenantPlatformAccess`,
  and the two irreversible operations additionally call
  `assertPlatformAdministrator` — `tenant-erasure.service.ts:134,389`). No
  missing check was found in this sample.
- **Current behaviour:** Correct today by convention, verified on every
  method sampled, but the framework provides no compile-time or
  request-pipeline enforcement that a *new* handler added to one of these
  controllers will remember to call the assertion. A missed call is a full
  platform/tenant boundary break with no test or guard to catch it before
  code review.
- **Expected behaviour:** A shared `PlatformGuard`
  (`@UseGuards(JwtAuthGuard, PlatformGuard)`) or a `@RequirePlatformRole()`
  decorator enforced at the controller/route level, so a new handler is
  unauthorized-by-default rather than authorized-by-remembering.
- **Risk:** Latent — no confirmed break at this commit, but the failure mode
  of the current pattern is silent and severe (a forgotten `assertX()` call in
  a `platform/tenants/:tenantId/...` handler would be reachable by an ordinary
  authenticated tenant user, since `JwtAuthGuard` alone accepts any valid
  session regardless of tenant vs. platform subject type).
- **Remediation:** Introduce a shared platform guard and migrate these five
  controllers to it opportunistically; keep the service-level asserts as
  defense-in-depth rather than removing them.
- **Difficulty:** MEDIUM (touches five controllers + guard authoring)
- **Regression risk:** LOW
- **Fix now:** NO — architectural improvement, not a live break; track as a
  backlog item.

### TEN-04 — Silent unscoped fallback in the generic data API's scope resolver

- **Category:** Tenant Isolation / Design hazard
- **Severity:** LOW
- **Confidence:** CONFIRMED (code), NOT OBSERVED (not currently exploitable)
- **Known:** NEW
- **Component:** `services/api/src/modules/data/entity-scope.resolver.ts`,
  `services/api/src/modules/data/entity-registry.ts`
- **Evidence:**
  `entity-scope.resolver.ts:9-12` —
  ```
  buildReadScope(metadata: EntityMetadata, user: AuthenticatedUser) {
    if (!metadata.tenantScoped && !metadata.businessUnitScoped) {
      return {};
    }
  ```
  `entity-registry.ts:4-114` — `ENTITY_REGISTRY` currently declares exactly
  **one** entity, `employees`, with `tenantScoped: true` and
  `scope.tenantIdField: 'tenantId'` correctly set (verified).
- **Current behaviour:** If a future entity is registered in
  `ENTITY_REGISTRY` and its author forgets to set `tenantScoped: true` (or
  `businessUnitScoped: true`) for a genuinely tenant-owned model, `where`
  resolves to `{}` — an **unscoped `findMany`/`count` across every tenant** —
  with no error, no warning, and no test that would catch it short of a
  cross-tenant QA scenario against that specific new entity.
  `DataService.resolveDelegate` (`data.service.ts:89-106`) only ever
  dereferences `metadata.prismaModel` from the fixed registry (not
  client-controlled), so today's one registered entity cannot be abused this
  way and there is no arbitrary-model access.
- **Expected behaviour:** `EntityMetadata` should make `tenantScoped: false`
  require an explicit, differently-named escape hatch (e.g.
  `explicitlyGlobalEntity: true`) rather than being the silent default
  fallthrough for "forgot to set it."
- **Risk:** None today (one entity, correctly configured). The risk is
  entirely in what this module becomes as more entities are registered —
  worth fixing while the blast radius is one file.
- **Remediation:** Fail closed instead of open: throw if neither
  `tenantScoped` nor `businessUnitScoped` nor an explicit global flag is set,
  rather than returning `{}`.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

## Section 2 — Unscoped query enumeration (counts)

Mechanical scan (method in Section "Method" above), 2,394 Prisma calls against
261 tenant-owned models across 830 files:

| Method | Total calls | No literal `tenantId` in call block |
|---|---|---|
| findFirst | 617 | 38 |
| findUnique | 129 | 56 |
| findMany | 452 | 91 |
| update | 389 | 373 |
| delete | 19 | 18 |
| upsert | 57 | 2 |
| updateMany | 129 | 20 |
| deleteMany | 50 | 6 |
| count | 246 | 95 |
| aggregate | 2 | 0 |
| groupBy | 37 | 29 |
| create/createMany | 267 | 25 |
| **Total** | **2,394** | **753** |

After the 60-line-lookback refinement (catches `tenantId` injected via a
helper/variable a few lines above the call, which the literal scan can't see)
and excluding hits with a nearby platform-guard keyword: **194** remained, of
which **181** had no nearby platform keyword either.

Classification of the sampled 181 (I traced the large majority of files by
hit-count — every file with ≥2 hits, plus every file touching a
tenant-facing, non-`super-admin`/`platform-*`/`billing`/`contracts`/
`support-cases` module):

- **(a) genuine break:** 2 (TEN-01, TEN-02 above — both in
  `lookups.service.ts`, both new).
- **(b) safe — platform-guarded:** the large majority of `super-admin/*`,
  `billing/*`, `contracts.service.ts`, `support-cases.service.ts`,
  `platform-*/*`, `commercial-bootstrap.ts`, `platform-lifecycle.service.ts` —
  every sampled call sits behind `assertPlatform`/`assertWrite`/
  `assertTenantPlatformAccess` either at the top of the same method or one
  call up the chain.
- **(c) safe — tenant re-verified before the bare-id call:** the majority of
  `update`/`delete` hits (e.g. `payroll-run.service.ts` 19/19 sampled,
  `field-security.controller.ts` 6/6, `timesheet-generation.service.ts`,
  `data-management/import-execution.service.ts`, `settings-runtime.service.ts`,
  `customization.service.ts`, `tax-rules/employee-tax-profiles.service.ts`)
  follow a `const existing = await findXOrThrow(tenantId, id)` (or an
  equivalent `findFirst({ where: { id, tenantId } })`) immediately before the
  bare-`{ where: { id } }` mutation, or reuse an id that was already
  tenant-verified higher up the call chain (e.g.
  `payroll-exchange-rate.service.ts`'s composite-unique-key lookups on a
  `payrollRunId` obtained from an already-scoped caller).
- **(d) safe — scoped via a helper the literal scan cannot see:**
  `dashboard.service.ts` (all 16 flagged hits go through
  `employeeBaseWhere`/`employeeScopedWhere`, both of which inject
  `tenantId: currentUser.tenantId`), `reports.service.ts` (all 3 remaining
  hits go through `scopedWhere()`, which is exactly the BUG-2624 fix — see
  below), `lookups.service.ts`'s non-flagged calls.
- Two calls (`auth.service.ts:1186/1199`, `agent.service.ts:1515`) revoke a
  refresh token by bcrypt-comparing the presented secret against the most
  recent active tokens; not a tenant-isolation break (revocation requires
  possessing the actual token secret) but the `take: 20` cap is a latent
  functional bug for tenants with >20 concurrent sessions — flagged for
  routing to a different specialist, not written up here.

No further genuine breaks were found in the sampled 181. The remaining
~unsampled minority (files with exactly 1 low-risk hit in an already
well-scoped module, e.g. single hits in `attendance.service.ts`,
`compensation.service.ts`, `payroll-defaults.service.ts`) were not
individually traced — see "Not examined" below.

---

## Section 3 — Client-supplied `tenantId`

Grepped all DTOs for a `tenantId` property and all handlers for
`body.tenantId`/`query.tenantId`/`params.tenantId`/`req.tenantId`.

DTOs declaring `tenantId`:
- `modules/auth/dto/login.dto.ts:43` — pre-authentication (tenant selection at
  login); not behind `JwtAuthGuard`, not a bypass.
- `modules/contracts/dto/contracts.dto.ts:143,234,244` — every handler that
  reaches these DTOs is behind `assertPlatform`/`assertWrite`
  (`contracts.service.ts:5031-5041`, verified). Safe (b).
- `modules/super-admin/dto/record-payment.dto.ts:15` — `super-admin` module,
  controller-level `@UseGuards(JwtAuthGuard, RolesGuard,
  PlatformPermissionsGuard)`. Safe (b).
- `modules/support-cases/dto/support-cases.dto.ts:27,52,84` — every handler
  guarded by `assertPlatform`/`assertWrite` (verified at
  `support-cases.service.ts:222,307` and surrounding methods). Safe (b).

Other `query.tenantId` reads (`platform-events.service.ts:217`,
`platform-monitoring.service.ts:51-54`) are cross-tenant *filters* a platform
operator applies deliberately when browsing events/logs across tenants; both
sit behind `assertRead`/`assertMonitoring` (verified `user.platform` checks).
Safe (b) — this is the platform staff's legitimate "which tenant am I looking
at" selector, not a tenant user escaping their own scope.

**No DTO or handler was found where an authenticated non-platform (ordinary
tenant) route trusts a client-supplied `tenantId` to select which tenant's
data to read or write.** Confidence: CONFIRMED for everything grepped;
NOT OBSERVED beyond the literal `tenantId`-named property/key (a field named
something else that secretly carries a tenant id was not searched for and
would not be caught by this method).

---

## Section 4 — Raw SQL

`grep -rl '$queryRaw\|$executeRaw'` across `services/api/src` (excluding
specs): exactly 3 files, 3 call sites. **No `$queryRawUnsafe` or
`$executeRawUnsafe` anywhere in the codebase** (NOT OBSERVED).

- `common/prisma/prisma.service.ts:129` — reads `_prisma_migrations` (Prisma's
  own bookkeeping table, no tenant concept). Safe (d).
- `modules/outbox/outbox-dispatcher.service.ts:180` — `claimBatch()`, a
  parameterised tagged-template `UPDATE ... RETURNING`, claims outbox rows
  across all tenants by design (it's queue infrastructure; each claimed
  event still carries its own `tenantId` payload for the delivery step
  downstream). Safe (d) — intentionally cross-tenant at the dispatcher layer,
  not client-reachable.
- `modules/outbox/outbox.service.ts:58` — parameterised `INSERT ... ON
  CONFLICT DO NOTHING`, explicitly writes `tenantId: input.tenantId` as a
  bound parameter. Safe.
- `modules/payroll/payroll.service.ts:443` — `Prisma.sql` advisory lock keyed
  on `` `${currentUser.tenantId}:${payrollCalendarId}` ``, parameterised, used
  only to serialise concurrent period generation for one tenant+calendar. Safe.

All four are tagged-template (`Prisma.sql` / `` $queryRaw`...` ``) — properly
parameterised, no string concatenation of user input into SQL text found.
**Confidence: CONFIRMED — no SQL injection surface, no unscoped raw query.**

---

## Section 5 — Generic data API (`modules/data/`)

Two distinct systems live under this heading:

**`DataService` / `ENTITY_REGISTRY`** (`data.service.ts`,
`entity-registry.ts`, `entity-scope.resolver.ts`) — a typed, statically
registered entity API. Traced `findMany` end to end: `entityLogicalName` →
`getEntityMetadata()` (fixed registry lookup, not client-controlled) →
`validateEntityQuery` → `EntityScopeResolver.buildReadScope` (injects
`buildScopedAccessWhere` using `metadata.scope.tenantIdField`) →
`resolveDelegate(metadata.prismaModel)` (also from the fixed registry, so a
caller cannot name an arbitrary Prisma model). Only one entity is currently
registered (`employees`), correctly `tenantScoped: true`. See TEN-04 above for
the one latent design hazard found here (the `{}` fallthrough for a
mis-registered future entity) — not currently exploitable.

**`CustomDataService`** (`custom-data.service.ts`) — the actual dynamic,
tenant-defined-table engine (`CustomizationTable`/`CustomDataRecord`), and the
higher-risk surface by design since tenants define their own entities here.
Every entry point (`findMany`, `create`, `update`, `softDelete`) calls
`tableOrThrow(entityLogicalName, user.tenantId)` first
(`custom-data.service.ts:155,212,265,321`, and the private `tableOrThrow` at
`:617` calls `findTable(entity, tenantId)` which filters `customizationTable`
by `{ tenantId, ... }` at `:625-627`), and every record-level operation goes
through `recordOrThrow` (`:378-400`), whose `findFirst` includes `{ id,
tenantId: user.tenantId, tableId: table.id, isDeleted: false }`
(`:389-393`). `update`/`softDelete`'s bare-`{ where: { id: existing.id } }`
Prisma calls (flagged by the mechanical scan) reuse `existing.id` from that
tenant-verified `recordOrThrow` result — class (c), safe. **Confidence:
CONFIRMED — traced end to end, no gap found.**

---

## Section 6 — Cross-cutting stores

- **Documents** — `modules/documents/documents.service.ts` uses
  `buildScopedAccessWhere` throughout (verified at lines 145, 491, 550).
  BUG-0053 (self-scoped readers could list/open tenant-wide documents) is
  **KNOWN, Status: VERIFIED, ArchitectDisposition: DONE** — confirmed fixed
  by re-reading the current code, not just trusting the record.
- **Notifications / Inbox** — `modules/inbox/inbox.service.ts:list()` filters
  `{ tenantId: user.tenantId, recipientUserId: user.userId, ... }`
  (`:23-24`); every per-notification lookup in the file uses `findFirst`
  with an explicit tenant+recipient `where`, never a bare `findUnique`.
  `modules/notifications/notifications.repository.ts` follows the same
  pattern for its tenant-facing paths.
- **Audit logs** — `modules/audit/audit.controller.ts:26,36` call
  `auditService.listByTenant(user.tenantId, query)` /
  `detailByTenant(user.tenantId, id)`; `audit.service.ts:110-135` thread
  `tenantId` into `auditRepository.findByTenant`/`findOneByTenant` /
  `getFilterMetadata`. Clean.
- **Error logs** — `error-logs.service.ts:findForUser` carries an explicit,
  well-commented tenant re-check (`:187-227`) that is exactly the fix for
  **BUG-0005** (cross-tenant error log read via support role) — **KNOWN,
  Status: VERIFIED, DONE**, confirmed still in place: `belongsToCallerTenant =
  Boolean(log.tenantId) && log.tenantId === user.tenantId`, checked before
  either the support-role or the owner branch returns the log.
- **Reports** — `reports.service.ts:53-65` (`scopedWhere`) always ANDs
  `{ tenantId: user.tenantId }` with `this.scope.buildWhere(user, source)`.
  This is the fix for **BUG-2624** (reports returned tenant-wide aggregates
  regardless of caller's row scope) — **KNOWN, Status: VERIFIED, DONE**,
  confirmed in place for headcount, leave, and recruitment summaries.
- **Organization structure** — `organization-access.service.ts` resolves
  `effectiveAccessLevel`/`requiresSelfScope` per caller. This is the fix for
  **BUG-0058** (organization structure reads ignored caller scope) —
  **KNOWN, Status: VERIFIED, DONE**, confirmed present.
- **Exports / report artifacts** — `reporting/export/report-artifact.service.ts`
  is unusually well-hardened: an explicit code comment states the exact
  attack this guards against (`:388-392`, "`findFirst` with `{ id, tenantId }`
  rather than `findUnique` by id: this id came from a URL, and a `findUnique`
  followed by a forgotten check is how cross-tenant reads happen"), and
  `requireRun(tenantId, runId)` is the single choke point every
  status-change/download call goes through (`:143-263`).
- **Views** — `modules/views/*.service.ts` resolves `tenantId` once via a
  `getTenantId(currentUser)` helper and threads it into every
  `moduleView.findMany`/`findFirst` call (`:108-350`, sampled).
- **Search / saved filters** — not a distinct module in this codebase; list
  filters live inside each domain service (e.g. `approvals.service.ts:
  buildWhere`, which ANDs `{ tenantId: user.tenantId }` with the row scope —
  and the code comment there documents a *previous* bug where a search filter
  spread could override the scope; it is now combined under `AND` so it
  cannot). No dedicated cross-module "saved filter" store was found —
  NOT OBSERVED as a separate surface.

---

## Section 7 — Platform path

- **`super-admin`** — `@UseGuards(JwtAuthGuard, RolesGuard,
  PlatformPermissionsGuard)` at the controller (`super-admin.controller.ts:73`,
  the only guard triple like this in the codebase — a real dedicated
  `PlatformPermissionsGuard`, not just a service-level assert). Confirmed
  platform-only.
- **`platform-events`, `platform-monitoring`, `platform-runtime`,
  `platform-users`, `tenant-control-plane`** — only `JwtAuthGuard` at the
  controller; authorization is delegated to service methods. Sampled and
  traced (see TEN-03) — every handler checked calls the right assertion.
  `tenant-control-plane` in particular is unusually well-designed: a single
  shared helper module (`tenant-control-plane.guard.ts`) with
  `assertTenantPlatformAccess` (checks `user.platform.id` +
  `userHasPlatformPermission`) and `assertPlatformAdministrator` (additionally
  requires `SUPER_ADMIN`/`PLATFORM_OWNER`/`PLATFORM_ADMIN` role) for the
  irreversible operations — verified `tenant-erasure.service.ts` calls
  `assertPlatformAdministrator` for both `erase()` (`:134`) and `diagnose()`
  (`:389`), on top of `assertTenantPlatformAccess`.
- **No tenant endpoint was found widened to serve platform needs** — every
  `query.tenantId`/cross-tenant filter found (Section 3) sits behind a
  platform assertion.
- **No platform endpoint was found reachable with an ordinary tenant JWT** in
  the sample traced — `authAccessService.loadAccessContext` (tenant path) vs.
  `loadPlatformAccessContext` (platform path,
  `clientId === 'admin' && payload.authSubjectType === 'platform-user'`) are
  distinct branches in `jwt-auth.guard.ts:104-107`; only the platform branch
  populates `request.user.platform`, and every platform assertion checked
  requires `user.platform?.id`.

---

## Section 8 — Background work

Found via `grep` for `setInterval`/cron-like scheduling (no `@nestjs/schedule`
`@Cron` usage in this codebase — all recurring work is hand-rolled
`setInterval` workers):

- `workforce-snapshot.worker.ts:143-167` — `prisma.tenant.findMany()` then
  `for (const tenant of tenants)`, each snapshot write scoped
  `tenantId: tenant.id`. Explicit per-tenant iteration. Safe.
- `report-scheduler.worker.ts:191-501` — `for (const schedule of due)`, every
  write is `where: { id: schedule.id, tenantId: schedule.tenantId }` or
  `tenantId: schedule.tenantId` explicitly, and includes a belt-and-suspenders
  check at `:426`: `if (context.authUser.tenantId !== schedule.tenantId)`.
  This is the most defensively written worker in the sample.
- `attendance-reconciliation-queue.service.ts:153-298` — claims due jobs,
  `for (const job of due)`, every downstream call threads `job.tenantId`
  explicitly.
- `timesheet-jobs.service.ts` — every write is `tenantId: user.tenantId`
  (this one runs per-request rather than platform-wide, `user` supplied by
  caller).
- `data-job-worker.service.ts:93-118` (`runClaimedJob`) — re-derives the
  **actual, current** access context of the job's original submitter via
  `authAccess.loadAccessContext(submittedByUserId)` before running the job
  ("Rows are written with the submitter's own permissions and scope, never an
  elevated worker identity" — comment at `:103-104`), rather than trusting a
  cached tenantId on the job row. This is the strongest pattern of the eight
  sections in this audit for the "background jobs must not run as an
  unscoped superuser" requirement.

**No background worker was found that iterates tenants without per-iteration
scoping.** Seeds were not deeply re-audited here (out of scope per the
briefing's read-only/no-seed-execution constraint) beyond confirming
`seed-config`/`seed-admin`/`seed-demo` are referenced from `package.json` and
not executed.

---

## Healthy — verified good

- **Tenant identity cannot be forged via JWT claim or client header.**
  `AuthAccessService.loadAccessContext` re-derives `tenantId` from the `User`
  row and rejects a mismatch against the JWT claim
  (`auth-access.service.ts:146-152`).
- **The Prisma `$use` middleware is confirmed inert** on the installed
  `@prisma/client@7.8.0` (no `$use` symbol in the generated client at all),
  and even if it were active it only scopes by business unit, never tenant —
  matches AGENTS.md's claim, independently re-verified against the actual
  generated client rather than trusted.
- **No raw SQL injection surface**: `$queryRawUnsafe`/`$executeRawUnsafe` are
  never used anywhere in `services/api/src`; the four `$queryRaw`/`$executeRaw`
  call sites are all parameterised tagged templates.
- **The dynamic custom-data engine (`custom-data.service.ts`) is correctly
  and consistently tenant-scoped** at every entry point via
  `tableOrThrow`/`recordOrThrow` — the highest-risk-by-design surface in the
  generic data API turns out to be the most carefully built.
- **`reporting/export/report-artifact.service.ts` explicitly documents and
  guards against the exact `findUnique`-by-URL-id cross-tenant pattern** this
  audit was looking for — a rare case of the codebase naming the vulnerability
  class in a comment and then closing it (`:388-392`).
- **`tenant-control-plane`'s platform/tenant boundary is centralized** in
  `tenant-control-plane.guard.ts` (`assertTenantPlatformAccess` /
  `assertPlatformAdministrator`) rather than ad-hoc per file, and every
  handler in `tenant-access.service.ts` and `tenant-erasure.service.ts` was
  confirmed to call it, including the two irreversible operations requiring
  the stricter platform-administrator check.
- **Three previously-found tenant-isolation bug records
  (BUG-0005, BUG-0053, BUG-0058) and one row-scope record (BUG-2624) were
  re-verified against current code, not just trusted from their `Status:
  VERIFIED` field** — all four fixes are confirmed present at this commit.
- **Background workers scope per-tenant/per-record on every iteration**; none
  found operating as an implicit cross-tenant superuser.
- **No client-supplied `tenantId` was found trusted on an authenticated
  non-platform route** — every DTO/query/param carrying a `tenantId` sits
  either pre-auth (login) or behind a platform assertion.
- **Currency (a genuinely tenant-owned model, unlike Country/State/City) is
  correctly tenant-scoped everywhere in the same `lookups` module family**
  (`configuration.controller.ts` threads `user.tenantId` through every
  currency handler) — confirms TEN-01/TEN-02 is a localized gap, not a
  module-wide pattern.

## Not examined / limits

- The mechanical scan covers `services/api/src` only — the three Next.js
  apps' `app/api/*` route handlers (stated as thin proxies per AGENTS.md) were
  not independently re-audited for accidentally-reimplemented authorization
  decisions; that is explicitly warned against in AGENTS.md
  (`web/AGENTS.md`: "never re-implement an authorization or tenant decision
  there") and is likely a different specialist's area (frontend/API-proxy).
- Of the 181 shortlisted no-tenantId hits, files with exactly one low-risk hit
  in an already well-scoped module (roughly 40 single-hit files across
  `attendance.service.ts`, `compensation.service.ts`,
  `payroll-defaults.service.ts`, `payroll-operations.service.ts`,
  `auth.service.ts`, `legal/consent.service.ts`,
  `partner-experience.service.ts`, `outbox-dispatcher/data-job-worker`
  helpers, etc.) were spot-checked but not all individually traced line by
  line; given the overwhelming consistency of the pattern in the ~140 hits
  that *were* fully traced, I assess these as very likely also safe (c)/(d),
  but this is LIKELY rather than CONFIRMED for that residual set.
  `legal/consent.service.ts` specifically has no controller currently wired
  to it (only `leads.service.ts` calls it internally) — NOT OBSERVED as
  currently HTTP-reachable, so not written up despite lacking a tenant
  concept in its `subjectWhere` helper.
- Did not search for a `tenantId`-equivalent value smuggled under a
  differently-named field (e.g. `orgId`, `accountId`, `workspaceId`) — only
  the literal string `tenantId` was grepped in Section 3.
- Did not execute anything — no live requests, no database queries, no build,
  per the briefing's read-only constraint. All findings are static-trace
  CONFIRMED (full path read) or explicitly marked LIKELY/NOT OBSERVED.
- Seed scripts (`seed-config`, `seed-admin`, `seed-demo`,
  `seed-platform-workflows`) were not read in depth for tenant-argument
  threading beyond confirming they exist as separate, explicit scripts (not
  run here).
- `apps/agent-desktop` (Electron) and `gateway/` (.NET) were not examined —
  out of this specialist's file set (`services/api/src`) and likely belong to
  a dedicated integrations/gateway specialist.
- The elevated-tenant-role mechanism (`hasElevatedTenantRole`,
  `common/security/elevated-tenant-roles.ts`) was checked only far enough to
  confirm it grants **tenant-wide**, not **cross-tenant**, access (every
  query it affects still carries `tenantId`) — its correctness as an RBAC/
  row-scope mechanism (as opposed to a tenant-boundary mechanism) is an AuthZ
  concern, not a TEN one; flagging for the AuthZ specialist rather than
  writing it up here.
