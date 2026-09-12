---
PLAN_ID: PLAN-039
aliases: [PLAN-039]
TITLE: Entitlement enforcement: plan-to-module gating and the ENFORCE cutover
AREA: entitlement-enforcement
STATUS: CURRENT
MODULES: [services/api/src/common/security, services/api/src/common/guards]
RISK: CRITICAL
COVERAGE_UNIT: GOOD
COVERAGE_API: GAP
COVERAGE_DATABASE: GAP
COVERAGE_INTEGRATION: GAP
COVERAGE_E2E: GAP
COVERAGE_BROWSER: GAP
COVERAGE_SECURITY: GAP
COVERAGE_PERFORMANCE: GAP
RELATED_BUGS: [BUG-1952, BUG-3350]
RELATED_REGRESSIONS: [REG-424]
CREATED_AT: 2026-09-12
UPDATED_AT: 2026-09-12
VERIFIED_AGAINST_SHA: 7e4d6cd1
---

# PLAN-039 — Entitlement enforcement: plan-to-module gating and the ENFORCE cutover

## Scope

Whether a tenant may reach a module its plan does not sell:
`TenantEntitlementService`, `EntitlementGuard`, `@RequireEntitlement`, the
shared resolution rule in `tenant-entitlement.rule.ts`, and the two consumers
that must never disagree about it — the request-path guard and
`FeatureAccessService`/`TenantModulesService` (the platform-admin module
screen). Covers the enforcement-mode platform setting
(`OFF`/`REPORT_ONLY`/`ENFORCE`) and the `TenantFeature` override mechanism,
including the BUG-3350 `CUSTOM`-sourced grandfathering exception.

**Deliberately excludes**: the tenant Plans screen's feature comparison
(`apps/web`) and whether its copy accurately describes enforcement — that is
a UI/copy concern tracked against BUG-3350 separately. Also excludes the
`ATTENDANCE_INTEGRATIONS`/`DESKTOP_AGENT`/`COMPLIANCE`/`DATA_MANAGEMENT`/`BRANDING`
feature keys, which carry no route guard at all by design
(`ENTITLEMENT_UNGATED_FEATURE_KEYS` in `common/constants/tenant-features.ts`)
— there is no enforcement behaviour here to test.

## Risks

1. **Enforcement flips on without grandfathering** (BUG-3350) — cuts off a
   tenant already using a module its plan does not sell, with no warning.
2. **An override can grant beyond the plan through the wrong door** — the
   settings-admin write path (`TenantModulesService.update()`, `source:
   MANUAL`) must never be able to do what only the grandfather script's
   `CUSTOM` override may.
3. **A feature key present in the full catalogue but absent from a plan's own
   `PlanFeature` rows is silently unreachable by any override** — REG-424,
   the precondition that would have defeated grandfathering entirely.
4. **The elevated-tenant-role bypass reaching this guard** — `PermissionsGuard`'s
   `hasElevatedTenantRole` short-circuit must have no effect on entitlement;
   a tenant administrator cannot sell their own tenant a module (BUG-1952).
5. **The admin screen and the guard disagreeing about one tenant's effective
   state** — same rule, two consumers (`tenant-entitlement.rule.ts`'s whole
   reason for existing as a shared module).
6. **A cold cache on a database fault answering `403` instead of `503`** —
   `TENANT_FEATURE_NOT_ENTITLED` vs `TENANT_ENTITLEMENT_UNAVAILABLE` is the
   difference between "you did not buy this" and "we could not check", and
   only one is the customer's problem.

## Preconditions

At least two plans with different feature sets (Starter excluding several
gated keys is the real seeded shape — see `plans.catalog.ts`). A tenant with
a live (`ACTIVE`/`TRIALING`) subscription on the narrower plan. The
`module-settings` `PlatformSetting` row, settable to each enforcement mode via
`prisma/set-entitlement-enforcement.ts` (never against production without an
explicit, separate decision — see ADR-0009).

## Test Types

- **UNIT** — the primary surface: `tenant-entitlement.rule.ts`,
  `tenant-entitlement.service.spec.ts`, `entitlement.guard.spec.ts`,
  `tenant-modules.service.spec.ts`, `feature-access.service.ts` (no spec file
  yet — gap).
- **API** — not yet automated; a real route carrying `@RequireEntitlement`
  under each enforcement mode, gap.
- **INTEGRATION** — the grandfather script against a real database, gap
  (explicitly not run against any database as part of ADR-0009's landing).
- **E2E / BROWSER** — not applicable; no UI surface in scope.
- **SECURITY** — covered: elevated-role bypass, cross-tenant isolation (the
  guard reads `tenantId` only from the authenticated subject).

## Data Requirements

A `Subscription` row per test tenant with `status` varied across
`ACTIVE`/`TRIALING`/`CANCELLED`/none. A `PlanFeature` set that includes at
least one key with **no row at all** for the plan under test (not a disabled
row) — the exact shape that made REG-424 possible. `TenantFeature` override
rows varied across `source: MANUAL` and `source: CUSTOM`. No credential
fixtures.

## Security Cases

- Elevated tenant role still refused when not entitled (`entitlement.guard.spec.ts`,
  driven off the real `ELEVATED_TENANT_ROLE_KEYS` list).
- Platform user exempt without any entitlement lookup running at all.
- Unauthenticated request left to `JwtAuthGuard` (this guard is a no-op with
  no `request.user`).
- A `MANUAL` override can restrict but never grant beyond the plan; only
  `CUSTOM` may grant, and only the grandfather script writes `CUSTOM`.

## Negative Cases

- `mode()` reading a malformed or unrecognised `PlatformSetting` value falls
  back to `REPORT_ONLY`, never to `ENFORCE` (a typo must not silently start
  refusing) and never silently to `OFF` (it must not silently stop logging).
- A lookup fault with a warm cache serves the last snapshot, `stale: true`.
- A lookup fault with a cold cache answers `UNRESOLVABLE`/503, not a 403.
- A lapsed subscription (`NO_LIVE_SUBSCRIPTION`) is allowed through, not
  refused — dunning is a separate decision.

## State Transitions

`OFF` → `REPORT_ONLY` → `ENFORCE` and back, each transition taking effect for
a given tenant within `ENTITLEMENT_CACHE_TTL_MS` (60s) of the platform
setting changing, or immediately after `TenantEntitlementService.invalidate(tenantId)`
(called by `TenantModulesService.update()` after an override write). A
`CUSTOM` grant, once written, must survive a plan change that still excludes
the key (it keeps granting) and must be revisited if the plan is upgraded to
include the key outright (redundant but harmless — `isIncludedInPlan &&
tenantOverride` or the CUSTOM-authoritative branch both resolve to enabled).

## Integration Cases

`prisma/grandfather-entitlement-overrides.ts` against a real database:
idempotent re-run writes nothing new; a tenant with a pre-existing `MANUAL`
override on the same key is skipped and reported, never overwritten.
`prisma/set-entitlement-enforcement.ts` is idempotent and reports the
before/after mode.

## Browser Cases

None — no UI surface is in this plan's scope (see Scope).

## Regression Links

REG-424 — an entitlement override could never grant a feature key missing
from the plan's own rows — QA-BILLING-036.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-qa.mjs; edit the frontmatter, not this block -->

## Related

- Scenarios — [[QA-BILLING-036]]
- Bugs — [[BUG-1952]], [[BUG-3350]]
- Regressions — REG-424 (see the regression register)

<!-- GRAPH:END -->
