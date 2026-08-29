# Browser E2E

> **Status: infrastructure exists and runs; named by the required aggregate,
> but still fail-open through job-level `continue-on-error: true`.**
> Closure criteria are in [Required-gate status](#required-gate-status).

Until this suite existed, this repository had **no browser tooling of any
kind** — no Playwright, no Cypress, no Puppeteer, and `apps/web` / `apps/admin`
jest running in a node environment with no jsdom. `BROWSER_E2E =
BLOCKED_INFRASTRUCTURE` appeared in the Known Limitations of every QA run, and
it was load-bearing: every UI finding this repository has produced was read from
code, never observed in a browser, so no UI defect could be *proven* fixed.
Tracked as [`ITEM-0001`](../backlog/items/ITEM-0001-no-browser-e2e-tooling-exists.md).

**This document covers the scripted suite.** For an agent driving a browser
interactively — navigating, clicking and judging a screen a step at a time —
see [`browser-control.md`](browser-control.md). Same engine, same Chromium
install, same prerequisites; different job. This one produces a pass or a fail
in CI. That one produces a judgement, and is not repeatable — a behaviour worth
protecting ends up back here as a spec.

---

## The decision

**Playwright**, in its own `e2e` workspace.

| Question | Answer | Why |
|---|---|---|
| Which tool | Playwright | Multi-origin in one context — the primary journey starts on landing (`:3000`) and finishes in admin (`:3002`). Cypress's per-origin model fights that. Traces and video on failure come free. |
| Where it lives | `e2e/`, a workspace of its own | The journeys span three apps. A suite inside `apps/admin` would be misfiled for half its scenarios or duplicated. |
| Which apps first | landing + admin | They carry the commercial journey, which is the product's most important flow and the one with the most open records against it. |
| CI mode | **Fail-open required-list dependency** | It appears in `ci-required.needs`, but job-level `continue-on-error` prevents a failing browser step from blocking the aggregate. |
| Test data | A disposable local/CI PostgreSQL, seeded, plus per-run unique identifiers | Never a developer's working database — `scripts/assert-test-database.mjs` refuses one, and the suite re-checks independently because it can be pointed elsewhere by an env var. |

### Current gate contradiction

The job was added to `ci-required.needs` after its original promotion criteria
were met, but `continue-on-error: true` was left on the job. GitHub therefore
reports the dependency as successful even when its test step fails. The latest
audited execution ran 8 tests and skipped one named BUG-0019 reachability
assertion. [[BUG-0049]] tracks both the fail-open policy and the misleading
aggregate signal.

It runs on every push and uploads its report. The artifact and test summary,
not the aggregate conclusion alone, are the current evidence source.

---

## Running it locally

Four prerequisites. The suite probes all of them and **skips with a named
reason** if any is missing — it never fails as though the product were broken,
and never passes as though it had run.

```bash
# 1. A disposable database, migrated and seeded.
#    Note the name: assert-test-database.mjs requires a test marker.
export DATABASE_URL="postgresql://<user>:<pw>@localhost:5432/dijipeople_test"
node scripts/assert-test-database.mjs
npm --workspace api run prisma:migrate:deploy
npm --workspace api run seed:config
npm --workspace api run seed:demo

# 2. A platform super admin. Credentials come from the environment and are
#    never committed — the suite has no fallback password by design.
export PLATFORM_SUPER_ADMIN_EMAIL="e2e-admin@dijipeople.test"
export PLATFORM_SUPER_ADMIN_PASSWORD="<a local-only password, 12+ chars>"
npm --workspace api run seed:admin

# 3. The four servers. `dev:web` joined on 2026-08-29 (ITEM-0034) — until then
#    port 3001 was never started, so apps/web could not be reached by a test
#    even though playwright.config.ts had defined a base URL for it.
npm run dev:api      # :4000
npm run dev:landing  # :3000
npm run dev:web      # :3001  — the tenant product
npm run dev:admin    # :3002

# 4. Browser binaries, once.
npm run test:browser:install
```

Then:

```bash
export E2E_PLATFORM_ADMIN_EMAIL="$PLATFORM_SUPER_ADMIN_EMAIL"
export E2E_PLATFORM_ADMIN_PASSWORD="$PLATFORM_SUPER_ADMIN_PASSWORD"
export E2E_DATABASE_URL="$DATABASE_URL"

# The tenant product needs a tenant user. Flows H, I and J skip with a named
# message without these rather than failing — a missing environment must never
# look like a product defect.
#
# Deliberately NOT a platform admin and preferably not a tenant owner: a browser
# flow signed in as a privileged user asserts what the privileged path renders
# and hides exactly the authorization defects this product most needs caught.
export E2E_TENANT_USER_EMAIL="<a seeded tenant user>"
export E2E_TENANT_USER_PASSWORD="<their password>"
export E2E_TENANT_SLUG="dijipeople-demo"   # optional; newest ACTIVE tenant otherwise

npm run test:browser
npm --workspace e2e run test:e2e:report   # HTML report, traces, screenshots
```

### Running it twice in ten minutes

`PublicRateLimitGuard` allows **20 POSTs per 10-minute window, per client IP and
path** (`services/api/src/common/guards/public-rate-limit.guard.ts`). A full run
of flows H, I and J spends five of those on `/api/auth/login` — three in Flow H,
which signs in for real because it is the flow *about* signing in, and one each
in Flows I and J, which sign in once and share a page.

Four consecutive runs therefore exhaust the budget, and the symptom is
misleading: tests that passed a moment ago fail on a `/login` URL that never
changes, which reads exactly like a broken sign-in and is not one. The API log
is where the truth is:

```
{"path":"/api/auth/login","statusCode":429,"errorCode":"RATE_LIMIT_EXCEEDED"}
```

**Check the lockout counters before concluding anything**, because the two look
identical from the browser and have different fixes:

```sql
select "failedLoginAttempts", "lockedUntil" from "User"     where email = '...';
select "failedLoginAttempts", "lockedUntil" from "Identity" where email = '...';
```

Zero on both means it is the rate limit, not a locked account. Restarting the
API clears the window, which is held in memory.

**The throttle is not the problem.** A login endpoint that did not throttle would
be the finding. This is recorded so the next person spends a minute on it rather
than an hour.

### Pointing it at another environment

```bash
E2E_LANDING_URL=https://staging-landing.example \
E2E_ADMIN_URL=https://staging-admin.example \
E2E_API_URL=https://staging-api.example \
npm run test:browser
```

**The database assertions self-disable** unless `E2E_DATABASE_URL` names a
demonstrably disposable local database. That is deliberate and fails closed:
pointing the suite at staging gives up the database half rather than reading a
shared database. **Never run it against production** — the journeys create real
leads, partners and tenants.

---

## What the suite covers

| Spec | Journey |
|---|---|
| `tests/flow-a-commercial-onboarding.spec.ts` | Landing request-demo → Lead → admin sign-in → lead list → lead record → tenant operations surface |
| `tests/flow-b-partner-journey.spec.ts` | Landing partner inquiry → dedup on resubmission → admin partner surfaces → inquiry reachability |
| `tests/flow-c-landing-public-surface.spec.ts` | The public marketing surface, anonymous |
| `tests/flow-d-provisioning-operations.spec.ts` | The provisioning queue in admin |
| `tests/flow-e-accessibility-and-layout.spec.ts` | Accessibility and layout across landing and admin |
| `tests/flow-f-public-seo.spec.ts` | The public SEO contract |
| `tests/flow-g-admin-tenant-list.spec.ts` | The admin tenant list |
| `tests/flow-h-tenant-sign-in.spec.ts` | **apps/web** — tenant login, the workspace picker, the authenticated shell |
| `tests/flow-i-growth-modules.spec.ts` | **apps/web** — every module the Growth plan entitles, plus tenant isolation observed from the browser |
| `tests/flow-j-tenant-settings.spec.ts` | **apps/web** — settings, and the Growth entitlements that live inside it |
| `tests/landing-*.spec.ts` | Landing checkout, public forms, public surface |

### The tenant product, and why this slice

`apps/web` had **no browser coverage at all** until 2026-08-29 (ITEM-0034), and
uniquely no other way to get any: its `jest.config.js` is
`testEnvironment: node` with no jsdom, so nothing in it can be tested through a
DOM by any other mechanism. 254 pages, 207 client components, never rendered by
a test.

**The slice is the Growth plan's entitlements**, chosen by the repository owner
on 2026-08-29. The reason it is a good boundary is that it is *checkable* rather
than a judgement about importance — `plans.catalog.ts` states exactly what
Growth grants:

```
employees · organization · leave · attendance · timesheets
projects · recruitment · onboarding · documents · notifications · branding
```

**Payroll is not in it**, and that matters: an earlier draft of Flow I had a
payslip journey, which is a screen no Growth tenant can open. It would have
asserted an empty state or a 403 and reported it as coverage. Reading the
catalog removed a test that proved nothing.

Three of the eleven — `organization`, `notifications`, `branding` — have no
top-level route and live in settings, which is Flow J. The fourth,
`documents`, is reached from an employee record and is **not covered by this
slice**; that is stated in Flow J's header so a reader counting entitlements
against tests finds the answer rather than assuming an oversight.

### What it deliberately does not fake

Two steps in the commercial journey cannot be completed by a browser today:

- **Contract signature.** Signing is an external surface. The journey stops at a
  prepared agreement rather than issuing an API call dressed up as a click.
- **Partner inquiry / onboarding review screens.** They have no inbound link
  anywhere in the admin app — [`BUG-0019`](../bugs/BUG-0019-partner-inquiry-and-onboarding-review-screens-are-unreachable.md).
  Navigating to them by typed URL would hide the very defect, so `B4` navigates
  the way a reviewer would and records where it lands.

Every other mutation goes through the UI. The database is read **only** to
verify what the UI produced.

---

## Selector policy

- Prefer `getByRole` and `getByLabel`. The landing forms wrap their inputs in
  `<label>`, and the admin login form uses `htmlFor`/`id`, so both are
  addressable by accessible name.
- **Never select on a Tailwind class.** They change on every restyle, and a
  selector on them reports a styling change as a functional failure.
- Add `data-testid` only where no accessible name exists — and prefer fixing the
  missing label, since an unlabelled control is an accessibility defect the
  repository's own frontend rules already forbid.

## Retries

One retry in CI, none locally. The justification is narrow: CI runners contend
for I/O against a database container and a cold Next.js first paint can exceed a
default timeout. It does **not** cover a flaky product — a test that only passes
on retry is a defect to investigate, and `retry #1` is visible in the report so
it cannot hide.

---

## Required-gate status

The original promotion criteria were:

1. The suite passes three consecutive runs on `main` with zero retries used.
2. Total runtime stays under ~8 minutes.
3. Server startup in CI is deterministic — no sleep-and-hope waits.
4. Any scenario that is environment-dependent is quarantined **by name**, with
   the reason recorded in `docs/qa/`.

The job is now named `browser-e2e` and is already in `ci-required`. Promotion is
not complete until `continue-on-error` is removed and the stale BUG-0019 skip is
restored to an executed assertion. Until then a green aggregate is not a
browser-pass verdict. Recorded in [`ci-recommendation.md`](ci-recommendation.md)
and [[BUG-0049]].
