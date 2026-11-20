---
PLAN_ID: PLAN-057
aliases: [PLAN-057]
TITLE: Growth plan demo readiness
AREA: growth-demo
STATUS: CURRENT
MODULES: [employees, organization, leave, attendance, timesheets, projects, recruitment, onboarding, documents, notifications, branding, attendance-integrations, data-import-export, advanced-data-management, email-template-customization, error-logs, billing, contracts]
RISK: HIGH
COVERAGE_UNIT: GOOD
COVERAGE_API: GAP
COVERAGE_DATABASE: GAP
COVERAGE_INTEGRATION: GAP
COVERAGE_E2E: GOOD
COVERAGE_BROWSER: GAP
COVERAGE_SECURITY: GAP
COVERAGE_PERFORMANCE: GAP
RELATED_BUGS: [BUG-4427, BUG-4428, BUG-4429, BUG-4438, BUG-4446, BUG-4447]
RELATED_REGRESSIONS: [REG-685, REG-686, REG-687, REG-688, REG-689]
CREATED_AT: 2026-11-19
UPDATED_AT: 2026-11-19
VERIFIED_AGAINST_SHA: 92eba463
---

# PLAN-057 — Growth plan demo readiness

## Scope

What a Growth-plan tenant is sold and therefore must be able to demonstrate.
The entitlement list is read from `services/api/src/modules/super-admin/plans.catalog.ts`
(`growth`), never from marketing copy: employees, organization, leave, attendance,
timesheets, projects, recruitment, onboarding, documents, notifications, branding,
attendance-integrations, data-import-export, advanced-data-management,
email-template-customization. **Not** entitled: payroll, desktop agent, white-label
branding, compliance — a Growth demo must not open them.

Also covers the path that creates the tenant (landing checkout, bank-transfer
claim, manual confirmation, provisioning, account activation) and the production
monitoring signal that tells the operator whether the demo environment is healthy.

## Risks

1. A buyer returns from a hosted checkout to a malformed URL (BUG-4427).
2. A user is allowed to submit input the API certainly refuses (BUG-4428), and every
   such mistake becomes a monitoring incident (BUG-4429), burying real faults.
3. An entitled module is unreachable, or an unentitled one is reachable (PLAN-039).
4. Tenant isolation on recruitment/documents/timesheets data (PLAN-003).

## Preconditions

Disposable database named `*_test` (`scripts/assert-test-database.mjs`), `migrate
deploy`, `seed:config`, `seed:demo`, `seed:admin` with the CI placeholder
credentials, and a real `npm ci` in the worktree (a junctioned `node_modules`
resolves a stale `@repo/config` and fails seeds — see the QA run record).

## Test Types

UNIT (Jest, API/landing/admin/web), API e2e (Jest, `services/api/test`),
BROWSER_E2E (Playwright, `e2e/tests`). Browser flows need the isolated landing and
tenant web stacks; they were not executed in this plan's first run — see the run
record for the honest split.

## Data Requirements

Isolated demo tenant from `seed:demo` (Growth plan assignment by `seed-demo`);
tests create what they assert on and clean what they create
(`.agent/context/test-resource-policy.md`). No production records, no synthetic
customer or payment rows in production.

## Security Cases

Cross-tenant reads on recruitment/documents/timesheets (reporting-tenant-isolation,
permission-propagation e2e); unentitled-module access returns the commercial 403
(PLAN-039); `tenantId` rejected as input (`property tenantId should not exist` stays
a queued incident by design).

## Negative Cases

| ID | Case | Expected | Automated by |
|---|---|---|---|
| GD-N01 | `/subscribe/success?onboarding=<uuid>?order_id=X` | UUID extracted, poll uses clean id | `provisioning-view.spec.ts › parseOnboardingId` |
| GD-N02 | `onboarding=../../etc` or empty | "Nothing to show here", no request | same spec |
| GD-N03 | Weak password on activation | Blocked client-side, unmet rules named | `activate-account-form.tsx` (rules: `password-rules.spec.ts`) |
| GD-N04 | Party / signer email `foo` | Inline error, Save/Send disabled | `lib/email-format.spec.ts` |
| GD-N05 | Blank required agreement field at submit | 400 names the field; NOT_AN_INCIDENT | `expected-protocol-outcome.spec.ts` |
| GD-N06 | Used / expired signature link | 400 message; NOT_AN_INCIDENT | same |
| GD-N07 | Active agreement exists (409) | NOT_AN_INCIDENT | same |
| GD-N08 | Stale public price id (404) | NOT_AN_INCIDENT only on `/public/` | same |
| GD-N09 | `partnerId must be a UUID` on a party route | still NEW (BUG-1742 guard) | same |
| GD-N10 | 500 carrying a "required" message | still NEW | same |

## State Transitions

