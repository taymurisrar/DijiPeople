# QA Run — starter-plan-e2e

## Metadata

| | |
|---|---|
| Date / time | 2026-08-29T00:43Z – 02:10Z |
| Branch | `agent/starter-plan-e2e-qa` |
| Commit SHA | `eb457d9db084fa3a9369dbb4620e3da9ec4c9615` (base); production API under test was `949f461c` |
| Worktree | `D:\My Work\hrm-dijipeople\dijipeople-starter-qa` |
| Environment | **Live production.** Tenant `DijiPeople Demo` (`91ab031f-8fa2-48b9-b346-7cdf326571ef`, `TEN-000002`), subscription Starter / Active / Monthly, at `https://dijipeople-demo.ws.dijipeople.com`; platform admin at `https://admin.dijipeople.com`. Working tree dirty throughout: it holds only this run's own records, no source change. No local database was used — every observation is against the production API and its own Postgres. |
| QA agent | QA (Architect-directed), SESSION-0070 |
| Scope | The seven capabilities the **Starter** plan grants: employees, organization, leave, attendance, documents, notifications, branding. Plus the five it does not grant, probed deliberately to test entitlement enforcement. Stripe and billing were **out of scope by instruction**. |

## Requirement

Establish whether the Starter plan can be released to paying customers: whether
everything it sells works end to end, and whether it withholds what it does not
sell. There is no ExecPlan — this is an exploratory QA run against production,
not a change.

## Risk Areas

- `apps/web` had **no browser E2E coverage at all** when this run started
  (ITEM-0034; a concurrent session added the first three flows mid-run in
  `9be52564`). Every screen here was therefore unproven by any automated test.
- No prior QA run in `docs/qa/runs/` had ever targeted `dijipeople-demo` or any
  `*.ws.dijipeople.com` workspace. The 2026-08-27 pass ran against an **empty**
  tenant, so populated lists, record pages, filtering and the approval chain were
  entirely unexplored.
- Bug-pattern exposure for these modules: `self-approval`, `fail-open-scope`,
  `duplicate-route-bypass`, `search-filter-scope-overwrite`,
  `silent-degradation` (an empty list may be a failed fetch), `doc-code-drift`.
- `docs/qa/regressions/index.md`: no entry covers the tenant workspace surface.

## Scenarios

