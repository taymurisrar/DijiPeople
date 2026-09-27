# QA Run — custom-fields-screens-and-query

## Metadata

| | |
|---|---|
| Date / time | 2026-09-27T11:52:29.764Z |
| Branch | `agent/custom-fields-screens-and-query` |
| Commit SHA | `e21b757484fc42907843c3d94fbf8b26bdb048e4` |
| Worktree | `D:\My Work\hrm-dijipeople\dp-cf-screens` |
| Environment | Working tree dirty only with a wording correction to ADR-0025 (records, no code). DB: local throwaway Postgres databases (`dijipeople_cs_test` for e2e, `dijipeople_bp36_test` seeded with config + demo for the browser pass); never the dev `dijipeople` DB. External services: none — SMTP and Stripe keys blanked. |
| QA agent | qa (Architect-run), TASK-0036 |
| Scope | BUG-3800, BUG-3809, BUG-3154 (EmployeeCompensation path), employee list sort/filter by custom fields, the four new screens (Pay setup, document types, claims create/edit, onboarding templates), and custom fields on the 13 bound tables with no demo data. |

## Requirement

TASK-0036 closes what TASK-0035 left open: lookups that refused paging and
search (BUG-3800), screens for system modules whose custom fields were only
reachable through the API, server-side sort and filter by custom fields on the
paged employee list (ADR-0025), and a live test of the bound modules that had
no demo data. Related: [[TASK-0036-custom-fields-screens-for-api-only-modules-sort-and-filter-b]].

## Risk Areas

- Tenant isolation in the new SQL over `CustomRecordExtension` (raw SQL,
  bound parameters) and in document types (BUG-3809 was a cross-tenant write).
- Disclosure through ordering or matching on a masked or permission-gated
  field.
- Back-compat of list response shapes (bare arrays kept unless paging asked).
- Secrets on the Pay setup screen: posting masked values back, returning
  ciphertext, wiping on omission.
- New screens reachable for the first time (their code had never run).

## Scenarios

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| S1 | Business units, payroll calendars and periods accept `pageSize` and `search` (QA-SETTINGS-036) | contract | 200, filtered; bare array when unpaged | PASS | `services/api/test/lookup-paging.e2e-spec.ts` 4/4 |
| S2 | A tenant cannot create or edit a shared document type or category (QA-TENANT-066) | tenant | 403 / 400, nothing written; other tenant sees nothing | PASS | `services/api/test/document-types.e2e-spec.ts` 5/5 |
| S3 | Compensation secrets dual-written, read decrypted, kept when omitted | regression | `*Enc` written; no `*Enc` in response; omission keeps | PASS | `employee-compensation-encryption.spec.ts` 3/3; browser B |
| S4 | Employee list filters by a custom field, tenant-scoped, negated ops include rows without values | tenant | Only matching rows of the caller's tenant | PASS | `custom-field-list-query.e2e-spec.ts` 6/6; live API check |
| S5 | Employee list sorts by a custom field and pages, unset rows last | happy | 30, 20, 10, then unset; page 2 continues | PASS | live API check; browser A |
| S6 | Masked or unreadable field cannot be filtered or sorted by | permission | 400 / no custom order | PASS | e2e; mutation-checked |
| S7 | Custom fields on 13 bound tables with no demo data | contract | Value stored on create and returned on read | PASS | `custom-fields-bound-modules.e2e-spec.ts` 13/13 |
| S8 | Pay setup tab: save, reload shows the account masked with an empty input, save without retyping keeps it, custom field saved | UI-state | as stated | PASS | browser B |
| S9 | New claim: create, custom field, add a line item; server computes the total | happy | DRAFT claim, total 125.50 | PASS (after fix) | browser D |
| S10 | Onboarding template: create with two tasks and a custom field, edit and remove a task | happy | tasks [Laptop, Badge] then [Badge] | PASS | browser E |
| S11 | Document types settings screen in the browser | UI-state | list, create, edit | BLOCKED | demo tenant's plan excludes Documents (plan-gated page, correct behaviour) |

## Automated Suites

