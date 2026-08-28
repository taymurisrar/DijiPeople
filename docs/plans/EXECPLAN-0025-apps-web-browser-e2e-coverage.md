---
ID: PLAN-025
aliases: [PLAN-025, EXECPLAN-0025]
Title: Browser E2E coverage for apps/web, the tenant product
Status: AWAITING_OWNER_DECISION
Session: SESSION-0069
Type: TEST_GAP
Size: LARGE
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
---

# ExecPlan — Browser E2E coverage for `apps/web`

## Objective

`apps/web` — the application every employee of every tenant uses — is opened by
a browser test for the first time. A first slice of flows covers signing in,
reaching a workspace, and the handful of journeys a tenant user performs daily,
with the same accessibility and layout assertions Flow E already applies to
admin and landing. CI starts the app and polls it, so a failure is a failure
rather than a silence.

This plan deliberately does **not** attempt 253 pages.

## Business requirement

[[ITEM-0034-apps-web-has-zero-browser-e2e-coverage]], `HIGH`, `PLAN_REQUIRED`.
Raised because `apps/web` has no browser coverage and, uniquely, no other way to
get any: `apps/web/jest.config.js` is `testEnvironment: node` with no jsdom, so
nothing in it can be tested through a DOM by any existing mechanism.

`TODO: Confirm product/business rule.` **Which journeys matter most is a
product judgement, and this plan does not make it alone.** The slice proposed
under *Requirements* is the author's recommendation with its reasoning; the
Definition of Done depends on the owner confirming or replacing it.

## Existing behavior

Measured at `eb457d9`, and two of the record's supporting facts have gone stale
since it was written at `1af3690` — recorded here rather than repeated:

| The record says | Measured now |
|---|---|
| "`e2e/tests/` contains exactly two specs" | **Ten.** Flows A–G plus three landing specs. The suite grew from 18 tests to 48. |
| "`browser-e2e` retains `continue-on-error: true`, so a failed browser step is still fail-open" | **Removed on 2026-08-18**, with a comment at `ci.yml:968` explaining that it made the job's promotion fail-open. The job is genuinely required now. |

What the record says that is **still exactly true**, and is the whole point:

- **No test consumes the `web` base URL.** `e2e/playwright.config.ts:37` defines
  `web: process.env.E2E_WEB_URL ?? 'http://localhost:3001'`; grepping the whole
  `e2e/` tree for a consumer returns nothing. The config reads as though web
  were in scope.
- **CI never starts it.** `ci.yml:1086-1087` starts `dev:landing` and
  `dev:admin`. Port 3001 is never started and never polled.
- **`e2e/fixtures/environment.ts` probes landing, admin and api only**, so web's
  absence cannot even produce a skip. It is invisible rather than reported.
- 254 `page.tsx` files, 207 client components, none ever rendered by a test.

Two records are explicitly unguardable without this, and both say so in their
own text: [[BUG-0043-web-dialogs-have-no-focus-trap-and-filter-controls-are-unlab]]
and [[BUG-0046-tenant-theme-mode-and-runtime-settings-saves-do-not-take-eff]].

## Existing architecture

The suite this extends, rather than a new one:

- `e2e/playwright.config.ts` — serial by deliberate choice (`workers: 1`),
  because the commercial journeys mutate shared platform state; `baseURL` is
  admin, and other surfaces are addressed absolutely from `BASE_URLS`.
- `e2e/fixtures/environment.ts` — `probeEnvironment` / `probePublicSurface`
  produce an explicit skip naming what was missing, rather than a failure.
- `e2e/fixtures/admin-session.ts` — `signInToAdmin`, `openAdmin`.
- `e2e/fixtures/accessibility.ts` — `auditPage`, `blocking`,
  `describeViolations`, `scrollsSideways`, `VIEWPORTS`. Flow E's policy is
  established and this plan adopts it unchanged: **critical and serious
  violations gate; moderate and minor are reported.**
- Tenant sign-in differs from admin sign-in and that is the main new fixture:
  `apps/web` resolves a tenant from the host or a `?tenant=` parameter
  (`apps/web/lib/tenant-url.ts`), and since TASK-0009 an identity may reach
  several workspaces.

