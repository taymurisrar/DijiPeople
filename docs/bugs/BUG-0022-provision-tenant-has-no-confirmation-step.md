---
ID: BUG-0022
aliases: [BUG-0022]
Title: "Provision tenant" has no confirmation step and no idempotency key
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-15
DetectedInSha: 7bbab3d
AffectedModules: [apps/admin, services/api/src/modules/tenant-control-plane]
OwnerAgent: frontend
ArchitectDisposition: TRIAGE_REQUIRED
QAReport: docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-15
ResolvedAt:
---

# BUG-0022 — "Provision tenant" has no confirmation step and no idempotency key

## Summary

Provisioning a tenant is the most consequential create in the commercial
lifecycle — it produces a tenant, an owner, a subscription and a first invoice —
and it is a single unconfirmed click. Double-submit protection across the
lifecycle screens is disabled-button-only, with no idempotency key on the
request.

## Expected Behavior

An irreversible, billable create is confirmed before it runs, and is safe to
retry at the transport level.

## Actual Behavior

One click, no confirmation. A dropped response, an impatient second click, or a
proxy retry has nothing but a disabled button between it and a second tenant.

## Reproduction

Provision a tenant from the admin customer record; observe no confirmation
dialog and no idempotency header on the request.

## Evidence

QA run, UI / UX section, rated MEDIUM. The run also records that tenant lifecycle
changes **do** correctly require a reason through `PanelDialog` (scenario A16.03
— a lifecycle change without a reason is rejected), so the pattern exists in the
same module and was not applied here.

## Root Cause

Confirmation was applied to lifecycle *transitions* and not to the initial
*create*, and double-submit was treated as a UI concern rather than a request
one.

## Impact

A duplicate tenant is expensive to unwind: it carries an owner invitation, a
subscription and an invoice. Compounded by
[[BUG-0015-a-tenant-that-fails-before-identities-and-billing-is-unrecoverable]] —
a duplicate that fails partway is currently unrecoverable as well as unwanted.

## Affected Areas

`apps/admin` tenant provisioning action; `services/api/src/modules/tenant-control-plane`
provisioning endpoint.

## Proposed Resolution

Add a `PanelDialog` confirmation naming what will be created, and accept a
client-generated idempotency key on the provisioning endpoint so a retried
request returns the original result rather than creating a second tenant.

## Acceptance Criteria

- Provisioning requires an explicit confirmation naming the customer and plan.
- Two identical provisioning requests carrying the same idempotency key produce
  exactly one tenant, one subscription and one invoice.

## Regression Coverage

**None.** The idempotency half is testable at the API level today; the
confirmation half needs browser tooling — [[ITEM-0001]].

## Dependencies

Best sequenced with [[BUG-0015-a-tenant-that-fails-before-identities-and-billing-is-unrecoverable]],
which also concerns idempotency of the same provisioning path and would supply
the invoice `idempotencyKey` anchor.

## Related Items

Modules [[tenant-provisioning|Tenant Provisioning]], [[tenant-control-plane|Tenant Control Plane]], [[platform-admin|Platform Admin]],
[[billing|Billing]].
Requirement [[requirement-commercial-onboarding|Commercial Onboarding]].

## Resolution

Not resolved.

## QA Retest

Not applicable.

## History

- 2026-08-15 — found during the commercial onboarding E2E UI/UX assessment.
- 2026-08-15 — recorded as OPEN, awaiting Architect triage.
