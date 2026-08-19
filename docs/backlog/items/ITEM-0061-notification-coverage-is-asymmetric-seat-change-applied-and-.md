---
ID: ITEM-0061
aliases: [ITEM-0061]
Title: Notification coverage is asymmetric — SEAT_CHANGE_APPLIED and SUBSCRIPTION_TERMINATED notify nobody
Type: FOLLOW_UP
Status: NEW
Priority: P3
Severity: LOW
AffectedModules: [notifications, billing]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: TRIAGE_REQUIRED
CreatedAt: 2026-08-19
UpdatedAt: 2026-08-19
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0061 — Notification coverage is asymmetric: SEAT_CHANGE_APPLIED and SUBSCRIPTION_TERMINATED notify nobody

## Summary

`platform-lifecycle-notifications.catalog.ts` subscribes to 12 domain events.
Two closely related events are missing from it in a way that looks accidental
rather than decided:

- **`PLAN_CHANGE_APPLIED` is in the catalog; `SEAT_CHANGE_APPLIED` is not.** Both
  are the moment a commercial change takes effect and the customer's bill
  changes. It is hard to construct a reason the first deserves a notification and
  the second does not.
- **`SUBSCRIPTION_ACTIVATED` is in the catalog; `SUBSCRIPTION_TERMINATED` is
  not.** The platform tells somebody when a subscription starts and nobody when
  it ends. `CANCELLATION_REQUESTED` is covered, so a customer-initiated
  cancellation is announced — but a termination arriving any other way, such as
  from Stripe, is silent.

## Why It Matters

Low severity, and deliberately filed as low: nothing is broken and no money
moves incorrectly. The cost is operational blindness at two moments a human
would expect to hear about, and the inconsistency makes the catalog harder to
reason about — the next person adding an event has no rule to follow, only a
list to imitate.

## Evidence

Found at `4f966ea` by the invariant added for [[BUG-0078]],
`services/api/src/modules/outbox/emitted-events-have-consumers.invariant.spec.ts`,
which reports every emitted `DomainEventType` with no consumer.

Catalog subscriptions (12): `CANCELLATION_REQUESTED`, `LEAD_SUBMITTED`,
`PARTNER_INQUIRY_SUBMITTED`, `PAYMENT_FAILED`, `PLAN_CHANGE_APPLIED`,
`RETENTION_STARTED`, `SEAT_OVERAGE_DETECTED`, `SUBSCRIPTION_ACTIVATED`,
`TENANT_DELETION_REQUESTED`, `TENANT_ERASED`, `TENANT_PROVISIONING_FAILED`,
`TENANT_READY`.

Emitted with no consumer (6): `CHECKOUT_STARTED`, `CUSTOMER_CREATED`,
`PLAN_CHANGE_REQUESTED`, `SEAT_CHANGE_APPLIED`, `SEAT_CHANGE_REQUESTED`,
`SUBSCRIPTION_TERMINATED`.

Four of those six are plainly history-only — a funnel record, a customer
record, and the two `*_REQUESTED` events whose `*_APPLIED` counterparts are the
ones worth announcing. The remaining two are this item.

## Proposed Approach

No ExecPlan. Either add the two catalog entries with appropriate recipients and
templates, or record in the catalog why each is deliberately silent. The second
is a legitimate answer — the point is that the answer should be written down,
which is what the invariant's allowlist is for.

## Acceptance Criteria

- `SEAT_CHANGE_APPLIED` and `SUBSCRIPTION_TERMINATED` are either in the
  notification catalog or in the invariant allowlist with a stated reason.
- The allowlist in `emitted-events-have-consumers.invariant.spec.ts` shrinks by
  two entries, or their reasons are replaced with product decisions rather than
  the current "not individually verified".

## Dependencies

None. Found during [[TASK-0008]] WP-10; not in its scope.

## Related Items

[[BUG-0078]] · [[TASK-0008]] · [[TASK-0007]]

## History

- 2026-08-19 — found at `4f966ea` by the BUG-0078 invariant on its first run.
  The check was written to catch one unhandled event and immediately surfaced a
  coverage question nobody had asked.
