# QA Run — growth-demo-incident-triage

## Metadata

| | |
|---|---|
| Date / time | 2026-11-19 |
| Branch | `agent/growth-demo-monitoring` |
| Commit SHA | `3a7055453b9ae00dab4a90f2380ecbd9f27d07d3` (the work recorded below was uncommitted when this was written) |
| Worktree | `D:\My Work\hrm-dijipeople\wt-growth-qa` |
| Environment | Disposable local PostgreSQL `dijipeople_growthqa_test` (migrated, `seed:config`, `seed:demo` for two tenants, `seed:admin`); API :4000, landing :3000, tenant web :3001, admin :3002 as `next dev` and ts-node; Node 24 (the repo pins 22; not re-run under 22); Playwright 1.58 Chromium. Production: read-only ErrorLog aggregates and RolePermission counts only. |
| QA agent | Architect session SESSION-0134 (inline) |
| Scope | Growth plan demo readiness for ahk. enterprises: tenant workflows (recruitment, leave, projects, documents, entitlement), the public checkout surface, and triage of the 209 open production monitoring rows. **Not covered:** a browser-driven bank-transfer purchase through admin approval (covered at API level by `bank-transfer-settlement`, 20 tests), timesheet submit and approve, attendance check-in with location, onboarding-to-employee conversion. |

## Requirement

Show that a Growth tenant can run its entitled modules through real workflows, fix the defects found, and classify every open production incident with evidence instead of closing them in bulk.

## Risk Areas

A role grant that a route requires but nobody holds (BUG-4438); inputs submitted that the API certainly refuses (BUG-4428); monitoring that queues answers the product is meant to give (BUG-4429); an entitlement posture that differs between a test tenant and production (REPORT_ONLY versus ENFORCE).

## Scenarios

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| GM-R1..R5 | Recruiter pipeline, refusals, role boundaries | happy / negative / permission | recruiter creates job, candidate and application, moves APPLIED to OFFER, rejection needs a reason, HR and employee get 403 | PASS (5/5) | `e2e/tests/flow-m-growth-hiring-workflows.spec.ts` |
| GN-L1..L3 | Leave approve, reject, refusals | happy / negative / role | manager approves and rejects, backwards dates and self-approval refused | PASS (3/3) | `e2e/tests/flow-n-growth-people-workflows.spec.ts` |
| GN-P1..P2 | Projects and assignment | happy / permission | allocation required, employee sees the assignment, HR, payroll and employee refused | PASS (2/2) | same |
| GN-D1 | Document upload, list, download, delete | happy | category required by tenant settings, admin removes | PASS | same |
| GN-E1 | Payroll refused on a Growth tenant | permission | not 200 | PASS | same |
| I as HR | Every Growth module reaches an intentional state, a refusal names a reference, an unentitled module is hidden and unreachable, a list shows only this tenant's rows | UI-state / tenant | as stated | PASS (10), 1 skipped | `flow-i-growth-modules.spec.ts` run as `hr@` against two tenants |
| Landing | public surface, forms, SEO, accessibility | contract / UI-state | as written | 38 PASS, 1 skipped (needs a Stripe-synced price, card checkout only) | `landing-public-*.spec.ts` |
| E3 | admin dashboard accessibility | UI-state | no serious violations | FAIL: color-contrast on dashboard cards (pre-existing, not triaged further) | `flow-e-accessibility-and-layout.spec.ts` |

## Automated Suites

| Command | Suite | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|
| `npx playwright test` (tenant env unset) | whole browser suite | 56 | 1 | 92 | 5.5 min |
| `npx playwright test` (flows a, b, h to l, landing; tenant env set) | previously skipped flows | 39 | 1 | 52 | 8.7 min |
| `npx playwright test tests/flow-n-*` | Flow N | 7 | 0 | 0 | 31 s |
| `npx playwright test tests/flow-i-*` as hr | Flow I | 10 | 0 | 1 | 1.0 min |
| `npx jest --config ./test/jest-e2e.json` (8 suites) | API database e2e | 90 | 0 | 0 | not timed |
| `npx jest` api, landing, admin, web (targeted) | unit | 497, 218, 1036, 9 | 0 | 0 | not timed |

