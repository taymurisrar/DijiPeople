# DP-QA-050 — Re-submitting create-tenant after the Custom plan price is published answers 201 `alreadyExists` while the tenant is still PROVISIONING_FAILED; provisioning needs a second, different call

| Field | Value |
|---|---|
| Category | Operator workflow / misleading success |
| Severity / Priority | Low / **P3** (a recovery exists and works) |
| Status | Open |
| Found | RUN-008 (`4dd29d3a`), test DPQA-PUB-003 (passes only by following the supported recovery); fixture observation while provisioning `qa-custom` |
| Evidence | `evidence/RUN008-measurements.md` (PUB-003), `e2e/golive-results/run008-provision.log` |

**Sequence (DP-QA-044 lifecycle).** (1) Create a Custom plan and a DRAFT price. (2) `POST /super-admin/customer-onboarding/:id/create-tenant` → 400 "Plan … has no published monthly price. Configure and publish a price …" — the refusal is clear, but it leaves a tenant row in `PROVISIONING_FAILED` **linked to the onboarding record** with no subscription. (3) Publish the price (`POST …/prices/:priceId/publish` → 201). (4) The operator repeats step 2 as the message invites.

**Observed at step 4.** `201 {"tenantId":…,"customerId":…,"onboardingId":…,"alreadyExists":true}`. Nothing was provisioned: the tenant is still `PROVISIONING_FAILED`, no subscription exists. The call is idempotent by design (an onboarding already linked to a tenant answers `alreadyExists`) but, to the operator, a 201 reads as success. Only `POST /platform/tenants/:tenantId/operations/retry-provisioning` (tested: 201, tenant → `PENDING_SETUP`, one subscription on the published price) completes the job. Deleting the failed tenant row and re-submitting also works (done for the `qa-custom` fixture) but is a database action no operator has.

**Impact.** An operator who follows the refusal message ("publish a price") and then repeats the same action believes the tenant exists. The handoff's lifecycle ("provisioning refused → publish price → customer provisioned") is true only when the first attempt left no tenant behind, or when the operator knows to use the control-plane retry.

**Suggested resolution.** Answer a re-submitted create-tenant for a `PROVISIONING_FAILED` tenant with the failed state (or retry it), or have the refusal message name the retry action.

| Run | Result |
|---|---|
| RUN-008 (`4dd29d3a`) | **OPEN** — recovery via retry-provisioning verified |
