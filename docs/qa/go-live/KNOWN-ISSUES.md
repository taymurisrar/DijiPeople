# Known issues register

Part of [[README]]. Detail in `issues/`, evidence in `evidence/`, remediation order in [[REMEDIATION-BACKLOG]]. Status of all rows below is **Open** at RUN-002 —
nothing has been fixed in the application and nothing is marked resolved without a passing retest.
Severity: Critical/High/Medium/Low. Priority: P0 release-stopping · P1 major workflow broken · P2 moderate/workaround · P3 cosmetic.

| ID | Title | Cat. | Sev | Pri | Role(s) | Tests | Since |
|---|---|---|---|---|---|---|---|
| [[DP-QA-002]] | Non-admin roles 403 on self-context/dashboard — **confirmed on really-provisioned tenants** | Functional/RBAC | High | **P1** | employee, manager, hr, payroll | RBAC-1-* | RUN-001 |
| [[DP-QA-011]] | Employee/HR 403 on leave types, employee cannot cancel own request, no leave types after provisioning | Functional/RBAC | High | **P1** | employee, hr | LV-001, LV-008 | RUN-002 |
| [[DP-QA-010]] | Data-management, attendance integrations, desktop agent, audit logs have no backend plan guard | Security/Plan | High | **P1** | owner (Starter) | ENT-060…065 | RUN-002 |
| [[DP-QA-012]] | Invalid timezone accepted by `PATCH /tenant-settings`; every page then throws RangeError | Functional | High | **P1** | owner | SET-003 | RUN-002 |
| [[DP-QA-005]] | Entitlement enforcement defaults to `REPORT_ONLY`; production mode unverifiable here | Observation/Plan | High | P1 *if* prod=REPORT_ONLY | — | ENT-001…005 | RUN-001 |
| [[DP-QA-001]] | Module routes show a generic crash instead of the plan-gate screen | Functional/UX | Medium | P2 | owner | ENT-1001/2/3/5 | RUN-001 |
| [[DP-QA-004]] | `/employees/import` → "uuid is expected" | Functional | Medium | P2 | owner | SMK-004 | RUN-001 |
| [[DP-QA-007]] | Logout 0.6–3.9 s; client timeout at 8 s (local) | Performance | Medium | P2 prov. | any | AUTH-030 | RUN-001 |
| [[DP-QA-013]] | Colour-contrast failures on 6 screens | Accessibility | Medium | P2 | owner | A11Y-001/3/6/8/9 | RUN-002 |
| [[DP-QA-014]] | Employees sort by Full Name → "Unknown sort field: fullName" | Functional | Medium | P2 | owner | EMP-008 | RUN-002 |
| [[DP-QA-015]] | Non-Starter tabs on the employee record | Functional/Plan | Medium | P2 | owner | EMP-007 | RUN-002 |
| [[DP-QA-016]] | Branding logo 404 for non-admins (broken image) | Functional/Branding | Medium | P2 | employee, hr | LV-010 | RUN-002 |
| [[DP-QA-017]] | Overview overflows horizontally on a phone (501 > 412 px) | UI/UX | Medium | P2 | owner | RESP-001 (mobile) | RUN-002 |
| [[DP-QA-018]] | Manager approves leave of an employee outside their reporting line (intent to confirm) | Security/AuthZ | High | P2 → P1 if scoped | manager | LV-026 | RUN-003 |
| [[DP-QA-020]] | Overlapping leave requests not prevented under concurrency (3/3 accepted) | Data integrity | Medium | P2 | employee | CONC-003 | RUN-003 |
| [[DP-QA-022]] | Employee cannot read their own attendance correction request (403) | Functional/RBAC | High | P2 | employee | ATT-009 | RUN-003 |
| [[DP-QA-003]] | `/recruitment` hub renders for Starter | Functional | Low | P3 | owner | ENT-1004 | RUN-001 |
| [[DP-QA-019]] | Approved leave cannot be cancelled/revoked by anyone (product decision) | Functional | Medium | P3 | admin | LV-023 | RUN-003 |
| [[DP-QA-021]] | New Employee form (Save) shown to an employee | UI gating | Low | P3 | employee | CMD-011 | RUN-003 |
| [[DP-QA-023]] | Firefox/WebKit uncaught fetch errors on two redirecting settings routes | Cross-browser | Low | P3 | owner | SMK-011/015 | RUN-003 |
| [[DP-QA-024]] | One 429 on page load drops the user into the generic error screen | Resilience | Low | P3 | any | PERF-003 | RUN-003 |
| [[DP-QA-006]] | `/my-profile` React empty-`src` warning | Functional | Low | P3 | employee | manual | RUN-001 |
| [[DP-QA-008]] | No-match delete answers HTTP 200 `success:false` (isolation itself holds) | API contract | Low | P3 | owner | ISO-004 | RUN-002 |
| [[DP-QA-009]] | Manager can read subscription price/cycle | Security (info) | Low | P3 | manager | RBAC-2-MANAGER-03 | RUN-002 |

Screens: ![gate reference](evidence/REF-plan-gate-screen-audit-events.png)

## Release gate status
P0 open: **0**. P1 open: **4 confirmed (DP-QA-002, -010, -011, -012)** + 1 owner decision (DP-QA-005 — `ENFORCE` is mandatory for go-live) + 1 possible P1 pending intent (DP-QA-018). 24 records open. → **NOT READY**.
