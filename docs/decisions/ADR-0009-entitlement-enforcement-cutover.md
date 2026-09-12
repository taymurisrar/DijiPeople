# ADR-0009 — Entitlement enforcement moves from REPORT_ONLY to ENFORCE, via grandfathering

## Status

Accepted

Date: 2026-09-12

An accepted ADR is **not rewritten** when the decision changes. Write a new
ADR that supersedes it and update this one's status. **This is explicitly the
kind of decision that gets re-litigated** — BUG-3350 says so in as many
words — so expect a future ADR to revisit it as the tenant base grows.

## Context

`TenantEntitlementService` and `EntitlementGuard` (BUG-1952) resolve plan
entitlement correctly for every gated module, but the enforcement mode has
defaulted to `REPORT_ONLY` since it shipped —
`services/api/src/common/security/tenant-entitlement.service.ts:9-23` — so the
guard has only ever logged `ENTITLEMENT_WOULD_REFUSE`, never actually refused
a request.

Meanwhile the tenant Plans screen's feature comparison tells a Starter tenant
that Payroll, Timesheets, Projects, Recruitment and Onboarding are "Available
in higher plan" — a binding commercial claim the platform was not enforcing
(BUG-3350). Verified against the live `dijipeople-demo` tenant (Starter /
Active): `/payroll/cycles` and `/recruitment/jobs` both render with live data,
no 403, no upgrade prompt.

**What is actually gated today.** Seven feature keys carry a real route guard
(`EntitlementGuard` + `@RequireEntitlement`) —
`common/constants/tenant-features.ts`'s `ENTITLEMENT_GATED_MODULES`:
`attendance`, `leave`, `onboarding`, `payroll`, `projects`, `recruitment`,
`timesheets`. Four more feature keys the comparison table also markets as
plan-gated — `desktop-agent`, `compliance`, `data-management`,
`attendance-integrations` — carry **no route guard at all**; they are
documented in `ENTITLEMENT_UNGATED_FEATURE_KEYS` as "enforced where settings
resolve," and a repository-wide search for their would-be enforcement point
(`assertFeatureEnabled`/`isFeatureEnabled` outside `feature-access.service.ts`
itself) returns zero call sites. **This ADR's cutover does not make the
comparison table true for those four.** That gap is real and is called out
below as a residual finding, not fixed here.

**What Starter actually grants**, from `services/api/src/modules/super-admin/plans.catalog.ts`:
`employees`, `organization`, `leave`, `attendance`, `documents`,
`notifications`, `branding`. It excludes every one of the seven gated keys
except `leave` and `attendance` — so flipping enforcement to `ENFORCE` can only
ever change behaviour for a Starter tenant on `onboarding`, `payroll`,
`projects`, `recruitment` and `timesheets`. Growth adds all of those except
`payroll`, so a Growth tenant's only exposure is `payroll`. Enterprise and
Enterprise+ include every catalog key and are never affected.

**Tenant impact — measured from code and seed data, not from a live database.**
No live-tenant query was run against production; the record explicitly asked
for a measurement from the code and seed data, not a database sweep. What that
analysis establishes:

- Exactly one tenant is confirmed by evidence already in BUG-3350 to be using
  a module outside its plan today: `dijipeople-demo` (Starter / Active), using
  Payroll and Recruitment live.
- Structurally, any tenant is *at risk* of the same gap if it is Starter and
  has ever created a payroll cycle, timesheet, project, job opening or
  onboarding case, or is Growth and has ever created a payroll cycle — because
  `REPORT_ONLY` has never refused any of that since the guard shipped.
- The exact count of affected tenants requires a database query this ADR
  deliberately does not run against production. `prisma/grandfather-entitlement-overrides.ts`
  (below) **is** that query, in dry-run form: run it, unapplied, against the
  target database and its report is the tenant-impact count for that
  database, per module. It must be run before enforcement is switched on that
  database, not merely to produce the count.

## Decision