## Requirements

Numbered, testable, and **the slice in 4–8 is the part awaiting confirmation.**

1. A `web-session` fixture signs a tenant user in against a named tenant, and
   produces an explicit skip — never a failure — when no tenant is seeded.
2. `probeEnvironment` polls web alongside landing, admin and api, so its absence
   is reported rather than invisible.
3. CI starts `dev:web` and waits for port 3001 before the browser job runs.
4. **Flow H — sign in and land.** Tenant login, the workspace picker when an
   identity reaches more than one, and the authenticated shell rendering with
   navigation.
5. **Flow I — the daily journeys.** Attendance (the most-used screen in the
   product), leave request submission, and payslip viewing. Read paths asserted
   for every one; one write path — the leave request — asserted end to end.
6. **Flow J — the runtime list and record pages.** One metadata-driven module
   opened as a list, filtered, sorted, and opened as a record. This is the
   surface `StandardModuleListPage` and `StandardModuleRecordPage` generate for
   most of the product, so one module's coverage is disproportionately broad.
7. **Accessibility and layout across all three**, using Flow E's existing
   helpers and its existing gating policy.
8. Nothing in the slice depends on payroll being *run*, tenant provisioning, or
   any state a test would have to create and then reconcile.

## Dependencies

- A seeded tenant with a signed-in-able user. `seed-demo` produces one; the
  fixture must skip rather than fail when it is absent, matching how every other
  flow behaves against a bare environment.
- **Owner confirmation of the slice.** This is the plan's one true blocker.

## Files / modules affected

