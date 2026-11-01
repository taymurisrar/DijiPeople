# RUN-007 preparation (no execution, no verdict)

Part of [[README]]. RUN-006 ([[RUN-006-2026-11-01]]) is the accepted independent **NOT READY** verdict for application `17d0dcaf` and, with RUN-001 to RUN-005 and all evidence, is untouched. RUN-007 starts only when the development agent supplies the **new committed final application SHA** that fixes DP-QA-035 to DP-QA-042. Until then nothing here has been run against a candidate; every expectation is the owner decision, not a description of a build.

Checkpoint: QA branch `agent/starter-golive-qa`, base `9c0f4111`.

## 1. Owner decisions (2026-11-01) and the tests that enforce them
| # | Decision | Defect | Tests |
|---|---|---|---|
| D1 | Standard exports exclude soft-deleted employees, national IDs, tax IDs and internal encrypted/hashed/storage fields | [[DP-QA-037]], [[DP-QA-038]] | EXP-001, EXP-002, EXP-003, IMX-030, IMX-031 |
| D2 | Sensitive-identifier export, if supported, needs explicit authorization, deliberate field selection and an audit row | DP-QA-037/038 | EXP-004 |
| D3 | Import/export/templates stay in every plan, subject to permissions and module entitlements | [[DP-QA-035]] | EXP-010-*, IMP-001, IMP-002, IMP-020, IMP-021, IMX-* |
| D4 | Desktop Agent and white-label need explicit grants on Custom subscriptions, even when based on enterprise-plus | [[DP-QA-042]] | CUS-001..005, AGT-001-C, BEM-006-C |
| D5 | Deployment seeding preserves valid approval workflows, e-mail settings and tenant-specific configuration | [[DP-QA-036]], [[DP-QA-039]] | APR-010..012, APR-020/021, APR-030, EML-001..004, SEED-001..011 |
| D6 | Existing and revoked agent credentials respect current entitlements promptly | DP-QA-042 | CUS-010, CUS-011, CUS-020, AGT-020 |

**"Promptly" is a newly decided number.** Today the entitlement cache makes enforcement take about 54-62 s (OBS-029). The specs use one constant `PROMPT_MS = 120000` (`29-run007-custom-grants-revocation.spec.ts`); if the owner sets a tighter SLA, change that one line and say so in the report. Measured delays are recorded as annotations.

## 2. New suites and stable test ids
Discovery after this preparation: **494** test instances in 33 files, 0 load errors, every new id unique.

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
| 29 grants/revocation | CUS-001..004 | enterprise-plus Custom, four grant combinations: agent and white-label follow the explicit grants only | API + real e-mail |
| | CUS-005 | enterprise-plus Custom with no explicit rows: agent refused (DP-QA-042) | API |
| | CUS-010 | Withdrawal cuts access token, refresh token and new sign-in within `PROMPT_MS`; delays recorded | API |
| | CUS-011 | Same user's ordinary web route still works; agent route 403 | API |
| | CUS-020 | enterprise -> growth -> enterprise: agent refused within budget, old token refused, upgrade restores | API |
| | SESS-030 | Idle-expired web session cannot be revived by refresh | API + DB |
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
2. Provision the tenants (`provision-plan-tenants.ps1`) **before the first `seed:config`**, and provision `qa-probe` the same way. **Do not apply the RUN-006 administrator remediation** (owner assigned to `system-admin`) to any tenant: that remediation exists only because DP-QA-036 was open. If the candidate needs it, DP-QA-036 stays open.
3. Order: functional suites first, the seed/migration group (SEED, APR-010..012, EML-*) last, because running the seed is itself a state change (OBS-035).
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
- Custom on enterprise-plus is built by switching tenant C's `Subscription.planId` in the throwaway database (onboarding cannot sell enterprise-plus). The original plan and feature rows are restored in `afterAll`.
- RESP and WK route lists use the routes that exist on Starter; a route that redirects by design is annotated, not weakened.

## 5. Still not covered, and why
- Absolute session lifetime (configured in days) cannot be exercised in a run; Not Run unless the candidate exposes a test clock.
- Advanced Data Management has no routes; nothing is asserted beyond "not represented as implemented".
- Visual baselines exist for Chromium only.
- Non-authentication notification e-mails are untested.
- A real mailbox and production link host (gate B5) need the owner's environment.
