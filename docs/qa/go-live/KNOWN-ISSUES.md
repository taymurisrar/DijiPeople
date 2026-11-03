# Known issues register

Part of [[README]]. Detail in `issues/`, evidence in `evidence/`, per-test evidence in [[RUN-006-RETEST-MATRIX]] (RUN-005: [[RUN-005-RETEST-MATRIX]]) and [[TRACEABILITY]].
Status reflects **RUN-006** (see the RUN-007 section below, which supersedes it) on application SHA `17d0dcafa33bdb8123e88f73d3346c577d25b4e3` (QA suite `21b318b6`); RUN-005 (`f47e504c`) statuses are kept in each record's run table and in [[RUN-005-2026-10-31]]. A row is **Resolved** only after independent verification through the UI and/or API with persisted state checked; a failed fix is **Reopened**; not executed is **Not Run**, never Passed.
Severity/priority: P0 release-stopping - P1 major workflow broken - P2 moderate/workaround - P3 cosmetic.

**42 records. Earlier 34 at RUN-006: 32 Resolved, 1 Reopened (023, WebKit on redirecting URLs), 1 Open owner gate (005). New in RUN-006: 8 records (035-042), all Open: 2 P1 ([[DP-QA-036]], [[DP-QA-037]]), 5 P2 (one is an owner review, [[DP-QA-042]]), 1 P3.**

