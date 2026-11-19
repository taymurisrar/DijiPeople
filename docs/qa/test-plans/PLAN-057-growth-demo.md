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
COVERAGE_E2E: GAP
COVERAGE_BROWSER: GAP
COVERAGE_SECURITY: GAP
COVERAGE_PERFORMANCE: GAP
RELATED_BUGS: [BUG-4427, BUG-4428, BUG-4429]
RELATED_REGRESSIONS: []
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

- Scenarios — [[QA-UNIT-001]]
- Bugs — [[BUG-4427]], [[BUG-4428]], [[BUG-4429]]

<!-- GRAPH:END -->
