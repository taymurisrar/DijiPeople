# Completed

> **Generated file — do not edit by hand.** Rebuild with `node scripts/rebuild-backlog.mjs`.

Terminal records: verified fixes, closed items, duplicates, things that turned
out not to be bugs, and explicitly accepted risks.

Kept, not deleted. A fixed bug is the evidence a regression test exists for
a real failure — which is what a future agent needs when it is about to write
the same defect again.

## Verified and closed

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [BUG-0005](../../docs/bugs/BUG-0005-cross-tenant-error-log-read-via-support-role.md) | A support-role user could read another tenant's error log | TENANT_ISOLATION | CRITICAL | P0 | VERIFIED | api:error-logs | DONE |
| [BUG-0006](../../docs/bugs/BUG-0006-organization-structure-mutable-by-any-authenticated-user.md) | Organization and business-unit structure was mutable by any authenticated user | AUTHORIZATION | CRITICAL | P0 | VERIFIED | api:organization | DONE |
| [BUG-0027](../../docs/bugs/BUG-0027-admin-plan-pricing-and-checkout-pricing-come-from-different-.md) | Admin plan pricing and checkout pricing come from different models | DATA_INTEGRITY | CRITICAL | P0 | VERIFIED | services/api/prisma, apps/admin, apps/landing | PLAN_REQUIRED |
| [BUG-0030](../../docs/bugs/BUG-0030-plan-list-get-mutates-commercial-pricing-and-can-fail-on-pla.md) | Plan list GET mutates commercial pricing and can fail on PlanPrice unique constraint | DATA_INTEGRITY | CRITICAL | P0 | VERIFIED | services/api, services/api/prisma | FIX_NOW |
| [BUG-0001](../../docs/bugs/BUG-0001-compensation-and-bank-data-behind-employee-record-read.md) | Compensation and bank data returned behind an employee-record read | AUTHORIZATION | HIGH | P1 | VERIFIED | api:employees | DONE |
| [BUG-0002](../../docs/bugs/BUG-0002-self-approval-of-attendance-corrections.md) | A manager could file and approve their own attendance correction | AUTHORIZATION | HIGH | P1 | VERIFIED | api:attendance | DONE |
| [BUG-0003](../../docs/bugs/BUG-0003-readteam-granted-tenant-wide-visibility.md) | readTeam permissions granted tenant-wide visibility | AUTHORIZATION | HIGH | P1 | VERIFIED | api:attendance, api:approvals | DONE |
| [BUG-0004](../../docs/bugs/BUG-0004-search-filter-overwrote-the-access-scope.md) | A search filter silently overwrote the access scope | AUTHORIZATION | HIGH | P1 | VERIFIED | api:approvals | DONE |
| [BUG-0007](../../docs/bugs/BUG-0007-unguarded-duplicate-of-a-permission-gated-route.md) | An unguarded duplicate route aliased a permission-gated one | AUTHORIZATION | HIGH | P1 | VERIFIED | api:tenant-settings | DONE |
| [BUG-0008](../../docs/bugs/BUG-0008-session-expired-sign-in-again-returned-405.md) | Session-expired "Sign in again" returned 405 and stranded admin operators | BUG | HIGH | P1 | VERIFIED | app:admin, app:admin | DONE |
| [BUG-0011](../../docs/bugs/BUG-0011-signed-agreement-editable-defeating-the-lead-conversion-gate.md) | Signed agreements were editable, defeating the lead-conversion gate | STATE_MACHINE | HIGH | P1 | VERIFIED | api:contracts | DONE |
| [BUG-0012](../../docs/bugs/BUG-0012-onboarding-created-by-lead-conversion-was-born-uneditable.md) | Every onboarding created by lead conversion was born un-editable | STATE_MACHINE | HIGH | P1 | VERIFIED | api:super-admin | DONE |
| [BUG-0014](../../docs/bugs/BUG-0014-no-tenant-that-failed-provisioning-could-be-retried.md) | No tenant that failed provisioning could be retried | STATE_MACHINE | HIGH | P1 | VERIFIED | api:tenant-control-plane | DONE |
| [BUG-0015](../../docs/bugs/BUG-0015-a-tenant-that-fails-before-identities-and-billing-is-unrecoverable.md) | A tenant that fails before identities-and-billing is permanently unrecoverable | STATE_MACHINE | HIGH | P1 | VERIFIED | api:tenant-control-plane | FIX_NOW |
| [BUG-0016](../../docs/bugs/BUG-0016-partner-onboarding-review-has-no-state-machine.md) | Partner onboarding review has no state machine | STATE_MACHINE | HIGH | P1 | VERIFIED | api:partner-experience | FIX_NOW |
| [BUG-0019](../../docs/bugs/BUG-0019-partner-inquiry-and-onboarding-review-screens-are-unreachable.md) | Partner inquiry and onboarding review screens have no inbound link | UX | HIGH | P1 | VERIFIED | apps/admin | PLAN_REQUIRED |
| [BUG-0026](../../docs/bugs/BUG-0026-public-login-and-tenant-email-links-resolved-to-localhost-in.md) | Public Login and tenant email links resolved to localhost in production | INFRA | HIGH | P1 | VERIFIED | apps/landing, apps/web, apps/admin, services/api, pkg:config | FIX_NOW |
| [BUG-0031](../../docs/bugs/BUG-0031-public-subscribe-endpoint-has-no-rate-limiting.md) | Public subscribe endpoint has no rate limiting | SECURITY | HIGH | P1 | VERIFIED | api:billing, apps/landing | PLAN_REQUIRED |
| [BUG-0032](../../docs/bugs/BUG-0032-landing-proxies-collapse-every-visitor-into-one-rate-limit-b.md) | Landing proxies collapse every visitor into one rate limit bucket | SECURITY | HIGH | P1 | VERIFIED | apps/landing, services/api/src/common | PLAN_REQUIRED |
| [BUG-0033](../../docs/bugs/BUG-0033-desktop-agent-login-is-unthrottled-and-enumerates-users-acro.md) | Desktop agent login is unthrottled and enumerates users across every tenant | SECURITY | HIGH | P1 | VERIFIED | api:agent, apps/agent-desktop | FIX_NOW |
| [BUG-0035](../../docs/bugs/BUG-0035-desktop-agent-logout-never-revokes-the-refresh-token.md) | Desktop agent logout never revokes the refresh token | SECURITY | HIGH | P1 | VERIFIED | apps/agent-desktop, api:agent | FIX_NOW |
| [BUG-0036](../../docs/bugs/BUG-0036-agent-heartbeat-has-no-idempotency-so-retries-double-count-p.md) | Agent heartbeat has no idempotency so retries double count productivity | DATA_INTEGRITY | HIGH | P1 | VERIFIED | api:agent, services/api/prisma, apps/agent-desktop | PLAN_REQUIRED |
| [ITEM-0001](../../docs/backlog/items/ITEM-0001-no-browser-e2e-tooling-exists.md) | No browser E2E tooling exists in any workspace | TEST_GAP | HIGH | P1 | DONE | apps/web, apps/admin, apps/landing | DONE |
| [ITEM-0018](../../docs/backlog/items/ITEM-0018-plans-and-prices-have-no-draft-publish-or-archive-lifecycle.md) | Plans and prices have no draft, publish or archive lifecycle | ARCHITECTURE | MEDIUM | P1 | DONE | services/api/prisma, api:super-admin, apps/admin, apps/landing | FIX_NOW |
| [BUG-0009](../../docs/bugs/BUG-0009-session-revocation-depended-on-the-refresh-cookie.md) | Server-side session revocation depended on the refresh cookie surviving | SECURITY | MEDIUM | P2 | VERIFIED | app:admin, api:auth | FIX_NOW |
| [BUG-0010](../../docs/bugs/BUG-0010-unguarded-cookie-options-could-turn-sign-out-into-a-500.md) | Unguarded cookie options could turn admin sign-out into a 500 | INFRA | MEDIUM | P2 | VERIFIED | app:admin | FIX_NOW |
| [BUG-0013](../../docs/bugs/BUG-0013-public-lead-endpoint-had-no-rate-limiting.md) | The public lead endpoint had no rate limiting | SECURITY | MEDIUM | P2 | VERIFIED | api:leads | DONE |
| [BUG-0017](../../docs/bugs/BUG-0017-tenant-base-domain-setting-does-not-drive-hostname-issuance.md) | The admin-editable tenant base domain does not drive hostname issuance | INTEGRATION | MEDIUM | P2 | VERIFIED | pkg:config, api:tenant-control-plane | PLAN_REQUIRED |
| [BUG-0020](../../docs/bugs/BUG-0020-window-prompt-used-for-governed-reasons.md) | window.prompt collects governed reasons instead of the design system dialog | UX | MEDIUM | P2 | VERIFIED | apps/admin, apps/web | PLAN_REQUIRED |
| [BUG-0021](../../docs/bugs/BUG-0021-landing-contact-form-fabricates-lead-data.md) | The landing contact form fabricates lead data and has no honeypot | DATA_INTEGRITY | MEDIUM | P2 | VERIFIED | apps/landing, api:leads | FIX_NOW |
| [BUG-0022](../../docs/bugs/BUG-0022-provision-tenant-has-no-confirmation-step.md) | "Provision tenant" has no confirmation step and no idempotency key | UX | MEDIUM | P2 | VERIFIED | apps/admin, api:tenant-control-plane | FIX_NOW |
| [BUG-0025](../../docs/bugs/BUG-0025-a-live-partner-could-be-demoted-through-the-generic-partner-.md) | A live partner could be demoted through the generic partner update | STATE_MACHINE | MEDIUM | P2 | VERIFIED | api:partners | FIX_NOW |
| [BUG-0028](../../docs/bugs/BUG-0028-country-to-currency-mapping-is-hardcoded-in-the-landing-fron.md) | Country to currency mapping is hardcoded in the landing frontend | INTEGRATION | MEDIUM | P2 | VERIFIED | apps/landing | PLAN_REQUIRED |
| [BUG-0029](../../docs/bugs/BUG-0029-public-features-page-advertised-capabilities-the-product-doe.md) | Public features page advertised capabilities the product does not gate and omitted ones it does | DOCUMENTATION | MEDIUM | P2 | VERIFIED | apps/landing | FIX_NOW |
| [BUG-0037](../../docs/bugs/BUG-0037-integration-patterns-context-denies-four-subsystems-that-exi.md) | Integration patterns context denies four subsystems that exist | DOCUMENTATION | MEDIUM | P2 | VERIFIED | .agent/context | FIX_NOW |
| [BUG-0038](../../docs/bugs/BUG-0038-tenant-commercial-panel-plan-dropdown-405s-and-never-loads.md) | Tenant commercial panel plan dropdown 405s and never loads | UX | MEDIUM | P2 | VERIFIED | apps/admin | FIX_NOW |
| [ITEM-0005](../../docs/backlog/items/ITEM-0005-customeraccount-leadid-has-no-unique-constraint.md) | CustomerAccount.leadId has no unique constraint, so double conversion is unprevented | TECH_DEBT | MEDIUM | P2 | DONE | services/api/prisma, api:super-admin | PLAN_REQUIRED |
| [ITEM-0012](../../docs/backlog/items/ITEM-0012-cross-check-route-methods-against-their-callers.md) | Cross-check app/api route methods against the hrefs that target them | TEST_GAP | MEDIUM | P2 | DONE | apps/web, apps/admin | FIX_NOW |
| [ITEM-0013](../../docs/backlog/items/ITEM-0013-assert-every-public-controller-is-rate-limited.md) | Assert mechanically that every @Public() controller carries the rate-limit guard | TEST_GAP | MEDIUM | P2 | DONE | services/api | FIX_NOW |
| [ITEM-0014](../../docs/backlog/items/ITEM-0014-branch-protection-is-not-configured.md) | Branch protection is not configured on the remote | INFRA | MEDIUM | P2 | DONE | .github | DONE |
| [ITEM-0016](../../docs/backlog/items/ITEM-0016-product-decision-partner-onboarding-review-re-opening-and-po.md) | Product decision — partner review re-opening and post-activation demotion | PRODUCT_DECISION | MEDIUM | P2 | DONE | api:partner-experience, api:partners | FIX_NOW |
| [ITEM-0019](../../docs/backlog/items/ITEM-0019-no-market-or-region-model-maps-countries-to-plans-currencies.md) | No market or region model maps countries to plans, currencies and legal sets | ARCHITECTURE | MEDIUM | P2 | DONE | services/api/prisma, api:super-admin, apps/admin, apps/landing | FIX_NOW |
| [ITEM-0030](../../docs/backlog/items/ITEM-0030-partner-inquiry-form-does-not-yet-capture-partnership-model.md) | Partner inquiry form does not yet capture partnership model | FOLLOW_UP | MEDIUM | P2 | DONE | apps/landing, api:partners | FIX_NOW |
| [ITEM-0021](../../docs/backlog/items/ITEM-0021-mechanical-guard-against-country-and-currency-literals-in-fr.md) | Mechanical guard against country and currency literals in frontends | TEST_GAP | LOW | P2 | DONE | scripts, apps/landing, apps/web, apps/admin | DEFER |
| [ITEM-0024](../../docs/backlog/items/ITEM-0024-landing-depends-on-lucide-react-without-declaring-it.md) | Landing depends on lucide-react without declaring it | TECH_DEBT | LOW | P2 | DONE | apps/landing | DEFER |
| [BUG-0023](../../docs/bugs/BUG-0023-testing-architecture-context-claims-two-e2e-specs-do-not-exist.md) | The testing-architecture context claims two e2e specs do not exist | DOCUMENTATION | LOW | P3 | VERIFIED | .agent/context | FIX_NOW |
| [BUG-0024](../../docs/bugs/BUG-0024-start-onboarding-api-and-proxy-have-no-caller.md) | The start-onboarding API endpoint and its proxy have no caller | BUG | LOW | P3 | VERIFIED | apps/admin, api:super-admin | FIX_NOW |
| [ITEM-0007](../../docs/backlog/items/ITEM-0007-should-duplicate-website-leads-be-deduplicated.md) | Product decision — should duplicate website leads be deduplicated? | PRODUCT_DECISION | LOW | P3 | DONE | api:leads, apps/landing | FIX_NOW |
| [ITEM-0008](../../docs/backlog/items/ITEM-0008-customeraccount-has-no-origin-channel.md) | Product decision — CustomerAccount carries no origin channel | PRODUCT_DECISION | LOW | P3 | DONE | services/api/prisma, api:super-admin | FIX_NOW |
| [ITEM-0011](../../docs/backlog/items/ITEM-0011-framework-validation-should-catch-absence-claims.md) | Framework validation should catch false absence claims in context documents | TECH_DEBT | LOW | P3 | DONE | .agent/context, scripts | FIX_NOW |
| [ITEM-0017](../../docs/backlog/items/ITEM-0017-buildworkspaceurl-still-carries-an-internal-loopback-fallbac.md) | buildWorkspaceUrl still carries an internal loopback fallback | TECH_DEBT | LOW | P3 | DONE | pkg:config | DEFER |
| [ITEM-0029](../../docs/backlog/items/ITEM-0029-validation-should-require-an-aliases-line-on-every-record.md) | Validation should require an aliases line on every record | TECH_DEBT | LOW | P3 | DONE | scripts, docs/backlog, docs/bugs | FIX_NOW |

## Accepted risk

_None._

## Not a bug, duplicate or cancelled

_None._
