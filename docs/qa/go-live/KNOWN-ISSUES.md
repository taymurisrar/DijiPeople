# Known issues register

Part of [[README]]. One row per defect/observation; detail and evidence in `issues/`. Severity: Critical/High/Medium/Low.
Priority: P0 release-stopping · P1 major workflow broken · P2 moderate with workaround · P3 cosmetic.

| ID | Title | Cat. | Sev | Pri | Status | First seen | Test |
|---|---|---|---|---|---|---|---|
| [[DP-QA-002]] | Non-admin roles: self-context 403 → "Employee profile not linked" / "Could not load dashboard" | Functional/RBAC | High | **P1** (provisional) | Open | RUN-001 | RBAC (to add) |
| [[DP-QA-005]] | Entitlement enforcement defaults to REPORT_ONLY — prod mode unverified | Observation | High | P1 *if* prod=REPORT_ONLY | Open — owner | RUN-001 | ENT-001…005 |
| [[DP-QA-001]] | Non-entitled module routes crash generic error, no upgrade message | Functional/UX | Medium | P2 | Open | RUN-001 | ENT-1001/2/3/5 |
| [[DP-QA-004]] | `/employees/import` → "uuid is expected" | Functional | Medium | P2 | Open | RUN-001 | SMK-004 |
| [[DP-QA-003]] | `/recruitment` hub renders for Starter under ENFORCE | Functional | Low | P3 | Open | RUN-001 | ENT-1004 |
| [[DP-QA-007]] | Logout 0.6–3.9 s; client "[Logout] Request timed out after 8000ms" | Performance | Medium | P2 (provisional) | Open — needs prod-like measure | RUN-001 | AUTH-030 |
| [[DP-QA-006]] | `/my-profile` React warning: empty string passed to `src` | Functional | Low | P3 | Open | RUN-001 | manual |

![gate reference](evidence/REF-plan-gate-screen-audit-events.png)

## Release gate status

P0 open: **0** · P1 open: **1 confirmed-symptom (DP-QA-002) + 1 pending owner (DP-QA-005)** → **NOT READY**.