| Command | Suite | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|
| `npm --workspace api run test` (onboarding, claims, customization, employees, documents, payroll, organization) | unit | 353 | 0 | 0 | ~60 s |
| `npm --workspace api run test` (employees, incl. seam spec) | unit | 49 | 0 | 0 | ~7 s |
| `npm --workspace api run test:e2e` (5 suites, `dijipeople_cs_test`) | e2e | 29 | 0 | 0 | ~2 min |
| `npm --workspace api run test:e2e` (bound modules) | e2e | 13 | 0 | 0 | 12 s |
| `npm --workspace web run test` (claims, onboarding, employees, pay setup, list filters) | unit | 116+ | 0 | 0 | ~10 s |
| `npm --workspace web run check-types`, `npm --workspace api run check-types` | types | clean | — | — | — |
| `next build` (apps/web) | build | exit 0 | — | — | — |

### Regression-test proof

| Test | With fix | Without fix |
|---|---|---|
| `custom-field-list-query.e2e-spec.ts` masked/unreadable case | PASS | FAIL (mask guard removed) |
| `employees-custom-list-query.spec.ts` orderBy seam | PASS | FAIL (pattern `s+` for `\s+`) |
| `document-types.e2e-spec.ts` shared type refused | PASS | FAIL (refusal removed → 201) |
| `lookup-paging.e2e-spec.ts` | PASS | FAIL (old DTOs → 400) |

## Manual Validation

Scripted Playwright browser pass against an isolated stack (API :4099, web
:3011 on `dijipeople-demo.localhost`, throwaway DB seeded with config + demo),
each step reading the stored state back through the API. It found three
defects in this task's own unmerged code, all fixed in e21b7574 and re-run:

1. New claim form entirely disabled (editability derived from a status a new
   claim does not have) — no Create button.
2. New claim currency empty behind a "USD" placeholder — save refused.
3. With `USE_ENTITY_DATA_API=true` the employee page took the entity-data path
   and silently dropped custom filters and sorts.

A live API check before the browser pass also found the custom-sort pattern
broken (lost backslash; fixed in 4a311f73 with a seam spec).

## Regression Checks

| Regression ID | Scenario | Result |
|---|---|---|
| REG-639 / REG-640 | custom field lookups and bindings (TASK-0035) | PASS — customization suites green |
| REG-641 | BUG-3800 lookups | PASS |
| REG-642 | BUG-3809 shared document rows | PASS |

## Bugs Found

| ID | Severity | Description | Bug pattern | Regression test added |
|---|---|---|---|---|
| BUG-3809 | HIGH | Tenant admin could create document types/categories every tenant sees | tenant-filter-missing | REG-642 |
| — | — | Three defects in this task's unmerged screens (above); fixed before integration, never shipped | declared-but-unwired-step | claim-editor.spec, custom-field-list-filters.spec |

Not filed: `GET /claims` refuses `pageSize`/`search` (400). No screen or lookup
sends them to that route (the BUG-3800 probe covered every lookup path), so it
is not reachable from the product today.

## Known Limitations

- Document types settings screen not exercised in the browser (plan-gated for
  the demo tenant); its API is covered by the e2e.
- Self-service claim pages (`/me/claims/new`, edit) not driven in the browser;
  they share the same form component and API routes as the admin pages.
- The production value of `USE_ENTITY_DATA_API` was not read; the fix works
  either way.

## Final QA Verdict

**PASS WITH RISKS**

Every scenario in scope passed through automated suites, and every screen but
document types passed a real browser pass that reads stored state back. The
risks are the two screens exercised only through their API (document types) or
through a shared component (self-service claims).

## Follow-up

- A read-only production check for tenant-created global document types and
  categories (BUG-3809 exposure) needs the owner's go-ahead.
- BUG-3154 remains open for the payroll repository path and the other models.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Scenarios and records this run exercised, cited in its own body:

[[ADR-0025]] · [[BUG-3154]] · [[BUG-3800]] · [[BUG-3809]] · [[QA-SETTINGS-036]] · [[QA-TENANT-066]] · [[TASK-0035]] · [[TASK-0036]]

<!-- GRAPH:END -->