| ID | Title | Pri | RUN-006 status | Evidence |
|---|---|---|---|---|
| [[DP-QA-001]] | Module routes show a crash instead of the plan-gate screen | P2 | **Resolved** | RUN-006: ENT-1001: pass, ENT-1002: pass, ENT-1003: pass, ENT-1005: pass. _RUN-005:_ ENT-1001/1002/1003/1005 pass (Chromium); MCP: /employees/import renders the gate, console clean (`RUN005-MCP-employees-import-plan-gate.png`) |
| [[DP-QA-002]] | Non-admin roles 403 on self-context/dashboard | P1 | **Resolved** | RUN-006: RBAC-1-EMPLOYEE: pass, RBAC-1-MANAGER: pass, RBAC-1-HR: pass, RBAC-1-PAYROLL: pass. _RUN-005:_ RBAC-1-EMPLOYEE/MANAGER/HR/PAYROLL pass on really provisioned tenants A and B; MCP employee My Profile loads with no 403 (`RUN005-MCP-employee-my-profile-tabs.png`) |
| [[DP-QA-003]] | /recruitment hub renders for Starter | P3 | **Resolved** | RUN-006: ENT-1004: pass. _RUN-005:_ ENT-1004 pass |
| [[DP-QA-004]] | /employees/import crashes (uuid) | P2 | **Resolved** | RUN-006: the route crash is gone: `/employees/import` redirects to Settings > Data Management on every plan (basic import/export is now on every plan, owner-approved); SMK-004 passes on Chromium/Firefox/WebKit/tablet. The command-bar *Import* action is dead: [[DP-QA-035]]; the page has a zero-width content column on phones: [[DP-QA-041]]. _RUN-005:_ Import is Growth-gated by contract: SMK-004 passes on Chromium/Firefox/mobile/tablet (clean redirect to the Data Management plan gate); CMD-022 asserts Import absent from Data Transfer; GRW-001..004 backend 403 on Starter; GRW-010..013 entitled access on the Growth tenant (`RUN005-MCP-employees-data-transfer-menu-no-import.png`). WebKit SMK-004 fails for the separate DP-QA-023 reason |
| [[DP-QA-005]] | Entitlement enforcement defaults to REPORT_ONLY | P1 (owner gate) | **Open (owner gate)** | RUN-006: mechanism re-verified locally on `17d0dcaf` (ENFORCE environment floor, no PlatformSetting row: ENT-*, MTX-001, AGT-*, IMX-* pass); production `ENFORCE`/grandfathering remains a separately authorised deployment gate (A1..A5). _RUN-005:_ Mechanism verified locally: ENFORCE env floor with NO PlatformSetting row -> Starter-excluded routes 403 (ENT-*, ENT-060..065, GRW-*); a malformed floor value fails closed to ENFORCE (second API :4196: /data-management/modules 403, /job-openings 403, /employees 200). Production state and grandfathering are the owner gate (PRODUCTION-RELEASE-GATES A1-A5); ENTITLEMENT_NOT_ENFORCED boot warning Blocked(environment) |
| [[DP-QA-006]] | /my-profile empty `src` warning | P3 | **Resolved** | RUN-006: located by the developer (`AccessDeniedState` rendered `<button href="">`); verified by QA with DevTools on the production build: "Back to dashboard" on `/access-denied` is `<a href="/">`, navigates to the dashboard, console clean on `/my-profile` and `/access-denied` (`RUN006-MCP-employee-access-denied.png`). _RUN-005:_ Not reproduced: zero console warnings/errors on employee My Profile via MCP (level warning) and in every UI test (diag fixture fails on console errors). Cannot be Resolved without a located cause; remains P3 Not Reproduced |
| [[DP-QA-007]] | Logout slow / client timeout | P2 | **Resolved** | RUN-006: POST /auth/logout 7-19 ms over 6 samples on the local production build (RUN-001: 600-3900 ms); AUTH-030, SESS-010 pass. Production-like latency remains an owner gate. _RUN-005:_ Measured POST /auth/logout on a disposable user, 6 samples: 7-15 ms (RUN-001: 600-3900 ms) on the local production build; AUTH-030 and SESS-010 pass. Production-like measurement stays a release gate (infrastructure latency differs) |
| [[DP-QA-008]] | No-match delete answers HTTP 200 success:false | P3 | **Resolved** | RUN-006: ISO-004: pass. _RUN-005:_ ISO-004: foreign and random id both 404 EMPLOYEE_NOT_FOUND with normalised bodies |
| [[DP-QA-009]] | Manager can read subscription price/cycle | P3 | **Resolved** | RUN-006: RBAC-2-PRICE: pass. _RUN-005:_ RBAC-2-PRICE: plan visible, price/cycle absent for manager; owner still sees them |
| [[DP-QA-010]] | No backend plan guard on four features | P1 | **Resolved** | RUN-006: ENT-060: pass, ENT-061: pass, ENT-062: pass, ENT-063: pass, ENT-064: pass, ENT-065: pass. _RUN-005:_ ENT-060..065 pass (8 backend routes 403 on Starter); GRW-001..004 |
| [[DP-QA-011]] | Employee/HR leave types 403; none after provisioning | P1 | **Resolved** | RUN-006: LV-001: pass, LV-008: pass. _RUN-005:_ LV-001, LV-008 pass; default leave types exist on freshly provisioned tenants A/B/G; employee form uses available-types |
| [[DP-QA-012]] | Invalid timezone accepted | P1 | **Resolved** | RUN-006: SET-003: pass. _RUN-005:_ SET-003 pass (400 on invalid, usable value stored) |
| [[DP-QA-013]] | Colour-contrast failures on 5 screens | P2 | **Resolved** | RUN-006: A11Y-001: pass, A11Y-003: pass, A11Y-006: pass, A11Y-008: pass, A11Y-009: pass. _RUN-005:_ A11Y-001/003/006/008/009 pass on tenants using the new default accent (note: tenants with a STORED brand colour keep it - gate) |
| [[DP-QA-014]] | Sort by Full Name error | P2 | **Resolved** | RUN-006: EMP-008: pass. _RUN-005:_ EMP-008 pass |
| [[DP-QA-015]] | Non-Starter tabs on employee records | P2 | **Resolved** | RUN-006: EMP-007: pass. _RUN-005:_ EMP-007 pass; MCP My Profile shows Summary, Attendance, Leave History, Documents, Previous Employment, Employee History, Education - no Timesheets/Payslips/Project Allocations |
| [[DP-QA-016]] | Branding logo unavailable to some roles | P2 | **Resolved** | RUN-006: BRAND-002: pass. _RUN-005:_ BRAND-002: logo loads for owner, employee, HR, manager and payroll-manager; tenant B never receives A's asset |
| [[DP-QA-017]] | Overview overflows horizontally on phones | P2 | **Resolved** | RUN-006: RESP-001: pass. _RUN-005:_ RESP-001 pass on Chromium, mobile (Pixel 7) and tablet |
| [[DP-QA-018]] | Manager approves outside the reporting line | P2 | **Resolved** | RUN-006: LV-026: pass. _RUN-005:_ LV-026 pass; LV-029: refused outside the line, 2xx once the employee reports to the manager, persisted APPROVED |
| [[DP-QA-019]] | Approved leave cannot be cancelled | P3 | **Resolved** | RUN-006: LV-023: pass. _RUN-005:_ Contract changed (cancellation allowed): LV-023 asserts CANCELLED, second cancel refused, no 5xx |
| [[DP-QA-020]] | Overlapping leave not prevented under concurrency | P2 | **Resolved** | RUN-006: CONC-003: pass. _RUN-005:_ CONC-003 pass |
| [[DP-QA-021]] | New Employee form shown to an employee | P3 | **Resolved** | RUN-006: CMD-011: pass. _RUN-005:_ CMD-011 pass |
| [[DP-QA-022]] | Employee cannot read own attendance correction request | P2 | **Resolved** | RUN-006: ATT-009: pass. _RUN-005:_ ATT-009 pass; ATT-020..024 pass on a working day |
| [[DP-QA-023]] | Firefox/WebKit uncaught fetch errors on redirecting routes | P3 | **Reopened** | RUN-006: in-app navigation is clean (all prefetches 200, 0 page errors on `/employees`), but WebKit still raises the "access control checks" page error whenever a **redirecting URL is opened directly**: SMK-004 8/10, SMK-011 3/10, SMK-015 7/10 failures in a 10x repeat (18 of 30), 0/20 on stable pages; Firefox clean. Cause shown: WebKit reports prefetches cancelled by the redirect. No user-visible effect (P3). _RUN-005:_ Firefox RESOLVED (SMK-004/011/015 12/12 over 4 repeats). WebKit REOPENED: SMK-004/011/015 fail intermittently (7 of 12 in a 4x repeat; 3 of 16 routes in the full run) with `pageerror: ...?_rsc=... due to access control checks` on RSC prefetches (`RUN005-DP-QA-023-webkit-rsc-prefetch-pageerrors.png`) |
| [[DP-QA-024]] | One 429 drops the user into the generic error screen | P3 | **Resolved** | RUN-006: PERF-003: pass. _RUN-005:_ PERF-003 pass (rate-limited pages say so; Retry-After sent) |
| [[DP-QA-025]] | Employee form issues ~100 API calls per load | P3 | **Resolved** | RUN-006: PERF-001: pass, PERF-002: pass. _RUN-005:_ PERF-001/002 pass; developer reports 127 -> 69 calls |
| [[DP-QA-026]] | E-mail branding not applied to generated e-mails | P3 (decision) | **Resolved** | RUN-006: superseded by the owner requirement (essential company-branded e-mail on every plan): BEM-001/002/004 pass on Starter, Growth, Enterprise and Custom; name, logo (anonymously loadable), colour, "Powered by DijiPeople", working links; white-label drops the attribution (`RUN006-MCP-email-reset-*.png`). _RUN-005:_ BRAND-005 passes what IS delivered (tenant company name + own host). The platform marks branding.emailSenderName/emailFooterText/showLogoInEmails NOT_IMPLEMENTED and the Branding screen does not offer them; no plan text promises branded e-mails. Not assumed optional: owner must decide implement vs. state platform-branded e-mail (gate) |
| [[DP-QA-027]] | Revoked/expired invitation tokens activate an account | P1 | **Resolved** | RUN-006: INV-102: pass, INV-105: pass, SEC-003: pass, SEC-004: pass. _RUN-005:_ INV-102 (expiry aged in UTC), INV-105 (revoked by resend), SEC-003 (5 concurrent activations -> exactly 1), SEC-004 (replay after activation) pass; DB status CONSUMED/REVOKED asserted |
| [[DP-QA-028]] | Resend-invite sends no e-mail | P2 | **Resolved** | RUN-006: INV-103: pass. _RUN-005:_ INV-103 pass: a new invitation e-mail reaches the local sink after resend |
| [[DP-QA-029]] | Leave balance not updated on approval; overdraw | P2 | **Resolved** | RUN-006: LV-031: pass. _RUN-005:_ LV-031 pass: balance reflects the 1st approval, 2 approvals consume the 2-day entitlement, 3rd refused, never negative (fixture now reads the submitting employee's own balance row) |
| [[DP-QA-030]] | Soft-deleted employees still listed | P1 | **Resolved** | RUN-006: EMP-010: pass, SEC-005: pass, SEC-006: pass, SEC-007: pass. _RUN-005:_ EMP-010 (UI list), SEC-005 (API list/search/entity data API), SEC-006 (404 by id for GET/PATCH/DELETE), SEC-007 (lookups) pass |
| [[DP-QA-031]] | Password-reset link reusable | P1 | **Resolved** | RUN-006: MAIL-002: pass, SEC-001: pass, SEC-002: pass, SEC-008: pass. _RUN-005:_ MAIL-002, SEC-001 (5 concurrent resets -> exactly 1 works), SEC-002 (replay with same/attacker password refused), SEC-008 (old access token 401 after reset), SEC-010 (UI: second reset refused with "invalid or expired", `RUN005-DP-QA-031-reset-link-replay-refused-ui.png`) |
| [[DP-QA-032]] | Activate account button click does nothing | P2 | **Resolved** | RUN-006: INV-104: pass, INV-106: pass. _RUN-005:_ INV-104 (click) and INV-106 (Enter) pass |
| [[DP-QA-033]] | Dead /documents prefetch answers 404 | P3 | **Resolved** | RUN-006: NAV-001: pass. _RUN-005:_ NAV-001 pass |
| [[DP-QA-034]] | Employee My Profile lookups answer 403 | P2 | **Resolved** | RUN-006: TRC-034: pass. _RUN-005:_ TRC-034 pass; MCP network log of My Profile shows only 2xx |

## Post-deploy verification 2026-11-03 (production `2a473785`) — read first

The RUN-008 verdicts apply to application `4dd29d3a`, **which is not in production**. New records: [[DP-QA-051]] (P1 release blocker: the 60-commit remediation is not deployed), [[DP-QA-052]] (P2: the Render `ENTITLEMENT_ENFORCEMENT_MODE` variable is inert on the deployed code; enforcement rests on the database row, which has no audit trail), [[DP-QA-053]] (P3, corrected: tenant CONSOLE rows are ignored in production, mail goes through the platform relay; delivery proof still owed). Production enforcement itself is **ON** (database row `ENFORCE`). [[DP-QA-048]] has a validated fix on branch `agent/smoke-tenant-login`. Details, evidence and next actions: [[PRODUCTION-VERIFICATION-2026-11-03]].

## RUN-008 status (application `4dd29d3a`, QA suite `c5867698`) — supersedes the RUN-007 section below

**50 records.** Independently verified in RUN-008: [[DP-QA-043]], [[DP-QA-044]], [[DP-QA-047]] (Resolved); the DP-QA-005 release mechanism (verified; production cutover still the owner's). **Open:** DP-QA-005 (owner gate), [[DP-QA-045]] and [[DP-QA-046]] (owner decisions, brief in [[OWNER-DECISIONS-045-046]]), and three records new in RUN-008, all P3: [[DP-QA-048]] (smoke login sends no tenant), [[DP-QA-049]] (price edit needs Stripe, raw 500), [[DP-QA-050]] (create-tenant `alreadyExists` while PROVISIONING_FAILED). Open P0: 0. Open P1: 0.

| ID | Title | Pri | RUN-008 | Evidence |
|---|---|---|---|---|
| [[DP-QA-005]] | Entitlement enforcement defaults to REPORT_ONLY | owner gate | **Gate verified; production variable open** | GATE-001..007 |
| [[DP-QA-043]] | Operator subscription assignment ignores a plan's reservation | P2 | **Resolved** | RSV-001..006, CPL-009 |
| [[DP-QA-044]] | Custom plans cannot be published | P2 | **Resolved** (amount edit Blocked, 049) | PUB-001..006, PUB-008, PUBUI-001/002 |
| [[DP-QA-047]] | Reassignment withdraws entitlements after the 60 s TTL | P2 | **Resolved** (one process) | REV-001..006, CUS-010/012/020 |
| [[DP-QA-045]] | Expired Custom subscription keeps every entitlement | P3 (owner decision) | **Open** | CUS-030 fails, assertion unchanged |
| [[DP-QA-046]] | A Custom plan cannot withhold five core features | P3 (owner decision) | **Open** | CUS-006 observation |
| [[DP-QA-048]] | `smoke:deployment` login-based checks and the Starter probe cannot sign in | P3 | **Open (new)** | GATE-008 fails |
| [[DP-QA-049]] | Price amount edit runs Stripe preparation: raw 500 without Stripe | P3 | **Open (new)** | PUB-007 Blocked |
| [[DP-QA-050]] | create-tenant answers `alreadyExists` for a PROVISIONING_FAILED tenant | P3 | **Open (new)** | PUB-003 |

## RUN-007 status (application `98f9b025`, QA suite `7b60e22d`) — supersedes the RUN-006 column below

**47 records.** Resolved and independently verified in RUN-007: DP-QA-001..004, 006..034 (re-run through the full suite), **023** (WebKit regression 10x), **035, 036, 037, 038, 039, 040, 041, 042**. **Open:** DP-QA-005 (owner gate), and five records new in RUN-007 — three P2 ([[DP-QA-043]], [[DP-QA-044]], [[DP-QA-047]]) and two P3 owner items ([[DP-QA-045]], [[DP-QA-046]]). Open P0: 0. Open application P1: 0.

| ID | Title | Pri | RUN-007 | Evidence |
|---|---|---|---|---|
| [[DP-QA-005]] | Entitlement enforcement defaults to REPORT_ONLY | P1 (owner gate) | **Open (owner gate)** | all results under the ENFORCE environment floor; production must set it |
| [[DP-QA-023]] | WebKit page error on redirecting URLs | P2 | **Resolved** | SMK-011/015 on 5 projects; WK-100..110; 10x regression 55/55 |
| [[DP-QA-035]]..[[DP-QA-041]] | command-bar import, approval routing, export privacy, internal columns, seed overwrite, `/auth/me`, mobile settings | P1–P3 | **Resolved** | see [[RUN-007-2026-11-02]] and [[RUN-007-RETEST-MATRIX]] |
| [[DP-QA-042]] | enterprise-plus / Custom default grants | P2 | **Resolved** | exactly three plans; Custom grants exact; legacy plan converted |
| [[DP-QA-043]] | Operator subscription assignment ignores a plan's reservation | P2 | **Open (new)** | CPL-009 |
| [[DP-QA-044]] | Custom plans cannot be published (onboarding refused; no Contact Sales) | P2 | **Open (new)** | CPL-010, fixture note |
| [[DP-QA-047]] | Subscription reassignment withdraws entitlements only after the 60 s TTL | P2 | **Open (new)** | CUS-012 (60.0 s), CUS-020 (59.2–60.1 s) |
| [[DP-QA-045]] | Expired Custom subscription keeps every entitlement | P3 (owner decision) | **Open (new)** | CUS-030 |
| [[DP-QA-046]] | Custom plan cannot withhold five core features at the API | P3 (awareness) | **Open (new)** | CUS-006 observation |

## Release gate status
RUN-006: P0 open: **0**. **P1 application defects open: 2** ([[DP-QA-036]] unroutable default approval route after seed:config, [[DP-QA-037]] deleted employees in the export). Owner gate: DP-QA-005 production ENFORCE cutover. Owner reviews: [[DP-QA-038]] plaintext identifiers, [[DP-QA-042]] Custom/enterprise-plus defaults. P2/P3 items are listed above and below.

## New in RUN-006 (application `17d0dcaf`)

| ID | Title | Pri | Status | Evidence |
|---|---|---|---|---|
| [[DP-QA-036]] | `seed:config` gives onboarded tenants an unroutable default approval route (leave and timesheets refused) | **P1** | **Open** | APR-001/002; reproduced on a fresh tenant created through onboarding |
| [[DP-QA-037]] | Employee export includes soft-deleted employees, with plaintext national ID and tax ID | **P1** | **Open** | IMX-030; four deleted employees still exported |
| [[DP-QA-038]] | Encrypted/hashed storage columns offered for import and written to the export | P2 (owner decision for plaintext ids) | **Open** | IMX-031 |
| [[DP-QA-035]] | Employees command bar "Import" does nothing on every plan | P2 | **Open** | IMX-023; MCP 3x; cause in the record |
| [[DP-QA-039]] | `seed:config` overwrites tenant-chosen notification settings on every run | P2 | **Open** | SEED-005/006/010/011 |
| [[DP-QA-041]] | Settings sub-pages unusable at phone width (content column 0 px wide) | P2 | **Open** | SMK-004 on mobile; layout probe |
| [[DP-QA-042]] | Custom / enterprise-plus gets the Desktop Agent and white-label by default | P2 (owner review) | **Open** | catalogue + override experiments |
| [[DP-QA-040]] | `/auth/me` reports an idle-expired session as live | P3 | **Open** | SESS-023 |
