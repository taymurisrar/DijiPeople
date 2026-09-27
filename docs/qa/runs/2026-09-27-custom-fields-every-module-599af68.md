# QA Run — custom-fields-every-module

## Metadata

| | |
|---|---|
| Date / time | 2026-09-27 |
| Branch | `agent/custom-fields-followup` |
| Commit SHA | `599af68c` (code); records follow in the closure commit |
| Worktree | `D:\My Work\hrm-dijipeople\dp-cf-followup` |
| Environment | Local throwaway Postgres (`dijipeople_cf2_test`), seeded with seed:config and seed:demo. API on :4099 and web on :3011 (`next dev`), with SMTP and Stripe credentials blanked. No external services. |
| QA agent | qa (Architect session SESSION-0115) |
| Scope | The generic custom-field hook on every bound system module (API and web), closed tables, lookup custom fields, the Employees list and export, and the Obsidian vault fixes. Not covered: modules whose tables had no seeded rows were not driven live; see Known Limitations. |

## Requirement

Every system table a tenant can add a custom field to also stores, shows and saves its values. Tables that cannot do so stop offering fields. Plan: EXECPLAN-0054. Decision: ADR-0024. Task: [[TASK-0035-custom-fields-follow-up-lookups-list-columns-export-other-sy]].

## Risk Areas

- **The claim the design rests on:** interceptors run before the global `ValidationPipe`, and strict DTOs use `forbidNonWhitelisted`.
- **A binding that names the wrong route param**, which would write values to another record.
- **Response shapes the interceptor does not recognise:** plain, wrapped, array and paged.
- **The lookup wrapper replacing a system field's preloaded options.**
- **A server-only import reaching a client bundle.** This happened in TASK-0034, where only `next build` caught it.
- **Load on list endpoints**, which now read custom values.

## Scenarios

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| S1 | A strict DTO accepts `customFields`; the created record answers with them | contract | 201 with values | PASS | custom-fields-system-modules.e2e-spec.ts |
| S2 | Bad value refused before the module writes | negative | 400 with `customFields.<key>`; row count unchanged | PASS | e2e |
| S3 | Update by route id; unrelated update keeps the value; audit row written | happy | as stated | PASS | e2e |
| S4 | List rows carry values | happy | row has value | PASS | e2e; HTTP sweep |
| S5 | Nested create (a holiday under its calendar) | boundary | stored against the holiday | PASS | e2e |
| S6 | Another tenant | tenant | no definitions; 404 on the record | PASS | e2e |
| S7 | A closed table refuses a new field (create and import) | negative | 400 / INCOMPATIBLE | PASS | e2e; package-comparison.spec.ts |
| S8 | Every binding names a real param, fits its method, and every customizable table is stored | contract | no violations | PASS | custom-fields.bindings.spec.ts (it found 2 tables first) |
| S9 | Live sweep: each seeded module's own update route stores and reads back | integration | value round-trips | PASS for 15 of 31 | HTTP sweep; see limitations |
| S10 | Settings runtime page | UI-state | "Additional information" shows the stored value; a change saves | PASS | browser: Work Calendars |
| S11 | Standard page (project edit) | UI-state | as above | PASS | browser |
| S12 | Bespoke form (holiday manager) | UI-state | Region saves | PASS | browser |
| S13 | Lookup custom field on the employee form | UI-state | options list departments; the selection saves | PASS | browser: Engineering, Finance, Human Resources; Finance saved |
| S14 | Web production build | contract | compiles | PASS | local `next build` |

## Automated Suites

| Command | Suite | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|
| `npx jest` (services/api, full) | API unit | 7575+ | 0 | 0 | — |
| `npx jest src/modules/customization src/modules/employees` | API customization + employees | 199 | 0 | 0 | — |
| `npx jest --config ./test/jest-e2e.json test/custom-fields-system-modules.e2e-spec.ts` | API e2e, DB-backed | 8 | 0 | 0 | — |
| `npx jest --config jest.config.js` (apps/web, full) | web | 2057 | 0 | 0 | — |
| `npx eslint "{src,test}/**/*.ts" --max-warnings=787` | API lint | 0 errors, 787 warnings | — | — | — |
| `npx tsc` (API build config and web) | typecheck | pass | — | — | — |
| `npx next build` (apps/web) | build | pass | — | — | 60 s compile |

### Regression-test proof

| Test | With fix | Without fix |
|---|---|---|
| e2e: a strict DTO accepts customFields (and 3 dependent cases) | PASS | FAIL, with the interceptor's body rewrite disabled (4 of 8 failed) |
| bindings spec: every customizable table is stored | PASS | FAIL on first run: attendancePolicies and onboardingTasks were customizable with nowhere to store values |

## Manual Validation

- **Live HTTP sweep of all 31 bound tables** through each module's own routes, as the demo CEO:
  - 15 passed end to end;
  - 12 had no seeded rows;
  - 3 answered 400 from the module's own contract (roles is a full-replace PUT, pay components validate the whole calculation, the seeded document categories are global). No value was stored on any refused update.
- **Browser pass** (scripted Playwright) on the four kinds of page: S10 to S13.
- **Settings pages outside the demo tenant's plan** (Organization, Leave) show the plan gate, as designed.

## Regression Checks

| Regression ID | Scenario | Result |
|---|---|---|
| REG-638 | Custom fields on Employees (TASK-0034) | PASS (employees specs, and the list and lookup in this pass) |
| REG-635..637 | Package ALM | PASS (customization suite) |
| REG-639 | Closed tables and storing coverage | PASS |
| REG-640 | Lookup custom fields | PASS |

## Bugs Found

| ID | Severity | Description | Bug pattern | Regression test added |
|---|---|---|---|---|
| BUG-3786 | MEDIUM | isCustomizable was never enforced (found in discovery); fixed here | declared-but-unwired-step | REG-639 |
| BUG-3787 | MEDIUM | Lookup custom fields offered no options (found in discovery); fixed here | declared-but-unwired-step | REG-640 |
| BUG-3800 | MEDIUM | Pre-existing: three entity lookups refuse the paging the form sends | — | No; PLAN_REQUIRED |

## Known Limitations

- **Twelve bound tables had no rows in the demo seed**, so their update route was not driven live: payroll cycles, periods and runs, candidates, job openings, applications, employee levels, teams, leave policies, claim types, claims, policies and policy assignments. Their bindings are checked structurally by the bindings spec (param names, methods, table), and the interceptor path is the same code the other modules exercised.
- **Pages not visited in the browser:** the policies manager and the Employees export were covered by typecheck and unit tests only.
- **Values are not filterable or sortable server-side** (ADR-0024).

## Final QA Verdict

**PASS WITH RISKS**

The mechanism is proven through the full app, and structurally on every binding. It was shown live on 15 modules and in a browser on all four kinds of page. Risks:
- twelve modules were not driven live, for lack of seed data;
- BUG-3800 is a separate, pre-existing defect.

## Follow-up

- BUG-3800 (plan required): search and paging on three list endpoints.
