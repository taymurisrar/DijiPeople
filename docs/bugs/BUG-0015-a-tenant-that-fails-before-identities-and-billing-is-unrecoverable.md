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
RegressionId: REG-013
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-17
ResolvedAt: 2026-08-15
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

> Reopened 2026-08-23. This record was `Status: VERIFIED` /
> `ArchitectDisposition: DONE` above this very section, so every dashboard
> and every go-live summary counted it finished. It is not: Platform Admin
> still renders "No business unit exists — BLOCKING … This is BUG-0015 and
> is not repairable from here" on a live tenant, and `tenant-operations.service.ts`
> still marks that finding `repairable: false`. Needs a plan, because the
> fix is a replayable identities-and-billing step rather than a patch.

## QA Retest

Not applicable yet. The QA run's `TENANT_PROVISIONING` verdict is **FAIL** on
this record, and tenant activation to `ACTIVE` has never been reached in any
test — see [[ITEM-0004]].

Retested at the merged SHA `d1768cb` during the open-bug closure wave.

The linked regression suite runs green: 7 API suites / 85 assertions across
REG-013 – REG-021, `npm run test:app-urls` 16/16, and REG-020's
`commercial-bootstrap.e2e-spec.ts` in the `Database migration gate` against a
real PostgreSQL 16. Each of these tests was proven to fail without its fix when
it was written; re-running them is what confirms the fix still holds.

## History

- 2026-08-17 — Architect reconciliation: terminal `VERIFIED` status normalized
  to `ArchitectDisposition: DONE`; the existing resolution and QA evidence are
  unchanged.

- 2026-08-15 — found during the commercial onboarding E2E; not fixed there
  because it warrants an ExecPlan.
- 2026-08-15 — re-verified against `main` `ad8f77f` and recorded as OPEN.

- 2026-08-15 — Architect triage: FIX_NOW rather than PLAN_REQUIRED. The ExecPlan the record asked for was scoped to a schema change for invoice idempotency; the natural anchors turned out to already exist — `User @@unique([tenantId, email])`, `Subscription.tenantId @unique`, `UserRole @@unique([userId, roleId])`, `TenantFeature @@unique([tenantId, key])` — and the invoice anchors on "this subscription already has one", so no migration is needed and the change is bounded. Fixed by extracting `TenantIdentitiesProvisioningService`, marking the step retryable, linking the onboarding to the tenant before anything can fail so a half-built tenant is recoverable, and adding a convergence assertion so a retry may not report SUCCEEDED while the tenant still lacks a business unit, an owner or a subscription.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0004]]
- Modules — [[tenant-control-plane]]
- Regression — REG-013 (see the regression register)

<!-- GRAPH:END -->
