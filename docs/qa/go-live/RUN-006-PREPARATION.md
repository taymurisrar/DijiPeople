# RUN-006 preparation (no execution, no verdict)

Part of [[README]]. RUN-005 ([[RUN-005-2026-10-31]]) is an accurate historical result for application `f47e504c` and is untouched; RUN-006 starts only when Session 2 supplies the new final application SHA. Requirements: [[STARTER-SCOPE]] section "Subscription requirements approved 2026-10-31". Traceability: [[TRACEABILITY]].

## 1. Open questions the development handoff must answer (QA will not guess)
| # | Question | Blocks |
|---|---|---|
| Q1 | Which data-management routes/features are "advanced" (premium), and on which plans? | REQ-2 tests (none written) |
| Q2 | Is the Desktop Agent included in `enterprise-plus`? | AGT matrix, MTX |
| Q3 | How is Custom "explicitly enabled" (override mechanism, plan key, grandfather flag)? What does a Custom tenant WITHOUT the agent get? | `C` fixture, AGT-001-C, MTX-010-C |
| Q4 | Exact attribution wording and where the DijiPeople attribution appears in e-mails | BEM-004 |
| Q5 | Logo delivery in e-mail (absolute URL, inline cid, attachment) and the setting keys (`emailBrandColor`, `emailFooterText`, `emailSenderName`, `showLogoInEmails`) | BEM-001/002/005 |
| Q6 | Which Starter feature keys were added (basic data management? e-mail branding?) | ENT-030 (`APPROVED_STARTER_ADDITIONS`) |

## 2. What was prepared (authored from the requirements; none executed against a candidate)
| Suite | Tests | Requirement |
|---|---|---|
| `20-import-export-all-plans` | IMX-001..006 per plan (A Starter, G, E, C), IMX-009..011, IMX-020..024 (Settings and Employees command-bar UI) | REQ-1 |
| `21-desktop-agent-plan-matrix` | AGT-001..003 per plan, AGT-010..013 (anonymous, forged token, employee role, cross-tenant, agent-client sign-in) | REQ-3 |
| `22-branded-emails` | BEM-001/002/004/005 per plan, BEM-010..013 (fallbacks, isolation, HTML escaping, link/host) | REQ-5, REQ-6 |
| `23-entitlement-matrix` | MTX-001, MTX-010 per plan, MTX-020 | REQ-8 |
| `24-session-idle-expiry` | SESS-020/021 using the tenant `idleTimeoutMinutes=1` policy (no 8-hour wait) | coverage gap |
| updated | ENT-030 (matrix-driven), ENT-060/061 and GRW-001..004 (basic import is allowed on Starter) | REQ-1 |
| tools | `provision-plan-tenants.ps1`, `webkit-regression.ps1`, `traceability.mjs` (+ requirement map), fixtures for `E`/`C` tenants and `entitlement-matrix.ts` | |

Discovery: 415 test instances, 0 load errors, 337 unique ids, traceability 0 problems. Tests for plan tenants that are not provisioned report **Not Run with a reason**, never Passed.
Assumptions that may need a justified selector/payload correction on first contact (never an assertion change): export job payload (`moduleKey`, `format`) and status vocabulary, the importer file-input selector, Settings > Data Management headings, e-mail logo markup.

## 3. Real limitations recorded now
- **Leave accrual is not a product feature by design.** The leave service allocates the FULL annual entitlement up front at policy assignment (owner decision 2026-08-29, EXECPLAN-0026); no scheduler exists, although the policy-rule DTO carries accrual fields. LV-030..032 cover allocation and balance consumption. A future accrual feature would need a new test design with a controllable clock.
- **Leave delegation:** no user-facing feature; only reporting-line and assigned-approver routing (LV-026/029).
- **Absolute session lifetime** is configured in days: Not Run. Idle expiry is testable (SESS-020/021) only if the platform accepts a 1-minute policy; a refusal is reported as Blocked.
- **Advanced data management, Custom plan, white-label:** untestable until Q1/Q3/Q4 are answered.
- Visual baselines are Chromium-only; non-auth notification e-mails untested; real-inbox deliverability is an owner gate.
- Production ENFORCE verification stays outside QA (REQ-7); locally the mechanism is verified with the environment floor and no PlatformSetting row.

