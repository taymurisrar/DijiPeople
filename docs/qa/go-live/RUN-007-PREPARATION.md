# RUN-007 preparation (no execution, no verdict)

Part of [[README]]. RUN-006 ([[RUN-006-2026-11-01]]) is the accepted independent **NOT READY** verdict for application `17d0dcaf` and, with RUN-001 to RUN-005 and all evidence, is untouched. RUN-007 starts only when the development agent supplies the **new committed final application SHA** that fixes DP-QA-035 to DP-QA-042. Until then nothing here has been run against a candidate; every expectation is the owner decision, not a description of a build.

Checkpoint: QA branch `agent/starter-golive-qa`. Revision 1 (`f5fab655`) assumed `enterprise-plus` was the Custom contract plan; **revision 2 (this page) replaces that with the owner's FINAL subscription architecture** (below). The revision-1 text stays in Git history.

## 0. FINAL subscription architecture (owner, 2026-11-01) - supersedes revision 1
- Exactly **three predefined plans: Starter, Growth, Enterprise**. `enterprise-plus` is **not** a valid predefined plan and is to be eliminated from the intended architecture.
- Every other plan is a **dynamically created Custom plan** for an individual customer, defined period, pilot, promotion or negotiated contract. A Custom plan **never inherits Enterprise entitlements**: it grants exactly the features it lists. Desktop Agent and e-mail white-label are reachable only when the Custom plan explicitly lists them.
- Basic import / export / templates are the **universal baseline** of every plan, subject to role permissions and the entitlement of the module concerned.
- **No `TenantFeature` override rows are written by the tests any more** (revision 1 used them to emulate a Custom grant). Custom plans are created and assigned only through the supported platform API (`POST /super-admin/plans`, `POST /super-admin/plans/:id/prices`, `PATCH /super-admin/tenants/:id/subscription`); SQL in the suite is read-only or restores a tenant's previous subscription.
- **Execution control:** development is correcting the architecture. RUN-007 is **not** executed against `dfd829f3` (it still implements the superseded `enterprise-plus` contract-plan model, handoff v5) and no `enterprise-plus` behaviour is accepted. RUN-007 waits for the newly completed committed SHA.

## 1. Owner decisions (2026-11-01) and the tests that enforce them
| # | Decision | Defect | Tests |
|---|---|---|---|
| D1 | Standard exports exclude soft-deleted employees, national IDs, tax IDs and internal encrypted/hashed/storage fields | [[DP-QA-037]], [[DP-QA-038]] | EXP-001, EXP-002, EXP-003, IMX-030, IMX-031 |
| D2 | Sensitive-identifier export, if supported, needs explicit authorization, deliberate field selection and an audit row | DP-QA-037/038 | EXP-004 |
| D3 | Import/export/templates stay in every plan, subject to permissions and module entitlements | [[DP-QA-035]] | EXP-010-*, IMP-001, IMP-002, IMP-020, IMP-021, IMX-* |
| D4 | Desktop Agent and white-label are reachable on a Custom plan only when that plan explicitly lists them; Custom plans never inherit Enterprise | [[DP-QA-042]] (reframed) | CUS-001..007, AGT-001-C, BEM-006-C, CUS-040 |
| D5 | Deployment seeding preserves valid approval workflows, e-mail settings and tenant-specific configuration | [[DP-QA-036]], [[DP-QA-039]] | APR-010..012, APR-020/021, APR-030, EML-001..004, SEED-001..011 |
| D6 | Existing and revoked agent credentials respect current entitlements promptly | DP-QA-042 | CUS-010, CUS-011, CUS-012, CUS-020, CUS-030, AGT-020 |
| D7 | Exactly three predefined plans; `enterprise-plus` eliminated | DP-QA-042 | CAT-001..004 |
| D8 | Custom plans are dynamic: created, priced, assigned, dated, edited, deactivated and deleted through the supported mechanism | new | CPL-001..006, CUS-031 |
| D9 | Predefined-plan seeds never overwrite Custom-plan definitions | new | SEEDPLAN-001, SEEDPLAN-002 |
| D10 | Legacy `enterprise-plus` data migrates safely; legitimate subscriptions and contractual entitlements are preserved | new | MIG-001..004 |

