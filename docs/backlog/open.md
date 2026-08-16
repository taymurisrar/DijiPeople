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

_None._

## HIGH

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [BUG-0034](../../docs/bugs/BUG-0034-desktop-agent-auto-update-points-at-an-endpoint-that-does-no.md) | Desktop agent auto update points at an endpoint that does not exist | INTEGRATION | HIGH | P1 | OPEN | apps/agent-desktop, api:agent, api:app-releases | PLAN_REQUIRED |
| [BUG-0038](../../docs/bugs/BUG-0038-employee-payslip-and-bank-account-proxies-return-the-callers.md) | Employee payslip and bank account proxies return the callers own data on 403 | DATA_INTEGRITY | HIGH | P1 | OPEN | apps/web, api:payroll, api:employees | FIX_NOW |
| [ITEM-0004](../../docs/backlog/items/ITEM-0004-tenant-activation-never-proven-end-to-end.md) | Tenant activation to ACTIVE has never been reached in any test | TEST_GAP | HIGH | P1 | READY | api:tenant-control-plane | FIX_NOW |
| [ITEM-0033](../../docs/backlog/items/ITEM-0033-apps-web-has-zero-browser-e2e-coverage.md) | apps/web has zero browser E2E coverage | TEST_GAP | HIGH | P1 | READY | apps/web, e2e | PLAN_REQUIRED |

## MEDIUM

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [ITEM-0018](../../docs/backlog/items/ITEM-0018-plans-and-prices-have-no-draft-publish-or-archive-lifecycle.md) | Plans and prices have no draft, publish or archive lifecycle | ARCHITECTURE | MEDIUM | P1 | VALIDATING | services/api/prisma, api:super-admin, apps/admin, apps/landing | FIX_NOW |
| [BUG-0039](../../docs/bugs/BUG-0039-apps-web-sets-no-security-response-headers.md) | apps/web sets no security response headers | SECURITY | MEDIUM | P2 | OPEN | apps/web | FIX_NOW |
| [BUG-0040](../../docs/bugs/BUG-0040-web-route-proxies-make-authorization-and-business-decisions.md) | Web route proxies make authorization and business decisions | SECURITY | MEDIUM | P2 | OPEN | apps/web | PLAN_REQUIRED |
| [BUG-0041](../../docs/bugs/BUG-0041-apps-web-reads-21-environment-variables-unregistered-in-turb.md) | apps/web reads 21 environment variables unregistered in turbo globalEnv | INFRA | MEDIUM | P2 | OPEN | apps/web, pkg:config | FIX_NOW |
| [BUG-0042](../../docs/bugs/BUG-0042-web-dialogs-have-no-focus-trap-and-filter-controls-are-unlab.md) | Web dialogs have no focus trap and filter controls are unlabelled | UX | MEDIUM | P2 | OPEN | apps/web | PLAN_REQUIRED |
| [BUG-0043](../../docs/bugs/BUG-0043-the-documented-new-module-workflow-for-apps-web-cannot-be-fo.md) | The documented new module workflow for apps/web cannot be followed | DOCUMENTATION | MEDIUM | P2 | FIXED | apps/web | FIX_NOW |
| [BUG-0044](../../docs/bugs/BUG-0044-the-canonical-settings-and-branding-contract-is-materially-s.md) | The canonical settings and branding contract is materially stale | DOCUMENTATION | MEDIUM | P2 | OPEN | apps/web, docs/architecture | PLAN_REQUIRED |
| [BUG-0045](../../docs/bugs/BUG-0045-tenant-theme-mode-and-runtime-settings-saves-do-not-take-eff.md) | Tenant theme mode and runtime settings saves do not take effect | UX | MEDIUM | P2 | OPEN | apps/web | FIX_NOW |
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
| [ITEM-0031](../../docs/backlog/items/ITEM-0031-replace-remaining-native-prompts-for-governed-input.md) | Replace remaining native prompts for governed input | UX | MEDIUM | P2 | READY | apps/admin, apps/web | DEFER |
| [ITEM-0032](../../docs/backlog/items/ITEM-0032-recompute-productivity-totals-inflated-by-heartbeat-replays.md) | Recompute productivity totals inflated by heartbeat replays | DATA_MIGRATION | MEDIUM | P2 | READY | api:agent | PRODUCT_DECISION |
| [ITEM-0034](../../docs/backlog/items/ITEM-0034-web-route-handlers-flatten-upstream-error-status-to-500.md) | Web route handlers flatten upstream error status to 500 | TECH_DEBT | MEDIUM | P2 | READY | apps/web | FIX_NOW |
| [ITEM-0035](../../docs/backlog/items/ITEM-0035-decide-the-fate-of-the-inert-runtime-registries-in-apps-web.md) | Decide the fate of the inert runtime registries in apps/web | ARCHITECTURE | MEDIUM | P2 | READY | apps/web | PLAN_REQUIRED |
| [ITEM-0036](../../docs/backlog/items/ITEM-0036-apps-web-depends-on-lucide-react-without-declaring-it.md) | apps/web depends on lucide-react without declaring it | TECH_DEBT | MEDIUM | P2 | READY | apps/web | FIX_NOW |

## LOW and unrated

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [ITEM-0021](../../docs/backlog/items/ITEM-0021-mechanical-guard-against-country-and-currency-literals-in-fr.md) | Mechanical guard against country and currency literals in frontends | TEST_GAP | LOW | P2 | READY | scripts, apps/landing, apps/web, apps/admin | DEFER |
| [ITEM-0023](../../docs/backlog/items/ITEM-0023-tenant-dataregion-populated-from-market-at-provisioning.md) | Tenant.dataRegion populated from market at provisioning | FOLLOW_UP | LOW | P2 | READY | services/api/prisma, api:tenant-control-plane | DEFER |
| [ITEM-0024](../../docs/backlog/items/ITEM-0024-landing-depends-on-lucide-react-without-declaring-it.md) | Landing depends on lucide-react without declaring it | TECH_DEBT | LOW | P2 | READY | apps/landing | DEFER |
| [ITEM-0011](../../docs/backlog/items/ITEM-0011-framework-validation-should-catch-absence-claims.md) | Framework validation should catch false absence claims in context documents | TECH_DEBT | LOW | P3 | READY | .agent/context, scripts | FIX_NOW |
| [ITEM-0015](../../docs/backlog/items/ITEM-0015-make-the-tenant-readiness-assertion-auditable.md) | Make the tenant readiness() authorization assertion auditable | FOLLOW_UP | LOW | P3 | READY | api:tenant-control-plane | FIX_NOW |
| [ITEM-0017](../../docs/backlog/items/ITEM-0017-buildworkspaceurl-still-carries-an-internal-loopback-fallbac.md) | buildWorkspaceUrl still carries an internal loopback fallback | TECH_DEBT | LOW | P3 | READY | pkg:config | DEFER |
| [ITEM-0029](../../docs/backlog/items/ITEM-0029-validation-should-require-an-aliases-line-on-every-record.md) | Validation should require an aliases line on every record | TECH_DEBT | LOW | P3 | READY | scripts, docs/backlog, docs/bugs | FIX_NOW |
