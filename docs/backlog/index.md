# Backlog Index

> **Generated file — do not edit by hand.** Rebuild with `node scripts/rebuild-backlog.mjs`.

Every durable Bug and Backlog record in the repository, whatever its state.

**47 records** — 28 bugs under [`docs/bugs/`](../bugs/), 19 non-bug items under [`items/`](items/).

A bug record **is** its own backlog entry. There is no parallel item for it —
see [`README.md`](README.md) for why.

## At a glance

| | Count |
|---|---|
| Open (active work) | 28 |
| Blocked | 0 |
| Deferred | 2 |
| Awaiting a product decision | 3 |
| Completed / closed | 14 |
| **Open CRITICAL** | **0** |
| **Open HIGH** | **6** |
| **Awaiting Architect triage** | **0** |

## Open by severity

| Severity | Count |
|---|---|
| HIGH | 6 |
| MEDIUM | 17 |
| LOW | 5 |

## Open by type

| Type | Count |
|---|---|
| ARCHITECTURE | 3 |
| BUG | 1 |
| DATA_INTEGRITY | 2 |
| DOCUMENTATION | 1 |
| FOLLOW_UP | 1 |
| INFRA | 3 |
| INTEGRATION | 2 |
| SECURITY | 1 |
| STATE_MACHINE | 3 |
| TECH_DEBT | 3 |
| TEST_GAP | 5 |
| UX | 3 |

## All records by status

| Status | Count |
|---|---|
| OPEN | 8 |
| DEFERRED | 2 |
| PRODUCT_DECISION | 3 |
| FIXED | 7 |
| VERIFIED | 12 |
| READY | 13 |
| DEFERRED | 2 |
| PRODUCT_DECISION | 3 |
| DONE | 2 |

