---
PLAN_ID: PLAN-019
aliases: [PLAN-019]
TITLE: Platform Admin surface
AREA: platform-admin
STATUS: CURRENT
MODULES: [apps/admin]
RISK: HIGH
COVERAGE_UNIT: GAP
COVERAGE_API: GAP
COVERAGE_DATABASE: GAP
COVERAGE_INTEGRATION: GAP
COVERAGE_E2E: GAP
COVERAGE_BROWSER: PARTIAL
COVERAGE_SECURITY: GAP
COVERAGE_PERFORMANCE: NOT_APPLICABLE
RELATED_BUGS: [BUG-0073, BUG-0074]
RELATED_REGRESSIONS: [REG-068]
CREATED_AT: 2026-08-19
UPDATED_AT: 2026-08-19
VERIFIED_AGAINST_SHA: 4290c03
---

# PLAN-019 - Platform Admin surface

Platform Admin is the console DijiPeople runs its own business from. Until this
plan its screens were covered only incidentally, by whichever domain plan
happened to pass through them, and its **accessibility was never verified at
all**. The first audit run against it found two real defects, one of them in the
shared shell and therefore on every screen.

## Scope

`apps/admin` as a surface: the shell, its navigation, the runtime components
every screen composes, and the operational screens built on them.

Domain behaviour reached *through* these screens stays with its own plan - this
plan covers the console as a thing a person uses, not the rules it invokes. The
platform authorization boundary in particular belongs to PLAN-002, which gained
BUG-0071 and BUG-0072 in the same session.

## Risks

- **The shell is shared, so a defect in it is a defect everywhere.** BUG-0073
  was a single class name in the sidebar and failed contrast on every admin
  screen at once. Screen-by-screen coverage will keep missing this class of
  defect unless the shell is audited in its own right.
- **Frontend gating is cosmetic by design.** `apps/admin` hides controls a user
  may not use, and that is a usability affordance, never enforcement. A test
  that confirms a control is hidden proves nothing about authorization; the
  server-side check is the one that matters.
- **A first accessibility audit surfaces a long tail.** Gating on all of it
  produces a red suite nobody can act on, which trains people to ignore CI - the
  failure the pipeline exists to prevent.
- **The console is low-traffic and high-consequence.** Defects here are found by
  operators mid-incident rather than by volume, so absence of complaints is not
  evidence of correctness.

## Preconditions

- A platform user, and the admin app, API and a disposable database running.
- Signed-in scenarios use the full `probeEnvironment`; there is no public half
  of this surface, so none of it can run without a session.
- Data created by the test, never inherited from a seed. A scenario resting on
  whatever `seed:demo` left behind stops testing anything the day the seed
  changes - and, as this session proved, can pass while reading rows the test
  did not write.

## Test Types

- **Browser** - the primary type here. These are screens; their defects are
  rendering, layout, keyboard reachability and announcement, and none of those
  are visible from the code.
- **Accessibility** - axe over the `wcag2a`/`wcag2aa`/`wcag21a`/`wcag21aa` rule
  sets, gating on critical and serious impact.
- **Layout** - asserted as properties (no horizontal body scroll at 390, 768 and
  1366 pixels), never as pixel baselines: baselines generated on one operating
  system do not match another's renderer and so cannot gate CI.
- **Unit and API** - deliberately `GAP`. The admin route handlers are thin
  proxies; the behaviour worth testing lives in the API and has its own plans.

## Data Requirements

Provisioning runs covering each operational state, created by the test with a
marker prefix and removed afterwards. Runs are recorded by the API as a
consequence of a purchase, and a run only breaches after its target passes, so
seeding them directly is the only way to test the states without waiting hours.

## Security Cases

Deferred to PLAN-002, which owns the platform authorization boundary. Recorded
here so the omission is a decision rather than a gap nobody noticed: a tenant
user must receive 403 from every `super-admin` route, and frontend gating must
never be the only thing preventing an action.

## Negative Cases

- An empty queue renders as empty, not as zeroes that imply a measurement.
- A value the system does not have renders as absent, not as a plausible
  default. A blank cell reads as a rendering bug; a default reads as a fact.
- A run whose steps have not been recorded yet reads as in progress, not stuck.

## State Transitions

The six operational states are **derived, never stored**, so they cannot drift
from the runs they describe. The order of derivation is the triage order:
FAILED and BREACHED outrank AT_RISK, which outranks MANUAL_ACTION_REQUIRED - the
most serious true statement is the one shown. Covered by QA-PLATFORM-001.

## Integration Cases

None owned here. The console reads the API and nothing else; Stripe, the gateway
and the device connectors are reached through their own modules and plans.

## Browser Cases

- QA-PLATFORM-001 - the provisioning queue surfaces every stuck run to an
  operator, in triage order, with the blocker they would act on.
- QA-PLATFORM-002 - the provisioning queue and the dashboard carry no critical
  or serious accessibility violation, and neither scrolls the body sideways at
  any of the three widths.

Two screens out of many, which is why `COVERAGE_BROWSER` is `PARTIAL` rather
than `GOOD`. A plan claiming more would be worse than no plan.

## Regression Links

- REG-068 - the admin surfaces carry no critical or serious accessibility
  violation. Guards BUG-0073 (contrast, shared shell) and BUG-0074 (a scrollable
  region reachable only by pointer).

<!-- GRAPH:BEGIN — generated by scripts/rebuild-qa.mjs; edit the frontmatter, not this block -->

## Related

- Scenarios — [[QA-API-001]], [[QA-PLATFORM-002]], [[QA-PLATFORM-003]], [[QA-PLATFORM-004]], [[QA-PLATFORM-005]], [[QA-PLATFORM-006]], [[QA-PLATFORM-007]], [[QA-PLATFORM-008]], [[QA-PLATFORM-009]], [[QA-PLATFORM-010]], [[QA-PLATFORM-011]], [[QA-PLATFORM-012]], [[QA-PLATFORM-013]], [[QA-PLATFORM-014]], [[QA-PLATFORM-015]], [[QA-PLATFORM-016]], [[QA-PLATFORM-017]], [[QA-PLATFORM-019]], [[QA-PLATFORM-020]], [[QA-PLATFORM-021]], [[QA-PLATFORM-022]], [[QA-PLATFORM-023]], [[QA-TENANT-013]]
- Module — [[platform-admin]]
- Bugs — [[BUG-0073]], [[BUG-0074]]
- Regressions — REG-068 (see the regression register)

<!-- GRAPH:END -->
