# Tenant Lifecycle

> Generated from repository evidence at `ad8f77f`.

What happens to a tenant from the moment a customer is ready until it is
decommissioned. **One tenant per customer environment**, reached at its own
hostname.

## The states

```
(none)
  ↓ provisioning — 8 steps, see [[tenant-provisioning]]
PROVISIONING_FAILED ←──┐
  ↓ retry ─────────────┘  (replays retryable steps in catalogue order)
PENDING_SETUP
  ↓ owner activated · modules enabled · readiness satisfied
ACTIVE
  ↓ governed lifecycle transitions, each requiring a reason
SUSPENDED / DECOMMISSIONED
```

Illegal transitions are refused — `PENDING_SETUP → DECOMMISSIONED` was verified
as rejected. Every lifecycle change requires a reason; a change without one is a
400.

## Readiness is the real gate

A tenant is not activated because provisioning "succeeded". It is activated when
readiness reports every condition met — subscription, workspace routing, an
**active** owner, and modules. `countActiveOwners` counts `ACTIVE` only, so a
tenant whose sole owner is still `INVITED` cannot activate.

That distinction is load-bearing, and it is exactly where the lifecycle
currently breaks: **a provisioning run can report SUCCEEDED while readiness
stays BLOCKED forever** — [[BUG-0015]].

## Erasure

The most destructive operation in the platform. As of `3c759ce` it **is**
exercised against a real PostgreSQL — the delete order is proven, including the
payslip cascade that had made every tenant holding a single payslip permanently
un-erasable, and the dry run is proven non-destructive and repeatable.

What is still missing is the assertion that matters most for an irreversible
cross-tenant operation: not "the tenant is gone" but "**the other tenant is
untouched**". [[ITEM-0003]].

## Where a tenant lives

The hostname resolves the tenant. `workspace-routing-verified` re-resolves the
primary hostname during provisioning and asserts it maps back to *this* tenant
before anyone is invited to it. See [[tenant-workspace-routing]].

The admin-editable base domain that ought to drive this is currently inert:
[[BUG-0017]], with the decision it waits on at [[ITEM-0006]].

## Open risks

- [[BUG-0015]] — unrecoverable early-failure tenants. HIGH.
- [[BUG-0022]] — the most consequential create in the product is one unconfirmed
  click with no idempotency key.
- [[ITEM-0004]] — activation to `ACTIVE` has never completed in a test.

## Related

[[tenant-provisioning]] · [[tenant-control-plane]] · [[multi-tenancy]] ·
[[tenant-workspace-routing]] · [[commercial-onboarding-journey]] ·
[[billing]] · [[requirement-tenant-workspace-domains]]