Expected behaviour written before execution. 43 findings resulted; the table
lists the scenarios, not every finding.

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| S1 | Tenant owner signs in | happy | Workspace loads | PASS | `POST /api/auth/login` 200, dashboard rendered, 0 console errors |
| S2 | Platform admin signs in and the tenant's plan is identified | happy | Starter confirmed | PASS | admin `/subscriptions`: DijiPeople Demo / Starter / Active / MONTHLY |
| S3 | Starter's entitlements are enumerable | contract | A definite list | PASS | admin plan Entitlements tab, checkbox state: 7 enabled of 12 |
| S4 | A non-entitled module is refused server-side | permission | 403 / denial | **FAIL** | `GET /api/payroll/cycles` 200, `/api/payroll/runs` 200, `/api/projects` 200; `POST /api/projects` **201** — BUG-1952 |
| S5 | Department CRUD through the UI | happy | Create, list, edit, delete | PASS with defects | created via form; BUG-1957, BUG-1958, BUG-1959, BUG-1960 |
| S6 | Department create rejects client-supplied `tenantId` | tenant | 400 | PASS | `400 VALIDATION_FAILED "property tenantId should not exist"` |
| S7 | Employee create + hierarchy integrity | happy / boundary | Create; refuse self-manager and cycles | PASS | 11 employees; self-manager 400; 2-cycle 400 |
| S8 | Employee list renders populated | UI-state | All rows, correct managers | PASS | 10 of 10 rows, correct pagination footer, no overflow at 1440px |
| S9 | Leave policy + entitlements configured | happy | Policy with per-type entitlement | PASS with defects | policy + 4 rules created; BUG-1962, ITEM-0105 |
| S10 | Leave policy assigned to employees via the UI | happy | Assignment created | **FAIL** | `leavePolicyId must be a UUID (POST /api/leave-policies/assignments)` — BUG-1961 |
| S11 | Employee submits a leave request via the UI | happy | Request created | **FAIL** | `POST /api/leave-requests` 400 `property ownerId should not exist, property status should not exist`, **no UI feedback** — BUG-1965, BUG-1966 |
| S12 | Leave request consumes entitlement | happy | Balance decremented from 20 | **FAIL** | `Insufficient leave balance` with a 20-day entitlement assigned — BUG-1967 |
| S13 | Leave approval routes to an approver | happy | Routed to line manager | **FAIL** | every chain rule must resolve; fails on both seeded rules — BUG-1968 |
| S14 | Leave request → approved, after workarounds | happy | PENDING → APPROVED | PASS | 201 PENDING, `totalDays` 3 (inclusive, correct), then APPROVED |
| S15 | Leave cancel | happy | CANCELLED | PASS | 201; but BUG-2016 (stale notification) |
| S16 | Attendance check-in on an off day | negative | Refused with a reason | PASS | button disabled, `title` explains; ITEM-0109 (tooltip-only) |
| S17 | Manual attendance entry | happy | Entry created | PASS with defects | `POST /api/attendance/manual` 201; BUG-2006 (silent success) |
| S18 | Attendance rejects a duplicate day and reversed times | boundary | 409 / 400 | PASS | `409 already exists for this employee on this date`; `400 Check-out time cannot be earlier than check-in time` |
| S19 | Attendance rejects an implausible future date | boundary | Refused | **FAIL** | `2027-06-15` accepted, 201 — BUG-2005 |
| S20 | Dashboard reflects reality on a non-working day | UI-state | Weekend not counted absent | **FAIL** | `ABSENT 11` + "Absent employees 11 — Review" on a Saturday the product itself calls an off day — BUG-2008 |
| S21 | Branding change persists and applies | happy | Saved and live | PASS | `branding.primaryColor: "#0f766e"`, `--brand-primary` updated without reload; BUG-2009 (10 raw labels) |
| S22 | Notifications fire and reach the inbox | happy | Event delivered | PASS | `leave.request.submitted.approver` delivered, bell badge 5, inbox rendered with human titles |
| S23 | Reports aggregate correctly | contract | Match seeded data | PASS | 11 employees, correct department split, 6 entries/working day for 08-23…27, 0 on Fri/Sat |
| S24 | Audit trail records state changes | contract | All state changes visible | **FAIL** | screen says 20, API says 305 (BUG-2043); employee lifecycle unaudited (BUG-2044) |
| S25 | Tenant isolation cannot be influenced by client input | tenant | Rejected | PASS | see Manual Validation |
| S26 | Every navigation destination renders | UI-state | No crash | **FAIL** | `/users` and `/approvals/new` render the error boundary — BUG-2003, BUG-2004 |
| S27 | Unauthenticated access to authenticated routes | permission | Redirect to login, no content | PASS | `/approvals` and `/employees` both 302 to `/login`; only the `next` deep-link differs — ITEM-0111 |
| S28 | Employee export / import template | contract | Round-trippable | **FAIL** | export 11 human-titled columns vs template 21 field keys — BUG-2026 |

## Automated Suites

| Command | Suite | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|
| `npm run backlog:check` | backlog records + indexes | 377 records, 0 structural errors | 0 | — | — |
| `npm run validate:framework` | framework structure | 4394 checks | 0 | — | — |
| `npm run knowledge:verify` | Obsidian vault parity | — | 114 problems | — | — |

`knowledge:verify` fails **and failed identically before this run**: all 114 are
`expected note is absent from the vault` or `vault copy differs from its
repository source`, i.e. the vault has not been synced with this unmerged
branch. Links authored here are clean (0 unresolved, 0 semantic errors). The one
`GRAPH_ORPHAN` is `docs/tasks/TASK-0024-…`, committed in `a3f4c213` before this
branch's base — another session's record, left alone.

No unit or e2e suite was run: **this run changed no source code**, so there was
nothing for them to cover. That is a deliberate scope statement, not an omission.

### Regression-test proof

Not applicable — no fix was made in this run. Every finding is filed for
triage; regression tests belong with the fixes.

## Manual Validation

Everything in Scenarios was performed by hand through the browser as the tenant
owner (`global-admin`/`system-admin` scope), with the platform admin console in a
second tab. Approximately 100 state-changing operations were executed against the
live tenant.

**Tenant isolation** was probed specifically, and held on every path tried:

```
GET   /api/employees/<own id>              -> 200
GET   /api/employees/<uuid not in tenant>  -> 404 "Employee was not found for this tenant."
GET   /api/employees?tenantId=<other>      -> 400 "property tenantId should not exist"
PATCH /api/employees/<own id> {tenantId:…} -> 400 "property tenantId should not exist"
POST  /api/departments {…, tenantId:…}     -> 400 "property tenantId should not exist"
```

