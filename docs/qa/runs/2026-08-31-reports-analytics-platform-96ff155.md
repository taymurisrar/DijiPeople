# QA Run — reports-analytics-platform

## Metadata

| | |
|---|---|
| Date / time | 2026-08-31T01:53:10.266Z |
| Branch | `agent/reports-analytics-platform` |
| Commit SHA | `96ff155fc258940692f860a6067e1f0b5e11b4ce` |
| Worktree | `D:\My Work\hrm-dijipeople\dijipeople-reports` |
| Environment | Working tree clean. Real PostgreSQL 18 (`dijipeople_reports_test`, full 225-migration history + `seed-config`/`seed-admin`/`seed-demo`), API on :4100, web on :3101, real `npm ci` (not the junctioned node_modules). No external services exercised: no email sent, no Stripe, no gateway. |
| QA agent | qa |
| Scope | Covered: the reporting engine end to end against a real database, every route in `/reporting`, all thirteen workspace pages in a real browser at three viewport widths, the legacy `/reports/*-summary` re-point, tenant isolation, and the migration against a fresh database. Not covered: scheduled email delivery against a live provider, exports at scale, and the deployed environment (that is post-deploy validation, WP-15). |

## Requirement

Deliver Reports & Analytics as a reporting platform rather than a second
dashboard: a semantic layer over the domain schema, one authoritative definition
per business metric, a query engine that composes tenant, row and field
security, and a workspace with analytics surfaces, a standard report library, a
custom report builder, saved views, exports and scheduled delivery. Plan:
[`EXECPLAN-0030`](../../plans/EXECPLAN-0030-enterprise-reports-and-analytics-platform.md).

## Risk Areas

Ranked, and drawn from the records rather than invented — the full list is in
[`PLAN-034`](../test-plans/PLAN-034-reports.md).

1. **Cross-tenant or cross-scope leakage through a dynamic query surface.** A
   reporting engine that turns client input into database queries is the exact
   shape that leaks.
2. **The row-scope defect being replaced** (`BUG-2624`): the old endpoints
   filtered on `tenantId` alone.
3. **A scheduled report delivering data its recipient may not see.**
4. **Field-level security bypassed on an export or a replayed definition.**
5. **`BUG-2623`** — `buildScopedAccessWhere` emits a predicate on a column
   `Employee` does not have.
6. **Metric correctness that looks plausible and is wrong** — averaging a per-row
   percentage, counting soft-deleted employees (`BUG-2625`), including `PENDING`
   attendance days in a denominator.
7. **Presentation misstating a true number** — `BUG-2043`, `BUG-2010`,
   `BUG-2148`, `BUG-2149`.

Bug patterns consulted: [`doc-code-drift`](../known-bug-patterns/doc-code-drift.md).

## Scenarios

