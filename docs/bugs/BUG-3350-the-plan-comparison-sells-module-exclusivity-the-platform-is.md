---
ID: BUG-3350
aliases: [BUG-3350]
Title: The plan comparison sells module exclusivity the platform is configured only to report on
Status: FIXED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-09-11
DetectedInSha: caad4a56
AffectedModules: [apps/web, services/api/src/common/security]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport:
RegressionId: REG-424
RelatedBacklogItem:
RelatedDecision: ADR-0009
RelatedImplementation:
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-12
ResolvedAt: 2026-09-12
---

# BUG-3350 — The plan comparison sells module exclusivity the platform is configured only to report on

> **Architect triage, 2026-09-11 — `PRODUCT_DECISION`.** The engineering is not
> in question: the guard exists, is wired to the right controllers, and is inert
> on purpose. What has to be decided is when it stops being inert, and what the
> screen is allowed to claim until then.

## Summary

The feature comparison on `/settings/subscription/plans` tells a Starter tenant
that Payroll, Timesheets, Projects, Recruitment, Onboarding, Desktop Agent,
Compliance & Retention and Import & Export are "Available in higher plan", and
prices the upgrade beside it. Verified against the live `dijipeople-demo` tenant,
which is on Starter / Active: **those modules work today, in full, on the plan
that says they do not.**

This is not a missing guard. `EntitlementGuard` and `@RequireEntitlement` are
applied across payroll, timesheets, projects, recruitment, onboarding,
compensation, leave, attendance, payslips, pay-components, tax-rules and
time-payroll. `TenantEntitlementService` resolves the decision correctly. It then
does nothing with it, because the enforcement mode defaults to `REPORT_ONLY` and
the cutover is a platform setting somebody has to change deliberately.

That design is sound and its reasoning is recorded in the source. The defect is
the seam: a purchase screen is making a binding commercial claim about a boundary
the platform is currently only logging about.

## Expected Behavior

Either the boundary is enforced, so the comparison table is true, or the screen
does not present unenforced boundaries as plan limits. A customer is never asked
to pay for something they already have.

## Actual Behavior

On a Starter tenant, with the comparison table on screen saying otherwise:

| Route | Comparison table says | What actually happens |
|---|---|---|
| `/payroll/cycles` | Payroll — Available in higher plan | Renders "Payroll Cycles" with live data |
| `/recruitment/jobs` | Recruitment — Available in higher plan | Renders "Jobs" with a working New action |

Neither route returns 403, and neither shows an upgrade prompt. The main
navigation does not list them, so the modules are hidden rather than withheld —
typing the path is enough.

## Reproduction

1. Sign in to `dijipeople-demo` (Starter / Active / Monthly).
2. Open `/settings/subscription/plans` and read the Payroll & Finance and Talent
   groups. Both say "Available in higher plan" for Starter.
3. Navigate directly to `/payroll/cycles`. The screen renders with data.
4. Navigate directly to `/recruitment/jobs`. The screen renders with a New
   action.

Verified on 2026-09-11.

## Evidence

The guard is present and correctly targeted —
`services/api/src/modules/payroll/payroll.controller.ts:38-39`:

```ts
@UseGuards(JwtAuthGuard, PermissionsGuard, EntitlementGuard)
@RequireEntitlement(TENANT_FEATURE_KEYS.PAYROLL)
```

It is inert by design —
`services/api/src/common/security/tenant-entitlement.service.ts:9-23`:

```ts
/**
 * How hard the platform enforces plan entitlements.
 *
 * This is the whole rollout story for BUG-1952. Enforcement cuts off every
 * tenant already using a module it never bought, so the code ships complete and
 * inert: the default is REPORT_ONLY, the refusals are logged, and the cutover is
 * a platform setting the owner changes deliberately.
 */
export const DEFAULT_ENTITLEMENT_ENFORCEMENT_MODE: EntitlementEnforcementMode =
  'REPORT_ONLY';
```