**Two duplicate-route candidates were checked and cleared.**
`PATCH /employees/:id/reporting-manager` and `PATCH /employees/:id/manager` carry
identical guards and call the same service method — a deliberate alias, not an
instance of `duplicate-route-bypass`.

**Three claims were disproved during the run and corrected rather than filed.**
(a) "The approval matrix is never consulted" — it is; the defect is that every
rule must resolve. (b) React error #441 is not a client bug — it is the RSC
Flight placeholder for a server-component throw. (c) Notifications were recorded
as unexercised — they work; the first check was simply taken before any
notification-generating event had succeeded.

## Regression Checks

`docs/qa/regressions/index.md` holds no entry covering the tenant workspace, so
there was nothing to re-check. BUG-1668 (horizontal scroll at 390px) is the only
previously-open defect on this surface; it was **not** re-tested, because this run
was conducted at 1440px. BUG-1960 is a distinct 1440px table overflow and its
record says so explicitly.

| Regression ID | Scenario | Result |
|---|---|---|
| — | none applicable to `apps/web` tenant workspace | N/A |

## Bugs Found

46 bug records and 8 backlog items. Full list:

`BUG-1952` `BUG-1953` `BUG-1954` `BUG-1955` `BUG-1956` `BUG-1957` `BUG-1958`
`BUG-1959` `BUG-1960` `BUG-1961` `BUG-1962` `BUG-1963` `BUG-1964` `BUG-1965`
`BUG-1966` `BUG-1967` `BUG-1968` `BUG-1969` `BUG-1970` `BUG-1974` `BUG-1976`
`BUG-1977` `BUG-1978` `BUG-1979` `BUG-1980` `BUG-1981` `BUG-2003` `BUG-2004`
`BUG-2005` `BUG-2006` `BUG-2007` `BUG-2008` `BUG-2009` `BUG-2010` `BUG-2011`
`BUG-2012` `BUG-2013` `BUG-2014` `BUG-2015` `BUG-2016` `BUG-2017` `BUG-2026`
`BUG-2043` `BUG-2044` `BUG-2045` `BUG-2046`
`ITEM-0104` `ITEM-0105` `ITEM-0106` `ITEM-0107` `ITEM-0108` `ITEM-0109`
`ITEM-0110` `ITEM-0111`

The release-blocking subset:

| ID | Severity | Description |
|---|---|---|
| BUG-1965 | HIGH | Leave request form posts `ownerId`/`status`; every submission 400s |
| BUG-1966 | HIGH | A failed save in the runtime form is swallowed with no message |
| BUG-1967 | HIGH | Leave entitlement is never allocated to a balance; no accrual engine exists |
| BUG-1968 | HIGH | Approval routing needs every chain rule to resolve; fresh tenants satisfy none |
| BUG-1961 | HIGH | Leave policy cannot be assigned from the UI (parent id never sent) |
| BUG-1952 | HIGH | Plan entitlements gate nothing, reads and writes alike |
| BUG-2003 | HIGH | `/users` never renders for any tenant |
| BUG-2008 | HIGH | Every employee counted absent on non-working days |
| BUG-2043 | HIGH | Audit screen reports 20 records when the log holds 305 |
| BUG-2044 | HIGH | Employee-lifecycle changes are not audited anywhere |

All 54 records carry an Architect disposition; none is `TRIAGE_REQUIRED`.

## Known Limitations

This section is what makes the verdict trustworthy. What could **not** be
established here:

- **The leave self-approval elevated bypass (BUG-1970) was not reproduced.** It
  is code-confirmed only. Proving it needs a second **activated** user, and no
  user can be activated on this environment without a deliverable mailbox — every
  account created here deliberately used a non-deliverable domain to honour the
  no-email constraint. The one live self-approval observed does not prove it,
  because the matrix explicitly named the requester as approver. Close it with a
  unit test, not a live probe.
- **The leave approve/reject permission gap (BUG-2015) was not exploited.** The
  guard misconfiguration is proven from source; demonstrating escalation needs the
  same second activated user.
- **No true cross-tenant read was attempted.** The only other tenant on this
  environment has zero employees, so no foreign record existed to target. The
  isolation *contract* was tested; a genuine cross-tenant fetch was not.
