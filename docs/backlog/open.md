# Open Backlog

> **Generated file — do not edit by hand.** Rebuild with `node scripts/rebuild-backlog.mjs`.

Active work: bugs that are `OPEN` / `IN_PROGRESS` / `FIXED` (fixed but not yet
QA-verified), and items that are `NEW` / `TRIAGE_REQUIRED` / `READY` /
`IN_PROGRESS` / `VALIDATING`.

The Architect reads this before planning any substantial change —
`BACKLOG_PRECHECK` in [`.agent/agents/architect.md`](../../.agent/agents/architect.md).

## Awaiting Architect triage

_None._

## CRITICAL

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [BUG-0027](../../docs/bugs/BUG-0027-admin-plan-pricing-and-checkout-pricing-come-from-different-.md) | Admin plan pricing and checkout pricing come from different models | DATA_INTEGRITY | CRITICAL | P0 | FIXED | services/api/prisma, apps/admin, apps/landing | PLAN_REQUIRED |
| [BUG-0030](../../docs/bugs/BUG-0030-plan-list-get-mutates-commercial-pricing-and-can-fail-on-pla.md) | Plan list GET mutates commercial pricing and can fail on PlanPrice unique constraint | DATA_INTEGRITY | CRITICAL | P0 | FIXED | services/api, services/api/prisma | FIX_NOW |

## HIGH

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [BUG-0015](../../docs/bugs/BUG-0015-a-tenant-that-fails-before-identities-and-billing-is-unrecoverable.md) | A tenant that fails before identities-and-billing is permanently unrecoverable | STATE_MACHINE | HIGH | P1 | FIXED | api:tenant-control-plane | FIX_NOW |
| [BUG-0016](../../docs/bugs/BUG-0016-partner-onboarding-review-has-no-state-machine.md) | Partner onboarding review has no state machine | STATE_MACHINE | HIGH | P1 | FIXED | api:partner-experience | FIX_NOW |
| [BUG-0019](../../docs/bugs/BUG-0019-partner-inquiry-and-onboarding-review-screens-are-unreachable.md) | Partner inquiry and onboarding review screens have no inbound link | UX | HIGH | P1 | OPEN | apps/admin | PLAN_REQUIRED |
| [BUG-0026](../../docs/bugs/BUG-0026-public-login-and-tenant-email-links-resolved-to-localhost-in.md) | Public Login and tenant email links resolved to localhost in production | INFRA | HIGH | P1 | FIXED | apps/landing, apps/web, apps/admin, services/api, pkg:config | FIX_NOW |
| [BUG-0031](../../docs/bugs/BUG-0031-public-subscribe-endpoint-has-no-rate-limiting.md) | Public subscribe endpoint has no rate limiting | SECURITY | HIGH | P1 | FIXED | api:billing, apps/landing | PLAN_REQUIRED |
| [BUG-0032](../../docs/bugs/BUG-0032-landing-proxies-collapse-every-visitor-into-one-rate-limit-b.md) | Landing proxies collapse every visitor into one rate limit bucket | SECURITY | HIGH | P1 | FIXED | apps/landing, services/api/src/common | PLAN_REQUIRED |
| [BUG-0033](../../docs/bugs/BUG-0033-desktop-agent-login-is-unthrottled-and-enumerates-users-acro.md) | Desktop agent login is unthrottled and enumerates users across every tenant | SECURITY | HIGH | P1 | FIXED | api:agent, apps/agent-desktop | FIX_NOW |
| [BUG-0034](../../docs/bugs/BUG-0034-desktop-agent-auto-update-points-at-an-endpoint-that-does-no.md) | Desktop agent auto update points at an endpoint that does not exist | INTEGRATION | HIGH | P1 | OPEN | apps/agent-desktop, api:agent, api:app-releases | PLAN_REQUIRED |
| [BUG-0035](../../docs/bugs/BUG-0035-desktop-agent-logout-never-revokes-the-refresh-token.md) | Desktop agent logout never revokes the refresh token | SECURITY | HIGH | P1 | FIXED | apps/agent-desktop, api:agent | FIX_NOW |
| [BUG-0036](../../docs/bugs/BUG-0036-agent-heartbeat-has-no-idempotency-so-retries-double-count-p.md) | Agent heartbeat has no idempotency so retries double count productivity | DATA_INTEGRITY | HIGH | P1 | OPEN | api:agent, services/api/prisma, apps/agent-desktop | PLAN_REQUIRED |
| [ITEM-0004](../../docs/backlog/items/ITEM-0004-tenant-activation-never-proven-end-to-end.md) | Tenant activation to ACTIVE has never been reached in any test | TEST_GAP | HIGH | P1 | READY | api:tenant-control-plane | FIX_NOW |

