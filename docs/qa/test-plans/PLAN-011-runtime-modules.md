---
PLAN_ID: PLAN-011
aliases: [PLAN-011]
TITLE: Runtime Module System
AREA: runtime-modules
STATUS: CURRENT
MODULES: [services/api/src/modules/data, services/api/src/modules/customization, apps/web/lib/runtime, apps/admin/lib/runtime]
RISK: HIGH
COVERAGE_UNIT: GOOD
COVERAGE_API: GAP
COVERAGE_DATABASE: GAP
COVERAGE_INTEGRATION: GAP
COVERAGE_E2E: GAP
COVERAGE_BROWSER: GAP
COVERAGE_SECURITY: PARTIAL
COVERAGE_PERFORMANCE: NOT_APPLICABLE
RELATED_BUGS: [BUG-0019, BUG-0020, BUG-0044]
RELATED_REGRESSIONS: [REG-028, REG-029]
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
VERIFIED_AGAINST_SHA: 714632d
---

# PLAN-011 — Runtime Module System

## Scope

The metadata-driven module runtime: module and metadata registries, command catalog, view definitions, the generic entity data API, and the scope resolution that decides which rows a runtime query may return.

## Risks

- A declared module with no reachable route (`BUG-0019`, `REG-028`) — the
  `unreachable-surface` pattern.
- Entity scope resolution failing open, which in the generic data API means every
  row of a model.
- A query parser accepting a filter shape it cannot safely translate.
- Governed input collected through a native browser prompt rather than the design
  system (`BUG-0020`, `REG-029`).
- Documentation describing a module-creation workflow that cannot be followed
  (`BUG-0044`).

## Preconditions

A tenant with at least one runtime-declared module and a custom entity.

## Test Types

`UNIT` covers the registries and resolvers. `BROWSER_E2E` is where this area most needs coverage and has none.

## Data Requirements

One runtime module with a view, a command, and rows visible at different access levels.

## Security Cases

The generic data API has no automatic tenant filter — `entity-scope.resolver.ts` resolves scope explicitly, so its unit coverage is load-bearing.

## Negative Cases

Query a model the role cannot read · filter on a field that is not exposed · invoke a command whose permission is absent · request a view that does not exist.

## State Transitions

Module declaration → registration → route → render. A break anywhere leaves a declared module nobody can open.

## Integration Cases

The generated `platform-runtime-schema.generated.json` is consumed by the frontends; regenerate rather than hand-merge.

## Browser Cases

Every runtime module's route rendering its module is the single highest-value browser case here, and `scripts/admin-runtime-smoke.mjs` is the closest available substitute.

## Regression Links

`REG-028` · `REG-029`