The mode lives in the `PlatformSetting` row `module-settings`, field
`entitlementEnforcement`. **The live value was not read during this review** —
that needs platform-admin or database access this review did not take. The
behaviour observed above is consistent with `REPORT_ONLY`, and `REPORT_ONLY` is
the default, but the live setting should be confirmed before acting.

The claim the screen makes is built from the plan's own feature rows, so it is
accurate about what was *sold* and silent about what is *enforced* —
`billing-settings-client.tsx:676-687`.

## Root Cause

Two correct decisions that were never reconciled. Enforcement was deliberately
staged so it would not cut off existing tenants. The plan comparison was built to
describe what each plan includes. Nobody connected the two, so the screen
advertises a distinction the runtime is not yet making.

## Impact

Reachable in production, and it cuts both ways.

- **Revenue.** Tenants are using modules they did not buy. Every Starter tenant
  with a motivated administrator has the full product.
- **Trust.** A tenant who upgrades to get Payroll and discovers they already had
  it has been sold something they owned. That is worse than the leak.

It also undermines [[BUG-3332]] and [[BUG-3333]] from a different angle: there is
little point fixing what the cards advertise while the advertisement is not
binding.

## Affected Areas

- `/settings/subscription/plans` — the comparison table
- `TenantEntitlementService`, `EntitlementGuard`
- Every controller carrying `@RequireEntitlement`
- The `module-settings` platform setting

## Proposed Resolution

The decision is the owner's, and it is genuinely a decision rather than a
default. Three routes:

1. **Switch enforcement to `ENFORCE`.** Makes the table true. Cuts off every
   tenant currently using an unbought module, which is exactly what the staged
   rollout was built to avoid doing by accident. Needs a tenant-impact count
   first: how many live tenants are using modules outside their plan.
2. **Grandfather, then enforce.** Write a tenant override for each module a
   tenant is actively using, then switch to `ENFORCE`. Nobody loses access, and
   new boundaries hold from that day. The override mechanism already exists in
   `TenantModulesService`.
3. **Soften the screen until enforcement lands.** Change "Available in higher
   plan" to wording that describes what the plan includes rather than what it
   withholds. Cheapest, and it stops the screen making a claim the platform
   cannot back.

Route 2 is the recommendation. Whichever is chosen, record it as an ADR — this is
the kind of decision that gets re-litigated.

## Acceptance Criteria

- For any tenant, a module the comparison table marks "Available in higher plan"
  is not reachable by typing its route, or the table no longer says so.
- The chosen enforcement posture is recorded as a decision, not left as a
  default.

## Regression Coverage

Needs a REG entry once a route is chosen: for a tenant on a plan excluding
Payroll, `GET /payroll/cycles` returns 403 under `ENFORCE`. Worth writing the
test now against an `ENFORCE` fixture, so it is ready before the cutover rather
than after.

## Dependencies

None technically. Blocks nothing, but makes [[BUG-3332]] and [[BUG-3333]] less
valuable until it is answered.

## Related Items

[[BUG-3330]], [[BUG-3331]], [[BUG-3332]], [[BUG-3333]], [[BUG-3334]],
[[BUG-3335]], [[BUG-3336]], [[BUG-3345]]

## Resolution

Decided and implemented: route 2, grandfather then enforce. Recorded in full
as ADR-0009 — read that for the reasoning, alternatives and agent rules;
this section summarises what landed in code.

- **Impact measurement (a).** No live-database query was run against
  production — the record and this task both asked for a measurement from
  code and seed data, not a production sweep. Structurally: Starter excludes
  five of the seven route-guarded feature keys (`onboarding`, `payroll`,
  `projects`, `recruitment`, `timesheets`); Growth excludes one (`payroll`);
  Enterprise/Enterprise+ exclude none. `dijipeople-demo` (Starter/Active) is
  the one tenant this record's own evidence already confirms is using
  `payroll` and `recruitment` beyond its plan.
  `prisma/grandfather-entitlement-overrides.ts` run in dry-run mode against
  any target database **is** the tenant-impact count for that database — it
  was not run against any real database as part of this change.
