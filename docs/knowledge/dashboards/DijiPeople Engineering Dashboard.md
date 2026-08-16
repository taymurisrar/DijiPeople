# DijiPeople Engineering Dashboard

> **Generated file — do not edit by hand.** Rebuild with `node scripts/generate-dashboards.mjs`,
> then publish with `node scripts/sync-obsidian.mjs`. Edits made in the vault are lost on the next sync.

## At a glance

| | |
|---|---|
| Open CRITICAL | **1** |
| Open HIGH | **11** |
| Open total | 44 |
| Blocked | 0 |
| Awaiting a product decision | 3 |
| Deferred | 2 |
| Completed | 14 |
| Awaiting Architect triage | 0 |

## Open Critical Bugs

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[BUG-0027-admin-plan-pricing-and-checkout-pricing-come-from-different-|BUG-0027]] | Admin plan pricing and checkout pricing come from different models | DATA_INTEGRITY | CRITICAL | FIXED | services/api/prisma, apps/admin, apps/landing | PLAN_REQUIRED |

## Open High Bugs

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[BUG-0015-a-tenant-that-fails-before-identities-and-billing-is-unrecoverable|BUG-0015]] | A tenant that fails before identities-and-billing is permanently unrecoverable | STATE_MACHINE | HIGH | FIXED | api:tenant-control-plane | FIX_NOW |
| [[BUG-0016-partner-onboarding-review-has-no-state-machine|BUG-0016]] | Partner onboarding review has no state machine | STATE_MACHINE | HIGH | FIXED | api:partner-experience | FIX_NOW |
| [[BUG-0019-partner-inquiry-and-onboarding-review-screens-are-unreachable|BUG-0019]] | Partner inquiry and onboarding review screens have no inbound link | UX | HIGH | OPEN | apps/admin | PLAN_REQUIRED |
| [[BUG-0026-public-login-and-tenant-email-links-resolved-to-localhost-in|BUG-0026]] | Public Login and tenant email links resolved to localhost in production | INFRA | HIGH | FIXED | apps/landing, apps/web, apps/admin, services/api, pkg:config | FIX_NOW |
| [[BUG-0030-public-subscribe-endpoint-has-no-rate-limiting|BUG-0030]] | Public subscribe endpoint has no rate limiting | SECURITY | HIGH | OPEN | api:billing, apps/landing | PLAN_REQUIRED |
| [[BUG-0031-landing-proxies-collapse-every-visitor-into-one-rate-limit-b|BUG-0031]] | Landing proxies collapse every visitor into one rate limit bucket | SECURITY | HIGH | OPEN | apps/landing, services/api/src/common | PLAN_REQUIRED |
| [[BUG-0032-desktop-agent-login-is-unthrottled-and-enumerates-users-acro|BUG-0032]] | Desktop agent login is unthrottled and enumerates users across every tenant | SECURITY | HIGH | OPEN | api:agent, apps/agent-desktop | FIX_NOW |
| [[BUG-0033-desktop-agent-auto-update-points-at-an-endpoint-that-does-no|BUG-0033]] | Desktop agent auto update points at an endpoint that does not exist | INTEGRATION | HIGH | OPEN | apps/agent-desktop, api:agent, api:app-releases | PLAN_REQUIRED |
| [[BUG-0034-desktop-agent-logout-never-revokes-the-refresh-token|BUG-0034]] | Desktop agent logout never revokes the refresh token | SECURITY | HIGH | OPEN | apps/agent-desktop, api:agent | FIX_NOW |
| [[BUG-0035-agent-heartbeat-has-no-idempotency-so-retries-double-count-p|BUG-0035]] | Agent heartbeat has no idempotency so retries double count productivity | DATA_INTEGRITY | HIGH | OPEN | api:agent, services/api/prisma, apps/agent-desktop | PLAN_REQUIRED |
| [[ITEM-0004-tenant-activation-never-proven-end-to-end|ITEM-0004]] | Tenant activation to ACTIVE has never been reached in any test | TEST_GAP | HIGH | READY | api:tenant-control-plane | FIX_NOW |