**"Promptly" is a newly decided number.** Today the entitlement cache makes enforcement take about 54-62 s (OBS-029). The specs use one constant `PROMPT_MS = 120000` (`29-run007-custom-grants-revocation.spec.ts`); if the owner sets a tighter SLA, change that one line and say so in the report. Measured delays are recorded as annotations.

## 2. New suites and stable test ids
Discovery after revision 2: **516** test instances in 34 files, 0 load errors, every new id unique (new fixtures: `fixtures/platform.ts`, `tools/legacy-enterprise-plus.mjs`).

| Spec | Test id | Expected outcome (the requirement) | Checks |
|---|---|---|---|
| 27 approvals | APR-010 | Fresh onboarded `qa-probe`: two `seed:config` runs leave every active ROLE step routable and the matrices byte-identical | DB |
| | APR-011 | Existing tenants (A, B, G, E, C): matrices unchanged by two seeds | DB |
| | APR-012 | A customised matrix keeps its name and activity after two seeds | DB |
| | APR-020-A/G/E/C | The real employee submits leave after seeding: 201, not an approval-route error, persisted PENDING/SUBMITTED | API + DB |
| | APR-021-A/G/E/C | The approver approves: persisted APPROVED | API + DB |
| | APR-030 | Timesheet week submit (Growth) is never refused for an unroutable route (calibrate fixture on pass 1) | API |
| 28 export/import | EXP-001 | Soft-deleted employee absent from the export; precondition proves the live one is present | API + DB |
| | EXP-002 | CNIC and tax id: not a column and not a value in the file (known values seeded) | API |
| | EXP-003 | No Enc/Hmac/Hash/Token/storage column in importFields, export header or template | API |
| | EXP-004 | Default and "include sensitive" requests leak nothing; if the build advertises a sensitive path: unauthorised role refused, authorised export writes an audit row | API + DB |
| | EXP-010-A/G/E/C | Employee and manager refused export, template and import-analyse (401/403) | API |
| | EXP-011 | Tenant B cannot read or download tenant A export jobs; A's file holds no B people | API + DB |
| | IMP-001 | Valid file imports end to end: rows persisted in the importer's tenant only; re-import creates no duplicates | API + DB |
| | IMP-002 | Invalid row reported with its row; analysis alone creates nothing | API + DB |
| | IMP-020 / IMP-021 | Valid file imported through Settings > Data Management and through Employees > Data Transfer > Import; UI result visible and row persisted | UI + DB |
| 29 Custom plans | CUS-001..004 | Custom plan = Starter features +/- desktop-agent +/- email-white-label: agent and white-label follow the plan list only; the resolved feature set equals the list exactly (nothing inherited) | API + real e-mail |
| | CUS-005 | Selective Enterprise features (payroll, timesheets, projects) without the two grant-only features: those modules served, recruitment/onboarding refused, agent refused | API |
| | CUS-006 | FEWER features than Starter (employees only): leave/documents refused; data-management still reachable, employee template and export work, a module the plan does not own is not exportable | API |
| | CUS-007 | Cross-module combination (employees + payroll + recruitment): exactly those served | API |
| | CUS-010 | Removing the agent from the plan cuts access token, refresh token and new sign-ins within `PROMPT_MS`; delays recorded | API |
| | CUS-011 | Same user's ordinary web route still works; agent route 403 | API |
| | CUS-012 | Custom to Custom reassignment re-resolves entitlements both ways within the budget | API |
| | CUS-020 | enterprise, growth, enterprise: agent cut and restored; token issued before the downgrade refused | API |
| | CUS-030 | Expired custom subscription stops granting plan-only features (or the platform refuses a past end date) | API |
| | CUS-031 | Start/end dates, status and plan identity persist and read back unchanged | API + DB |
| | CUS-040 | Tenant isolation: a Custom plan on tenant C changes nothing for tenants A and B | API |
| | SESS-030 | Idle-expired web session cannot be revived by refresh | API + DB |
| 31 architecture | CAT-001 | Exactly the three predefined plans exist; no plan masquerades as predefined | API + DB |
| | CAT-002 | No enterprise-plus plan row, active subscription, catalogue, sellable, public or feature-catalogue entry | API + DB |
| | CAT-003 | No enterprise-plus dependency left in API/web/admin/landing/packages/seeds source (migrations, specs, docs, legacy tooling excepted and counted); remaining hits listed | source scan |
| | CAT-004 | Plan selection and the public catalogue offer starter, growth, enterprise | API |
| | CPL-001 | Custom plan created through the supported API; row, feature keys and price persisted; detail read-back | API + DB |
| | CPL-002 | Duplicate key, unknown feature key, negative price, missing name refused | API |
| | CPL-003 | Editing a plan price does not rewrite an existing subscription's contracted price | API + DB |
| | CPL-004 | A Custom plan is not in the public catalogue nor offered to tenants | API |
| | CPL-005 | Assigned plan cannot be deleted; after unassigning it can; deactivated plan leaves the sellable list | API + DB |
| | CPL-006 | Tenant users cannot list/create/edit/delete plans; tenant B cannot see tenant C's Custom plan | API |
| | SEEDPLAN-001 | Two `seed:config` runs leave Custom plans, features, prices and their subscriptions byte-identical | DB |
| | SEEDPLAN-002 | A Custom plan named like a predefined one is neither merged nor overwritten | DB |
| | MIG-001 | After the candidate's migration no tenant remains on enterprise-plus | DB |
| | MIG-002 | Legacy entitlements preserved (nothing lost, nothing newly granted); grant-only features survive only where explicitly granted | DB |
| | MIG-003 | Status, cycle, contracted price, currency and validity dates unchanged | DB |
| | MIG-004 | A repeated seed changes no plan, feature, price or subscription row | DB |
| 30 e-mail/responsive/WebKit | EML-001 | E-mail enabled: stays enabled after two seeds and a reset e-mail reaches the sink | DB + sink |
| | EML-002 | E-mail disabled: stays disabled after two seeds and NO e-mail reaches the sink (DP-QA-039) | DB + sink |
| | EML-003 | Provider rows (id, type, enabled, default, config, updatedAt) identical after two seeds | DB |
| | EML-004 | Fresh tenant gets at most one default provider without external credentials; other tenants untouched | DB |
| | RESP-100..105 | Six Settings routes at 412 px: no horizontal scroll, layout viewport stays 412, content column has width and is on screen (DP-QA-041) | UI |
| | RESP-110..113 | Command bars of Employees/Leave/Attendance/Documents: controls inside the viewport; Data Transfer menu fully visible | UI |
| | WK-100..105 | WebKit cold direct open of six routes: no "access control checks" page error (DP-QA-023) | UI |
| | WK-110 | WebKit in-app sidebar navigation: no page error | UI |

