# Known issues register

Part of [[README]]. Detail in `issues/`, evidence in `evidence/`, per-test evidence in [[RUN-005-RETEST-MATRIX]] and [[TRACEABILITY]].
Status reflects **RUN-005** on application SHA `f47e504c6397a8d51508fb3dbcf102314e9c9648` (QA suite `03131c8a`). A row is **Resolved** only after independent verification through the UI and/or API with persisted state checked; a failed fix is **Reopened**; nothing is closed on the developer's say-so.
Severity/priority: P0 release-stopping - P1 major workflow broken - P2 moderate/workaround - P3 cosmetic.

**34 records: 30 Resolved, 1 Reopened (partial: WebKit only), 3 Open (005 owner gate, 006 not reproduced, 026 owner decision).**

| ID | Title | Pri | RUN-005 status | Evidence |
|---|---|---|---|---|
| [[DP-QA-001]] | Module routes show a crash instead of the plan-gate screen | P2 | **Resolved** | ENT-1001/1002/1003/1005 pass (Chromium); MCP: /employees/import renders the gate, console clean (`RUN005-MCP-employees-import-plan-gate.png`) |
| [[DP-QA-002]] | Non-admin roles 403 on self-context/dashboard | P1 | **Resolved** | RBAC-1-EMPLOYEE/MANAGER/HR/PAYROLL pass on really provisioned tenants A and B; MCP employee My Profile loads with no 403 (`RUN005-MCP-employee-my-profile-tabs.png`) |
| [[DP-QA-003]] | /recruitment hub renders for Starter | P3 | **Resolved** | ENT-1004 pass |
| [[DP-QA-004]] | /employees/import crashes (uuid) | P2 | **Resolved** | Import is Growth-gated by contract: SMK-004 passes on Chromium/Firefox/mobile/tablet (clean redirect to the Data Management plan gate); CMD-022 asserts Import absent from Data Transfer; GRW-001..004 backend 403 on Starter; GRW-010..013 entitled access on the Growth tenant (`RUN005-MCP-employees-data-transfer-menu-no-import.png`). WebKit SMK-004 fails for the separate DP-QA-023 reason |
| [[DP-QA-005]] | Entitlement enforcement defaults to REPORT_ONLY | P1 (owner gate) | **Open** | Mechanism verified locally: ENFORCE env floor with NO PlatformSetting row -> Starter-excluded routes 403 (ENT-*, ENT-060..065, GRW-*); a malformed floor value fails closed to ENFORCE (second API :4196: /data-management/modules 403, /job-openings 403, /employees 200). Production state and grandfathering are the owner gate (PRODUCTION-RELEASE-GATES A1-A5); ENTITLEMENT_NOT_ENFORCED boot warning Blocked(environment) |
| [[DP-QA-006]] | /my-profile empty `src` warning | P3 | **Open** | Not reproduced: zero console warnings/errors on employee My Profile via MCP (level warning) and in every UI test (diag fixture fails on console errors). Cannot be Resolved without a located cause; remains P3 Not Reproduced |
| [[DP-QA-007]] | Logout slow / client timeout | P2 | **Resolved** | Measured POST /auth/logout on a disposable user, 6 samples: 7-15 ms (RUN-001: 600-3900 ms) on the local production build; AUTH-030 and SESS-010 pass. Production-like measurement stays a release gate (infrastructure latency differs) |
| [[DP-QA-008]] | No-match delete answers HTTP 200 success:false | P3 | **Resolved** | ISO-004: foreign and random id both 404 EMPLOYEE_NOT_FOUND with normalised bodies |
| [[DP-QA-009]] | Manager can read subscription price/cycle | P3 | **Resolved** | RBAC-2-PRICE: plan visible, price/cycle absent for manager; owner still sees them |
| [[DP-QA-010]] | No backend plan guard on four features | P1 | **Resolved** | ENT-060..065 pass (8 backend routes 403 on Starter); GRW-001..004 |
| [[DP-QA-011]] | Employee/HR leave types 403; none after provisioning | P1 | **Resolved** | LV-001, LV-008 pass; default leave types exist on freshly provisioned tenants A/B/G; employee form uses available-types |
| [[DP-QA-012]] | Invalid timezone accepted | P1 | **Resolved** | SET-003 pass (400 on invalid, usable value stored) |
| [[DP-QA-013]] | Colour-contrast failures on 5 screens | P2 | **Resolved** | A11Y-001/003/006/008/009 pass on tenants using the new default accent (note: tenants with a STORED brand colour keep it - gate) |
| [[DP-QA-014]] | Sort by Full Name error | P2 | **Resolved** | EMP-008 pass |
| [[DP-QA-015]] | Non-Starter tabs on employee records | P2 | **Resolved** | EMP-007 pass; MCP My Profile shows Summary, Attendance, Leave History, Documents, Previous Employment, Employee History, Education - no Timesheets/Payslips/Project Allocations |
| [[DP-QA-016]] | Branding logo unavailable to some roles | P2 | **Resolved** | BRAND-002: logo loads for owner, employee, HR, manager and payroll-manager; tenant B never receives A's asset |
| [[DP-QA-017]] | Overview overflows horizontally on phones | P2 | **Resolved** | RESP-001 pass on Chromium, mobile (Pixel 7) and tablet |
| [[DP-QA-018]] | Manager approves outside the reporting line | P2 | **Resolved** | LV-026 pass; LV-029: refused outside the line, 2xx once the employee reports to the manager, persisted APPROVED |
| [[DP-QA-019]] | Approved leave cannot be cancelled | P3 | **Resolved** | Contract changed (cancellation allowed): LV-023 asserts CANCELLED, second cancel refused, no 5xx |
| [[DP-QA-020]] | Overlapping leave not prevented under concurrency | P2 | **Resolved** | CONC-003 pass |
| [[DP-QA-021]] | New Employee form shown to an employee | P3 | **Resolved** | CMD-011 pass |
| [[DP-QA-022]] | Employee cannot read own attendance correction request | P2 | **Resolved** | ATT-009 pass; ATT-020..024 pass on a working day |
| [[DP-QA-023]] | Firefox/WebKit uncaught fetch errors on redirecting routes | P3 | **Reopened** | Firefox RESOLVED (SMK-004/011/015 12/12 over 4 repeats). WebKit REOPENED: SMK-004/011/015 fail intermittently (7 of 12 in a 4x repeat; 3 of 16 routes in the full run) with `pageerror: ...?_rsc=... due to access control checks` on RSC prefetches (`RUN005-DP-QA-023-webkit-rsc-prefetch-pageerrors.png`) |
| [[DP-QA-024]] | One 429 drops the user into the generic error screen | P3 | **Resolved** | PERF-003 pass (rate-limited pages say so; Retry-After sent) |
| [[DP-QA-025]] | Employee form issues ~100 API calls per load | P3 | **Resolved** | PERF-001/002 pass; developer reports 127 -> 69 calls |
| [[DP-QA-026]] | E-mail branding not applied to generated e-mails | P3 (decision) | **Open** | BRAND-005 passes what IS delivered (tenant company name + own host). The platform marks branding.emailSenderName/emailFooterText/showLogoInEmails NOT_IMPLEMENTED and the Branding screen does not offer them; no plan text promises branded e-mails. Not assumed optional: owner must decide implement vs. state platform-branded e-mail (gate) |
| [[DP-QA-027]] | Revoked/expired invitation tokens activate an account | P1 | **Resolved** | INV-102 (expiry aged in UTC), INV-105 (revoked by resend), SEC-003 (5 concurrent activations -> exactly 1), SEC-004 (replay after activation) pass; DB status CONSUMED/REVOKED asserted |
| [[DP-QA-028]] | Resend-invite sends no e-mail | P2 | **Resolved** | INV-103 pass: a new invitation e-mail reaches the local sink after resend |
| [[DP-QA-029]] | Leave balance not updated on approval; overdraw | P2 | **Resolved** | LV-031 pass: balance reflects the 1st approval, 2 approvals consume the 2-day entitlement, 3rd refused, never negative (fixture now reads the submitting employee's own balance row) |
| [[DP-QA-030]] | Soft-deleted employees still listed | P1 | **Resolved** | EMP-010 (UI list), SEC-005 (API list/search/entity data API), SEC-006 (404 by id for GET/PATCH/DELETE), SEC-007 (lookups) pass |
| [[DP-QA-031]] | Password-reset link reusable | P1 | **Resolved** | MAIL-002, SEC-001 (5 concurrent resets -> exactly 1 works), SEC-002 (replay with same/attacker password refused), SEC-008 (old access token 401 after reset), SEC-010 (UI: second reset refused with "invalid or expired", `RUN005-DP-QA-031-reset-link-replay-refused-ui.png`) |
| [[DP-QA-032]] | Activate account button click does nothing | P2 | **Resolved** | INV-104 (click) and INV-106 (Enter) pass |
| [[DP-QA-033]] | Dead /documents prefetch answers 404 | P3 | **Resolved** | NAV-001 pass |
| [[DP-QA-034]] | Employee My Profile lookups answer 403 | P2 | **Resolved** | TRC-034 pass; MCP network log of My Profile shows only 2xx |

## Release gate status
P0 open: **0**. P1 application defects open: **0** (027, 030, 031 and the four RUN-003 blockers are independently verified fixed). Owner gate: DP-QA-005 production ENFORCE cutover. P3/decision items: DP-QA-006, -023 (WebKit), -026. -> **CONDITIONALLY READY**, see [[README]] and [[PRODUCTION-RELEASE-GATES]].