Order: AWAITING_PAYMENT -> (bank claim) -> CONFIRMED -> PROVISIONED
(`bank-transfer-settlement`, `payment-authorised-provisioning`,
`managed-payment-settlement`, `provisioning-queue` e2e suites — reused).

## Integration Cases

Safepay hosted-checkout return URL (query-string concatenation, BUG-4427); Stripe
webhook signature rejection (`Invalid Stripe webhook signature` is a 400 from
unsigned callers and stays queued while enforcement is on).

## Browser Cases

Reused, not rewritten: `e2e/tests/flow-i-growth-modules.spec.ts` (every entitled
module renders its own control), `flow-l-module-acceptance`, `flow-j-tenant-settings`,
`flow-k-module-views`, `flow-a-commercial-onboarding`, `flow-h-tenant-sign-in`,
`landing-checkout-provisioning`. Playwright MCP was unavailable in this session
(connection timeout); the repository's own Playwright harness is the route.

## Regression Links

BUG-4427, BUG-4428, BUG-4429 (this plan). Related: BUG-1742, BUG-1754, BUG-2465.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-qa.mjs; edit the frontmatter, not this block -->

## Related

- Scenarios — [[QA-E2E-001]], [[QA-E2E-002]], [[QA-E2E-003]], [[QA-GROWTH-001]], [[QA-GROWTH-002]], [[QA-GROWTH-003]], [[QA-GROWTH-004]], [[QA-UNIT-001]], [[QA-UNIT-002]]
- Bugs — [[BUG-4427]], [[BUG-4428]], [[BUG-4429]], [[BUG-4438]], [[BUG-4446]], [[BUG-4447]]
- Regressions — REG-685, REG-686, REG-687, REG-688, REG-689 (see the regression register)

<!-- GRAPH:END -->

## Executable workflow suites (added by SESSION-0134)

| Suite | File | Tests | What it proves |
|---|---|---|---|
| Flow M | `e2e/tests/flow-m-growth-hiring-workflows.spec.ts` | 5 | recruiter pipeline end to end, rejection rule, who may reach recruitment |
| Flow N | `e2e/tests/flow-n-growth-people-workflows.spec.ts` | 7 | leave (approve/reject/refusals), projects + assignment, documents, entitlement boundary |
| Flow O | `e2e/tests/flow-o-growth-hiring-browser.spec.ts` | 8 | the hiring journey through the browser: recruiter job, candidate, application, stages to HIRED, onboarding; admin completes 11 tasks and converts (one API-assisted step, BUG-4447) |
| Flow P | `e2e/tests/flow-p-growth-hr-browser.spec.ts` | 10 (1 `fixme`, BUG-4456) | HR workflows through the browser: leave approve/reject/invalid, approvals inbox, notification, projects + assignment, timesheet submit/approve, attendance, document upload/download, setting change and restore |
| Flow Q | `e2e/tests/flow-q-growth-bank-transfer-browser.spec.ts` | 7 | Growth bought by bank transfer end to end: pricing, wizard, email code, bank details, claim, two-person approval, provisioning, activation, tenant login; duplicate, reject-resubmit, double approval, code failures, login before activation |
| Safety | `e2e/tests/safety.spec.ts` | 12 | writing flows refuse production URLs, non-loopback hosts, non-test databases and a production API |
| Fixture | `e2e/tools/prepare-growth-tenant.mjs` | - | Growth subscription + ENFORCE on a disposable tenant |
| Fixture | `e2e/fixtures/safety.ts`, `residue.ts` | - | the guard, and a by-tag residue measurement |

Both run in the required `browser-e2e` CI job (fail-closed) and **throw rather than skip** when the environment is missing.

## Closure evidence (2026-11-19 / 2026-11-20)

- **Required `Browser e2e` job on branch `agent/growth-demo-closure`, run 44640424792:** 183 passed, 1 flaky (Flow K K5 passed on retry), 9 skipped, 9.7 min, success. Skips are named in-test: Flow B B4 (BUG-0019), Flow H H5, Flow I x2, Flow J x3 (BUG-1951), Flow P GP-D2 (BUG-4456), landing checkout (needs a Stripe-synced price). It was 46 skipped before SESSION-0134.
- **CI root causes found on the way:** the runner was memory-starved by `next dev` (production builds now); Flow Q needed `OUTBOX_WORKER_ENABLED`, `EXPOSE_DEV_AUTH_LINKS`, `LANDING_APP_URL`, `WEB_APP_URL` and `TENANT_BASE_DOMAIN`, and without the last the provisioning handler created duplicate tenants (BUG-4467).
- **Local runs:** Flow P 9 passed + 1 fixme and Flow Q 7/7, each twice in a row, zero tagged residue.
- **Demo script:** `docs/qa/demo-scripts/ahk-growth-30-minute-demo.md`.
