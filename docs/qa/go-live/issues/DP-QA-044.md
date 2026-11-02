# DP-QA-044 — Custom plans have no supported way to be published, so they cannot be provisioned through onboarding or offered as Contact Sales

| Field | Value |
|---|---|
| Category | Commercial lifecycle |
| Severity / Priority | Medium / **P2** (blocks documented Custom-plan workflow steps 2–3; the backlog already knows it as ITEM-0018 / ITEM-0022) |
| Status | Open |
| Found | RUN-007 (`98f9b025`), provisioning the Custom-plan fixture; DPQA-CPL-010 evidence |
| Evidence | `create-tenant` answers 400: `Plan "qa-cp-baseline" has no published monthly price. Configure and publish a price for this plan before creating a subscription.`; `e2e/golive-results/run007/results-chromium-p9a01.json` |

**Expected.** Handoff v6, Custom-plan workflow: "2. Price … and publish (existing). 3. Assign through the existing onboarding workflow." Owner decision 7: an unreserved Custom plan may be listed as Contact Sales "only after explicit authorized publication".

**Observed.** No API route or admin-console action sets `PlanPrice.publicationStatus` or `Plan.publicationStatus` to PUBLISHED: the plan and price DTOs carry no such field, and `createPlan` documents "publication stays a separate deliberate act". Onboarding `create-tenant` resolves only a PUBLISHED price, so a Custom plan created through the supported mechanism cannot be provisioned that way. The only working route is the operator `PATCH …/subscription` with an explicit `planPriceId` and `purchasedSeats`. Contact-Sales publication of an unreserved plan cannot be performed at all.

**Fixture note — not a pass.** RUN-007 provisioned the Custom tenant on Starter through onboarding and then moved it with `PATCH tenants/:id/subscription` (`tools/assign-plan.mjs`). Publication behaviour is therefore **Not Run**.

**Related design fact (not a defect).** A refused `create-tenant` leaves the tenant in the recorded `PROVISIONING_FAILED` state with no subscription (a first-class state with transitions to PENDING_SETUP and ARCHIVED). It holds the slug until retried or archived. DPQA-CPL-010 asserts exactly that and passes after the calibration recorded in the run report.

| Run | Result |
|---|---|
| RUN-007 (`98f9b025`) | **OPEN** — publication Not Run (no mechanism); onboarding onto an unpublished Custom plan is refused |