## MEDIUM

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [ITEM-0018](../../docs/backlog/items/ITEM-0018-plans-and-prices-have-no-draft-publish-or-archive-lifecycle.md) | Plans and prices have no draft, publish or archive lifecycle | ARCHITECTURE | MEDIUM | P1 | VALIDATING | services/api/prisma, api:super-admin, apps/admin, apps/landing | FIX_NOW |
| [BUG-0009](../../docs/bugs/BUG-0009-session-revocation-depended-on-the-refresh-cookie.md) | Server-side session revocation depended on the refresh cookie surviving | SECURITY | MEDIUM | P2 | FIXED | app:admin, api:auth | FIX_NOW |
| [BUG-0010](../../docs/bugs/BUG-0010-unguarded-cookie-options-could-turn-sign-out-into-a-500.md) | Unguarded cookie options could turn admin sign-out into a 500 | INFRA | MEDIUM | P2 | FIXED | app:admin | FIX_NOW |
| [BUG-0017](../../docs/bugs/BUG-0017-tenant-base-domain-setting-does-not-drive-hostname-issuance.md) | The admin-editable tenant base domain does not drive hostname issuance | INTEGRATION | MEDIUM | P2 | OPEN | pkg:config, api:tenant-control-plane | PLAN_REQUIRED |
| [BUG-0020](../../docs/bugs/BUG-0020-window-prompt-used-for-governed-reasons.md) | window.prompt collects governed reasons instead of the design system dialog | UX | MEDIUM | P2 | OPEN | apps/admin, apps/web | PLAN_REQUIRED |
| [BUG-0021](../../docs/bugs/BUG-0021-landing-contact-form-fabricates-lead-data.md) | The landing contact form fabricates lead data and has no honeypot | DATA_INTEGRITY | MEDIUM | P2 | FIXED | apps/landing, api:leads | FIX_NOW |
| [BUG-0022](../../docs/bugs/BUG-0022-provision-tenant-has-no-confirmation-step.md) | "Provision tenant" has no confirmation step and no idempotency key | UX | MEDIUM | P2 | OPEN | apps/admin, api:tenant-control-plane | FIX_NOW |
| [BUG-0025](../../docs/bugs/BUG-0025-a-live-partner-could-be-demoted-through-the-generic-partner-.md) | A live partner could be demoted through the generic partner update | STATE_MACHINE | MEDIUM | P2 | FIXED | api:partners | FIX_NOW |
| [BUG-0028](../../docs/bugs/BUG-0028-country-to-currency-mapping-is-hardcoded-in-the-landing-fron.md) | Country to currency mapping is hardcoded in the landing frontend | INTEGRATION | MEDIUM | P2 | FIXED | apps/landing | PLAN_REQUIRED |
| [BUG-0029](../../docs/bugs/BUG-0029-public-features-page-advertised-capabilities-the-product-doe.md) | Public features page advertised capabilities the product does not gate and omitted ones it does | DOCUMENTATION | MEDIUM | P2 | FIXED | apps/landing | FIX_NOW |
| [BUG-0037](../../docs/bugs/BUG-0037-integration-patterns-context-denies-four-subsystems-that-exi.md) | Integration patterns context denies four subsystems that exist | DOCUMENTATION | MEDIUM | P2 | FIXED | .agent/context | FIX_NOW |
| [ITEM-0002](../../docs/backlog/items/ITEM-0002-no-live-api-session-test-harness.md) | No harness exists for testing against a running API with real sessions | TEST_GAP | MEDIUM | P2 | READY | services/api, apps/admin | FIX_NOW |
| [ITEM-0003](../../docs/backlog/items/ITEM-0003-tenant-erasure-never-exercised-against-a-database.md) | Tenant erasure has no cross-tenant survival assertion | TEST_GAP | MEDIUM | P2 | READY | api:tenant-control-plane | FIX_NOW |
| [ITEM-0005](../../docs/backlog/items/ITEM-0005-customeraccount-leadid-has-no-unique-constraint.md) | CustomerAccount.leadId has no unique constraint, so double conversion is unprevented | TECH_DEBT | MEDIUM | P2 | READY | services/api/prisma, api:super-admin | PLAN_REQUIRED |
| [ITEM-0006](../../docs/backlog/items/ITEM-0006-adr-one-source-of-truth-for-the-tenant-base-domain.md) | ADR needed — one source of truth for the tenant base domain | ARCHITECTURE | MEDIUM | P2 | READY | pkg:config, services/api, apps/web, apps/admin, apps/landing | PLAN_REQUIRED |
| [ITEM-0010](../../docs/backlog/items/ITEM-0010-deployed-sha-is-not-exposed.md) | The running system does not expose its deployed SHA | INFRA | MEDIUM | P2 | READY | services/api | FIX_NOW |
| [ITEM-0012](../../docs/backlog/items/ITEM-0012-cross-check-route-methods-against-their-callers.md) | Cross-check app/api route methods against the hrefs that target them | TEST_GAP | MEDIUM | P2 | READY | apps/web, apps/admin | FIX_NOW |
| [ITEM-0019](../../docs/backlog/items/ITEM-0019-no-market-or-region-model-maps-countries-to-plans-currencies.md) | No market or region model maps countries to plans, currencies and legal sets | ARCHITECTURE | MEDIUM | P2 | VALIDATING | services/api/prisma, api:super-admin, apps/admin, apps/landing | FIX_NOW |
| [ITEM-0020](../../docs/backlog/items/ITEM-0020-contract-phase-drop-legacy-plan-pricing-columns.md) | Contract phase: drop legacy Plan pricing columns | TECH_DEBT | MEDIUM | P2 | READY | services/api/prisma, api:super-admin, apps/admin | PLAN_REQUIRED |
| [ITEM-0022](../../docs/backlog/items/ITEM-0022-governed-publish-and-archive-actions-for-commercial-configur.md) | Governed publish and archive actions for commercial configuration | FOLLOW_UP | MEDIUM | P2 | READY | api:super-admin, apps/admin | PLAN_REQUIRED |
| [ITEM-0025](../../docs/backlog/items/ITEM-0025-hidden-writes-remain-on-lookups-and-onboarding-read-paths.md) | Hidden writes remain on lookups and onboarding read paths | TECH_DEBT | MEDIUM | P2 | READY | api:lookups, api:onboarding | PLAN_REQUIRED |
| [ITEM-0026](../../docs/backlog/items/ITEM-0026-desktop-agent-windows-installer-is-unsigned.md) | Desktop agent Windows installer is unsigned | SECURITY | MEDIUM | P2 | READY | apps/agent-desktop | PLAN_REQUIRED |
| [ITEM-0027](../../docs/backlog/items/ITEM-0027-desktop-agent-has-no-retry-backoff-and-no-bounded-give-up.md) | Desktop agent has no retry backoff and no bounded give up | TECH_DEBT | MEDIUM | P2 | READY | apps/agent-desktop, api:agent | PLAN_REQUIRED |
| [ITEM-0028](../../docs/backlog/items/ITEM-0028-apps-agent-desktop-has-no-agents-md-and-no-test-coverage.md) | apps/agent-desktop has no AGENTS.md and no test coverage | TEST_GAP | MEDIUM | P2 | READY | apps/agent-desktop, api:agent | FIX_NOW |
| [ITEM-0030](../../docs/backlog/items/ITEM-0030-partner-inquiry-form-does-not-yet-capture-partnership-model.md) | Partner inquiry form does not yet capture partnership model | FOLLOW_UP | MEDIUM | P2 | VALIDATING | apps/landing, api:partners | FIX_NOW |