Traceability: `traceability-map.mjs` now links every new id to its defect; `npm run`-style check is `node golive/tools/traceability.mjs` (run from `e2e/`).

## 3. Protocol for the execution (when the SHA arrives)
1. Detached worktree at the exact SHA, fresh `_test` database, clean install, migrations, production-mode build, ENFORCE floor, local SMTP sink. Do not reuse `dijipeople_starterv6_test`.
2. Provision the tenants (`provision-plan-tenants.ps1`: Starter A/B, Growth G, Enterprise E) **before the first `seed:config`**; then create the **Custom-plan tenant C**: `node golive/tools/create-custom-plan.mjs qa-cp-baseline employees,organization,leave,attendance,documents,notifications,branding,data-import-export,desktop-agent,email-white-label,email-template-customization` followed by `provision-tenant.mjs qa-custom "QA Custom" <owner> qa-cp-baseline`; put `QA_TENANT_C_*` and `QA_PLATFORM_EMAIL/PASSWORD` in `.env.qa.local`. Provision `qa-probe` the same way, and provision `qa-probe` the same way. **Do not apply the RUN-006 administrator remediation** (owner assigned to `system-admin`) to any tenant: that remediation exists only because DP-QA-036 was open. If the candidate needs it, DP-QA-036 stays open.
3. **Legacy migration copy (MIG-*)**: before the candidate's migration runs, copy the RUN-006 database (`dijipeople_starterv6_test`, which still has the `enterprise-plus` plan) to a new `_legacy_test` database, run `node golive/tools/legacy-enterprise-plus.mjs prepare <url> qa-custom qa-growth` and `capture <url>` (writes `golive-results/run007/legacy-baseline.json`), then apply the candidate's `migrate deploy` and `seed:config` to that copy and point `QA_DATABASE_URL` at it for the MIG group only. The fresh run keeps its own `_test` database. If the baseline file is absent, MIG-* are reported Not Run, never Passed.
3b. Order: functional suites first, the seed/migration group (SEED, APR-010..012, EML-*) last, because running the seed is itself a state change (OBS-035).
4. Run chromium (full), firefox, webkit (full plus 10x `webkit-regression.ps1`, then the WK suite), mobile (Pixel 7), tablet (iPad). Retain traces on failure; screenshots and video as configured.
5. Independently retest **every open or reopened defect** (DP-QA-005, 023, 035-042) and the **regression-critical resolved set**: 001-004 (authentication and session), 006/007 (navigation and logout), 011 (employee leave types), 026/027/030/031 (branded e-mail, invitation and reset, employee-API data exposure and security fixes), plus all P0/P1 security fixes. The rest of DP-QA-001..034 is re-run through the full suite and counted.
6. `secret-scan.cjs` over reports, evidence and staged files before every commit. Redact tokens in e-mail renders before saving (OBS-037).
7. Report: actual coverage by module and browser, verified resolutions, remaining defects, release gates, evidence-based verdict. Publish as an immutable `runs/RUN-007-<date>.md`; update the matrix, [[KNOWN-ISSUES]], [[PRODUCTION-RELEASE-GATES]] and [[TRACEABILITY]].
8. No application change, merge, deployment or production access.

