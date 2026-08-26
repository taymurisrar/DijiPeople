# QA Run — admin-prod-e2e

## Metadata

| | |
|---|---|
| Date / time | 2026-08-26T00:24:14.995Z |
| Branch | `agent/admin-prod-e2e-qa` |
| Commit SHA | `8d6be21b963ea45a43fc1a85f07ca24507e53a44` |
| Worktree | `D:\My Work\hrm-dijipeople\wt-admin-qa` |
| Environment | **Production** — `https://admin.dijipeople.com`, signed in as a `PLATFORM_OWNER`. Stripe is in test mode by the owner's instruction. Working tree dirty only with this run's own records and its one fix. |
| QA agent | qa |
| Scope | `apps/admin` as a running production system: all 63 routes, the sidebar, CRUD lifecycle on the runtime modules, accessibility, security posture, and a bounded performance probe. **Out of scope by explicit decision:** sustained load and stress against production — the owner chose a bounded read-only probe because the tenant app and landing site share the Render service. |

## Requirement

Drive the production admin console end to end and establish what actually works,
at the level of detail a release decision needs. [`PLAN-019`](../test-plans/PLAN-019-platform-admin.md)
declared this surface `GAP` on unit, API, database, integration, E2E and
security, with only browser coverage `PARTIAL` — so nearly everything here is
first coverage rather than re-verification.

No ExecPlan: this is a QA run, and the one fix it produced (BUG-1422) is a
two-function change with no schema or contract impact.

## Risk Areas

- **The shell is shared, so a defect in it is a defect everywhere.** `PLAN-019`
  says this explicitly, and BUG-0073 was exactly that shape. Two of this run's
  findings (BUG-1421, BUG-1423) are shell/shared-component defects present on
  every screen at once — found only because the audit was written against *all*
  routes rather than screen by screen.
- **Frontend gating is cosmetic by design.** Nothing here treats a hidden
  control as evidence of authorization; every authorization claim below was
  tested against the API directly.
- **The console is low-traffic and high-consequence.** Absence of complaints is
  not evidence of correctness — BUG-1419 and BUG-1420 both sat in production on
  the incident-triage screen.
- **Driving production means writing to production.** Every record created is
  listed under Manual Validation with its disposal.

## Scenarios

Expected behaviour written before execution.

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| S1 | Every declared admin route renders for a platform user | UI-state | 63/63 respond 200 and render their own heading | **PASS** | `sweep.json` — all 63 HTTP 200 |
| S2 | Every sidebar item navigates to a working screen | UI-state | 19/19 reachable, none dead | **PASS** | `sidebar.json` — 19 items, all 200 |
| S3 | Incident rows on `/settings/monitoring` open the incident | happy | HTTP 200 detail view | **FAIL** | 25/25 return HTTP 404 → [[BUG-1419]] |
| S4 | Severity filter finds the incidents that exist | happy | filtering ERROR returns the error incidents | **FAIL** | 0 of 14 shown → [[BUG-1420]] |
| S5 | A customer can be created, edited, assigned and deleted | happy | full lifecycle succeeds | **PASS** | created `b509c56d`, renamed, verified, deleted 200 |
| S6 | An edit answering 2xx actually persists | contract | read-back matches | **PASS** | see Manual Validation — first attempt was a harness error |
| S7 | Forged system fields on create are refused | permission | `id`/`tenantId`/`createdAt`/`createdById`/`stripeCustomerId`/`isDemoData` rejected | **PASS** | HTTP 400, `property id should not exist, …` |
| S8 | Unauthenticated callers cannot read platform data | permission | 401 on every platform API | **PASS** | 6/6 endpoints HTTP 401 |
| S9 | Unauthenticated page loads do not leak content | permission | redirect to `/login`, no shell rendered | **PASS** | 4/4 → `/login?next=…`, no content |
| S10 | Session cookies are hardened | security | httpOnly + secure + SameSite≠None | **PASS** | 4/4 auth cookies pass; only the theme cookie is readable, correctly |
| S11 | Sign-in does not enumerate accounts | security | identical response for known and unknown email | **PASS** | byte-identical `Invalid admin credentials.` |
| S12 | Standard security headers are served | security | HSTS, nosniff, frame-options, referrer-policy, CSP | **FAIL** | 4/5 present, CSP absent → [[BUG-1424]] |
| S13 | A currency code must be a currency | boundary | non-currency rejected | **FAIL** | `"5"` accepted and stored → [[BUG-1425]] |
| S14 | Runtime forms have labelled controls | UI-state | zero axe `label` violations | **FAIL** | 28 unlabelled controls → [[BUG-1423]] |
| S15 | Each screen is identifiable to assistive tech | UI-state | one `main`, one `h1`, distinct `title` | **FAIL** | 47–48 of 48 routes fail each → [[BUG-1421]] |
| S16 | A rejected form value tells the user which field | contract | `errors: [{field, message}]` | **FAIL → FIXED** | was `"Bad Request Exception"` → [[BUG-1422]], fixed here |
| S17 | The API holds up under modest concurrency | performance | no collapse at 8 concurrent | **PASS** | 1.4× degradation at n=8 (476ms → 690ms) |
| S18 | A read-only role cannot write | permission | every write refused | **PASS** | `READ_ONLY_AUDITOR` refused 403 on 5/5 writes |
| S19 | A read-only role cannot escalate its own privilege | permission | cannot mint a `PLATFORM_OWNER` | **PASS** | HTTP 403 |
| S20 | A read-only role cannot delete its own account | permission | refused | **PASS** | HTTP 403 |

