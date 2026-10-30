# Remediation backlog (for a separate development agent)

Part of [[README]]. QA does not fix application defects. Ordered by release impact. Each item names the failing test(s) that will go green when it is fixed.

## Release-blocking (P1)
| # | Issue | What to change (suggested) | Verifying tests |
|---|---|---|---|
| 1 | [[DP-QA-002]] non-admin roles 403 on self-context / dashboard | grant the self-service privilege (`user-preferences` READ bridge → `dashboard.view`) to every system role in `SYSTEM_ROLE_PRIVILEGES`; map only 404/empty to "profile not linked" | RBAC-1-* |
| 2 | [[DP-QA-011]] employee/HR 403 on leave types; cannot cancel own request; no leave types after provisioning | same grant review for `leave-requests/available-types`, `leave-types` (read), `…/cancel`; ship default leave types or a guided setup | LV-001, LV-008 |
| 3 | [[DP-QA-010]] four paid features have no backend guard | `@RequireEntitlement` on data-management, integrations/attendance, agent, audit-logs (or change the plan comparison) | ENT-060…065 |
| 4 | [[DP-QA-012]] invalid timezone accepted and breaks every page | validate against `Intl.supportedValuesOf('timeZone')`; make `formatting-context.ts` fall back | SET-003 |
| 5 | [[DP-QA-005]] enforcement default `REPORT_ONLY` | **owner action**, see `PRODUCTION-RELEASE-GATES.md` section A | gates A1–A5 |

### Added in RUN-003
| # | Issue | Suggested change | Verifying tests |
|---|---|---|---|
| 6 | [[DP-QA-018]] manager approves outside reporting line | confirm intended scope; enforce `buildScopedAccessWhere` on approve/reject | LV-026 |
| 7 | [[DP-QA-020]] overlap race on leave submit | serialise per employee (advisory lock / exclusion constraint) | CONC-003 |
| 8 | [[DP-QA-022]] employee cannot read own correction request | grant own-read on correction requests | ATT-009 |

## Should fix before launch (P2)
[[DP-QA-001]] plan-gate screen for module routes · [[DP-QA-004]] `/employees/import` · [[DP-QA-007]] logout latency · [[DP-QA-013]] colour contrast ·
[[DP-QA-014]] Employees sort by Full Name · [[DP-QA-015]] non-Starter tabs on the employee record · [[DP-QA-016]] logo 404 for non-admins · [[DP-QA-017]] mobile overflow.

## Low (P3)
[[DP-QA-019]] approved leave cannot be revoked (decision) · [[DP-QA-021]] New Employee form shown to employees · [[DP-QA-023]] Firefox/WebKit fetch errors · [[DP-QA-024]] 429 → error screen · [[DP-QA-003]] recruitment hub not gated · [[DP-QA-006]] `src=""` warning · [[DP-QA-008]] 200 on no-match delete · [[DP-QA-009]] manager sees subscription price.

## Product / onboarding decisions
- OBS-008: a freshly provisioned tenant has **no leave types, shifts, work sites or policies** — employees cannot request leave or be recorded for attendance until an admin configures them (QA had to create fixtures).
- OBS-003: Claims/Approvals/Reports have no feature key — included in every plan by omission?
- OBS-009: provisioning needed manual gates in QA (executed subscription agreement, wildcard-DNS flag, tenant status transitions) — confirm the production runbook covers them.
