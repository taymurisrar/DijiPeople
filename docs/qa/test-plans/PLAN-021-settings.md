---
PLAN_ID: PLAN-021
aliases: [PLAN-021]
TITLE: Settings, preferences and enterprise configuration
AREA: settings
STATUS: CURRENT
MODULES: [services/api/src/modules/tenant-settings, services/api/src/modules/settings-runtime, services/api/src/modules/customization, apps/web/app/(authenticated)/settings]
RISK: HIGH
COVERAGE_UNIT: PARTIAL
COVERAGE_API: GAP
COVERAGE_DATABASE: GAP
COVERAGE_INTEGRATION: GAP
COVERAGE_E2E: GAP
COVERAGE_BROWSER: GAP
COVERAGE_SECURITY: GAP
COVERAGE_PERFORMANCE: GAP
RELATED_BUGS: [BUG-0668, BUG-0669]
RELATED_REGRESSIONS: [REG-223, REG-224]
CREATED_AT: 2026-08-22
UPDATED_AT: 2026-08-22
VERIFIED_AGAINST_SHA: d5d9ce7
---

# PLAN-021 — Settings, preferences and enterprise configuration

## Scope

The tenant-configurable surface: `tenant-settings` (including
`enterprise-configuration`), `settings-runtime`, `customization`, and the
settings pages in `apps/web`. The contract is
`docs/architecture/settings-and-branding.md`.

**Excluded:** platform-side configuration (`platform-runtime`,
`PlatformSetting`), which is [[PLAN-019]]'s; and the module registry, which is
[[PLAN-017]]'s.

> Raised on 2026-08-22 because this area had **no plan at all**, which was
> discovered the ordinary way: two regressions were registered against it and
> `rebuild-qa` refused them — *"a scenario outside every plan is never selected
> for a re-run"*. Two defects had already been found here in one afternoon while
> looking at something else entirely.

## Risks

Ranked by what has actually gone wrong, not by imagination:

1. **A parameter accepted and ignored.** [[BUG-0668]]: `resolveExchangeRate`
   took an `effectiveDate` and never queried it, on a model that is
   effective-dated by design. The caller does everything right and gets the wrong
   number. This area computes money.
2. **Declared but unwired.** [[BUG-0669]]: a validation DTO written with correct
   rules and never referenced, so the endpoint accepted anything. The signature
   of this class is that an audit *sees* the control.
3. **Resolution order.** Settings resolve through tenant → organization →
   business unit → employee, and a wrong precedence is invisible until two levels
   disagree.
4. **Cross-tenant leakage through a resolver.** These services take a tenantId
   and thread it by hand, like everything else here.
5. **Unbounded values persisted.** Preferences, branding strings and formats are
   free text stored on a row and rendered elsewhere.

## Preconditions

None beyond a tenant. The unit scenarios need no database. The enterprise
configuration scenarios that touch exchange rates construct their own snapshot
history rather than relying on a seed — a seeded rate table would make them pass
for a reason they do not state.

## Test Types

- **UNIT** — where the coverage is today. Resolution order, validation, and the
  helpers that read settings.
- **API / DATABASE** — applicable and largely absent. Resolution through the real
  `settings-runtime` endpoints against a real database is not covered.
- **SECURITY** — applicable: every settings write is a tenant-scoped write.
  Partially covered by `settings-context-authorization.spec.ts` and
  `feature-availability-authorization.spec.ts`.
- **BROWSER_E2E** — no browser harness in CI (see [[ITEM-0034]]).

## Data Requirements

Fixture tenants from `test/helpers/db-fixtures.ts` for anything DB-backed. No
credential, no branding asset from a real customer.

## Security Cases

- A tenant's settings read or write cannot reach another tenant's rows.
- A user without `user-preferences.write` cannot change preferences.
- A settings write validates its body against a DTO — [[QA-SETTINGS-004]].
- Branding and preference values are bounded, so nothing unbounded is persisted
  and rendered elsewhere.

## Negative Cases

- An invalid timezone is a 400, not a 500 from `Intl.DateTimeFormat`.
- A time format outside `12h|24h` is refused.
- A currency conversion for a date no rate window covers is refused, and the
  message names the date — [[QA-SETTINGS-003]].
- A field the DTO does not declare is refused rather than silently dropped.

## State Transitions

Exchange rate snapshots are effective-dated and supersede rather than replace: a
correction is a later window covering the same moment, and the later one wins.
An `ACTIVE` → archived transition must not change what a past date resolves to.

## Integration Cases

Automatic rate snapshots carry `provider`, `lastFetchedAt` and
`providerRawResponse`. A provider timeout or malformed response must leave the
last good window in place rather than writing a partial row — **not covered**.

## Browser Cases

The settings pages render from the resolved context, and a wrong precedence shows
up as the wrong value in a form field rather than as an error. Nothing proves
this today; it is part of [[ITEM-0034]].

## Regression Links

- REG-223 — a currency conversion uses the rate in force on the date given
  ([[QA-SETTINGS-003]], [[BUG-0668]])
- REG-224 — every settings write validates its body against a DTO
  ([[QA-SETTINGS-004]], [[BUG-0669]])

<!-- GRAPH:BEGIN — generated by scripts/rebuild-qa.mjs; edit the frontmatter, not this block -->

## Related

- Scenarios — [[QA-SETTINGS-003]], [[QA-SETTINGS-004]]
- Module — [[settings]]
- Bugs — [[BUG-0668]], [[BUG-0669]]
- Regressions — REG-223, REG-224 (see the regression register)

<!-- GRAPH:END -->
