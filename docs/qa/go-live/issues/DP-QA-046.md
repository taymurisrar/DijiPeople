# DP-QA-046 — A Custom plan cannot withhold employees, organization, documents, notifications or branding at the API

| Field | Value |
|---|---|
| Category | Entitlement enforcement (design observation) |
| Severity / Priority | Low / **P3 (owner awareness)** |
| Status | Open — owner awareness |
| Found | RUN-007 (`98f9b025`), test DPQA-CUS-006 (plan listing only `employees`) |

**Observed.** On a Custom plan that lists only `employees` (plus the automatic import/export baseline) every gated module is refused inside the propagation budget — leave, projects, payroll, recruitment, timesheets, onboarding and the agent — but `GET /documents` still answers 200. `ENTITLEMENT_UNGATED_FEATURE_KEYS` (`common/constants/tenant-features.ts`) says why: `employees` and `organization` (enabled on every shipped plan, the substrate), `documents` (cross-cutting), `notifications` (delivery infrastructure) and `branding` (a settings surface) are deliberately not route-gated.

**Consequence for "plans with fewer features than Starter".** A Custom plan may list fewer features than Starter, and the customer-visible feature list reflects it, but those five keys are not enforced by the backend. CUS-006 asserts the withholdable modules and records the documents route status as an observation.

Not a defect against the written design. Recorded so the owner can decide whether "fewer than Starter" should be enforceable for these keys.

| Run | Result |
|---|---|
| RUN-007 (`98f9b025`) | **OPEN (awareness)** — observation attached to CUS-006 |
