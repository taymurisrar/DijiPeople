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
COVERAGE_E2E: PARTIAL
COVERAGE_BROWSER: PARTIAL
COVERAGE_SECURITY: PARTIAL
COVERAGE_PERFORMANCE: PARTIAL
RELATED_BUGS: [BUG-0073, BUG-0074, BUG-1419, BUG-1420, BUG-1421, BUG-1422, BUG-1423, BUG-1424, BUG-1425]
RELATED_REGRESSIONS: [REG-068, REG-261]
CREATED_AT: 2026-08-19
UPDATED_AT: 2026-08-26
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

The authorization *boundary* stays with PLAN-002, which owns it: a tenant user
must receive 403 from every `super-admin` route, and frontend gating must never
be the only thing preventing an action.

The console's own posture is covered here, because it is a property of this
surface rather than of the boundary. Established against production 2026-08-26:

- Every platform API answers 401 to an unauthenticated caller, and every
  protected page redirects to `/login` without rendering the shell.
- The four auth cookies are `httpOnly`, `secure` and `SameSite=Lax`; only the
  theme cookie is script-readable, which is correct.
- Sign-in returns a byte-identical response for a known and an unknown address,
  so it does not enumerate accounts.
- Create refuses client-supplied `id`, `tenantId`, `createdAt`, `createdById`,
  `stripeCustomerId` and `isDemoData` explicitly, by `forbidNonWhitelisted`.
- `Content-Security-Policy` is absent — BUG-1424. The other four headers are
  present.

`COVERAGE_SECURITY` is `PARTIAL` and not `GOOD` for one reason worth stating:
every check above ran as `PLATFORM_OWNER` holding `platform.*`. **The role that
can reach everything cannot demonstrate that a narrower role cannot.** Until a
restricted platform role is driven across the same endpoints, this surface has
no evidence about over-permissive access, which is where its authorization
defects would actually live.

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

- 2026-08-26 - all 63 declared routes driven against production: every one
  responds 200 and renders its own heading, and all 19 sidebar items resolve.
  That run produced the shell findings below, which screen-by-screen coverage
  had missed for as long as the shell has existed.

`COVERAGE_BROWSER` stays `PARTIAL` rather than `GOOD`: the sweep proves every
screen *renders*, which is not the same as proving every screen *works*. Two
screens have their behaviour asserted. A plan claiming more would be worse than
no plan.

## Performance Cases

`COVERAGE_PERFORMANCE` moved from `NOT_APPLICABLE` to `PARTIAL` on 2026-08-26.
It was never truly not-applicable - it was unmeasured, and the measurement found
the slowest screen in the app.

Baseline against production, single user, median of three:

- TTFB is flat at **202ms** across every route, so the edge and the server are
  not the constraint.
- A page settles in **~4s**, which is client waterfall rather than latency.
- The runtime list APIs answer in **465-835ms**.
- At 8 concurrent read requests the server degrades **1.4x** (476ms -> 690ms).
- `/settings/monitoring` settles in **25-31s** - BUG-1419, a prefetch storm
  against a route that does not exist. Re-baseline it after that fix.

One methodological trap is worth recording, because it produced a convincing
false result: concurrency measured with **identical** URLs shows a clean linear
ladder (1.0x, 2.0x, 4.3x, 6.1x, 9.4x) that reads exactly like server-side
serialization. It is the browser coalescing identical in-flight requests. At
n=8: identical URL 4216ms, distinct URL 667ms. Always vary the URL, or measure
outside the browser.

Sustained and write load remain untested against production by owner decision -
the tenant app and landing site share the service.

## Regression Links

- REG-068 - the admin surfaces carry no critical or serious accessibility
  violation. Guards BUG-0073 (contrast, shared shell) and BUG-0074 (a scrollable
  region reachable only by pointer).
- REG-261 - runtime validation names the field it rejected. Guards BUG-1422.

The 2026-08-26 production run added five open findings that this plan predicted
in shape but had no coverage for. Four are shared-component defects, which is
this plan's stated central risk:

- BUG-1419, BUG-1420 - both on `/settings/monitoring`, both silent: a dead link
  that looks live, and a filter that answers confidently and wrongly.
- BUG-1421 - one `<title>` across 47 of 48 routes, two `<main>`, two `<h1>`,
  the sidebar in no landmark, no skip link anywhere.
- BUG-1423 - 28 form controls with no accessible name, in the shared runtime
  form. The bespoke forms pass, which is what identified the component.
- BUG-1424 - no CSP on the highest-blast-radius surface.

Note what REG-068 did **not** catch. It gates axe on the admin surfaces, and
BUG-1421 and BUG-1423 are both accessibility defects that were live throughout.
REG-068 covers two screens; BUG-1423 lives on create forms and BUG-1421's
landmark faults are `best-practice`-tagged rules that a `wcag2a`/`wcag2aa` run
does not report at all. A regression test scoped to two screens and four rule
tags is not coverage of a surface - and this is the concrete example of it.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-qa.mjs; edit the frontmatter, not this block -->

## Related

- Scenarios — [[QA-API-001]], [[QA-PLATFORM-002]], [[QA-PLATFORM-003]], [[QA-PLATFORM-004]], [[QA-PLATFORM-005]], [[QA-PLATFORM-006]], [[QA-PLATFORM-007]], [[QA-PLATFORM-008]], [[QA-PLATFORM-009]], [[QA-PLATFORM-010]], [[QA-PLATFORM-011]], [[QA-PLATFORM-012]], [[QA-PLATFORM-013]], [[QA-PLATFORM-014]], [[QA-PLATFORM-015]], [[QA-PLATFORM-016]], [[QA-PLATFORM-017]], [[QA-PLATFORM-019]], [[QA-PLATFORM-020]], [[QA-PLATFORM-021]], [[QA-PLATFORM-022]], [[QA-PLATFORM-023]], [[QA-PLATFORM-024]], [[QA-PLATFORM-025]], [[QA-PLATFORM-026]], [[QA-TENANT-013]], [[QA-TENANT-021]], [[QA-TENANT-022]], [[QA-TENANT-023]], [[QA-TENANT-024]], [[QA-TENANT-025]], [[QA-TENANT-026]], [[QA-TENANT-027]], [[QA-TENANT-028]], [[QA-TENANT-029]], [[QA-TENANT-030]], [[QA-TENANT-031]], [[QA-TENANT-032]], [[QA-TENANT-033]], [[QA-TENANT-034]], [[QA-TENANT-035]], [[QA-TENANT-036]], [[QA-TENANT-037]], [[QA-TENANT-038]], [[QA-TENANT-039]], [[QA-TENANT-040]], [[QA-TENANT-041]]
- Module — [[platform-admin]]
- Bugs — [[BUG-0073]], [[BUG-0074]], [[BUG-1419]], [[BUG-1420]], [[BUG-1421]], [[BUG-1422]], [[BUG-1423]], [[BUG-1424]], [[BUG-1425]]
- Regressions — REG-068, REG-261 (see the regression register)

<!-- GRAPH:END -->