## Automated Suites

| Command | Suite | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|
| `npx jest` (from `services/api`) | API unit | 1800 | 0 | 0 | 44.2s |
| `npm --workspace api run check-types` | tsc `--noEmit` | clean | 0 | — | — |
| `npx eslint --fix` + `prettier --write` | changed files only | clean (0 errors, warnings pre-existing) | 0 | — | — |
| Browser harness, 27 scripts | production E2E | see Scenarios | — | — | ~50 min |

An earlier invocation of `jest --rootDir services/api` from the repo root
reported 8 failures. Those were an artifact of that invocation — the specs
resolve fixtures via `process.cwd()/../..`, which pointed at `D:\My Work\`. Run
from `services/api`, all 226 suites pass. Recorded because a run report that
quietly drops a failure it decided was spurious is not a run report.

### Regression-test proof

| Test | With fix | Without fix (mutated) |
|---|---|---|
| `platform-runtime.validate-contract.spec.ts` › names every field that failed | PASS | **FAIL** |
| `platform-runtime.validate-contract.spec.ts` › never hands the operator the exception class name | PASS | **FAIL** |
| `…` › answers for a non-validation failure | PASS | PASS (guards a different path) |
| `…` › answers for a non-Error throw | PASS | PASS (guards a different path) |

Mutation performed by restoring both halves of the original behaviour — `errors`
hard-coded to `[]` and `message` read from `error.message`. 2 of 4 cases fail,
and pass again on restore.

**The first draft of this spec was not a regression test.** It asserted the
*source text* of `platform-runtime.service.ts` and killed the mutant only through
a string match — it would have passed against any rewrite that kept the same
words. It was replaced by extracting `readValidationFailure` so the contract
could be executed instead of grepped.

## Manual Validation

Everything below was driven against production through a scripted Chromium
session, not by reading code.

**Records created, and their disposal:**

| Record | Id | Disposal |
|---|---|---|
| Customer | `ce1fb5a3-e28a-42dc-93fa-3bf9552414cf` | DELETE 200 — gone |
| Customer | `b509c56d-8f64-4420-b5b2-66c9508442f5` | DELETE 200 — gone |
| Customer (mass-assign probe) | — | never created; refused 400 |
| Partner | `a0016c2d-62ea-47d3-bcb2-9cbeb342e501` | DELETE 200 — gone |
| Platform user (`READ_ONLY_AUDITOR`) | `c4702875-e5c1-4b44-a553-c5f5dd83d3f3` | DELETE 200 — gone |
| Platform user (`READ_ONLY_AUDITOR`) | `070fc1c6-1b40-4677-b4b9-dd79d9e73ce8` | DELETE 200 — gone |
| Plan | `221cf0ed-b038-4186-af26-5847e4674af6` | **still present**, see below |

Final sweep across leads, customers, partners, support-cases and contracts
returns no record carrying the run's `QA0059` tag.

**The plan could not be deleted.** There is no `@Delete('plans/:planId')` route —
only `@Delete('plans/:planId/prices/:priceId')` — so `DELETE` answers 405. It was
neutralised instead: `isActive: false`, zero `PlanPrice` rows, therefore not
sellable and not quotable. It remains as a row named `QA00591` and needs removing
by whoever has database access. This is called out to the owner rather than
buried here.

**Three findings were retracted before they were filed.** Each looked real and
each was my harness, not the product. They are recorded because a run that only
lists what survived gives no sense of how much did not:

1. *"No runtime module can create a record."* The combobox handling clicked the
   first `button` inside each field wrapper regardless of what it was, and
   skipped controls that already held a value. Customers, partners and plans all
   create correctly.
2. *"The API serialises concurrent requests"* — a clean linear ladder, 1.0× /
   2.0× / 4.3× / 6.1× / 9.4× at n=1…8 over HTTP/2, which is a textbook
   serialization signature. It was the browser coalescing identical in-flight
   requests. At n=8 against the same endpoint: identical URL 4216ms, distinct URL
   667ms. The server degrades 1.4×, which is healthy.
3. *"An edit returns 200 without persisting."* The runtime controller takes
   `{ values: {…} }`; the probe sent a flat body, so `values` was undefined and
   the PATCH correctly changed nothing. With the documented shape the edit
   persists.

The same wrong body shape also invalidated the first mass-assignment result — it
returned 400 for missing fields, not for refusing the forged ones. Re-run
correctly, the refusal is explicit and complete.

**Authorization, tested from below.** The most privileged session cannot
demonstrate that a lesser one is constrained, so a `READ_ONLY_AUDITOR` was
created — a role whose grant list is entirely `.read` — signed in, and driven
against the same endpoints in its own browser context.

It could read tenants, customers, leads and contracts. It was refused **403** on
every write attempted: creating a lead, a customer and a partner; **creating a
`PLATFORM_OWNER`**, which is the privilege-escalation case; and deleting its own
account. It could write its own view preferences, which is correct — those are
the user's own.

One result needed chasing and turned out to be the test's fault. Reading
partners answered **400**, not 200, on a permission the role holds. It answers
400 for `PLATFORM_OWNER` too: `PartnerQueryDto` sets `@Min(10)` on `pageSize`
and the probe passed 5. The `/partners` screen renders correctly for the
auditor. Nothing role-related, and worth recording because a 400 where 200 was
expected reads as an authorization defect until it is checked.

That 400 is also the clearest illustration of what [[BUG-1422]] cost. Through the
ordinary API path the error contract is exemplary — `traceId`, `errorCode:
VALIDATION_FAILED`, and `details.fields: [{ field: "pageSize", message: "pageSize
must not be less than 10" }]`. The `/validate` endpoint had all of that available
and threw it away.

Both auditor accounts were deleted, HTTP 200.

**Login.** Three consecutive early attempts produced *no network request at
all* — no error, no feedback — then three consecutive attempts succeeded. Not
reproducible on demand across the rest of the run (roughly 30 further sign-ins,
all clean). Recorded under Follow-up rather than filed, because a defect nobody
can reproduce is a rumour.

## Regression Checks

| Regression ID | Scenario | Result |
|---|---|---|
| REG-068 | Platform admin surface regressions | Not re-run — no code in scope changed |
| REG-261 | Runtime validation names the failing field | **Added by this run**, mutation-tested |

BUG-0073 (sidebar contrast, shell-wide) is the ancestor of BUG-1421 and
BUG-1423 — same class, same component family, found the same way. The contrast
violations this run found (19 nodes, 5 routes) are new instances in the runtime
form placeholders, not a recurrence of BUG-0073's sidebar class.

## Bugs Found

| ID | Severity | Description | Bug pattern | Regression test added |
|---|---|---|---|---|
| [[BUG-1419]] | HIGH | All 25 incident links on `/settings/monitoring` 404; prefetch storm makes it the slowest screen in the app (~25–31s vs ~4s) | `doc-code-drift` — a spec argues for protecting a route that never existed | No — needs triage first |
| [[BUG-1420]] | HIGH | 1466 of 1471 incidents store `severity` lowercase; the filter compares strictly against uppercase, so ERROR shows 0 of 14 | unconstrained string column | No — needs an ExecPlan (production backfill) |
| [[BUG-1421]] | MEDIUM | Shell: one `<title>` for 47 of 48 routes, two `<main>`, two `<h1>`, sidebar in no landmark, no skip link | shared-shell defect | No — needs triage |
| [[BUG-1422]] | HIGH | Runtime validation answered `"Bad Request Exception"` with no field detail, while the client was already reading `errors` | contract half-implemented | **Yes — REG-261, mutation-tested** |
| [[BUG-1423]] | HIGH | 28 form controls with no accessible name across four create screens | shared-component defect | No — needs triage |
| [[BUG-1424]] | MEDIUM | No `Content-Security-Policy` on the highest-blast-radius surface | missing defence in depth | No — needs triage |
| [[BUG-1425]] | MEDIUM | `currencyCode` validated by `MaxLength(3)` only; `"5"` accepted and stored | shape mistaken for validation | No — needs triage |

## Known Limitations

- **Load and stress against production were deliberately not run.** The owner
  chose a bounded read-only probe (≤8 concurrent, GET only, short bursts). So
  this run says nothing about behaviour under sustained or write load, at
  concurrency above 8, or about Neon autoscaling under pressure. The 1.4×
  figure at n=8 is a floor, not a capacity statement.
- **Two of fifteen platform roles were exercised** — `PLATFORM_OWNER`
  (`platform.*`) and `READ_ONLY_AUDITOR` (only `.read` grants). The thirteen
  between them are untested: `PLATFORM_ADMIN`, `PLATFORM_OPERATIONS`,
  `PRESALES_MANAGER`, `PRESALES_USER`, `PARTNER_MANAGER`, `CONTRACT_MANAGER`,
  `LEGAL_REVIEWER`, `FINANCE_MANAGER`, `BILLING_USER`, `SUPPORT_MANAGER`,
  `SUPPORT_AGENT`, `MONITORING_OPERATOR` and `MEMBER`. Testing the two extremes
  shows the mechanism works; it does not show that each middle role's grant list
  is correct, which is a different question and the one most likely to hold a
  defect.
- **No tenant-side or cross-tenant testing.** Admin legitimately reads across
  tenants; proving isolation needs a tenant-user session, which this run did not
  have.
- **Stripe stayed in test mode** by instruction, so no billing flow was driven
  to a real charge.
- **Email delivery was not verified.** Flows that send were driven only up to
  the send.
- **`/settings/monitoring` timings are contaminated by BUG-1419.** Its 25–31s is
  the defect, not a baseline; re-measure after the fix.
- The interactive browser MCP blocks the three authenticated production hosts by
  design (`.mcp.json`, added in c4035dbb). That guardrail was **not** modified;
  the run used its own scripted Chromium instead.

## Final QA Verdict

**PASS WITH RISKS.**

The console works. All 63 routes render, all 19 sidebar items resolve, the full
CRUD lifecycle succeeds, and the security posture is genuinely good where it was
tested: authentication is enforced on every endpoint probed, cookies are
hardened, sign-in does not enumerate accounts, mass assignment is refused
explicitly, and the API holds up under modest concurrency.

The risks are these. Two HIGH defects sit on the incident-triage screen — the one
place an operator goes when something is already wrong — and both fail silently:
a dead link that looks like a working link, and a filter that answers confidently
and wrongly. Two more HIGH defects make the metadata-driven forms hard to use and
impossible to use with a screen reader; the runtime is the documented default for
new modules, so both compound with every module added. None is a data-loss or
data-exposure defect, and none blocks the console's core operation.

The verdict is not PASS because BUG-1420 means severity-based triage on this
surface cannot currently be trusted at all, and that is not a cosmetic condition.

## Follow-up

1. **Remove the leftover plan** `221cf0ed-b038-4186-af26-5847e4674af6` — needs
   database access; no delete route exists. Owner action.
2. **Triage BUG-1419 through BUG-1425.** BUG-1420 needs an ExecPlan; the rest
   are contained changes.
3. **Test the thirteen middle platform roles.** The two extremes now have
   evidence and the mechanism is sound. What is untested is whether each
   intermediate role's grant list matches what that role should actually reach —
   e.g. whether `SUPPORT_AGENT` can reach billing, or `PRESALES_USER` can reach
   contracts. That is where an over-permissive grant would hide.
4. **Characterise the dead sign-in button.** A loop of cold-start sign-ins with
   full network capture would settle whether it is a hydration race or an
   artifact. Do not file until reproduced.
5. **Check CSP on `apps/web` and `apps/landing`** — very likely absent there
   too, but measure rather than assume.
6. **Consider the incident queue's signal-to-noise.** 1471 incidents, all status
   `NEW`, dominated by internet scanners probing `/settings.php`, `/config.php`,
   `/phpinfo`. Nothing is triaged, which is its own reason the two defects above
   went unnoticed. Not filed as a bug — it is a product decision about what
   belongs in that queue.