**e2e/** — `playwright.config.ts` (no change expected; `BASE_URLS.web` already
exists), `fixtures/environment.ts`, `fixtures/web-session.ts` (new),
`tests/flow-h-tenant-sign-in.spec.ts` (new),
`tests/flow-i-daily-journeys.spec.ts` (new),
`tests/flow-j-runtime-module.spec.ts` (new).

**.github/workflows/ci.yml** — start `dev:web`, poll 3001. Single-writer file
for the browser job; no other job's definition is touched.

**docs/** — ITEM-0034 closed; ITEM-0001's misleading title corrected (see
*Risks*); QA scenarios and a REG entry for the new flows; PLAN-011
(runtime-modules) and any plan whose `COVERAGE_BROWSER` this actually moves.

## Database impact

**None.** No model, no migration. The flows read seeded data and create one
leave request, which the tenant fixture removes — per
`.agent/context/test-resource-policy.md`, a test creates what it asserts on and
cleans exactly what it created.

## Backend impact

**None.** No endpoint, DTO or service changes. If a flow cannot be written
without one, that is a finding about the product and becomes a bug record — not
a reason to add an endpoint inside a test-coverage task.

## Frontend impact

**None to ship.** No `apps/web` source change is planned. Any defect the flows
surface becomes a durable record and is triaged; fixing it inside this task
would conflate "we can now see" with "we have now fixed", and the first is the
deliverable.

## Permission / RBAC impact

None. The flows sign in as an ordinary seeded tenant user and assert what that
user can reach. No permission key, matrix entry, elevated role or seed grant
changes.

Worth stating because it is load-bearing: a browser flow signing in as a
**privileged** user would hide exactly the authorization defects this product
most needs caught. The fixture uses the least-privileged user that can complete
each journey.

## Tenant-isolation impact

The flows exercise the tenant path, so `tenantId` comes from the session as it
always does; no query is written by this plan. One assertion is worth adding
precisely because it is cheap here and impossible in a unit test: a signed-in
tenant user's list screens show only their own tenant's records. That is an
observation, not a new mechanism.

## Audit / event / logging impact

None. Nothing here logs, audits or emits an event.

## Integration impact

None external. No Stripe, no gateway, no desktop agent, no email.

## Migration / data compatibility

Not applicable — no schema, no contract, no stored data changes.

## Parallel-safe tasks

- **WP-A** `fixtures/web-session.ts` and the `probeEnvironment` extension —
  `PARALLEL_SAFE`.
- **WP-B** CI starts and polls `dev:web` — `PARALLEL_SAFE` (touches only the
  browser job).

## Dependency-blocked tasks

- **WP-C** Flow H — `DEPENDENCY_BLOCKED` on WP-A.
- **WP-D** Flow I — `DEPENDENCY_BLOCKED` on WP-C, because it signs in the same
  way and should not duplicate the fixture's discovery.
- **WP-E** Flow J — `DEPENDENCY_BLOCKED` on WP-C.
- **WP-F** Accessibility and layout across H, I and J — `DEPENDENCY_BLOCKED` on
  all three.

## Integration tasks

- **WP-G** `INTEGRATION` — records: close ITEM-0034, correct ITEM-0001, file
  scenarios and a REG entry, move `COVERAGE_BROWSER` on the plans this genuinely
  changes and **only** those, and file a bug record for every defect the flows
  surfaced.

## Testing strategy

The deliverable is tests, so the question is how we know *they* work.

- `npx playwright test --config e2e/playwright.config.ts` locally against a
  running stack, and the CI `browser-e2e` job on the exact SHA.
- **Every new flow is proven to fail without the thing it asserts.** Flow E's
  precedent: an assertion that cannot fail is not coverage. For the accessibility
  helpers this means running against a deliberately broken fixture; for the
  journeys, asserting on a real element rather than on the page having loaded.
- `npm run repo:health`, `validate:framework`, `qa:check`, `backlog:check`.
- **Manual, once:** run the suite against a stack with no seeded tenant and
  confirm every new test *skips with a message naming what was missing*, rather
  than failing. That behaviour is the difference between a suite people trust
  and one they learn to ignore.

## Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **A first browser suite over an app that has never had one finds a long tail and blocks every branch.** | High | High | Flow E's policy, adopted unchanged: critical and serious gate, moderate and minor are reported and become backlog. A suite nobody can act on gets ignored, which is worse than no suite. |
| 2 | The flows encode current behaviour rather than required behaviour, so a defect becomes the baseline. | Medium | High | Assertions come from `apps/web/AGENTS.md` — labelled controls, escapable dialogs, no meaning in colour alone, no sideways scroll at 390px — not from what the page happens to do. |
| 3 | Wall-clock. The suite is `workers: 1` by deliberate choice and grew from 18 tests to 48; three more flows push the browser job's timeout again. | Medium | Medium | Measure before adding the last flow. `ci.yml:933` records that a cancelled run produces *no evidence at all* — `ci:classify` reports it `IS_EVIDENCE = NO` — so an overrun does not merely slow the branch, it blocks integration. |
| 4 | Flakiness from shared platform state, which is why the suite is serial. | Medium | Medium | The slice deliberately avoids provisioning and payroll runs. The one write path creates and removes its own record. |
| 5 | **[[ITEM-0001]] is closed `DONE` and titled "No browser E2E tooling exists in any workspace", listing `apps/web` first.** A future agent retrieving it concludes the tenant product is covered. | High | Medium | Correct that record's title and text as part of WP-G. It is the reason ITEM-0034 had to be filed at all. |

## Rollback considerations

Tests only. Reverting is deleting three spec files, one fixture, and the CI
lines that start `dev:web`. Nothing in the product depends on any of it.

The one non-obvious consequence: after WP-B, a broken `apps/web` **fails CI**
where it previously could not. That is the point, and it is worth saying out
loud before it surprises somebody mid-branch.

## Definition of Done

- [ ] Owner has confirmed or replaced the slice in requirements 4–8
- [ ] `apps/web` is started and polled by CI; its absence produces a named skip
- [ ] Flows H, I and J pass on the exact SHA in the `browser-e2e` job
- [ ] Each new assertion demonstrated to fail without the behaviour it asserts
- [ ] Suite skips cleanly, with messages, against an unseeded environment
- [ ] Every defect found is a durable record, triaged — none fixed silently
      inside this task
- [ ] ITEM-0034 closed; **ITEM-0001 corrected**
- [ ] `COVERAGE_BROWSER` moved only on plans this genuinely changes
- [ ] Browser job wall-clock measured and its timeout still adequate
- [ ] No unrelated changes in the diff