1. **Grandfather, then enforce** (route 2 of BUG-3350's Proposed Resolution).
   `prisma/grandfather-entitlement-overrides.ts` finds every tenant with a live
   subscription that is using a gated module its plan excludes (a live
   subscription plus at least one row of that module's data for the tenant),
   and writes a `TenantFeature` override for exactly that (tenant, module)
   pair. Idempotent, dry-run by default, applies only with `--apply`.

2. That override carries `source: CUSTOM`, a `TenantFeatureSource` enum value
   that existed in the schema unused. `resolveTenantFeatureState()`
   (`common/security/tenant-entitlement.rule.ts`) now treats a `CUSTOM`
   override as authoritative in both directions; every other override source
   (`MANUAL`, written by `TenantModulesService.update()`, the ordinary
   settings-admin path) is unchanged — it still cannot grant what the plan
   does not sell. This is a narrow, additive exception, not a relaxation of
   the general rule.

3. `TenantEntitlementService.load()` now iterates the full tenant-feature
   catalog (`TENANT_FEATURE_KEY_LIST`) rather than only the plan's own
   `PlanFeature` rows. This was a precondition for (2), not a separate
   decision: `commercial-bootstrap.ts`'s `reconcilePlanFeatures` never writes
   a disabled `PlanFeature` row for a feature a plan excludes, so Starter has
   no `payroll` row at all — the old loop would never have visited `payroll`
   for a Starter tenant regardless of any override. Confirmed
   behaviour-preserving for every existing `MANUAL`/no-override case: see
   `tenant-entitlement.service.spec.ts`.

4. Enforcement mode is a **platform setting**, not a code constant.
   `prisma/set-entitlement-enforcement.ts` writes the `entitlementEnforcement`
   field of the `module-settings` `PlatformSetting` row directly — the same
   row `TenantEntitlementService.mode()` already reads with a 60-second TTL.
   `DEFAULT_ENTITLEMENT_ENFORCEMENT_MODE` in code **stays `REPORT_ONLY`** —
   that is the fail-safe read when the setting cannot be read at all, and
   changing it would remove the safety net rather than express the decision.
   `prisma/seed-config.ts`'s shipped `module-settings` defaults are **not**
   changed either, and deliberately so — see Migration / Compatibility Impact.

5. **This lands on `develop` only and must NOT be deployed to production as
   part of this change.** Neither script runs automatically; both require an
   explicit invocation naming a database. No CI job, seed step or release
   script calls either of them.

## Reasons

- REPORT_ONLY has done its job: the log line it was built to produce
  (`ENTITLEMENT_WOULD_REFUSE`) is exactly what makes the grandfather script
  possible to write with confidence — the shape of the risk was already
  observable before this ADR.
- Route 2 (grandfather, then enforce) is what the record itself recommends,
  and it is the only route of the three that makes the comparison table true
  *and* protects an existing tenant from an accidental cutoff. Route 1
  (enforce with no grandfathering) trades tenant trust for speed; Route 3
  (soften the copy) leaves the underlying gap in place.
- A platform-setting toggle, not a constant, is what "reversible without a
  code change" requires literally: an operator can run
  `set-entitlement-enforcement.ts REPORT_ONLY` and have every request stop
  refusing within the 60-second cache TTL, no deploy involved.
- `CUSTOM` over a new schema migration: the enum value already existed,
  unused, so no `schema.prisma` change was needed for this ADR at all — see
  Migration / Compatibility Impact.

## Alternatives Considered

**Route 1 — enforce immediately, no grandfathering.**
Rejected: this is exactly what `REPORT_ONLY` was built to prevent doing by
accident (`tenant-entitlement.service.ts`'s own comment on
`DEFAULT_ENTITLEMENT_ENFORCEMENT_MODE`), and BUG-3350 asks for the
tenant-impact count *before* acting for that reason.

**Route 3 — soften the Plans screen copy instead of enforcing.**
Rejected as the only action, though cheap and real: it stops the screen
overselling, but it also leaves every module a tenant is not paying for
reachable by typing the route, forever. Recorded as a candidate follow-up
below, not a replacement.

**Change `DEFAULT_ENTITLEMENT_ENFORCEMENT_MODE` to `'ENFORCE'` in code.**
Rejected: requirement (b) is explicit that this must be reversible without a
code change, and a code constant is the opposite of that. It would also mean
the fail-safe on a read failure becomes `ENFORCE`, which is the wrong
direction to fail in — `REPORT_ONLY` is deliberately the safe answer on both a
misconfigured value and a read fault.

**Add `entitlementEnforcement: 'ENFORCE'` to `prisma/seed-config.ts`'s shipped
`module-settings` defaults.**
Rejected: `seed:config` runs on every `release:api`, and its merge logic only
preserves a key the target database already has — a brand-new field in the
shipped default becomes live the next time *anyone* deploys, on every
environment that has never set it explicitly. That is a deploy-triggered
commercial change with no review step, which is the opposite of "deliberate."

**A schema migration adding a dedicated `TenantFeatureSource.GRANDFATHERED`
value instead of reusing `CUSTOM`.**
Rejected for this change: `CUSTOM` already existed, unused anywhere in code,
and its plain-English meaning ("stands on its own, not derived from the
catalog") fits. Introducing a new enum value is a schema migration this ADR
does not need. If a future ADR wants a more specific label for reporting, that
is a naming migration, not a behavioural one.

## Consequences

**Positive**

- The Plans screen's comparison table becomes true for five of the seven
  enforced modules, for every tenant on Starter or Growth, without an
  in-flight tenant losing access to a module it was already using.
- The enforcement/override rule stays in exactly one place
  (`tenant-entitlement.rule.ts`), read by both the guard and the
  platform-admin module screen — `feature-access.service.ts` and
  `tenant-modules.service.ts` were updated in the same change so the two
  cannot disagree about a `CUSTOM` grant.
- Reversible in under a minute, on one environment, with no deploy.

**Negative / costs**

- Does **not** make the comparison table true for Desktop Agent, Compliance,
  Data Management or Attendance Hardware — those have no route guard at all.
  A tenant can still reach them by typing the route regardless of this ADR.
  This is the most important open gap this ADR creates visibility into but
  does not close.
- The grandfather script's "usage" probe checks one representative table per
  module (a payroll cycle, a timesheet, a project, a job opening, an
  onboarding case). A tenant that used a module only through a table the probe
  does not check would not be grandfathered and could see a surprise refusal.
  Re-running the script's dry-run report after any near-term complaint is the
  mitigation, not a promise the probe is exhaustive.
- `ENABLED_BY_CUSTOM_GRANT` is a new value in `TenantModuleState`
  (`tenant-control-plane/tenant-modules.service.ts`). `apps/admin`'s module
  screen (out of this change's scope) will render it as an unrecognised state
  until it adds a label for it — cosmetic, not a security gap, since
  enforcement reads the resolved boolean, not this label.

**Neutral**

- `TenantEntitlementService.load()` now does one extra map lookup per catalog
  key per request (14 keys, cached for 60 seconds per tenant) rather than
  iterating only the plan's own rows. Immaterial cost.

## Migration / Compatibility Impact

- **No `schema.prisma` change.** `TenantFeatureSource.CUSTOM` already existed
  and was unused; this ADR is the first thing to write it.
- **No migration to run.** The grandfather script and the mode-setter both
  operate on existing tables (`TenantFeature`, `PlatformSetting`).
- **`prisma/seed-config.ts` is unchanged.** A fresh environment still seeds
  `module-settings` without `entitlementEnforcement`, which
  `parseEnforcementMode()` reads as the code default, `REPORT_ONLY`. Nothing
  about a normal deploy or a normal `seed:config` run changes as a result of
  this ADR.
- **Rollout is per-environment, by hand:**
  1. `npm run entitlement:grandfather` (dry run) against the target database;
     read the report.
  2. `npm run entitlement:grandfather -- --apply` against the same database.
  3. `npm run entitlement:set-mode -- ENFORCE` against the same database.
  4. Roll back at any time with `npm run entitlement:set-mode -- REPORT_ONLY`
     against the same database — the grandfather rows are harmless to leave in
     place under `REPORT_ONLY` or `OFF`.
- **This ADR authorizes running these on `develop`'s database only, as part
  of the change that introduced them.** Running either script against a
  staging or production database is a separate, later decision the platform
  owner makes explicitly — this ADR is not blanket authorization for that.

## Security / Tenant Impact

- Tightens, not loosens, tenant isolation for the five modules it actually
  enforces: a Starter or Growth tenant that has never used Payroll (etc.)
  gains no new exposure, and one that has is grandfathered rather than
  silently continuing to bypass a boundary the UI already claims exists.
- The `CUSTOM` override path is written only by a script an operator runs
  directly against a chosen database with an explicit `--apply` flag — no new
  HTTP endpoint, no new client-writable field. `TenantModulesService.update()`
  (the one write path reachable over the API) is unchanged and still refuses
  a `MANUAL` grant beyond the plan.
- Every query in both new scripts is scoped by `tenantId` read from the
  `Subscription`/`Tenant` rows themselves, never from client input — there is
  no client input, since these are operator-run CLI scripts.
- `TenantEntitlementService.decide()`'s `NO_LIVE_SUBSCRIPTION` carve-out is
  untouched: a lapsed subscription still resolves to nothing entitled without
  the guard refusing outright, for the same dunning-is-a-separate-decision
  reason as before.

## Agent Rules

1. Do not run `prisma/set-entitlement-enforcement.ts` or
   `prisma/grandfather-entitlement-overrides.ts` with `--apply` against any
   database other than one you were explicitly told to target. Neither script
   is wired into `seed:all`, `release:api` or any CI job, and that is
   deliberate — do not add either to those paths without a new ADR.
2. Do not change `DEFAULT_ENTITLEMENT_ENFORCEMENT_MODE` in
   `tenant-entitlement.service.ts`. The enforcement posture is a platform
   setting; a code constant change here is exactly the mistake this ADR
   avoided.
3. Do not add `entitlementEnforcement` to `prisma/seed-config.ts`'s
   `module-settings` defaults. That field's absence there is deliberate — see
   Alternatives Considered.
4. If you add a new entitlement-gated route (a new `@RequireEntitlement`), add
   its feature key to `USAGE_PROBES` in
   `prisma/grandfather-entitlement-overrides.ts` if the module has data worth
   probing for prior usage, or note in that file why it does not.
5. A write to `TenantFeature` with `source: CUSTOM` must only ever come from
   the grandfather script or a documented equivalent — never from
   `TenantModulesService` or any other request-reachable path. If a future
   change needs a request-reachable "grant beyond plan," that is a new
   decision and a new ADR, not an extension of this one.
6. Before proposing to gate `desktop-agent`, `compliance`, `data-management`
   or `attendance-integrations` with a real route guard, read
   `ENTITLEMENT_UNGATED_FEATURE_KEYS` and `ENTITLEMENT_UNGATED_MODULES` in
   `common/constants/tenant-features.ts` first — each carries a specific,
   already-considered reason it is not gated (a deployed gateway, an
   in-the-field desktop agent build, a cross-cutting audit read). Closing the
   comparison-table gap for those four is a real follow-up, not a trivial one.

## Related Modules

`services/api/src/common/security/tenant-entitlement.service.ts`,
`tenant-entitlement.rule.ts`, `common/guards/entitlement.guard.ts`,
`common/constants/tenant-features.ts`,
`modules/tenant-settings/feature-access.service.ts`,
`modules/tenant-control-plane/tenant-modules.service.ts`,
`prisma/set-entitlement-enforcement.ts`,
`prisma/grandfather-entitlement-overrides.ts`.

## Related Features

BUG-1952 (original entitlement-guard build, REPORT_ONLY default). BUG-3350
(this cutover). BUG-3332/BUG-3333/BUG-3334 (the same Plans-screen review this
was found alongside).