## Product Decisions Needed

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[ITEM-0016-product-decision-partner-onboarding-review-re-opening-and-po|ITEM-0016]] | Product decision — partner review re-opening and post-activation demotion | PRODUCT_DECISION | MEDIUM | PRODUCT_DECISION | api:partner-experience, api:partners | PRODUCT_DECISION |
| [[ITEM-0007-should-duplicate-website-leads-be-deduplicated|ITEM-0007]] | Product decision — should duplicate website leads be deduplicated? | PRODUCT_DECISION | LOW | PRODUCT_DECISION | api:leads, apps/landing | PRODUCT_DECISION |
| [[ITEM-0008-customeraccount-has-no-origin-channel|ITEM-0008]] | Product decision — CustomerAccount carries no origin channel | PRODUCT_DECISION | LOW | PRODUCT_DECISION | services/api/prisma, api:super-admin | PRODUCT_DECISION |

## Blocked Items

_None._

## Current Test Gaps

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[ITEM-0004-tenant-activation-never-proven-end-to-end|ITEM-0004]] | Tenant activation to ACTIVE has never been reached in any test | TEST_GAP | HIGH | READY | api:tenant-control-plane | FIX_NOW |
| [[ITEM-0002-no-live-api-session-test-harness|ITEM-0002]] | No harness exists for testing against a running API with real sessions | TEST_GAP | MEDIUM | READY | services/api, apps/admin | FIX_NOW |
| [[ITEM-0003-tenant-erasure-never-exercised-against-a-database|ITEM-0003]] | Tenant erasure has no cross-tenant survival assertion | TEST_GAP | MEDIUM | READY | api:tenant-control-plane | FIX_NOW |
| [[ITEM-0012-cross-check-route-methods-against-their-callers|ITEM-0012]] | Cross-check app/api route methods against the hrefs that target them | TEST_GAP | MEDIUM | READY | apps/web, apps/admin | FIX_NOW |
| [[ITEM-0013-assert-every-public-controller-is-rate-limited|ITEM-0013]] | Assert mechanically that every @Public() controller carries the rate-limit guard | TEST_GAP | MEDIUM | READY | services/api | FIX_NOW |
| [[ITEM-0027-apps-agent-desktop-has-no-agents-md-and-no-test-coverage|ITEM-0027]] | apps/agent-desktop has no AGENTS.md and no test coverage | TEST_GAP | MEDIUM | READY | apps/agent-desktop, api:agent | FIX_NOW |
| [[ITEM-0021-mechanical-guard-against-country-and-currency-literals-in-fr|ITEM-0021]] | Mechanical guard against country and currency literals in frontends | TEST_GAP | LOW | READY | scripts, apps/landing, apps/web, apps/admin | DEFER |

## Current Infrastructure Gaps

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[BUG-0026-public-login-and-tenant-email-links-resolved-to-localhost-in|BUG-0026]] | Public Login and tenant email links resolved to localhost in production | INFRA | HIGH | FIXED | apps/landing, apps/web, apps/admin, services/api, pkg:config | FIX_NOW |
| [[BUG-0010-unguarded-cookie-options-could-turn-sign-out-into-a-500|BUG-0010]] | Unguarded cookie options could turn admin sign-out into a 500 | INFRA | MEDIUM | FIXED | app:admin | FIX_NOW |
| [[ITEM-0010-deployed-sha-is-not-exposed|ITEM-0010]] | The running system does not expose its deployed SHA | INFRA | MEDIUM | READY | services/api | FIX_NOW |

