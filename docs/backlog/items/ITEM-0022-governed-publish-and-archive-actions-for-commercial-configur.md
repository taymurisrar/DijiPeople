---
ID: ITEM-0022
Title: Governed publish and archive actions for commercial configuration
Type: FOLLOW_UP
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [api:super-admin, apps/admin]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-16
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0022 — Governed publish and archive actions for commercial configuration

## Summary

Wave 1 introduced the publication **state** and enforces it everywhere that
matters — unpublished configuration never leaves the API and cannot be bought.
What it did not add is the governed **transitions**: explicit Publish and Archive
actions in Admin, audit events for them, and create-new-version-on-edit instead
of editing a published price in place.

## Why It Matters

Today an operator changes `publicationStatus` through the ordinary edit form.
That works, but it means:

- Publishing a price — a commercial act that changes what customers are charged
  — is indistinguishable from renaming a plan in the audit trail.
- Editing a `PUBLISHED` price mutates a row that live subscriptions reference.
  `Subscription` snapshots `basePrice` and `finalPrice`, so **existing customers
  are not re-billed**, and the version lineage exists to supersede properly —
  but nothing yet forces that path.
- Publication validation (plan published, market enabled, price effective, no
  overlapping window) lives in the resolver and is enforced at read time, not at
  publish time. An operator can create a configuration that is simply never
  resolvable, with no feedback until they check the public site.

## Evidence

- `commercial-offer.resolver.ts` — enforcement is read-time.
- No `publishPlanPrice` / `archivePlanPrice` service method exists.
- `AuditService.log()` is not called for publication changes.
- `PlanPrice.supersedesPriceId` and `version` exist and are currently only ever
  set by hand.

## Proposed Approach

**Needs an ExecPlan** — new endpoints, permission keys in both systems, audit
events, and Admin actions.

1. `publish` / `archive` service methods that run publication validation
   *before* the transition and refuse an invalid one with a named reason.
2. Controlled transitions: `DRAFT → PUBLISHED → ARCHIVED`, with `ARCHIVED →
   PUBLISHED` refused (create a new version instead).
3. `AuditService.log()` with before/after snapshots on every transition.
4. Editing a `PUBLISHED` price creates a superseding version rather than
   mutating the row.
5. Admin action bar entries with an impact statement — and state only what the
   implementation actually guarantees.

## Acceptance Criteria

- Publishing an invalid configuration is refused with the specific reason.
- Every transition produces an audit event naming the actor.
- Editing a published price yields a new version; the superseded row survives.
- An existing subscription's rendered terms are unchanged by publishing a new
  price for its plan, asserted by a test.

## Dependencies

Builds directly on [[ITEM-0018]], which landed in Wave 1.

## Related Items

[[ITEM-0018]] · [[BUG-0027]] · [[ITEM-0020]]

## History

- 2026-08-16 — created during Wave 1, which delivered the state but not the
  governed transitions.
