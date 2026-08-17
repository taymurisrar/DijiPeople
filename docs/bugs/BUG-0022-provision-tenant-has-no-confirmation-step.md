---
ID: BUG-0022
aliases: [BUG-0022]
Title: "Provision tenant" has no confirmation step and no idempotency key
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-15
DetectedInSha: 7bbab3d
AffectedModules: [apps/admin, services/api/src/modules/tenant-control-plane]
OwnerAgent: frontend
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md
RegressionId: REG-030
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-17
ResolvedAt: 2026-08-16
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

Fixed, and the shape of the fix is the opposite of what the record proposed —
for a reason worth recording.

The record proposed a client-generated idempotency key. Reading the endpoint
first showed **two guards already existed**:

1. `createTenantFromOnboarding` returns `{ alreadyExists: true }` when
   `onboarding.tenantId` is already set;
2. `Tenant.slug` is `@unique`, and both requests in a double-submit resolve the
   same slug from `onboarding.plannedTenantSlug`, so the database already
   refuses the second tenant.

An idempotency key would have been a *third* mechanism deciding something two
already decided — a second source of truth for "has this been provisioned", which
is the failure mode this codebase has been bitten by repeatedly.

**What was actually missing was the race.** Two requests that both read the
onboarding before either writes both pass guard (1), and the loser hit a raw
P2002 — surfacing to an operator as an unexplained failure on the most expensive
create in the product, indistinguishable from provisioning being broken.

`createTenantRowIdempotently` translates that one case: on P2002 it re-reads the
onboarding, and if the winner has since linked its tenant it returns the same
`alreadyExists` result the pre-check returns. The constraint stays the
authority. Crucially it does **not** assume — if the onboarding still has no
tenant, the conflict is a slug genuinely held by an unrelated tenant, and the
original error is rethrown rather than reported as success.

**The confirmation dialog** is added via `useConfirmAction`, which names what
will be created — the workspace, the owner invitation, the subscription, the
first invoice — rather than asking whether the operator is sure. `creates` is a
required field on the request type for that reason: a content-free confirmation
adds a click and no information, which trains people to click through it.

The dialog is the weaker half and is documented as such in the hook. It stops the
impatient second click; it does nothing about a dropped response or a proxy
retry. The half that actually holds is the constraint plus the P2002
translation.

## QA Retest

`tenant-provisioning-idempotency.spec.ts` — 4 assertions: the winner's tenant is
returned on a lost race, an unrelated slug conflict still fails, a non-unique
error is rethrown without consulting the onboarding, and the happy path does not
pay for the race handling.

Verified to fail against the unsafe variant: removing the
`if (!winner?.tenantId) throw error` guard — i.e. assuming every P2002 is a
duplicate submit — fails *rethrows when the slug belongs to an unrelated tenant*.

API 159 suites / 1131 tests passing; admin typecheck clean.

## History

- 2026-08-17 — Architect reconciliation: terminal `VERIFIED` status normalized
  to `ArchitectDisposition: DONE`; the existing resolution and QA evidence are
  unchanged.

- 2026-08-15 — found during the commercial onboarding E2E UI/UX assessment.
- 2026-08-15 — recorded as OPEN, awaiting Architect triage.

- 2026-08-15 — Architect triage: FIX_NOW, with the worst half already mitigated. The BUG-0015 work links `CustomerOnboarding.tenantId` to the tenant immediately after the tenant row is created, so a repeat provisioning request now returns the existing tenant through the pre-existing `alreadyExists` branch instead of creating a rival one — the duplicate-tenant hazard this record is mostly about. What remains is the confirmation dialog and an explicit client idempotency key, both bounded.
- 2026-08-16 — fixed. The proposed idempotency key was deliberately not added:
  two guards already existed and a third would have been a second source of
  truth. The genuine gap was the P2002 race, plus the missing confirmation.