## Recently Fixed Bugs

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[BUG-0005-cross-tenant-error-log-read-via-support-role|BUG-0005]] | A support-role user could read another tenant's error log | TENANT_ISOLATION | CRITICAL | VERIFIED | api:error-logs | DONE |
| [[BUG-0006-organization-structure-mutable-by-any-authenticated-user|BUG-0006]] | Organization and business-unit structure was mutable by any authenticated user | AUTHORIZATION | CRITICAL | VERIFIED | api:organization | DONE |
| [[BUG-0027-admin-plan-pricing-and-checkout-pricing-come-from-different-|BUG-0027]] | Admin plan pricing and checkout pricing come from different models | DATA_INTEGRITY | CRITICAL | FIXED | services/api/prisma, apps/admin, apps/landing | PLAN_REQUIRED |
| [[BUG-0001-compensation-and-bank-data-behind-employee-record-read|BUG-0001]] | Compensation and bank data returned behind an employee-record read | AUTHORIZATION | HIGH | VERIFIED | api:employees | DONE |
| [[BUG-0002-self-approval-of-attendance-corrections|BUG-0002]] | A manager could file and approve their own attendance correction | AUTHORIZATION | HIGH | VERIFIED | api:attendance | DONE |
| [[BUG-0003-readteam-granted-tenant-wide-visibility|BUG-0003]] | readTeam permissions granted tenant-wide visibility | AUTHORIZATION | HIGH | VERIFIED | api:attendance, api:approvals | DONE |
| [[BUG-0004-search-filter-overwrote-the-access-scope|BUG-0004]] | A search filter silently overwrote the access scope | AUTHORIZATION | HIGH | VERIFIED | api:approvals | DONE |
| [[BUG-0007-unguarded-duplicate-of-a-permission-gated-route|BUG-0007]] | An unguarded duplicate route aliased a permission-gated one | AUTHORIZATION | HIGH | VERIFIED | api:tenant-settings | DONE |
| [[BUG-0008-session-expired-sign-in-again-returned-405|BUG-0008]] | Session-expired "Sign in again" returned 405 and stranded admin operators | BUG | HIGH | VERIFIED | app:admin, app:admin | DONE |
| [[BUG-0011-signed-agreement-editable-defeating-the-lead-conversion-gate|BUG-0011]] | Signed agreements were editable, defeating the lead-conversion gate | STATE_MACHINE | HIGH | VERIFIED | api:contracts | DONE |
| [[BUG-0012-onboarding-created-by-lead-conversion-was-born-uneditable|BUG-0012]] | Every onboarding created by lead conversion was born un-editable | STATE_MACHINE | HIGH | VERIFIED | api:super-admin | DONE |
| [[BUG-0014-no-tenant-that-failed-provisioning-could-be-retried|BUG-0014]] | No tenant that failed provisioning could be retried | STATE_MACHINE | HIGH | VERIFIED | api:tenant-control-plane | DONE |
| [[BUG-0015-a-tenant-that-fails-before-identities-and-billing-is-unrecoverable|BUG-0015]] | A tenant that fails before identities-and-billing is permanently unrecoverable | STATE_MACHINE | HIGH | FIXED | api:tenant-control-plane | FIX_NOW |
| [[BUG-0016-partner-onboarding-review-has-no-state-machine|BUG-0016]] | Partner onboarding review has no state machine | STATE_MACHINE | HIGH | FIXED | api:partner-experience | FIX_NOW |
| [[BUG-0026-public-login-and-tenant-email-links-resolved-to-localhost-in|BUG-0026]] | Public Login and tenant email links resolved to localhost in production | INFRA | HIGH | FIXED | apps/landing, apps/web, apps/admin, services/api, pkg:config | FIX_NOW |
| [[BUG-0009-session-revocation-depended-on-the-refresh-cookie|BUG-0009]] | Server-side session revocation depended on the refresh cookie surviving | SECURITY | MEDIUM | FIXED | app:admin, api:auth | FIX_NOW |
| [[BUG-0010-unguarded-cookie-options-could-turn-sign-out-into-a-500|BUG-0010]] | Unguarded cookie options could turn admin sign-out into a 500 | INFRA | MEDIUM | FIXED | app:admin | FIX_NOW |
| [[BUG-0013-public-lead-endpoint-had-no-rate-limiting|BUG-0013]] | The public lead endpoint had no rate limiting | SECURITY | MEDIUM | VERIFIED | api:leads | DONE |
| [[BUG-0025-a-live-partner-could-be-demoted-through-the-generic-partner-|BUG-0025]] | A live partner could be demoted through the generic partner update | STATE_MACHINE | MEDIUM | FIXED | api:partners | FIX_NOW |
| [[BUG-0028-country-to-currency-mapping-is-hardcoded-in-the-landing-fron|BUG-0028]] | Country to currency mapping is hardcoded in the landing frontend | INTEGRATION | MEDIUM | FIXED | apps/landing | PLAN_REQUIRED |
| [[BUG-0029-public-features-page-advertised-capabilities-the-product-doe|BUG-0029]] | Public features page advertised capabilities the product does not gate and omitted ones it does | DOCUMENTATION | MEDIUM | FIXED | apps/landing | FIX_NOW |
| [[BUG-0036-integration-patterns-context-denies-four-subsystems-that-exi|BUG-0036]] | Integration patterns context denies four subsystems that exist | DOCUMENTATION | MEDIUM | FIXED | .agent/context | FIX_NOW |
| [[BUG-0023-testing-architecture-context-claims-two-e2e-specs-do-not-exist|BUG-0023]] | The testing-architecture context claims two e2e specs do not exist | DOCUMENTATION | LOW | FIXED | .agent/context | FIX_NOW |

