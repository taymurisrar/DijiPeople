# QA Run — task-0031-demo-walkthrough-2-local-browser-qa

## Metadata

| | |
|---|---|
| Date / time | 2026-09-13T02:34:43.205Z |
| Branch | `agent/walkthrough2-integration` |
| Commit SHA | `e253306a7b8ffea3a2f8f833bd4f0c628154f5e3` (record filed here); browser runs executed against `2a8f811a` … `22511c32` in the verify worktree, each noted below |
| Worktree | `D:\My Work\hrm-dijipeople\dijipeople-wt2-integration`; app served from `dijipeople-wt2-verify` |
| Environment | Working tree dirty only with this record and the task's engineering history record, both untracked at scaffold time. Local API on :4101 and tenant web on :3101 against a throwaway PostgreSQL database `dijipeople_walkthrough2_test` (never the populated `dijipeople` database). Seeded with `seed:config`, `seed:demo`, `seed:admin`; the notifications feature enabled for the local tenant by a CUSTOM TenantFeature override. Email: the local tenant's Console provider, so no mail left the machine |
| QA agent | QA (Architect session SESSION-0105) |
| Scope | TASK-0031 WP-01..WP-06 as integrated: employee record (hierarchy dialog, Work Sites tab, primary work site guard, reset password confirm), Customization access and create → publish, the published custom module in the runtime, all four notifications settings pages. Not covered here: production (WP-08), real email delivery, the owner's demo tenant data |

## Requirement

Every defect and decided improvement from the second demo walkthrough works in a
running app before release: ADR-0013 (customization by permission), ADR-0014
(work sites tab), ADR-0015 (sink providers retired in production), ADR-0016
(published custom modules render), ADR-0017 (chain-scoped hierarchy dialog).
Plans: EXECPLAN-0045 … EXECPLAN-0050.

## Risk Areas

- Integration seams between independently built streams — the notifications service was changed by three of them, and the custom-module runtime by two (WP-01, WP-02).
- Row scope for a new Prisma model behind the generic scope builder (`buildScopedAccessWhere` assumes a `userId` column).
- Metadata saved before its dependencies exist: forms created before columns.
- Hydration timing on a cold Next.js dev server, which makes widgets look stuck.

## Scenarios

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| S1 | A system administrator without the System Customizer role opens Modules, Packages, Publish Center, Sidebar | permission | Each page loads; tables API 200; no error modal | PASS | batch 1 screenshots `10-cust-*` |
| S2 | Create a custom table, a text, a choice and a reference field, publish from Publish Center | happy | Each create 201; publish succeeds | PASS | batch 2: `createTable 201`, three field creates 201 |
| S3 | The published module appears in the main menu and its list renders | happy | Menu entry with the plural name; list with the published view's columns | PASS | batch 2 `sidebarLinks` includes "QA Local Assets"; `62-custom-module-list` |
| S4 | New on the custom module opens a create screen with the module's fields | happy | Form shows every published field | FAIL at `58e4c32a`, PASS at `22511c32` | batch 4: `controls: []` before; after the fix Serial Number, Condition, Assigned Employee |
| S5 | Save & Close on the create screen creates a record | happy | Returns to the list showing the new record | PASS | batch 4 rerun: "QA-LOCAL-0001 … Showing 1 to 1 of 1 records" |
| S6 | Reporting Hierarchy dialog opens from the employee record | UI-state | Named dialog, Close button, branching tree, current employee marked | PASS | batch 3 `80-hierarchy-dialog`; batch 5 `currentMarked: 1` |
| S7 | Mouse hover on a hierarchy node | UI-state | Detail card appears inside the viewport and hides on leave | PASS | batch 5 `hoverTooltipInViewport: true`, `tooltipHiddenAfterLeave: true` |
| S8 | Keyboard focus on a hierarchy node | UI-state | Detail card appears | PASS | batch 5 `focusTooltipVisible: true` |
| S9 | Click a hierarchy node | happy | Opens that employee's record | PASS | batch 5 `clickOpensOtherRecord: true` |
| S10 | First touch tap on a hierarchy node at 400px | boundary | Shows the card without navigating | PASS | batch 5 `touchFirstTapStays: true`, `touchFirstTapCard: true` |
| S11 | Hierarchy dialog at 400px | boundary | Fits the viewport | PASS | batch 3 `82-hierarchy-dialog-400` |
| S12 | Work Sites tab on the employee record | happy | Related-records tab with Assign, Edit, Remove, Refresh | PASS | batch 2 `42-work-sites-tab` |
| S13 | PATCH an employee with a different `locationId` | negative | 400 VALIDATION_FAILED "Change the primary work site from the Work Sites tab." | PASS | batch 2 `patchLocationStatus: 400` |
| S14 | Reset Password on the employee record | UI-state | Confirmation before anything is sent | PASS | batch 1 `23-reset-password-confirm` |
| S15 | Toggle a notification event channel and reload | idempotency | The new value survives the reload; restored afterwards | PASS | batch 2 `toggleRoundTrip.persisted: true` |
| S16 | Email Templates page | UI-state | System defaults listed ACTIVE with View and Customize; no placeholder copy; no raw JSON fields | PASS | batch 2 `placeholderCopy: false`, `rawJsonFields: false` |
| S17 | Email Providers page on a Console-only tenant | UI-state | States that email is not delivered, and why | PASS | batch 2 providers snippet "Email is not delivered The Console provider does not send email." |
| S18 | Add provider dialog | UI-state | Typed SMTP settings; SMTP default | PASS | batch 2 `55-add-provider` |
| S19 | Delivery Logs page | UI-state | Channel switch and an empty state | PASS | batch 2 `56-logs` |
| S20 | Notifications pages at 400px | boundary | No horizontal overflow | FAIL — the settings shell overflows, not the pages | batch 2 `rulesOverflowX400: true`; owned by ITEM-0185 |

