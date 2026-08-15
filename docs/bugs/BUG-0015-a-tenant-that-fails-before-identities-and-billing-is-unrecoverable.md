---
ID: BUG-0015
aliases: [BUG-0015]
Title: A tenant that fails before identities-and-billing is permanently unrecoverable
Status: OPEN
Severity: HIGH
Priority: P1
Type: STATE_MACHINE
Source: QA_RUN
DetectedDate: 2026-08-15
DetectedInSha: 7bbab3d
AffectedModules: [services/api/src/modules/tenant-control-plane]
OwnerAgent: backend-api
ArchitectDisposition: PLAN_REQUIRED
QAReport: docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-15
ResolvedAt:
---

# BUG-0015 — A tenant that fails before identities-and-billing is permanently unrecoverable

## Summary

`identities-and-billing` is step 5 of 8 and is deliberately **not** retryable —
replaying it would create a second owner and a second invoice. It is also the
only step that creates the tenant's business unit, owner, service account and
subscription. A tenant whose provisioning fails at or before it can therefore
never obtain an owner, and can never be activated.

## Expected Behavior

Any tenant whose provisioning fails is recoverable through a supported surface,
or is unambiguously reported as unrecoverable so an operator can discard it.

## Actual Behavior

Retry marks `identities-and-billing` `SKIPPED` and continues. The tenant reaches
`PENDING_SETUP` with **0 business units and 0 users**.
`POST /platform/tenants/:id/access` then refuses with *"This tenant has no
business unit yet. Complete provisioning before adding access."*
(`tenant-access.service.ts:169`), so no owner can be added; `countActiveOwners`
stays 0, so activation is refused for ever.

**Since [[BUG-0014-no-tenant-that-failed-provisioning-could-be-retried]] was
fixed, retry reports SUCCEEDED** and the tenant looks healthy while being
permanently unusable — arguably worse than the previous hard failure.

## Reproduction

Scenarios A12.05, A15.01, A16.01 in the QA run. Fail provisioning before step 5,
retry, then attempt to add an owner.

## Evidence

QA run BUG-05. Tenant `f2ab6d93-b9a4-40a9-ae06-298ed31fa0c9`: 9 roles, 0 business
units, 0 users, readiness `BLOCKED` on `subscription`, `workspace-routing`,
`owner` and `modules`, with no supported route out.

Verified still present at `main` `ad8f77f`:
`tenant-control-plane.constants.ts:125` marks the step `isRetryable: false`, and
`tenant-operations.service.ts` `runRetryableStep` has no branch for it.

## Root Cause

**Non-idempotent work bundled into a single non-retryable step.** Owner creation,
service-account creation, subscription creation and first-invoice creation each
have a natural idempotency anchor; bundling them meant the whole step had to be
classified by its least safe member.

## Impact

Any provisioning failure before step 5 strands a customer account that has
already signed and converted. Recovery today requires direct database work.

## Affected Areas

`services/api/src/modules/tenant-control-plane` — operations, access, readiness,
activation; the admin operations panel; billing (invoice creation).

## Proposed Resolution

Make `identities-and-billing` **idempotent against its natural anchors** — owner
email uniqueness per tenant, one subscription per tenant, invoice
`idempotencyKey` — and then mark it retryable.

**Do not** relax `POST /access` to bootstrap a business unit. That would let an
operator paper over a half-provisioned tenant, producing a tenant that exists in
a state provisioning never produces.

This touches owner, subscription and invoice creation and therefore needs an
ExecPlan under [`PLANS.md`](../../PLANS.md) — hence `PLAN_REQUIRED` rather than
`FIX_NOW`.

## Acceptance Criteria

- Replaying `identities-and-billing` on a tenant that already has an owner,
  subscription or invoice produces no duplicate of any of them.
- A tenant failed at any step can be retried to a state where an owner can be
  added and the tenant activated.
- Retry reporting SUCCEEDED implies the tenant is actually usable — readiness
  agrees.

## Regression Coverage

**None yet.** Required before the fix: a test that replays the step against a
tenant that already has each anchor and asserts exactly one of each survives.

## Dependencies

None external. Needs an ExecPlan and a Database agent opinion on the invoice
idempotency key.

## Related Items

Bug pattern [[declared-but-unwired-step]] (adjacent — this is the inverse: a
step correctly marked non-retryable whose non-retryability is unrecoverable).
Modules [[tenant-control-plane|Tenant Control Plane]], [[tenant-provisioning|Tenant Provisioning]], [[billing|Billing]].
Exposed by fixing [[BUG-0014-no-tenant-that-failed-provisioning-could-be-retried]].
UX consequence tracked with [[BUG-0022-provision-tenant-has-no-confirmation-step]].

## Resolution

Not resolved.

## QA Retest

Not applicable yet. The QA run's `TENANT_PROVISIONING` verdict is **FAIL** on
this record, and tenant activation to `ACTIVE` has never been reached in any
test — see [[ITEM-0004]].

## History

- 2026-08-15 — found during the commercial onboarding E2E; not fixed there
  because it warrants an ExecPlan.
- 2026-08-15 — re-verified against `main` `ad8f77f` and recorded as OPEN.