## Recent QA Runs

- [[2026-08-16-public-commercial-wave2-7686bb0|QA Run — Wave 2: Public Plans + Features Experience]]
- [[2026-08-16-production-url-integrity-344a832|QA Run — Production URL integrity (BUG-0026)]]
- [[2026-08-16-monorepo-app-documentation-78072d2|QA Run — Monorepo application documentation audit (TASK-0002)]]
- [[2026-08-16-commercial-config-wave1-a525896|QA Run — Wave 1: Commercial Configuration Foundation]]
- [[2026-08-15-commercial-onboarding-e2e-7bbab3d|QA Run — Commercial onboarding lifecycle E2E (website lead and partner journeys)]]
- [[2026-08-15-browser-e2e-and-provisioning-recovery-572a3b8|QA Run — First browser E2E, and provisioning recovery against a real database]]
- [[2026-08-14-tenant-control-plane-ba1e818|QA Run — tenant-control-plane]]
- [[2026-08-14-admin-session-expired-logout-cbc2db8|QA Run — admin-session-expired-logout]]

## Recent Implementations

- [[2026-08-16-monorepo-app-documentation|2026-08-16 — Documenting `apps/docs`, `apps/landing` and `apps/agent-desktop`]]
- [[2026-08-15-database-ci-and-gh-access|Database CI, GitHub access, and the first four framework merges]]
- [[2026-08-14-tenant-control-plane|Tenant Control Plane]]

## Recent Engineering History

- [[2026-08-16-public-commercial-wave2-301a397|Engineering History — Wave 2: Public Plans + Features Experience]]
- [[2026-08-16-production-url-integrity-344a832|Engineering History — Production url integrity]]
- [[2026-08-16-monorepo-app-documentation-78072d2|Engineering History — Monorepo app documentation]]
- [[2026-08-16-framework-orchestration-f38a6bf|Engineering History — Framework orchestration]]
- [[2026-08-16-commercial-config-wave1-7b5aeaa|Engineering History — Wave 1: Commercial Configuration Foundation]]
- [[2026-08-15-knowledge-backlog-framework-986ab10|Engineering History — Operational knowledge-management layer]]
- [[2026-08-15-autonomous-framework-triage-b2ba383|Engineering History — Autonomous framework triage, provisioning recovery and browser E2E]]

## Recent Releases

_None. Nothing has been deployed through the release process._