Flow I's skips under the admin user are explained. Its refusal test needs a lower-privileged user, its isolation test needs two tenants, and Flow J's three are `test.fixme` for the open BUG-1951.

### Regression-test proof

| Test | With fix | Without fix (stashed) |
|---|---|---|
| Flow M GM-R3 (stage move) | PASS | FAIL: 403 on the stage move, observed in the same session before the grant was added |
| `expected-protocol-outcome.spec.ts`, user-correctable cases | PASS | not separately stashed |
| `parseOnboardingId` cases | PASS | not applicable, new function |

## Manual Validation

Read-only production queries: the ErrorLog aggregate, the 209 open rows, the stack heads of the 500s, and RolePermission counts for `recruitment.advance` (zero for every system role in all five tenants). Nothing was written to production.

## Production incident triage (209 open rows: 37 error, 172 warning)

The full per-row list is `2026-11-19-growth-demo-incident-dispositions.csv` (incident id, category, recommended disposition, evidence). No row was closed. Closing a monitoring row is a write through the platform admin console and this session holds no platform credentials, so the dispositions are recommendations for a person to apply.

| Category | Rows | Recommended disposition | Basis |
|---|---|---|---|
| E1 CORS origin answered 500 | 7 | close as resolved | stack `Origin ... is not allowed by CORS`; BUG-0976 VERIFIED; `callback(null, false)` in `env.validation.ts` |
| E2 API unavailable 2026-08-26 | 10 | close as resolved | outage window, nothing since |
| E3 BigInt serialization of a raw User row | 1 | close as resolved | BUG-3883 FIXED |
| E4 Stripe resource_missing as 500 | 2 | close as resolved | handled in `stripe-billing.service.ts` |
| E5 Neon data-transfer quota | 1 | close as resolved | infrastructure, stack DriverAdapterError |
| X1 public legal not published | 11 | close as expected | 404 is the answer |
| X2 authorization refusal | 13 | close as expected | 403 working |
| X3 not found or stale link | 33 | close as expected | 404 on a missing record |
| X4 duplicate guard | 7 | close as expected | 409 working |
| X5 business-rule or user-correctable | 20 | close as expected | now classified automatically (BUG-4429) |
| S1 billing webhook signature or match | 4 | keep open | security signal |
| S2 rate limit | 1 | keep open or close | working as designed |
| C1 React hydration #418 and #441 | 12 | keep open, verify | browser-reported, last seen 2026-10-06, not reproduced here |
| C2 handled refusal stored as 500 | 2 | keep open | monitoring misclassification: the client error boundary stores a handled API refusal as `SYSTEM_UNEXPECTED_ERROR` |
| U Safepay webhook secret not configured | 1 | keep open | production configuration item |
| V1 our client sent invalid input or an unserved route | 84 | keep open, review | 62 last seen on or before 2026-08-30; includes 13 HTML-bodied 404s (BUG-2460 class) and the 22 `uuid v4` rows now fixed by BUG-4427 |

Outcome: no genuine ongoing server fault was found. 21 rows are resolved history, 84 are expected answers, and 104 stay open for a person: 5 security signals, 14 client-render or misclassified, 1 configuration gap and 84 client-input rows to review.

## Regression Checks

REG-685 to REG-688 added. BUG-1742 (a UUID rejection must stay visible) is re-asserted by the new classification tests.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Scenarios and records this run exercised, cited in its own body:

[[BUG-0976]] · [[BUG-1742]] · [[BUG-1951]] · [[BUG-2460]] · [[BUG-3883]] · [[BUG-4427]] · [[BUG-4428]] · [[BUG-4429]] · [[BUG-4438]] · [[SESSION-0134]]

<!-- GRAPH:END -->
