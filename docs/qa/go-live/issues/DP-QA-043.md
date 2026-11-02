# DP-QA-043 — Operator subscription assignment ignores a plan's customer reservation (the converted legacy plan stays assignable too)

| Field | Value |
|---|---|
| Category | Commercial integrity / authorization of a reserved plan |
| Severity / Priority | Medium / **P2** (platform-admin path only; breaks owner decision 6 for staff-driven moves) |
| Status | Open |
| Found | RUN-007 (`98f9b025`), test DPQA-CPL-009 (soft assertion (a)); reproduced on every run (p6a01, p7a01, p9) |
| Evidence | `e2e/golive-results/run007/results-chromium-p6a01.json`; annotation "PATCH tenants/:id/subscription of ANOTHER customer's tenant onto a reserved plan -> 200" |

**Expected (owner decision 6, handoff v6 enforcement table).** A plan reserved to one customer (`Plan.eligibleCustomerAccountId`) is private and unavailable to other customers. The handoff lists the enforcement points: customer select, onboarding create/update, `create-tenant`.

**Observed.** `PATCH /super-admin/tenants/:tenantId/subscription` (platform permission `platform.billing.administer`) moved **tenant B**, a different customer, onto a plan reserved to tenant C's customer and answered **200**; tenant B's `Subscription.planId` changed. `SuperAdminService.updateTenantSubscription` never calls `assertPlanAssignable`, which is used only by `platform-lifecycle.service.ts` (customer select, onboarding, create-tenant).

**What is enforced (verified in the same test).**
- (b) A tenant owner's own `POST /billing/plan-changes` onto the reserved plan is refused with a 4xx (not 5xx).
- (c) A customer that does not exist yet cannot select it (`POST /super-admin/customers` is refused).

**Impact.** A reserved or negotiated plan, and the converted legacy plan (`custom-<id12>`, archived or reserved), can still be assigned to any other customer's tenant by an operator in one call, bypassing the guard the handoff calls the "final authority". Not reachable by tenants.

**Suggested resolution (developer's call).** Apply the reservation and validity-window check in `updateTenantSubscription`, with an explicit audited override if staff must move a customer onto a reserved plan for that same customer.

| Run | Result |
|---|---|
| RUN-007 (`98f9b025`) | **OPEN** — CPL-009 fails on (a); (b) and (c) pass |
