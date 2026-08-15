# Browser E2E

> **Status: infrastructure exists and runs; not a required CI gate yet.**
> Promotion criteria are in [Promotion](#promotion-to-the-required-gate).

Until this suite existed, this repository had **no browser tooling of any
kind** — no Playwright, no Cypress, no Puppeteer, and `apps/web` / `apps/admin`
jest running in a node environment with no jsdom. `BROWSER_E2E =
BLOCKED_INFRASTRUCTURE` appeared in the Known Limitations of every QA run, and
it was load-bearing: every UI finding this repository has produced was read from
code, never observed in a browser, so no UI defect could be *proven* fixed.
Tracked as [`ITEM-0001`](../backlog/items/ITEM-0001-no-browser-e2e-tooling-exists.md).

---

## The decision

**Playwright**, in its own `e2e` workspace.

| Question | Answer | Why |
|---|---|---|
| Which tool | Playwright | Multi-origin in one context — the primary journey starts on landing (`:3000`) and finishes in admin (`:3002`). Cypress's per-origin model fights that. Traces and video on failure come free. |
| Where it lives | `e2e/`, a workspace of its own | The journeys span three apps. A suite inside `apps/admin` would be misfiled for half its scenarios or duplicated. |
| Which apps first | landing + admin | They carry the commercial journey, which is the product's most important flow and the one with the most open records against it. |
| CI mode | **Report-only** | See below. |
| Test data | A disposable local/CI PostgreSQL, seeded, plus per-run unique identifiers | Never a developer's working database — `scripts/assert-test-database.mjs` refuses one, and the suite re-checks independently because it can be pointed elsewhere by an env var. |

### Why report-only, and not required

The database e2e job is already report-only for a stated reason: a gate that is
red on arrival for environmental reasons trains people to ignore CI, which is
the exact failure the pipeline exists to prevent. A browser suite has strictly
more environmental surface than that job — three servers, a database, browser
binaries and a real login — so requiring it on day one would be a worse version
of the same mistake.

It runs in full on every push, its report is uploaded, and nothing in it is
skipped or weakened.

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

# 3. The three servers.
npm run dev:api      # :4000
npm run dev:landing  # :3000
npm run dev:admin    # :3002

# 4. Browser binaries, once.
npm run test:browser:install
```

Then:

```bash
export E2E_PLATFORM_ADMIN_EMAIL="$PLATFORM_SUPER_ADMIN_EMAIL"
export E2E_PLATFORM_ADMIN_PASSWORD="$PLATFORM_SUPER_ADMIN_PASSWORD"
export E2E_DATABASE_URL="$DATABASE_URL"
npm run test:browser
npm --workspace e2e run test:e2e:report   # HTML report, traces, screenshots
```

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

## Promotion to the required gate

Move `browser-e2e-report` into `ci-required` when **all** hold:

1. The suite passes three consecutive runs on `main` with zero retries used.
2. Total runtime stays under ~8 minutes.
3. Server startup in CI is deterministic — no sleep-and-hope waits.
4. Any scenario that is environment-dependent is quarantined **by name**, with
   the reason recorded in `docs/qa/`.

Until then it reports and does not block. Recorded in
[`ci-recommendation.md`](ci-recommendation.md).
