# Known issues register

Part of [[README]]. Detail in `issues/`, evidence in `evidence/`, remediation order in [[REMEDIATION-BACKLOG]].
Status reflects **RUN-004** (candidate application SHA `22a21a14`, QA suite base `8c1ee270` + RUN-004 edits). A row is **Resolved** only after a passing independent retest
(functional + API + UI where applicable); a failed fix is **Reopened** with a screenshot; nothing is closed on the developer's say-so.
Severity: Critical/High/Medium/Low. Priority: P0 release-stopping · P1 major workflow broken · P2 moderate/workaround · P3 cosmetic.

## RUN-003 findings reconciled in RUN-004

| ID | Title | Pri | RUN-004 status | Evidence (RUN-004) |
|---|---|---|---|---|
| [[DP-QA-001]] | Module routes show a crash instead of plan-gate | P2 | **Resolved** | ENT-1001/1002/1003/1005 pass |
| [[DP-QA-002]] | Non-admin roles 403 on self-context/dashboard | P1 | **Resolved** (provisioned tenants A/B) | RBAC-1-* pass; payroll Overview + employee My Profile load |
| [[DP-QA-003]] | `/recruitment` hub renders for Starter | P3 | **Resolved** | ENT-1004 passes |
| [[DP-QA-004]] | `/employees/import` fails (uuid) | P2 | **Reopened** | SMK-004 fails on all 5 browsers, CMD-022 fails; React #441 — `evidence/DP-QA-004-r4-import-menuitem-does-nothing.png` |
| [[DP-QA-005]] | Entitlement enforcement default `REPORT_ONLY` | P1 (owner gate) | **Mechanism verified locally; production gate open** | Env floor `ENFORCE` holds with no PlatformSetting; malformed value fails closed (second API :4096). Production boot warning Blocked(environment). Owner must verify production read-only — [[PRODUCTION-RELEASE-GATES]] |
| [[DP-QA-006]] | `/my-profile` empty-`src` warning | P3 | Open (not addressed) | — |
| [[DP-QA-007]] | Logout slow / client timeout | P2 prov. | Open (not addressed) | AUTH-030 passes functionally |
| [[DP-QA-008]] | No-match delete HTTP 200 `success:false` | P3 | **Resolved** | ISO-004 expects 404 EMPLOYEE_NOT_FOUND |
| [[DP-QA-009]] | Manager can read subscription price | P3 | **Resolved** | RBAC-2-PRICE |
| [[DP-QA-010]] | No backend plan guard on four features | P1 | **Resolved** | ENT-060..065 pass |
| [[DP-QA-011]] | Employee/HR leave types 403; none after provisioning | P1 | **Resolved** | LV-001, LV-008 pass; form uses `available-types` |
| [[DP-QA-012]] | Invalid timezone accepted | P1 | **Resolved** | SET-003 passes |
| [[DP-QA-013]] | Colour-contrast failures | P2 | Open (unchanged) | A11Y-001/3/6/8/9 fail |
| [[DP-QA-014]] | Sort by Full Name error | P2 | **Resolved** | EMP-008 |
| [[DP-QA-015]] | Non-Starter tabs on employee record | P2 | **Reopened for My Profile** (admin record page resolved) | EMP-007 passes; employee My Profile still shows Timesheets/Payslips/Project Allocations — `evidence/DP-QA-015-r4-my-profile-nonstarter-tabs.png` |
| [[DP-QA-016]] | Branding logo 404 for non-admins | P2 | **Reopened** | 200 for owner/employee/HR/manager but 403 for payroll-manager (BRAND-002) |
| [[DP-QA-017]] | Overview overflows on phone | P2 | Open (unchanged) | RESP-001 mobile fails |
| [[DP-QA-018]] | Manager approves outside reporting line | P2→P1 if scoped | Open | LV-026 fails |
| [[DP-QA-019]] | Approved leave cannot be cancelled | P3 | Open (product decision) | — |
| [[DP-QA-020]] | Overlapping leave under concurrency | P2 | Open | CONC-003 fails |
| [[DP-QA-021]] | New Employee form shown to employee | P3 | Open | CMD-011 fails |
| [[DP-QA-022]] | Employee cannot read own correction request | P2 | **Resolved (collateral)** | ATT-009 passes |
| [[DP-QA-023]] | Firefox/WebKit fetch errors on redirecting routes | P3 | Open | SMK-011/015 fail on Firefox and WebKit |
| [[DP-QA-024]] | One 429 drops user to error screen | P3 | Open | ~100 API calls per employee form load |
| [[DP-QA-025]] | Employee form issues ~100 API calls per load | P3 | Open | see record |

## New in RUN-004

| ID | Title | Pri | Status | Tests |
|---|---|---|---|---|
| [[DP-QA-027]] | Revoked and expired invitation tokens still activate an account | **P1** | Open | INV-102, INV-105 |
| [[DP-QA-030]] | Soft-deleted employees are still listed on the Employees list | **P1** | Open | EMP-010 |
| [[DP-QA-031]] | Password-reset link can be reused | **P1** | Open | MAIL-002 |
| [[DP-QA-028]] | Resend-invite sends no e-mail (deliveryMode disabled) | P2 | Open | INV-103 |
| [[DP-QA-029]] | Leave balance not reduced on approval; third approval overdraws to −1.00 | P2 | Open | LV-031 |
| [[DP-QA-032]] | "Activate account" button click does nothing (Enter works) | P2 | Open | INV-104 |
| [[DP-QA-034]] | Employee My Profile lookups for teams/locations answer 403 | P2 | Open | network |
| [[DP-QA-033]] | Dead `/documents` prefetch answers 404 on Overview/My Profile | P3 | Open | NAV-001 |
| [[DP-QA-026]] | E-mail templates carry no tenant branding (not implemented) | P3 obs. | Open | BRAND-004 |

## Release gate status
P0 open: **0**. P1 open: **3 (DP-QA-027, -030, -031)** + owner gate DP-QA-005 (production `ENFORCE` read-only verification) + possible P1 DP-QA-018 pending intent. → **NOT READY**.
The four RUN-003 P1 blockers (002, 010, 011, 012) are independently verified fixed on the candidate.