Expected behaviour written before execution.

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| S1 | Tenant A's engine query counts only tenant A employees | tenant | 3 for A, 1 for B, with different counts so a leak shows as a wrong number | PASS | `reporting-tenant-isolation.e2e-spec.ts`, real PostgreSQL |
| S2 | No row of tenant B appears in a tenant-A result set | tenant | every row carries A's tenantId | PASS | same spec |
| S3 | Every produced `where` carries an explicit tenant predicate from the token | tenant | A's id present, B's absent | PASS | same spec |
| S4 | A caller with no access to the source entity fails closed | permission | poison-pill id, count 0, not an empty predicate | PASS | same spec |
| S5 | A report definition cannot be read across tenants | tenant | `findFirst` with B's tenantId returns null | PASS | same spec |
| S6 | Deleting a tenant removes its reporting rows | migration | definitions and runs cascade to 0 | PASS | same spec |
| S7 | Row scope at every access level produces the right `where` | permission | BU/ORG/PARENT_CHILD/SELF each narrow; NONE poisons; none returns `{}` | PASS | `scope.resolver.spec.ts` (11 tests) |
| S8 | The `ownerTeamId` predicate `Employee` has no column for is dropped, not crashed on | permission | dropped inside the OR, three real ownership terms survive | PASS | `scope.resolver.spec.ts` |
| S9 | Headcount matches the database and excludes soft-deleted employees | happy | 15, and department breakdown sums to 15 | PASS | live API: 15; breakdown HR 9 + Eng 4 + Fin 2 |
| S10 | A standard report returns rows with relation-backed columns resolved | happy | 15 rows, 12 columns including department, designation, business unit, manager | PASS | live API `std:workforce.directory` |
| S11 | A CSV export downloads with a BOM, label headers and tenant-formatted dates | contract | `01/01/2025`, never ISO; BOM present; 7-day expiry | PASS | live download, `employee-directory-2026-08-31.csv` |
| S12 | Every workspace page renders with no console error and no failed request | UI-state | 13 pages clean | PASS | browser run, 0 problems |
| S13 | No horizontal overflow at 1920, 1280 and 1024 | UI-state | false at each | PASS | browser run |
| S14 | Period, comparison and filters are URL state | UI-state | `?preset=year_to_date&compare=previous_year` renders a different period | PASS | browser run |
| S15 | An as-of-now metric resolves `$NOW` | boundary | Leave Analytics renders content, not an error | FAIL → PASS | see Bugs Found |
| S16 | Server and client render the same text | UI-state | no hydration mismatch | FAIL → PASS | see Bugs Found |
| S17 | Migration applies to a genuinely fresh database | migration | all 225 migrations, 7 tables, 38 indexes | PASS | `dijipeople_reports_fresh` |
| S18 | New permissions reach an existing tenant without reseeding | permission | desktop metrics visible to HR after re-login | PASS | live API catalog, 6+3 metrics |

## Automated Suites

| Command | Suite | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|
| `npm --workspace api run test` | API unit + invariants | 6322 | 0 | 0 | 58s |
| `npm --workspace web run test` | Web pure-logic | 1511 | 0 | 0 | 9s |
| `npm --workspace api run test:e2e` (reporting isolation) | DB-backed isolation | 7 | 0 | 0 | 5s |
| `npm --workspace api run check-types` | API typecheck | — | 0 | — | — |
| `npm --workspace web run check-types` | Web typecheck | — | 0 | — | — |
| `npx eslint "{src,test}/**/*.ts" --max-warnings=789` | API lint ratchet | 0 errors, 781 warnings | 0 | — | — |
| `npx eslint` (apps/web) | Web lint | 0 errors, 27 warnings | 0 | — | — |
| `npm run validate:framework` | Framework | 4836 checks | 0 | — | — |
| `npm run prisma:migrate:deploy` (fresh DB) | Migration | 225 applied | 0 | — | — |

### Regression-test proof

| Test | With fix | Without fix (stashed) |
|---|---|---|
| `scope.resolver.spec.ts` › "keeps the business-unit term for a source that does not name the column" | PASS | FAIL — returns the poison pill, every sub-tenant reader sees zero rows |
| `filter.model.spec.ts` › "accepts a Date instance" | PASS | FAIL — throws "expects a date" |

Both were written against the observed failure, not after it was fixed.

## Manual Validation

Driven in a real Chromium via Playwright against the local stack, because the
MCP browser's allowlist covers production hosts only. Thirteen pages visited,
each screenshotted full-page, with console errors, failed requests and 4xx/5xx
API responses collected per page, then three viewport widths re-checked for
horizontal overflow.

Reading the screenshots — not only the pass/fail counters — is what found the
hydration defect, and is the reason this run has a Bugs Found section at all.

Verified by hand on the live API with a real token: the catalog filters sources
by access, headcount and its breakdown match the database, a standard report
returns real rows, and a CSV export downloads and opens with the right headers.

## Regression Checks

No `REG-nnn` entry currently covers the reporting modules — this is the first QA
run for the area. Two are recommended below.

| Regression ID | Scenario | Result |
|---|---|---|
| — | none registered for this area yet | N/A |

## Bugs Found

Six defects. Four were in code written earlier in this same task and are fixed
here; two are in code this task replaces and are recorded as durable records.