## 4. RUN-006 execution protocol (when the SHA arrives)
1. Resolve the full 40-hex SHA in the development worktree and confirm it is a code commit, not a docs-only handoff. Create the detached worktree (`prepare-run005.ps1 -Sha <sha> -Database dijipeople_starterv6_test`), fresh DB, clean `npm ci`, production build, ENFORCE floor. Use new ports (suggest API 4297, web 3214, TLS 3644, sink 1225/8225) after checking `netstat`; never touch other sessions' processes.
2. Provision A, B, G, E (and C per Q3) through the real workflow; set `QA_TENANT_{G,E,C}_*` in `.env.qa.local`; commit the QA tree first so the QA SHA is real.
3. Fill `APPROVED_STARTER_ADDITIONS` and the Q1-Q6 answers from the handoff; run `traceability.mjs`.
4. Full Chromium run; `run-all-browsers.ps1`; `webkit-regression.ps1 -Repeat 10` (DP-QA-023, with traces); Playwright MCP inspection of Settings > Data Management, the Import/Export dialogs, a branded e-mail rendered from the sink, and the Enterprise agent settings screen.
5. Never edit specs during a run. Correct failures only for verified contract or fixture reasons and list each in the report. `merge-run.cjs` -> `make-run-report.mjs` -> `retest-matrix.mjs`; the report is immutable once committed.
6. Verdict by the rules in [[README]]: zero unresolved P0/P1, critical-workflow coverage, verified entitlement security, repeatable results. Owner gates are listed, never marked passed.

## 5. Owner answers and candidate preflight (2026-11-01) - execution still on hold
**Answers to Q1-Q6** (owner dispatch): Q1 `advanced-data-management` is premium but has **no implemented routes** - no test is written and it is reported as *not implemented*, never as covered. Q2 Enterprise-class plans include the agent only where explicitly entitled; Starter/Growth never; Custom needs an explicit entitlement. Q3 Custom uses the existing custom-plan / tenant-entitlement mechanism, not a `custom` catalogue key (the `C` fixture is built from that mechanism; Not Run until a Custom tenant exists). Q4 attribution is `Powered by DijiPeople`. Q5 configured logos must render safely without recipient login: assert the real HTML and fetch the asset anonymously. Q6 new keys: `data-import-export`, `advanced-data-management`, `email-template-customization`, `email-white-label`; `desktop-agent` stays separate.

**Mapping read from candidate `a55bb679` (`plans.catalog.ts`, read-only)**: Starter = 7 base keys + `data-import-export`; Growth adds timesheets, projects, recruitment, onboarding, `attendance-integrations`, `data-import-export`, `advanced-data-management`, `email-template-customization` (no agent, no white-label); Enterprise and Enterprise+ = every catalogue key. Migration `20261101090000_split_data_import_export_entitlement` renames the old key to `advanced-data-management` and adds `data-import-export` to every plan. Fixtures updated accordingly (`APPROVED_STARTER_ADDITIONS = ['data-import-export']`). To be verified at run time against the resolved features, not assumed.

**Candidate status: NOT FINAL.** `a55bb679` is an ancestor of handoff `3054f1fa`, but the development worktree holds uncommitted edits to `seed-config.ts` and `production-sink-retirement.spec.ts` (the seed:config e-mail-provider overwrite check). RUN-006 starts only when the final SHA is confirmed; if it differs from `a55bb679`, the code diff is re-read first.

**Additional tests to author once the final SHA is known** (selectors and admin routes depend on it): repeated `seed:config` preserves an existing SMTP provider row; fresh tenant gets safe e-mail defaults; migration keeps existing tenants' features and branding; downgraded tenant's existing agent token is refused; Enterprise/Custom agent works as entitled; WebKit prefetch retest. Test counts are reported as executed / Not Run / excluded, never as a required pass count.

## 6. SMTP / seed / migration regression (added 2026-11-01, still not executed)
Spec `25-seed-migration-idempotency` (SEED-001..009, chromium project only, needs `QA_API_WORKTREE` in `.env.qa.local`, else Not Run): disabled SMTP marker with a per-run DUMMY credential survives repeated `seed:config` byte-for-byte (incl. `updatedAt`); a tenant with any provider never gets the Console default; a tenant with none gets exactly one and a second seed adds none; invitation and reset mail still DELIVER through the local sink after seeding; branding, settings, features, roles, role permissions and privileges are unchanged; two seed runs give identical snapshots with no duplicates; migrations all finished and the entitlement-split migration SQL re-applied twice is a no-op. Snapshots attach only hashes. `tools/secret-scan.cjs <dirs>` scans results, reports and docs for the dummy secret, URL credentials, secret-bearing JSON members, auth headers and the QA password; run it before every commit and on the whole results folder before the report is closed (REQ-9, requirement 6). Known limits: the marker is a disabled SMTP row (an enabled one would reroute delivery away from the sink), so "enabled SMTP keeps working" is proven by the Console/sink path in SEED-004 plus the code-level rule; the exact encrypted-credential format used by the admin UI is not reproduced. Discovery: 424 tests / 28 files, 0 load errors.
