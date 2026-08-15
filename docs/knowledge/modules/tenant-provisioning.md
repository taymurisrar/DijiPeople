# Tenant Provisioning

> Generated from repository evidence at `ad8f77f`. Verified by the 2026-08-15
> commercial onboarding E2E, whose `TENANT_PROVISIONING` verdict was **FAIL**.

## Purpose

Turning a ready customer into a running tenant: the row, the workspace hostname,
roles, owner, subscription, defaults, routing verification and the owner
invitation.

## The eight steps

From `tenant-control-plane.constants.ts`:

| # | Step | Retryable |
|---|---|---|
| 1 | `tenant-record` | no |
| 2 | `workspace-slug-reserved` | yes |
| 3 | `workspace-domain` | yes |
| 4 | `rbac-defaults` | yes |
| 5 | **`identities-and-billing`** | **no** |
| 6 | `customization-defaults` | yes |
| 7 | `workspace-routing-verified` | yes |
| 8 | `invitations` | yes (recorded satisfied; re-issued per identity elsewhere) |

Step 5 creates the tenant's **business unit, owner, service account,
subscription and first invoice**. It is non-retryable because replaying it would
create a second owner and a second invoice.

## Important business rules

- **Provisioning is refused while readiness fails**, with the blockers listed,
  and a blocked attempt leaves **no partial `Tenant`**.
- **Activation requires an active owner.** `countActiveOwners` counts `ACTIVE`
  only — a tenant whose sole owner is still `INVITED` cannot be activated.
- **Lifecycle changes require a reason**, and illegal transitions
  (`PENDING_SETUP → DECOMMISSIONED`) are refused.
- **A plan-excluded module cannot be enabled by override.**
- `workspace-routing-verified` re-resolves the primary hostname and asserts it
  maps back to *this* tenant before anyone is invited — see
  [[tenant-workspace-routing]].

## Known bugs

- [[BUG-0014-no-tenant-that-failed-provisioning-could-be-retried]] — VERIFIED.
  Two steps were declared retryable and never wired into the replay switch, so
  every retry died on the first of them and left the tenant permanently
  `PROVISIONING_FAILED`. The UI kept offering the button. Pattern:
  [[declared-but-unwired-step]].
- [[BUG-0015-a-tenant-that-fails-before-identities-and-billing-is-unrecoverable]]
  — **OPEN, HIGH, PLAN_REQUIRED.** Because step 5 is skipped on retry, a tenant
  that fails at or before it never gets a business unit, so no owner can be
  added and it can never be activated. Since BUG-0014 was fixed, **retry reports
  SUCCEEDED** and the tenant looks healthy while being permanently unusable —
  arguably worse than the previous hard failure.
- [[BUG-0017-tenant-base-domain-setting-does-not-drive-hostname-issuance]] —
  OPEN. The admin control for the base domain is inert.
- [[BUG-0022-provision-tenant-has-no-confirmation-step]] — OPEN. The most
  consequential create in the lifecycle is one unconfirmed click with no
  idempotency key.

## Open backlog

[[ITEM-0004]] — activation to `ACTIVE` has never been reached in any test,
blocked by BUG-0015. [[ITEM-0006]] — the ADR BUG-0017 waits on.

## Regressions

REG-012 — `tenant-provisioning-retry.spec.ts`, which pins the step catalogue and
the replay switch together so a future retryable-but-unwired step fails the test
rather than production.

## Related

[[tenant-control-plane]] · [[customers]] · [[customer-onboarding]] ·
[[billing]] · [[tenant-workspace-routing]] · [[multi-tenancy]] ·
[[integration-architecture]]