## LOW and unrated

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [ITEM-0021](../../docs/backlog/items/ITEM-0021-mechanical-guard-against-country-and-currency-literals-in-fr.md) | Mechanical guard against country and currency literals in frontends | TEST_GAP | LOW | P2 | READY | scripts, apps/landing, apps/web, apps/admin | DEFER |
| [ITEM-0023](../../docs/backlog/items/ITEM-0023-tenant-dataregion-populated-from-market-at-provisioning.md) | Tenant.dataRegion populated from market at provisioning | FOLLOW_UP | LOW | P2 | READY | services/api/prisma, api:tenant-control-plane | DEFER |
| [ITEM-0024](../../docs/backlog/items/ITEM-0024-landing-depends-on-lucide-react-without-declaring-it.md) | Landing depends on lucide-react without declaring it | TECH_DEBT | LOW | P2 | READY | apps/landing | DEFER |
| [BUG-0023](../../docs/bugs/BUG-0023-testing-architecture-context-claims-two-e2e-specs-do-not-exist.md) | The testing-architecture context claims two e2e specs do not exist | DOCUMENTATION | LOW | P3 | FIXED | .agent/context | FIX_NOW |
| [BUG-0024](../../docs/bugs/BUG-0024-start-onboarding-api-and-proxy-have-no-caller.md) | The start-onboarding API endpoint and its proxy have no caller | BUG | LOW | P3 | OPEN | apps/admin, api:super-admin | FIX_NOW |
| [ITEM-0011](../../docs/backlog/items/ITEM-0011-framework-validation-should-catch-absence-claims.md) | Framework validation should catch false absence claims in context documents | TECH_DEBT | LOW | P3 | READY | .agent/context, scripts | FIX_NOW |
| [ITEM-0015](../../docs/backlog/items/ITEM-0015-make-the-tenant-readiness-assertion-auditable.md) | Make the tenant readiness() authorization assertion auditable | FOLLOW_UP | LOW | P3 | READY | api:tenant-control-plane | FIX_NOW |
| [ITEM-0017](../../docs/backlog/items/ITEM-0017-buildworkspaceurl-still-carries-an-internal-loopback-fallbac.md) | buildWorkspaceUrl still carries an internal loopback fallback | TECH_DEBT | LOW | P3 | READY | pkg:config | DEFER |
| [ITEM-0029](../../docs/backlog/items/ITEM-0029-validation-should-require-an-aliases-line-on-every-record.md) | Validation should require an aliases line on every record | TECH_DEBT | LOW | P3 | READY | scripts, docs/backlog, docs/bugs | FIX_NOW |
