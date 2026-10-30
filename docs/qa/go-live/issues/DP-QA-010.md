# DP-QA-010 — Four paid features have no backend guard: a Starter tenant owner is served data-management, attendance integrations, desktop-agent settings and audit logs

| Field | Value |
|---|---|
| Category | Security / Functional (plan enforcement, backend) |
| Severity / Priority | High / **P1** — a plan restriction is enforced by the UI only |
| Status | Open |
| Tests | `DPQA-ENT-060 … 065` (all fail) — file `03b-plan-ungated-features.spec.ts` |
| Env | tenant `qa-prov-a` (provisioned, **Starter**), role owner, `entitlementEnforcement = ENFORCE`, 2026-10-30, Chromium/API |

## Actual (CONFIRMED, status codes under ENFORCE)
| Request | Feature (not in Starter) | Result |
|---|---|---|
| `GET /api/data-management/modules`, `/imports` | data-management (Growth) | **200** |
| `GET /api/integrations/attendance/connectors`, `/integrations/gateways` | attendance-integrations (Growth) | **200** |
| `GET /api/agent/settings` | desktop-agent (Growth) | **200** |
| `GET /api/audit-logs` | compliance (Enterprise) | **200** |

For contrast, `/projects`, `/payroll/runs`, `/timesheets/entries`, `/job-openings`, `/onboarding/*` return 403 (DPQA-ENT-001…005 pass).
The UI is inconsistent with the API: `/settings/audit-compliance/history/audit-events` shows the "not part of your current subscription"
screen (`DPQA-ENT-040` passes) while the same data is one authenticated GET away. **The gate is cosmetic for these four.**

## Analysis
- This is the known residual in `docs/decisions/ADR-0009-entitlement-enforcement-cutover.md` ("`ENTITLEMENT_UNGATED_FEATURE_KEYS` … carry no route guard … this ADR's cutover does not make the comparison table true for those four").
  QA records it as a **release risk** because the customer-facing plan comparison presents these as higher-plan features and the brief requires restrictions to be enforced "in both frontend and backend".
- Needs product decision: guard them (`@RequireEntitlement`) or stop marketing them as plan-gated. Either way the ADR's "residual finding" needs a ticket.

| Run | Result |
|---|---|
| RUN-002 | FAIL ×6 |