| ID | Severity | Description | Bug pattern | Regression test added |
|---|---|---|---|---|
| [[BUG-2624]] | HIGH | The legacy `/reports` endpoints returned tenant-wide aggregates regardless of the caller's row scope | authorization-missing | e2e + `scope.resolver.spec.ts` |
| [[BUG-2625]] | MEDIUM | Legacy headcount counted soft-deleted employees and disagreed with the Employees screen | — | source `baseWhere` |
| [[BUG-2623]] | HIGH | `buildScopedAccessWhere` emits `ownerTeamId` against `Employee`, which has no such column | — | `scope.resolver.spec.ts` (contained in reporting only) |
| [[BUG-2626]] | MEDIUM | Dashboard numbers render in the visitor's browser locale, not the tenant's | — | deferred, out of scope |
| in-task | HIGH | The scope sanitiser widened instead of failing closed; three sources exposed at BU level | — | `scope.resolver.spec.ts` |
| in-task | HIGH | Permission keys the platform would never grant — every existing tenant would have been refused | — | live verification, S18 |
| in-task | MEDIUM | A hydration mismatch showed an "Unexpected error" dialog over every working analytics page | — | browser run with hydration reporting enabled |
| in-task | MEDIUM | `$NOW` resolved to a Date that the filter coercion rejected | — | `filter.model.spec.ts` |

## Known Limitations

- **Scheduled email delivery was not exercised end to end.** Tenant email is live
  in production and this run refused to send anything. The worker, the claim, the
  authorization-at-execution path and the failure counting are unit-tested with
  doubles; an actual message reaching an inbox is not proven.
- **Exports were tested at 15 rows.** The row cap, the refusal above it and the
  artifact expiry are unit-tested, but no export of tens of thousands of rows was
  generated.
- **Performance is measured against 15 employees on the seeded demo tenant, not
  against the 240-employee analytics fixture.** The fixture exists and is
  deterministic; wiring metric assertions to its published expected values is
  recommended follow-up.
- **Component rendering has no unit coverage** — `apps/web` runs jest in a node
  environment with no jsdom, so chart and page correctness rests on the browser
  run plus the geometry unit tests.
- **Workforce and Attendance analytics are empty on the demo tenant** because
  `WorkforceSnapshotDaily` starts empty and `AttendanceDay` requires the
  reconciliation engine. Both render an empty state naming the cause. This is
  correct behaviour, but it means those surfaces were validated for structure and
  emptiness rather than for populated charts.
- **The deployed environment is not covered here.** That is WP-15.

## Final QA Verdict

**PASS WITH RISKS**

The engine is proven where it matters most: tenant isolation and row scope are
verified against a real PostgreSQL at every access level, the numbers reconcile
with the database, and every workspace page renders clean in a real browser at
three widths. Six defects were found and four fixed within the run, each with a
test that fails without the fix.

The risks are the limitations above, and they are risks of absence rather than
of known defect: scheduled delivery has not put a real message in a real inbox,
exports have not been run at scale, and two surfaces were validated empty
because the data they describe does not exist on the demo tenant yet. None of
these blocks a release; each is worth closing.

## Follow-up

- Promote two regressions: the row-scope fix (`BUG-2624`) and the sanitiser's
  fail-closed behaviour, each naming the spec that fails without it.
- Wire the metric specs to `seed-analytics-fixture`'s published expected values
  (active headcount 195, joiners/leavers 10/10, attendance rate 89.1652%).
- Run the workforce snapshot backfill for the demo tenant so Workforce Analytics
  has history to show.
- Send one scheduled report to a non-deliverable `@demo.dijipeople.com` address
  in production and confirm the attachment arrives.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Scenarios and records this run exercised, cited in its own body:

[[BUG-2010]] · [[BUG-2043]] · [[BUG-2148]] · [[BUG-2149]] · [[BUG-2623]] · [[BUG-2624]] · [[BUG-2625]] · [[BUG-2626]] · [[EXECPLAN-0030]] · [[PLAN-034]]

<!-- GRAPH:END -->
