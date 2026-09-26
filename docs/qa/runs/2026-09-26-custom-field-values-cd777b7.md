# QA Run — custom-field-values

## Metadata

| | |
|---|---|
| Date / time | 2026-09-26T20:46:43.344Z |
| Branch | `agent/custom-field-values` |
| Commit SHA | `cd777b787741682835822efb7f0bbe789ae4c447` |
| Worktree | `D:\My Work\hrm-dijipeople\dp-field-values` |
| Environment | Working tree dirty only with this run record and the history record. DB available: a local throwaway Postgres (`dijipeople_fv_test`), seeded with seed:config and seed:demo for the HTTP pass. External services: none; SMTP and Stripe credentials were blanked in the throwaway API env. |
| QA agent | qa (Architect session SESSION-0113) |
| Scope | Custom field values on Employees (API, employee form, browser save and reload) and package import at scale. Not covered: lookup custom fields, list views, export. |

## Requirement

A published custom field on Employees stores, validates and shows a value per employee (BUG-3697). A package of about 1,700 components imports well inside the 120 s transaction timeout. See [[TASK-0034-custom-field-values-on-system-modules-package-import-at-scal]] and EXECPLAN-0053.

## Risk Areas

- **Tenant isolation.** A new tenant-owned table is keyed by (tenantId, tableKey, recordId), and `recordId` has no foreign key.
- **Object-level access.** The value service trusts `recordId`, so `EmployeesService` must check access first.
- **Masked values and read-only fields** posted back unchanged by the form.
- **Create paths that don't know about custom fields** (imports, onboarding) must not start failing when a field is required.
- **Import batching:** rollback labels and ordering by component type.
- **Client bundles:** a new import in `lib/runtime` could reach server-only code. It did, and CI caught it on 680b132f.

## Scenarios

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| S1 | Draft field is neither shown nor accepted | happy | No definitions; validate returns {} | PASS | custom-field-values.e2e-spec.ts; HTTP: definitions [] before publish |
| S2 | Store, merge, clear | happy | Values merge; null clears | PASS | e2e; HTTP: G2 stored, kept across an unrelated PATCH, cleared to null |
| S3 | Invalid choice and over-length value | negative | 400 with `customFields.<key>` errors; nothing written | PASS | e2e; HTTP 400 `details["customFields.ad_grade"]` |
| S4 | Unchanged masked and read-only values posted back | regression | No write; changed read-only value refused | PASS | e2e "a form posting back unchanged…" |
| S5 | Another tenant | tenant | No definitions, no values | PASS | e2e |
| S6 | Unknown top-level field on the employee PATCH | contract | Still 400 (forbidNonWhitelisted) | PASS | HTTP |
| S7 | Form metadata, section, values, payload, error mapping | UI-state | Field present; lookups excluded; payload `customFields` only when present | PASS | employee-custom-fields.spec.ts |
| S8 | Import at scale | boundary | Install ≤ 60 ops for 60×25 fields | PASS | customization-package-alm-scale.e2e-spec.ts (43 / 42 / 246 ops) |
| S9 | Package ALM round trip unchanged by batching | regression | 19 cases pass | PASS | customization-package-alm.e2e-spec.ts |
| S10 | Web production build | contract | `next build` compiles | PASS | local next build after the fix; CI Build job on cd777b78 |

## Automated Suites

| Command | Suite | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|
| `npx jest src/modules/customization src/modules/employees src/modules/data` | API unit | 272 | 0 | 0 | — |
| `npx jest --config ./test/jest-e2e.json` (the three suites) | API e2e, DB-backed | 28 | 0 | 0 | — |
| `npx jest --config jest.config.js lib/runtime` | web | 397 | 0 | 0 | — |
| `npx tsc --noEmit -p tsconfig.build.json` / web `tsc` | typecheck | pass | — | — | — |
| `npx eslint "{src,test}/**/*.ts" --max-warnings=787` | API lint | 0 errors, 787 warnings | — | — | — |
| `npx next build` (apps/web) | build | pass | — | — | 65 s compile |
| CI 36269897626 | all required jobs | PASS | — | — | — |

### Regression-test proof

`withoutUnchangedValues` was disabled so that it returned the submission unchanged:

| Test | With fix | Without fix |
|---|---|---|
| custom-field-values.spec.ts — withoutUnchangedValues | PASS | FAIL |
| custom-field-values.e2e-spec.ts — a form posting back unchanged masked and read-only values writes nothing | PASS | FAIL |

The storage tests cannot run without the fix at all, because the service and table do not exist.

## Manual Validation

- The real API was booted on :4099 against the seeded throwaway database. `CustomFieldValuesModule` resolved, which proves the DI wiring.
- Driven over HTTP as the demo CEO:
  - create an `ad_grade` column, then publish;
  - read the definitions;
  - PATCH with a bad value, then a good value;
  - read the detail;
  - send an unrelated PATCH, then clear the value;
  - send an unknown field.
- Every step behaved as expected.
- **Browser pass** (scripted Playwright, `next dev` on :3011 against the same API, workspace `dijipeople-demo.localhost`):
  - The demo CEO opened Sara Ahmed's edit form. "Additional information" rendered with an "Employee Grade" select.
  - The CEO chose Grade 1 and saved, then reopened the detail page. It showed Employee Grade = Grade 1, read back from the server.
  - The first save attempt was refused client-side because the tenant requires an emergency contact the seeded employee lacked. That is expected validation, unrelated to this change. Filling the contact let the save through.
  - No console errors.

## Regression Checks

| Regression ID | Scenario | Result |
|---|---|---|
| REG-635..637 | Package ALM round trip (TASK-0033) | PASS (customization-package-alm.e2e-spec.ts, 19/19) |
| REG-638 | This fix | PASS |

## Bugs Found

| ID | Severity | Description | Bug pattern | Regression test added |
|---|---|---|---|---|
| — | — | Masked and read-only values posted back by the form would have been refused or overwritten. Found and fixed before merge, inside BUG-3697's scope. | two-writers-one-field | Yes (S4) |
| — | — | A server-only import reached a client bundle. CI Build caught it on 680b132f, and it was fixed in cd777b78. | — | CI Build job |

## Known Limitations

- **The browser pass used scripted Playwright**, not the MCP server, which did not connect. It covered one field type (a select). The other types are covered by the shared data-type mapping and unit tests.
- **Scale is measured in operation counts**, not wall-clock against Neon.

## Final QA Verdict

**PASS WITH RISKS**

Storage, validation, masking, isolation and form wiring are proven by DB-backed tests, HTTP tests and a browser save-and-reload. The import scale fix is proven by operation counts. Remaining risk: lookup fields, list views and export are absent, tracked in [[ITEM-0221]].

## Follow-up

- [[ITEM-0221]]: lookups, list-view columns, export, other system modules (architect).
- None beyond ITEM-0221.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Scenarios and records this run exercised, cited in its own body:

[[BUG-3697]] · [[ITEM-0221]] · [[SESSION-0113]] · [[TASK-0033]] · [[TASK-0034]]

<!-- GRAPH:END -->