## All records

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [BUG-0005](../../docs/bugs/BUG-0005-cross-tenant-error-log-read-via-support-role.md) | A support-role user could read another tenant's error log | TENANT_ISOLATION | CRITICAL | P0 | VERIFIED | api:error-logs | DONE |
| [BUG-0006](../../docs/bugs/BUG-0006-organization-structure-mutable-by-any-authenticated-user.md) | Organization and business-unit structure was mutable by any authenticated user | AUTHORIZATION | CRITICAL | P0 | VERIFIED | api:organization | DONE |
| [BUG-0001](../../docs/bugs/BUG-0001-compensation-and-bank-data-behind-employee-record-read.md) | Compensation and bank data returned behind an employee-record read | AUTHORIZATION | HIGH | P1 | VERIFIED | api:employees | DONE |
| [BUG-0002](../../docs/bugs/BUG-0002-self-approval-of-attendance-corrections.md) | A manager could file and approve their own attendance correction | AUTHORIZATION | HIGH | P1 | VERIFIED | api:attendance | DONE |
| [BUG-0003](../../docs/bugs/BUG-0003-readteam-granted-tenant-wide-visibility.md) | readTeam permissions granted tenant-wide visibility | AUTHORIZATION | HIGH | P1 | VERIFIED | api:attendance, api:approvals | DONE |
| [BUG-0004](../../docs/bugs/BUG-0004-search-filter-overwrote-the-access-scope.md) | A search filter silently overwrote the access scope | AUTHORIZATION | HIGH | P1 | VERIFIED | api:approvals | DONE |
| [BUG-0007](../../docs/bugs/BUG-0007-unguarded-duplicate-of-a-permission-gated-route.md) | An unguarded duplicate route aliased a permission-gated one | AUTHORIZATION | HIGH | P1 | VERIFIED | api:tenant-settings | DONE |
| [BUG-0008](../../docs/bugs/BUG-0008-session-expired-sign-in-again-returned-405.md) | Session-expired "Sign in again" returned 405 and stranded admin operators | BUG | HIGH | P1 | VERIFIED | app:admin, app:admin | DONE |
| [BUG-0011](../../docs/bugs/BUG-0011-signed-agreement-editable-defeating-the-lead-conversion-gate.md) | Signed agreements were editable, defeating the lead-conversion gate | STATE_MACHINE | HIGH | P1 | VERIFIED | api:contracts | DONE |
| [BUG-0012](../../docs/bugs/BUG-0012-onboarding-created-by-lead-conversion-was-born-uneditable.md) | Every onboarding created by lead conversion was born un-editable | STATE_MACHINE | HIGH | P1 | VERIFIED | api:super-admin | DONE |
| [BUG-0014](../../docs/bugs/BUG-0014-no-tenant-that-failed-provisioning-could-be-retried.md) | No tenant that failed provisioning could be retried | STATE_MACHINE | HIGH | P1 | VERIFIED | api:tenant-control-plane | DONE |
| [BUG-0015](../../docs/bugs/BUG-0015-a-tenant-that-fails-before-identities-and-billing-is-unrecoverable.md) | A tenant that fails before identities-and-billing is permanently unrecoverable | STATE_MACHINE | HIGH | P1 | FIXED | api:tenant-control-plane | FIX_NOW |
| [BUG-0016](../../docs/bugs/BUG-0016-partner-onboarding-review-has-no-state-machine.md) | Partner onboarding review has no state machine | STATE_MACHINE | HIGH | P1 | FIXED | api:partner-experience | FIX_NOW |
| [BUG-0019](../../docs/bugs/BUG-0019-partner-inquiry-and-onboarding-review-screens-are-unreachable.md) | Partner inquiry and onboarding review screens have no inbound link | UX | HIGH | P1 | OPEN | apps/admin | PLAN_REQUIRED |
| [BUG-0026](../../docs/bugs/BUG-0026-public-login-and-tenant-email-links-resolved-to-localhost-in.md) | Public Login and tenant email links resolved to localhost in production | INFRA | HIGH | P1 | FIXED | apps/landing, apps/web, apps/admin, services/api, pkg:config | FIX_NOW |
| [BUG-0027](../../docs/bugs/BUG-0027-admin-plan-pricing-and-checkout-pricing-come-from-different-.md) | Admin plan pricing and checkout pricing come from different models | DATA_INTEGRITY | HIGH | P1 | OPEN | services/api/prisma, apps/admin, apps/landing | PLAN_REQUIRED |
| [ITEM-0001](../../docs/backlog/items/ITEM-0001-no-browser-e2e-tooling-exists.md) | No browser E2E tooling exists in any workspace | TEST_GAP | HIGH | P1 | DONE | apps/web, apps/admin, apps/landing | DONE |
| [ITEM-0004](../../docs/backlog/items/ITEM-0004-tenant-activation-never-proven-end-to-end.md) | Tenant activation to ACTIVE has never been reached in any test | TEST_GAP | HIGH | P1 | READY | api:tenant-control-plane | FIX_NOW |
| [ITEM-0018](../../docs/backlog/items/ITEM-0018-plans-and-prices-have-no-draft-publish-or-archive-lifecycle.md) | Plans and prices have no draft, publish or archive lifecycle | ARCHITECTURE | MEDIUM | P1 | READY | services/api/prisma, api:super-admin, apps/admin, apps/landing | PLAN_REQUIRED |
| [BUG-0009](../../docs/bugs/BUG-0009-session-revocation-depended-on-the-refresh-cookie.md) | Server-side session revocation depended on the refresh cookie surviving | SECURITY | MEDIUM | P2 | FIXED | app:admin, api:auth | FIX_NOW |
| [BUG-0010](../../docs/bugs/BUG-0010-unguarded-cookie-options-could-turn-sign-out-into-a-500.md) | Unguarded cookie options could turn admin sign-out into a 500 | INFRA | MEDIUM | P2 | FIXED | app:admin | FIX_NOW |
| [BUG-0013](../../docs/bugs/BUG-0013-public-lead-endpoint-had-no-rate-limiting.md) | The public lead endpoint had no rate limiting | SECURITY | MEDIUM | P2 | VERIFIED | api:leads | DONE |
| [BUG-0017](../../docs/bugs/BUG-0017-tenant-base-domain-setting-does-not-drive-hostname-issuance.md) | The admin-editable tenant base domain does not drive hostname issuance | INTEGRATION | MEDIUM | P2 | OPEN | pkg:config, api:tenant-control-plane | PLAN_REQUIRED |
| [BUG-0020](../../docs/bugs/BUG-0020-window-prompt-used-for-governed-reasons.md) | window.prompt collects governed reasons instead of the design system dialog | UX | MEDIUM | P2 | OPEN | apps/admin, apps/web | PLAN_REQUIRED |
| [BUG-0021](../../docs/bugs/BUG-0021-landing-contact-form-fabricates-lead-data.md) | The landing contact form fabricates lead data and has no honeypot | DATA_INTEGRITY | MEDIUM | P2 | OPEN | apps/landing, api:leads | FIX_NOW |
| [BUG-0022](../../docs/bugs/BUG-0022-provision-tenant-has-no-confirmation-step.md) | "Provision tenant" has no confirmation step and no idempotency key | UX | MEDIUM | P2 | OPEN | apps/admin, api:tenant-control-plane | FIX_NOW |
| [BUG-0025](../../docs/bugs/BUG-0025-a-live-partner-could-be-demoted-through-the-generic-partner-.md) | A live partner could be demoted through the generic partner update | STATE_MACHINE | MEDIUM | P2 | FIXED | api:partners | FIX_NOW |
| [BUG-0028](../../docs/bugs/BUG-0028-country-to-currency-mapping-is-hardcoded-in-the-landing-fron.md) | Country to currency mapping is hardcoded in the landing frontend | INTEGRATION | MEDIUM | P2 | OPEN | apps/landing | PLAN_REQUIRED |
| [ITEM-0002](../../docs/backlog/items/ITEM-0002-no-live-api-session-test-harness.md) | No harness exists for testing against a running API with real sessions | TEST_GAP | MEDIUM | P2 | READY | services/api, apps/admin | FIX_NOW |
| [ITEM-0003](../../docs/backlog/items/ITEM-0003-tenant-erasure-never-exercised-against-a-database.md) | Tenant erasure has no cross-tenant survival assertion | TEST_GAP | MEDIUM | P2 | READY | api:tenant-control-plane | FIX_NOW |
| [ITEM-0005](../../docs/backlog/items/ITEM-0005-customeraccount-leadid-has-no-unique-constraint.md) | CustomerAccount.leadId has no unique constraint, so double conversion is unprevented | TECH_DEBT | MEDIUM | P2 | READY | services/api/prisma, api:super-admin | PLAN_REQUIRED |
| [ITEM-0006](../../docs/backlog/items/ITEM-0006-adr-one-source-of-truth-for-the-tenant-base-domain.md) | ADR needed — one source of truth for the tenant base domain | ARCHITECTURE | MEDIUM | P2 | READY | pkg:config, services/api, apps/web, apps/admin, apps/landing | PLAN_REQUIRED |
| [ITEM-0009](../../docs/backlog/items/ITEM-0009-no-observability-platform-exists.md) | No observability platform exists, so a release cannot be verified from outside | INFRA | MEDIUM | P2 | DEFERRED | services/api, apps/web, apps/admin | DEFER |
| [ITEM-0010](../../docs/backlog/items/ITEM-0010-deployed-sha-is-not-exposed.md) | The running system does not expose its deployed SHA | INFRA | MEDIUM | P2 | READY | services/api | FIX_NOW |
| [ITEM-0012](../../docs/backlog/items/ITEM-0012-cross-check-route-methods-against-their-callers.md) | Cross-check app/api route methods against the hrefs that target them | TEST_GAP | MEDIUM | P2 | READY | apps/web, apps/admin | FIX_NOW |
| [ITEM-0013](../../docs/backlog/items/ITEM-0013-assert-every-public-controller-is-rate-limited.md) | Assert mechanically that every @Public() controller carries the rate-limit guard | TEST_GAP | MEDIUM | P2 | READY | services/api | FIX_NOW |
| [ITEM-0014](../../docs/backlog/items/ITEM-0014-branch-protection-is-not-configured.md) | Branch protection is not configured on the remote | INFRA | MEDIUM | P2 | DONE | .github | DONE |
| [ITEM-0016](../../docs/backlog/items/ITEM-0016-product-decision-partner-onboarding-review-re-opening-and-po.md) | Product decision — partner review re-opening and post-activation demotion | PRODUCT_DECISION | MEDIUM | P2 | PRODUCT_DECISION | api:partner-experience, api:partners | PRODUCT_DECISION |
| [ITEM-0019](../../docs/backlog/items/ITEM-0019-no-market-or-region-model-maps-countries-to-plans-currencies.md) | No market or region model maps countries to plans, currencies and legal sets | ARCHITECTURE | MEDIUM | P2 | READY | services/api/prisma, api:super-admin, apps/admin, apps/landing | PLAN_REQUIRED |
| [BUG-0018](../../docs/bugs/BUG-0018-bulk-lead-delete-is-unreachable-for-every-role.md) | Bulk lead delete is unreachable for every role, including SUPER_ADMIN | AUTHORIZATION | LOW | P3 | DEFERRED | api:platform-auth, api:super-admin | DEFER |
| [BUG-0023](../../docs/bugs/BUG-0023-testing-architecture-context-claims-two-e2e-specs-do-not-exist.md) | The testing-architecture context claims two e2e specs do not exist | DOCUMENTATION | LOW | P3 | FIXED | .agent/context | FIX_NOW |
| [BUG-0024](../../docs/bugs/BUG-0024-start-onboarding-api-and-proxy-have-no-caller.md) | The start-onboarding API endpoint and its proxy have no caller | BUG | LOW | P3 | OPEN | apps/admin, api:super-admin | FIX_NOW |
| [ITEM-0007](../../docs/backlog/items/ITEM-0007-should-duplicate-website-leads-be-deduplicated.md) | Product decision — should duplicate website leads be deduplicated? | PRODUCT_DECISION | LOW | P3 | PRODUCT_DECISION | api:leads, apps/landing | PRODUCT_DECISION |
| [ITEM-0008](../../docs/backlog/items/ITEM-0008-customeraccount-has-no-origin-channel.md) | Product decision — CustomerAccount carries no origin channel | PRODUCT_DECISION | LOW | P3 | PRODUCT_DECISION | services/api/prisma, api:super-admin | PRODUCT_DECISION |
| [ITEM-0011](../../docs/backlog/items/ITEM-0011-framework-validation-should-catch-absence-claims.md) | Framework validation should catch false absence claims in context documents | TECH_DEBT | LOW | P3 | READY | .agent/context, scripts | FIX_NOW |
| [ITEM-0015](../../docs/backlog/items/ITEM-0015-make-the-tenant-readiness-assertion-auditable.md) | Make the tenant readiness() authorization assertion auditable | FOLLOW_UP | LOW | P3 | READY | api:tenant-control-plane | FIX_NOW |
| [ITEM-0017](../../docs/backlog/items/ITEM-0017-buildworkspaceurl-still-carries-an-internal-loopback-fallbac.md) | buildWorkspaceUrl still carries an internal loopback fallback | TECH_DEBT | LOW | P3 | READY | pkg:config | DEFER |

## Views

- [Open](open.md) — active work
- [Blocked](blocked.md) — waiting on something external
- [Deferred](deferred.md) — deliberately not now
- [Product decisions](product-decisions.md) — waiting on a human product call
- [Completed](completed.md) — fixed, verified, closed, cancelled or accepted