- **The live value of `USE_ENTITY_DATA_API` could not be read** (the env call was
  correctly refused by the sandbox). Every checked-in config sets it `true` and the
  `/users` crash reproduces, so the conclusion holds, but confirm from the runtime
  log for digest `2951983503`.
- **`POST /api/employees/import` was never executed** — only the template it
  serves was inspected. The import path itself remains untested.
- **BUG-1668 was not re-tested**: this run was at 1440px, that defect is at 390px.
  No mobile or tablet width was exercised at all.
- **No load, concurrency or performance testing.** No migration testing.
- **Billing and Stripe were excluded by instruction.**

## Final QA Verdict

**FAIL.**

Three of the seven capabilities the Starter plan sells cannot be delivered to a
customer using the product as shipped. Leave is the decisive one: five
independent defects stack so that no employee can submit a request, and the
failure is silent in the UI. I completed a request only after disabling
`consumesBalance` and deactivating both seeded approval matrices — two changes no
customer would know to make, one of which turns off balance tracking entirely.
Separately, the plan does not withhold what it does not sell: entitlement is
unenforced on reads and writes, so a Starter tenant has Growth and Enterprise
modules for Starter money. `/users`, a primary admin entry point linked three
times from the dashboard, has never rendered for anyone.

Much of the platform is genuinely sound and should be said so: tenant isolation
held on every path probed, mass assignment is blocked, the data-integrity rules
(self-manager, reporting cycles, duplicate attendance, reversed times) are all
correct, reports aggregate accurately, and the settings architecture is well
structured. The failures are concentrated, identifiable and mostly small — four
of the ten blockers are one-line fixes. This is a **not yet**, not a rewrite.

## Follow-up

- The four highest-leverage fixes, in order: BUG-1966 (stop swallowing failed
  saves — restores diagnosability everywhere), BUG-1961/BUG-2011 (one line at
  `standard-module-data.adapter.ts:453` unblocks 7 screens and stops a silent
  orphan), the leave chain BUG-1965 + BUG-1967 + BUG-1968, and BUG-1952
  (entitlement enforcement).
- Eight records are `PRODUCT_DECISION` and need the product owner, not an
  engineer: BUG-1979/1980/1981 (is the attendance override deliberate?),
  BUG-2007 (retire-by-status or add delete?), BUG-2045 (do background jobs belong
  in a compliance audit log?), ITEM-0106, ITEM-0108, ITEM-0110.
- Promote S6, S7, S18 and S25 into durable QA scenarios — they are cheap,
  they passed, and they cover the invariants most likely to regress.
- The demo tenant is left with working demo data and a teal brand, and with two
  seeded approval matrices deactivated so that leave can be demonstrated at all.
  Restoring them re-breaks leave; the trade is documented in the session notes.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Scenarios and records this run exercised, cited in its own body:

[[BUG-1668]] · [[BUG-1952]] · [[BUG-1953]] · [[BUG-1954]] · [[BUG-1955]] · [[BUG-1956]] · [[BUG-1957]] · [[BUG-1958]] · [[BUG-1959]] · [[BUG-1960]] · [[BUG-1961]] · [[BUG-1962]] · [[BUG-1963]] · [[BUG-1964]] · [[BUG-1965]] · [[BUG-1966]] · [[BUG-1967]] · [[BUG-1968]] · [[BUG-1969]] · [[BUG-1970]] · [[BUG-1974]] · [[BUG-1976]] · [[BUG-1977]] · [[BUG-1978]] · [[BUG-1979]] · [[BUG-1980]] · [[BUG-1981]] · [[BUG-2003]] · [[BUG-2004]] · [[BUG-2005]] · [[BUG-2006]] · [[BUG-2007]] · [[BUG-2008]] · [[BUG-2009]] · [[BUG-2010]] · [[BUG-2011]] · [[BUG-2012]] · [[BUG-2013]] · [[BUG-2014]] · [[BUG-2015]] · [[BUG-2016]] · [[BUG-2017]] · [[BUG-2026]] · [[BUG-2043]] · [[BUG-2044]] · [[BUG-2045]] · [[BUG-2046]] · [[ITEM-0034]] · [[ITEM-0104]] · [[ITEM-0105]] · [[ITEM-0106]] · [[ITEM-0107]] · [[ITEM-0108]] · [[ITEM-0109]] · [[ITEM-0110]] · [[ITEM-0111]] · [[SESSION-0070]] · [[TASK-0024]]

<!-- GRAPH:END -->