## Active / Recent Backlog

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[ITEM-0018-plans-and-prices-have-no-draft-publish-or-archive-lifecycle|ITEM-0018]] | Plans and prices have no draft, publish or archive lifecycle | ARCHITECTURE | MEDIUM | VALIDATING | services/api/prisma, api:super-admin, apps/admin, apps/landing | FIX_NOW |
| [[BUG-0009-session-revocation-depended-on-the-refresh-cookie|BUG-0009]] | Server-side session revocation depended on the refresh cookie surviving | SECURITY | MEDIUM | FIXED | app:admin, api:auth | FIX_NOW |
| [[BUG-0010-unguarded-cookie-options-could-turn-sign-out-into-a-500|BUG-0010]] | Unguarded cookie options could turn admin sign-out into a 500 | INFRA | MEDIUM | FIXED | app:admin | FIX_NOW |
| [[BUG-0017-tenant-base-domain-setting-does-not-drive-hostname-issuance|BUG-0017]] | The admin-editable tenant base domain does not drive hostname issuance | INTEGRATION | MEDIUM | OPEN | pkg:config, api:tenant-control-plane | PLAN_REQUIRED |
| [[BUG-0020-window-prompt-used-for-governed-reasons|BUG-0020]] | window.prompt collects governed reasons instead of the design system dialog | UX | MEDIUM | OPEN | apps/admin, apps/web | PLAN_REQUIRED |
| [[BUG-0021-landing-contact-form-fabricates-lead-data|BUG-0021]] | The landing contact form fabricates lead data and has no honeypot | DATA_INTEGRITY | MEDIUM | OPEN | apps/landing, api:leads | FIX_NOW |
| [[BUG-0022-provision-tenant-has-no-confirmation-step|BUG-0022]] | "Provision tenant" has no confirmation step and no idempotency key | UX | MEDIUM | OPEN | apps/admin, api:tenant-control-plane | FIX_NOW |
| [[BUG-0025-a-live-partner-could-be-demoted-through-the-generic-partner-|BUG-0025]] | A live partner could be demoted through the generic partner update | STATE_MACHINE | MEDIUM | FIXED | api:partners | FIX_NOW |
| [[BUG-0028-country-to-currency-mapping-is-hardcoded-in-the-landing-fron|BUG-0028]] | Country to currency mapping is hardcoded in the landing frontend | INTEGRATION | MEDIUM | FIXED | apps/landing | PLAN_REQUIRED |
| [[BUG-0029-public-features-page-advertised-capabilities-the-product-doe|BUG-0029]] | Public features page advertised capabilities the product does not gate and omitted ones it does | DOCUMENTATION | MEDIUM | FIXED | apps/landing | FIX_NOW |
| [[BUG-0036-integration-patterns-context-denies-four-subsystems-that-exi|BUG-0036]] | Integration patterns context denies four subsystems that exist | DOCUMENTATION | MEDIUM | FIXED | .agent/context | FIX_NOW |
| [[ITEM-0002-no-live-api-session-test-harness|ITEM-0002]] | No harness exists for testing against a running API with real sessions | TEST_GAP | MEDIUM | READY | services/api, apps/admin | FIX_NOW |
| [[ITEM-0003-tenant-erasure-never-exercised-against-a-database|ITEM-0003]] | Tenant erasure has no cross-tenant survival assertion | TEST_GAP | MEDIUM | READY | api:tenant-control-plane | FIX_NOW |
| [[ITEM-0005-customeraccount-leadid-has-no-unique-constraint|ITEM-0005]] | CustomerAccount.leadId has no unique constraint, so double conversion is unprevented | TECH_DEBT | MEDIUM | READY | services/api/prisma, api:super-admin | PLAN_REQUIRED |
| [[ITEM-0006-adr-one-source-of-truth-for-the-tenant-base-domain|ITEM-0006]] | ADR needed — one source of truth for the tenant base domain | ARCHITECTURE | MEDIUM | READY | pkg:config, services/api, apps/web, apps/admin, apps/landing | PLAN_REQUIRED |
| [[ITEM-0010-deployed-sha-is-not-exposed|ITEM-0010]] | The running system does not expose its deployed SHA | INFRA | MEDIUM | READY | services/api | FIX_NOW |
| [[ITEM-0012-cross-check-route-methods-against-their-callers|ITEM-0012]] | Cross-check app/api route methods against the hrefs that target them | TEST_GAP | MEDIUM | READY | apps/web, apps/admin | FIX_NOW |
| [[ITEM-0013-assert-every-public-controller-is-rate-limited|ITEM-0013]] | Assert mechanically that every @Public() controller carries the rate-limit guard | TEST_GAP | MEDIUM | READY | services/api | FIX_NOW |
| [[ITEM-0019-no-market-or-region-model-maps-countries-to-plans-currencies|ITEM-0019]] | No market or region model maps countries to plans, currencies and legal sets | ARCHITECTURE | MEDIUM | VALIDATING | services/api/prisma, api:super-admin, apps/admin, apps/landing | FIX_NOW |
| [[ITEM-0020-contract-phase-drop-legacy-plan-pricing-columns|ITEM-0020]] | Contract phase: drop legacy Plan pricing columns | TECH_DEBT | MEDIUM | READY | services/api/prisma, api:super-admin, apps/admin | PLAN_REQUIRED |
| [[ITEM-0022-governed-publish-and-archive-actions-for-commercial-configur|ITEM-0022]] | Governed publish and archive actions for commercial configuration | FOLLOW_UP | MEDIUM | READY | api:super-admin, apps/admin | PLAN_REQUIRED |
| [[ITEM-0025-desktop-agent-windows-installer-is-unsigned|ITEM-0025]] | Desktop agent Windows installer is unsigned | SECURITY | MEDIUM | READY | apps/agent-desktop | PLAN_REQUIRED |
| [[ITEM-0026-desktop-agent-has-no-retry-backoff-and-no-bounded-give-up|ITEM-0026]] | Desktop agent has no retry backoff and no bounded give up | TECH_DEBT | MEDIUM | READY | apps/agent-desktop, api:agent | PLAN_REQUIRED |
| [[ITEM-0027-apps-agent-desktop-has-no-agents-md-and-no-test-coverage|ITEM-0027]] | apps/agent-desktop has no AGENTS.md and no test coverage | TEST_GAP | MEDIUM | READY | apps/agent-desktop, api:agent | FIX_NOW |
| [[ITEM-0021-mechanical-guard-against-country-and-currency-literals-in-fr|ITEM-0021]] | Mechanical guard against country and currency literals in frontends | TEST_GAP | LOW | READY | scripts, apps/landing, apps/web, apps/admin | DEFER |
| [[ITEM-0023-tenant-dataregion-populated-from-market-at-provisioning|ITEM-0023]] | Tenant.dataRegion populated from market at provisioning | FOLLOW_UP | LOW | READY | services/api/prisma, api:tenant-control-plane | DEFER |
| [[ITEM-0024-landing-depends-on-lucide-react-without-declaring-it|ITEM-0024]] | Landing depends on lucide-react without declaring it | TECH_DEBT | LOW | READY | apps/landing | DEFER |
| [[BUG-0023-testing-architecture-context-claims-two-e2e-specs-do-not-exist|BUG-0023]] | The testing-architecture context claims two e2e specs do not exist | DOCUMENTATION | LOW | FIXED | .agent/context | FIX_NOW |
| [[BUG-0024-start-onboarding-api-and-proxy-have-no-caller|BUG-0024]] | The start-onboarding API endpoint and its proxy have no caller | BUG | LOW | OPEN | apps/admin, api:super-admin | FIX_NOW |
| [[ITEM-0011-framework-validation-should-catch-absence-claims|ITEM-0011]] | Framework validation should catch false absence claims in context documents | TECH_DEBT | LOW | READY | .agent/context, scripts | FIX_NOW |
| [[ITEM-0015-make-the-tenant-readiness-assertion-auditable|ITEM-0015]] | Make the tenant readiness() authorization assertion auditable | FOLLOW_UP | LOW | READY | api:tenant-control-plane | FIX_NOW |
| [[ITEM-0017-buildworkspaceurl-still-carries-an-internal-loopback-fallbac|ITEM-0017]] | buildWorkspaceUrl still carries an internal loopback fallback | TECH_DEBT | LOW | READY | pkg:config | DEFER |

