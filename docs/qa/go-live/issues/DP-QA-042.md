# DP-QA-042 — Custom / `enterprise-plus` receives the Desktop Agent and white-label e-mail by default (OWNER REVIEW)

| Field | Value |
|---|---|
| Category | Product contract / entitlement design |
| Severity / Priority | Medium / **P2 — owner decision** (not a code fault: it is what the catalogue and the handoff state) |
| Status | Open — owner review |
| Found | RUN-006 (`17d0dcaf`): plan catalogue read from the database, `CUSTOM` override experiments on `qa-custom` and `qa-enterprise`, onboarding attempt for `enterprise-plus` |

**Question asked by the owner.** A Custom subscription without an explicit desktop-agent entitlement must not receive the agent by default; any deviation is a defect needing owner review.

**What was found.**

| Fact | Evidence |
|---|---|
| There is no `custom` plan key. Custom is "the `enterprise-plus` contract plan plus `TenantFeature` rows with source `CUSTOM`" (handoff v4). | catalogue: `starter, growth, enterprise, enterprise-plus` |
| `enterprise-plus` (like `enterprise`) enables **every** catalogue key, including `desktop-agent` and `email-white-label`. | `PlanFeature`: `enterprise-plus/desktop-agent = true`, `enterprise-plus/email-white-label = true`; plan definition takes `TENANT_FEATURE_DEFINITIONS.map(key)` |
| So a Custom customer on `enterprise-plus` **does** receive the agent and white-label unless someone adds `CUSTOM isEnabled=false` rows. | not created through onboarding (see next row), reasoning from the catalogue plus the experiment below |
| `enterprise-plus` cannot be sold through the onboarding workflow: *"Enterprise+ cannot be sold: it is active but has no active price"* (it is contract-only by design). | `create-tenant` → 400 `VALIDATION_FAILED` |
| Withdrawing works: a `CUSTOM isEnabled=false` row removes a plan-granted agent from an Enterprise tenant; sign-in is refused after about 62 s (entitlement cache). | direct probe, `qa-enterprise`, row deleted afterwards |
| The opposite works too: on a **Growth-plan** tenant the agent is refused until a `CUSTOM isEnabled=true` row exists (AGT-001-C, AGT-020). | tests pass |

**Decision needed.** (a) Accept that `enterprise-plus` includes the agent and white-label and that a contract wanting less needs explicit withdrawal rows (documented, with an admin screen or runbook), or (b) make `enterprise-plus` carry only what the contract enables (agent and white-label off by default).

| Run | Result |
|---|---|
| RUN-006 (`17d0dcaf`) | **OPEN — owner review** |

**Owner decision (2026-11-01, DEC-023):** Desktop Agent and white-label require explicit grants on Custom subscriptions even when based on enterprise-plus. The RUN-006 default is therefore a deviation; RUN-007 asserts the decision with CUS-001..005, CUS-010, CUS-011 and CUS-020.