## Automated Suites

| Command | Suite | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|
| `npm --workspace api run test -- src/modules/data` | data unit specs | 87 | 0 | 0 | — |
| `npm run test:e2e -- custom-module-runtime` (services/api, throwaway DB) | custom-module runtime e2e | 8 | 0 | 0 | ~5 s |
| `npx jest --config jest.config.js lib/runtime/custom-modules` (apps/web) | custom-module runtime + navigation | 29 | 0 | 0 | — |
| `npx eslint "{src,test}/**/*.ts" --max-warnings=787` (services/api) | API lint ratchet | 0 errors, 787 warnings | — | — | — |
| `node scripts/validate-framework.mjs` | framework validation | 5741 checks | 0 | — | — |
| CI runs 34732185363, 34732682935, 34732697734 on `f865ac5e` | all required jobs | PASS | — | — | — |

### Regression-test proof

| Test | With fix | Without fix (stashed) |
|---|---|---|
| `custom-module-runtime.spec.ts` › ignores a published form with no placed fields and keeps the generated one | PASS | FAIL (runtime file from `58e4c32a`: 2 failed, 13 passed) |
| `custom-module-runtime.spec.ts` › drops a section whose only placements are columns not in the definition | PASS | FAIL (same run) |
| `custom-module-runtime.e2e-spec.ts` › keeps a SELF-scoped reader in tenant A away from another user record | PASS at `cff72bbe` | FAIL at `2a8f811a` (PrismaClientValidationError on `userId`) |

## Manual Validation

Browser checks were driven by Playwright scripts against the local stack, one
batch per area, with screenshots read back and judged. The Playwright MCP
browser refuses `localhost`, so it was not used. Two apparent failures —
New doing nothing and the hierarchy never loading — were a cold dev server still
compiling; a diagnostic run with longer waits and network capture showed both
working, and the scripts were corrected rather than the product.

## Regression Checks

The regressions TASK-0031 registered (REG-481 … REG-488, REG-491 … REG-512,
REG-515 … REG-519) are unit or e2e tests and ran in the CI runs above. The
browser scenarios S1, S6–S13, S15–S19 re-check QA-SETTINGS-021, QA-EMPLOYEE-004,
QA-EMPLOYEE-005, QA-EMPLOYEE-006, QA-SETTINGS-029, QA-SETTINGS-027,
QA-SETTINGS-031 and QA-SETTINGS-032 by hand.

| Regression ID | Scenario | Result |
|---|---|---|
| REG-492 | create without a parent (unit) and SELF scope (e2e) | PASS |
| REG-488 | a changed `locationId` is refused on update | PASS (S13) |

## Bugs Found

| ID | Severity | Description | Bug pattern | Regression test added |
|---|---|---|---|---|
| BUG-3494 (reopened seam) | HIGH | A module built table → fields → publish opened a create screen with no fields: the table's main form is saved with `fields: []` and later columns are not placed on it | metadata saved before its dependencies | Yes — two `custom-module-runtime.spec.ts` cases; fixed in `22511c32` |
| BUG-3494 (seam) | HIGH | SELF-scoped custom-record readers got a 500: the scope builder queried a `userId` column the model lacks | generic scope builder assumptions | Yes — the e2e case above; fixed in `cff72bbe` |
| BUG-3523 | LOW | A custom module's top bar shows its table key instead of its name | — | No — deferred |

## Known Limitations

- Local development build, not a production build: hydration timing differs, and the sink-provider retirement (ADR-0015) is inactive outside production, so Console is still offered locally.
- No real email was sent; delivery through the platform relay is verified on production under WP-08.
- One tenant, one administrator; the `hr` role's access to the events page (ITEM-0193) was not exercised.
- The demo tenant's own data and templates were not touched.

## Final QA Verdict

**PASS WITH RISKS**

Every decided behaviour works in a running app, and the two defects this run
found were fixed and re-verified before release. Risks carried forward:
production-only behaviour (sink retirement, real relay mail) is unproven until
WP-08; the settings shell overflows at phone width (ITEM-0185).

## Follow-up

- WP-08: verify on the demo tenant after deploy, including one real email.
- ITEM-0185 (settings shell at phone width), BUG-3523 (top bar title) — Architect-triaged, deferred.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Scenarios and records this run exercised, cited in its own body:

[[ADR-0013]] · [[ADR-0014]] · [[ADR-0015]] · [[ADR-0016]] · [[ADR-0017]] · [[BUG-3494]] · [[BUG-3523]] · [[ITEM-0185]] · [[ITEM-0193]] · [[QA-EMPLOYEE-004]] · [[QA-EMPLOYEE-005]] · [[QA-EMPLOYEE-006]] · [[QA-SETTINGS-021]] · [[QA-SETTINGS-027]] · [[QA-SETTINGS-029]] · [[QA-SETTINGS-031]] · [[QA-SETTINGS-032]] · [[SESSION-0105]] · [[TASK-0031]]

<!-- GRAPH:END -->
