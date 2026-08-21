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
- [[BUG-0353]] — FIXED. The **third** implementation of "which workspace does
  this hostname address", keyed on `WEB_APP_PROD_ROOT_DOMAIN` while the web app
  keys on `TENANT_BASE_DOMAIN`. See below; this one is worth reading before
  touching anything hostname-shaped. Pattern: [[divergent-duplicate-guard]].

## Workspace hostnames: one rule, and the three names it had

`packages/config/platform-domains.js` owns this. `buildWorkspaceHostname` and
`buildWorkspaceUrl` construct; **`parseWorkspaceHostname` resolves**. Everything
that turns a `Host` header into a workspace must call the last one.

The concept has been implemented three times, under three different environment
variable names for the same value:

| Copy | Keyed on | Removed by |
|---|---|---|
| `apps/admin/lib/tenant-url.ts` | `NEXT_PUBLIC_TENANT_ROOT_DOMAIN` | REG-179 |
| `PublicTenantsService.getTenantSlugFromHost` | `WEB_APP_PROD_ROOT_DOMAIN` | REG-184 |
| `packages/config/platform-domains.js` | `TENANT_BASE_DOMAIN` (+ documented fallbacks) | — canonical |

Each copy was internally correct. Configuring the platform properly for two of
them left the third reading an unset variable, and an inert hostname parser
**fails closed** — `xoul-ltd.localhost` resolved to no slug and login answered
`TENANT_NOT_FOUND` for a tenant that existed and was ACTIVE.

Two things follow, and both cost a round to learn:

1. When consolidating a duplicated rule, enumerate every **reader** of the
   concept, not only the writer that was reported. REG-179 fixed the builder,
   verified the link, and left the parser.
2. Search by *concept*, not by variable name. Three names for one value is
   precisely what hid the third copy from a search for the first two.

Reserved slugs are a separate, product-level list held by `PublicTenantsService`
and deliberately unknown to the host parser. Keep them separate: the parser's
refusals (`admin.`, `api.`, `app.`, the bare domain, nested labels) are about
addressing; the reserved list is about what a customer may be called.

## Open backlog

[[ITEM-0004]] — activation to `ACTIVE` has never been reached in any test,
blocked by BUG-0015. [[ITEM-0006]] — the ADR BUG-0017 waits on.

## Regressions

REG-012 — `tenant-provisioning-retry.spec.ts`, which pins the step catalogue and
the replay switch together so a future retryable-but-unwired step fails the test
rather than production.

REG-179 — `packages/config/platform-domains.test.js` and
`apps/admin/lib/tenant-url.spec.ts`, for the constructed URL.

REG-184 — `services/api/src/modules/tenants/public-tenant-host.spec.ts`, for the
resolution. Three of its seven assertions are refusals, and those are the
security-relevant half: resolving `admin.dijipeople.com` would hand whoever
registered the slug "admin" the platform's own hostname, and resolving
`evil.maseer.dijipeople.com` as "maseer" would let a nested label address
somebody else's workspace.

## Related

[[tenant-control-plane]] · [[customers]] · [[customer-onboarding]] ·
[[billing]] · [[tenant-workspace-routing]] · [[multi-tenancy]] ·
[[integration-architecture]]
