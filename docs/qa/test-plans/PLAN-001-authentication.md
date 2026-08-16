---
PLAN_ID: PLAN-001
aliases: [PLAN-001]
TITLE: Authentication
AREA: authentication
STATUS: CURRENT
MODULES: [services/api/src/modules/auth, services/api/src/common/guards, apps/admin/app/api/auth]
RISK: CRITICAL
COVERAGE_UNIT: GOOD
COVERAGE_API: PARTIAL
COVERAGE_DATABASE: GAP
COVERAGE_INTEGRATION: GAP
COVERAGE_E2E: GAP
COVERAGE_BROWSER: GAP
COVERAGE_SECURITY: PARTIAL
COVERAGE_PERFORMANCE: NOT_APPLICABLE
RELATED_BUGS: [BUG-0008, BUG-0009, BUG-0010]
RELATED_REGRESSIONS: [REG-008, REG-032, REG-033]
CREATED_AT: 2026-08-16
UPDATED_AT: 2026-08-16
VERIFIED_AGAINST_SHA: 714632d
---

# PLAN-001 — Authentication

## Scope

Sign-in, sign-out, session lifetime, refresh, lockout and password policy across the
three authenticated clients — `web`, `admin` and `agent-desktop`. Each has its own
JWT secret and its own `appClientId`, and `JwtAuthGuard` checks that the token's
audience matches the requesting client before loading any access context.

Excludes what a user may *do* once authenticated — that is `authorization`.

## Risks

- A token minted for one client being accepted by another, which would let a
  desktop-agent credential reach the tenant product.
- Sign-out that clears a cookie without revoking the server-side session
  (`BUG-0009`), so a stolen refresh token outlives the logout.
- An error while clearing cookies turning sign-out into a 500 (`BUG-0010`) —
  the user stays signed in and believes they are not.
- A caller and its route disagreeing on HTTP method, so "Sign in again" 405s
  (`BUG-0008`, and the same class again as `REG-033`).
- Unbounded login attempts enabling credential stuffing.

## Preconditions

A seeded tenant with at least one active user per role, and one revoked session.
No live database is needed for the unit and route-contract scenarios; the
session-revocation path needs one.

## Test Types

`UNIT` and `API` run today. `E2E` needs a live PostgreSQL and is therefore
`BLOCKED_INFRASTRUCTURE` in this checkout. `BROWSER_E2E` is runnable —
Playwright is installed in the `e2e` workspace — but no authentication journey
spec exists yet.

## Data Requirements

Two tenants, three users (employee, manager, tenant admin), one platform user.
Never record a password, token or connection string in a run.

## Security Cases

Cross-client token rejection, session revocation on sign-out, lockout after
repeated failures, and no account enumeration in any authentication response.

## Negative Cases

Wrong password · unknown user · expired token · token for another client ·
revoked session · malformed Authorization header · sign-out with no cookie.

## State Transitions

`ANONYMOUS → AUTHENTICATED → REFRESHED → REVOKED`. Revoked never returns to
authenticated without a fresh sign-in.

## Integration Cases

None external. The desktop agent is a client of this area, not an integration —
its own contract cases live in `agent-desktop`.

## Browser Cases

Sign-in, expired-session recovery and sign-out are the three browser cases, and
they are now runnable: Playwright is **installed**, in the `e2e` workspace — `@playwright/test` with
two journey specs, run in CI as `browser-e2e-report` (report-only, not a gate).
`npm run test:browser`, and `npm run test:browser:install` first.

None of the three is covered by the two existing journey specs, so the dimension
stays `GAP` — the tooling is present and the tests are not, which is a
different and more actionable statement than "no tooling".

## Regression Links

`REG-008` · `REG-032` · `REG-033`