- **Reversible platform setting, not a constant (b).**
  `prisma/set-entitlement-enforcement.ts` writes the `entitlementEnforcement`
  field of the `module-settings` `PlatformSetting` row directly.
  `DEFAULT_ENTITLEMENT_ENFORCEMENT_MODE` in code is untouched (`REPORT_ONLY`),
  and `prisma/seed-config.ts`'s shipped defaults are untouched too — see the
  ADR's Alternatives Considered for why seeding the field would have silently
  flipped production on the next unrelated deploy.
- **Grandfathering (c).** `prisma/grandfather-entitlement-overrides.ts` — idempotent,
  dry-run by default, requires `--apply` to write. It writes a `TenantFeature`
  row with `source: CUSTOM` for each (tenant, module) pair where the tenant's
  plan excludes the module but the tenant has at least one row of that
  module's data. `resolveTenantFeatureState()`
  (`common/security/tenant-entitlement.rule.ts`) now treats only a `CUSTOM`
  override as able to grant beyond the plan; `TenantModulesService.update()`
  (the ordinary settings-admin path, `source: MANUAL`) is unchanged and still
  refuses to. `TenantEntitlementService.load()` was also changed to iterate
  the full feature catalog rather than only the plan's own `PlanFeature` rows
  — a precondition for the grant to be visible at all, since a plan that
  excludes a feature has no row for it (`commercial-bootstrap.ts`), not a
  disabled one. Not executed against any database.
- **Starter's actual grants (d).** `employees`, `organization`, `leave`,
  `attendance`, `documents`, `notifications`, `branding` — read from
  `services/api/src/modules/super-admin/plans.catalog.ts`. Everything else in
  the catalog, Starter excludes.
- **ADR (e).** ADR-0009, `docs/decisions/ADR-0009-entitlement-enforcement-cutover.md`.
- **Not deployed (f).** Neither script is wired into `seed:all`, `release:api`
  or any CI job. This change lands on `develop` only; actually switching a
  database to `ENFORCE` is a separate, later, explicit operational step the
  ADR's Agent Rules restrict to a database an operator names directly.

**Residual gap, deliberately outside this change's scope and called out in the ADR**: `desktop-agent`,
`compliance`, `data-management` and `attendance-integrations` carry no route
guard at all (`ENTITLEMENT_UNGATED_FEATURE_KEYS`), each for a specific,
already-considered reason. This cutover does not make the comparison table's
claims about those four true. Worth its own backlog item if the owner wants
the table fully honest rather than five-sevenths honest.

Specs: `common/security/tenant-entitlement.service.spec.ts` (CUSTOM grants,
MANUAL still capped, catalog-wide iteration is behaviour-preserving for the
no-override case), `common/guards/entitlement.guard.spec.ts` (end-to-end
through the real service: ENFORCE denies with no override, allows with a
CUSTOM override, a MANUAL override does not substitute), and
`tenant-control-plane/tenant-modules.service.spec.ts` (the admin screen labels
a CUSTOM grant distinctly from a stale `BLOCKED_BY_PLAN` override).

## QA Retest

Pending — needs a QA pass on a database where
`entitlement:grandfather -- --apply` and `entitlement:set-mode -- ENFORCE`
have actually been run, confirming a grandfathered tenant keeps access and a
non-grandfathered one on the same plan is refused.

## History

- 2026-09-11 — found while reviewing the tenant Plans screen; verified against
  the live demo tenant at `caad4a56`.
- 2026-09-11 — Architect triage: `PRODUCT_DECISION`.
- 2026-09-12 — Owner decided route 2 (grandfather, then enforce). Implemented:
  `CUSTOM`-sourced grandfather overrides, catalog-wide entitlement resolution,
  a platform-setting enforcement toggle, and ADR-0009. Not applied to any
  database as part of this change.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]
- Regression — REG-424 (see the regression register)

<!-- GRAPH:END -->