## 4. Assumptions that may need a justified calibration on first contact
Never an assertion change; each correction is recorded in the report (the RUN-006 pattern).
- Import file: required columns are taken from `importFields[].required` and the template header; the importer's execute/status vocabulary (`COMPLETED`) and result text in the UI are matched loosely.
- Sensitive export (EXP-004): the request shape for a deliberate sensitive selection is unknown until the handoff names it. If the build advertises none, the test passes only on the leak checks and records "not offered"; if it advertises one, the authorization and audit checks apply and need the real payload.
- Timesheets (APR-030): the Growth employee needs a timesheet and a week; the fixture is calibrated on pass 1 and skipped with a reason if absent.
- Web refresh (SESS-030): assumes the refresh cookie travels in the request context's cookie jar.
- Custom plans are built through the supported platform API. Calibrate on pass 1: response ids (`id` vs `plan.id`), whether `PATCH tenants/:id/subscription` needs a `planPriceId`, whether a past `endDate` / `EXPIRED` status is accepted (CUS-030 accepts either a refusal or enforcement), the public-catalogue and billing-plans routes used by CPL-004, and what marks a plan as Custom (CAT-001 treats everything that is neither predefined nor created by the suite as a legitimate migrated Custom plan and reports it). Delete semantics (CPL-005) follow `PlanDeletionService`: refused while live or sold.
- MIG-002 treats `desktop-agent` / `email-white-label` as survive-only-if-explicitly-granted; a legacy tenant that merely used the agent without a grant is reported as an owner decision, not failed. Ratify with the owner before sign-off.
- RESP and WK route lists use the routes that exist on Starter; a route that redirects by design is annotated, not weakened.

## 5. Fixture corrections versus genuine defects (rule for the report)
Fixture / test-side corrections (selectors, payload shapes, response ids, the calibrations above) get their own report section with a justification; **application defects get DP-QA records**. Any `enterprise-plus` behaviour that survives in the candidate (a plan row, catalogue entry, UI option, API response, billing path or source reference) is an application defect, never a fixture issue.

## 6. Still not covered, and why
- Absolute session lifetime (configured in days) cannot be exercised in a run; Not Run unless the candidate exposes a test clock.
- Advanced Data Management has no routes; nothing is asserted beyond "not represented as implemented".
- Visual baselines exist for Chromium only.
- Non-authentication notification e-mails are untested.
- A real mailbox and production link host (gate B5) need the owner's environment.