## Key Architecture Decisions

- [[ADR-0001-ai-agent-workflow|ADR-0001 — AI-assisted engineering workflow for DijiPeople]]
- [[decision-a-bug-record-is-its-own-backlog-item|Decision — A bug record **is** its own backlog item]]
- [[decision-ci-verdict-gates-shared-merges|Decision — A shared-target merge requires a read CI verdict on the exact SHA]]
- [[decision-platform-admin-is-a-separate-identity|Decision — Platform admin is a separate identity, not an elevated tenant user]]
- [[decision-tenantid-is-the-isolation-identity|Decision — `tenantId` is the isolation identity, enforced by convention]]

## Knowledge Health

| Knowledge | Count |
|---|---|
| Bug records | 36 |
| Backlog items | 27 |
| Known bug patterns | 18 |
| QA runs | 8 |
| Engineering history records | 7 |
| Release records | 0 |
| Module notes | 19 |
| Architecture notes | 17 |
| Decision notes (ADR + generated) | 5 |
| Implementation records | 3 |

**Awaiting Architect triage: 0.** A record nobody has
triaged is work nobody has decided about — the number that should stay near
zero between tasks.

**No release records exist.** Nothing has been deployed through the release process yet; this is a true statement about the repository, not a gap in the dashboard.

## How this is maintained

Regenerate with:

```bash
node scripts/rebuild-backlog.mjs
node scripts/generate-dashboards.mjs
node scripts/sync-obsidian.mjs
```

Every count above is derived from the records at generation time. Nothing
here is maintained by hand, and editing this note in the vault only means
losing the edit on the next sync — change the record instead.
