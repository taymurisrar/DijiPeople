# Backlog Index

> **Generated file — do not edit by hand.** Rebuild with `node scripts/rebuild-backlog.mjs`.

Every durable Bug and Backlog record in the repository, whatever its state.

**109 records** — 59 bugs under [`docs/bugs/`](../bugs/), 50 non-bug items under [`items/`](items/).

A bug record **is** its own backlog entry. There is no parallel item for it —
see [`README.md`](README.md) for why.

## At a glance

| | Count |
|---|---|
| Open (active work) | 30 |
| Blocked | 0 |
| Deferred | 1 |
| Awaiting a product decision | 1 |
| Completed / closed | 77 |
| **Open CRITICAL** | **0** |
| **Open HIGH** | **6** |
| **Awaiting Architect triage** | **0** |

## Open by severity

| Severity | Count |
|---|---|
| HIGH | 6 |
| MEDIUM | 19 |
| LOW | 5 |

## Open by type

| Type | Count |
|---|---|
| ARCHITECTURE | 1 |
| DOCUMENTATION | 2 |
| FOLLOW_UP | 3 |
| INFRA | 2 |
| INTEGRATION | 1 |
| SECURITY | 6 |
| TECH_DEBT | 6 |
| TEST_GAP | 6 |
| UX | 3 |

## All records by status

| Status | Count |
|---|---|
| OPEN | 5 |
| DEFERRED | 1 |
| PRODUCT_DECISION | 1 |
| VERIFIED | 53 |
| READY | 25 |
| DONE | 24 |

## All records

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [BUG-0005](../../docs/bugs/BUG-0005-cross-tenant-error-log-read-via-support-role.md) | A support-role user could read another tenant's error log | TENANT_ISOLATION | CRITICAL | P0 | VERIFIED | api:error-logs | DONE |
| [BUG-0006](../../docs/bugs/BUG-0006-organization-structure-mutable-by-any-authenticated-user.md) | Organization and business-unit structure was mutable by any authenticated user | AUTHORIZATION | CRITICAL | P0 | VERIFIED | api:organization | DONE |
| [BUG-0027](../../docs/bugs/BUG-0027-admin-plan-pricing-and-checkout-pricing-come-from-different-.md) | Admin plan pricing and checkout pricing come from different models | DATA_INTEGRITY | CRITICAL | P0 | VERIFIED | services/api/prisma, apps/admin, apps/landing | DONE |
| [BUG-0030](../../docs/bugs/BUG-0030-plan-list-get-mutates-commercial-pricing-and-can-fail-on-pla.md) | Plan list GET mutates commercial pricing and can fail on PlanPrice unique constraint | DATA_INTEGRITY | CRITICAL | P0 | VERIFIED | services/api, services/api/prisma | DONE |
| [BUG-0047](../../docs/bugs/BUG-0047-seven-bug-records-are-verified-while-their-fixes-exist-only.md) | Seven bug records are VERIFIED while their fixes exist only on unmerged branches | SECURITY | CRITICAL | P0 | VERIFIED | api:organization, api:error-logs, api:employees, api:attendance, docs/qa/regressions | DONE |
| [BUG-0049](../../docs/bugs/BUG-0049-report-only-ci-jobs-swallow-security-and-database-e2e-failur.md) | Report-only CI jobs swallow security and database E2E failures | INFRA | HIGH | P0 | VERIFIED | .github/workflows, services/api/src/common/constants, services/api/test, docs/qa | DONE |
| [BUG-0052](../../docs/bugs/BUG-0052-production-dependency-graph-carries-critical-and-high-securi.md) | Production dependency graph carries critical and high security advisories | SECURITY | HIGH | P0 | OPEN | package-lock.json, apps/agent-desktop, apps/web, apps/admin, apps/landing, services/api | FIX_NOW |
| [BUG-0053](../../docs/bugs/BUG-0053-documents-self-scoped-users-can-read-tenant-wide-documents.md) | Self-scoped document readers can list and open tenant-wide documents | AUTHORIZATION | HIGH | P0 | VERIFIED | api:documents | DONE |
| [BUG-0055](../../docs/bugs/BUG-0055-partner-routes-use-tenant-role-aliases-instead-of-platform-permissions.md) | Partner administration routes use tenant role aliases instead of platform permissions | AUTHORIZATION | HIGH | P0 | VERIFIED | api:partners | DONE |
| [BUG-0056](../../docs/bugs/BUG-0056-billing-routes-authorize-by-role-instead-of-billing-capability.md) | Billing routes authorize by role instead of billing capability | AUTHORIZATION | HIGH | P0 | VERIFIED | api:billing | DONE |
| [BUG-0057](../../docs/bugs/BUG-0057-settings-context-allows-arbitrary-organization-preview.md) | Self-service settings context allows arbitrary organization preview | AUTHORIZATION | HIGH | P0 | VERIFIED | api:tenant-settings | DONE |
| [BUG-0058](../../docs/bugs/BUG-0058-organization-structure-reads-ignore-caller-scope.md) | Organization structure reads ignore caller scope | AUTHORIZATION | HIGH | P0 | VERIFIED | api:organization | DONE |
| [BUG-0001](../../docs/bugs/BUG-0001-compensation-and-bank-data-behind-employee-record-read.md) | Compensation and bank data returned behind an employee-record read | AUTHORIZATION | HIGH | P1 | VERIFIED | api:employees | DONE |
| [BUG-0002](../../docs/bugs/BUG-0002-self-approval-of-attendance-corrections.md) | A manager could file and approve their own attendance correction | AUTHORIZATION | HIGH | P1 | VERIFIED | api:attendance | DONE |
| [BUG-0003](../../docs/bugs/BUG-0003-readteam-granted-tenant-wide-visibility.md) | readTeam permissions granted tenant-wide visibility | AUTHORIZATION | HIGH | P1 | VERIFIED | api:attendance, api:approvals | DONE |
| [BUG-0004](../../docs/bugs/BUG-0004-search-filter-overwrote-the-access-scope.md) | A search filter silently overwrote the access scope | AUTHORIZATION | HIGH | P1 | VERIFIED | api:approvals | DONE |
| [BUG-0007](../../docs/bugs/BUG-0007-unguarded-duplicate-of-a-permission-gated-route.md) | An unguarded duplicate route aliased a permission-gated one | AUTHORIZATION | HIGH | P1 | VERIFIED | api:tenant-settings | DONE |
| [BUG-0008](../../docs/bugs/BUG-0008-session-expired-sign-in-again-returned-405.md) | Session-expired "Sign in again" returned 405 and stranded admin operators | BUG | HIGH | P1 | VERIFIED | app:admin, app:admin | DONE |
| [BUG-0011](../../docs/bugs/BUG-0011-signed-agreement-editable-defeating-the-lead-conversion-gate.md) | Signed agreements were editable, defeating the lead-conversion gate | STATE_MACHINE | HIGH | P1 | VERIFIED | api:contracts | DONE |
| [BUG-0012](../../docs/bugs/BUG-0012-onboarding-created-by-lead-conversion-was-born-uneditable.md) | Every onboarding created by lead conversion was born un-editable | STATE_MACHINE | HIGH | P1 | VERIFIED | api:super-admin | DONE |
| [BUG-0014](../../docs/bugs/BUG-0014-no-tenant-that-failed-provisioning-could-be-retried.md) | No tenant that failed provisioning could be retried | STATE_MACHINE | HIGH | P1 | VERIFIED | api:tenant-control-plane | DONE |
| [BUG-0015](../../docs/bugs/BUG-0015-a-tenant-that-fails-before-identities-and-billing-is-unrecoverable.md) | A tenant that fails before identities-and-billing is permanently unrecoverable | STATE_MACHINE | HIGH | P1 | VERIFIED | api:tenant-control-plane | DONE |
| [BUG-0016](../../docs/bugs/BUG-0016-partner-onboarding-review-has-no-state-machine.md) | Partner onboarding review has no state machine | STATE_MACHINE | HIGH | P1 | VERIFIED | api:partner-experience | DONE |
| [BUG-0019](../../docs/bugs/BUG-0019-partner-inquiry-and-onboarding-review-screens-are-unreachable.md) | Partner inquiry and onboarding review screens have no inbound link | UX | HIGH | P1 | VERIFIED | apps/admin | DONE |
| [BUG-0026](../../docs/bugs/BUG-0026-public-login-and-tenant-email-links-resolved-to-localhost-in.md) | Public Login and tenant email links resolved to localhost in production | INFRA | HIGH | P1 | VERIFIED | apps/landing, apps/web, apps/admin, services/api, pkg:config | DONE |
| [BUG-0031](../../docs/bugs/BUG-0031-public-subscribe-endpoint-has-no-rate-limiting.md) | Public subscribe endpoint has no rate limiting | SECURITY | HIGH | P1 | VERIFIED | api:billing, apps/landing | DONE |
| [BUG-0032](../../docs/bugs/BUG-0032-landing-proxies-collapse-every-visitor-into-one-rate-limit-b.md) | Landing proxies collapse every visitor into one rate limit bucket | SECURITY | HIGH | P1 | VERIFIED | apps/landing, services/api/src/common | DONE |
| [BUG-0033](../../docs/bugs/BUG-0033-desktop-agent-login-is-unthrottled-and-enumerates-users-acro.md) | Desktop agent login is unthrottled and enumerates users across every tenant | SECURITY | HIGH | P1 | VERIFIED | api:agent, apps/agent-desktop | DONE |
| [BUG-0034](../../docs/bugs/BUG-0034-desktop-agent-auto-update-points-at-an-endpoint-that-does-no.md) | Desktop agent auto update points at an endpoint that does not exist | INTEGRATION | HIGH | P1 | OPEN | apps/agent-desktop, api:agent, api:app-releases | PLAN_REQUIRED |
| [BUG-0035](../../docs/bugs/BUG-0035-desktop-agent-logout-never-revokes-the-refresh-token.md) | Desktop agent logout never revokes the refresh token | SECURITY | HIGH | P1 | VERIFIED | apps/agent-desktop, api:agent | DONE |
| [BUG-0036](../../docs/bugs/BUG-0036-agent-heartbeat-has-no-idempotency-so-retries-double-count-p.md) | Agent heartbeat has no idempotency so retries double count productivity | DATA_INTEGRITY | HIGH | P1 | VERIFIED | api:agent, services/api/prisma, apps/agent-desktop | DONE |
| [BUG-0039](../../docs/bugs/BUG-0039-employee-payslip-and-bank-account-proxies-return-the-callers.md) | Employee payslip and bank account proxies return the callers own data on 403 | DATA_INTEGRITY | HIGH | P1 | VERIFIED | apps/web, api:payroll, api:employees | DONE |
| [BUG-0048](../../docs/bugs/BUG-0048-partner-inquiry-form-rejects-every-submission-that-leaves-th.md) | Partner inquiry form rejects every submission that leaves the optional website blank | BUG | HIGH | P1 | VERIFIED | apps/landing, api:partner-experience | DONE |
| [BUG-0060](../../docs/bugs/BUG-0060-stale-generated-prisma-client-breaks-local-api-development.md) | A stale generated Prisma client breaks local API development with 60 misleading errors | INFRA | HIGH | P1 | VERIFIED | services/api, scripts, package.json | DONE |
| [ITEM-0001](../../docs/backlog/items/ITEM-0001-no-browser-e2e-tooling-exists.md) | No browser E2E tooling exists in any workspace | TEST_GAP | HIGH | P1 | DONE | apps/web, apps/admin, apps/landing | DONE |
| [ITEM-0004](../../docs/backlog/items/ITEM-0004-tenant-activation-never-proven-end-to-end.md) | Tenant activation to ACTIVE has never been reached in any test | TEST_GAP | HIGH | P1 | READY | api:tenant-control-plane | FIX_NOW |
| [ITEM-0034](../../docs/backlog/items/ITEM-0034-apps-web-has-zero-browser-e2e-coverage.md) | apps/web has zero browser E2E coverage | TEST_GAP | HIGH | P1 | READY | apps/web, e2e | PLAN_REQUIRED |
| [ITEM-0047](../../docs/backlog/items/ITEM-0047-database-e2e-suites-fail-against-an-ephemeral-postgresql.md) | Database e2e suites fail against an ephemeral PostgreSQL | TEST_GAP | HIGH | P1 | READY | services/api/test, .github/workflows | PLAN_REQUIRED |
| [ITEM-0048](../../docs/backlog/items/ITEM-0048-replace-or-contain-active-win-and-the-xlsx-export-path.md) | Replace or contain active-win and the xlsx export path | SECURITY | HIGH | P2 | READY | apps/agent-desktop, services/api/src/common/excel, package-lock.json | PLAN_REQUIRED |
| [BUG-0051](../../docs/bugs/BUG-0051-backlog-and-qa-validators-accept-contradictory-record-state.md) | Backlog and QA validators accept contradictory record state | INFRA | MEDIUM | P1 | VERIFIED | scripts/lib/backlog-records.mjs, scripts/lib/qa-records.mjs, docs/bugs, docs/backlog, docs/qa | DONE |
| [ITEM-0018](../../docs/backlog/items/ITEM-0018-plans-and-prices-have-no-draft-publish-or-archive-lifecycle.md) | Plans and prices have no draft, publish or archive lifecycle | ARCHITECTURE | MEDIUM | P1 | DONE | services/api/prisma, api:super-admin, apps/admin, apps/landing | DONE |
| [ITEM-0044](../../docs/backlog/items/ITEM-0044-validate-forwarded-host-before-tenant-web-workspace-resoluti.md) | Validate forwarded host before tenant web workspace resolution | SECURITY | MEDIUM | P1 | READY | apps/web | PLAN_REQUIRED |
| [BUG-0009](../../docs/bugs/BUG-0009-session-revocation-depended-on-the-refresh-cookie.md) | Server-side session revocation depended on the refresh cookie surviving | SECURITY | MEDIUM | P2 | VERIFIED | app:admin, api:auth | DONE |
| [BUG-0010](../../docs/bugs/BUG-0010-unguarded-cookie-options-could-turn-sign-out-into-a-500.md) | Unguarded cookie options could turn admin sign-out into a 500 | INFRA | MEDIUM | P2 | VERIFIED | app:admin | DONE |
| [BUG-0013](../../docs/bugs/BUG-0013-public-lead-endpoint-had-no-rate-limiting.md) | The public lead endpoint had no rate limiting | SECURITY | MEDIUM | P2 | VERIFIED | api:leads | DONE |
| [BUG-0017](../../docs/bugs/BUG-0017-tenant-base-domain-setting-does-not-drive-hostname-issuance.md) | The admin-editable tenant base domain does not drive hostname issuance | INTEGRATION | MEDIUM | P2 | VERIFIED | pkg:config, api:tenant-control-plane | DONE |
| [BUG-0020](../../docs/bugs/BUG-0020-window-prompt-used-for-governed-reasons.md) | window.prompt collects governed reasons instead of the design system dialog | UX | MEDIUM | P2 | VERIFIED | apps/admin, apps/web | DONE |
| [BUG-0021](../../docs/bugs/BUG-0021-landing-contact-form-fabricates-lead-data.md) | The landing contact form fabricates lead data and has no honeypot | DATA_INTEGRITY | MEDIUM | P2 | VERIFIED | apps/landing, api:leads | DONE |
| [BUG-0022](../../docs/bugs/BUG-0022-provision-tenant-has-no-confirmation-step.md) | "Provision tenant" has no confirmation step and no idempotency key | UX | MEDIUM | P2 | VERIFIED | apps/admin, api:tenant-control-plane | DONE |
| [BUG-0025](../../docs/bugs/BUG-0025-a-live-partner-could-be-demoted-through-the-generic-partner-.md) | A live partner could be demoted through the generic partner update | STATE_MACHINE | MEDIUM | P2 | VERIFIED | api:partners | DONE |
| [BUG-0028](../../docs/bugs/BUG-0028-country-to-currency-mapping-is-hardcoded-in-the-landing-fron.md) | Country to currency mapping is hardcoded in the landing frontend | INTEGRATION | MEDIUM | P2 | VERIFIED | apps/landing | DONE |
| [BUG-0029](../../docs/bugs/BUG-0029-public-features-page-advertised-capabilities-the-product-doe.md) | Public features page advertised capabilities the product does not gate and omitted ones it does | DOCUMENTATION | MEDIUM | P2 | VERIFIED | apps/landing | DONE |
| [BUG-0037](../../docs/bugs/BUG-0037-integration-patterns-context-denies-four-subsystems-that-exi.md) | Integration patterns context denies four subsystems that exist | DOCUMENTATION | MEDIUM | P2 | VERIFIED | .agent/context | DONE |
| [BUG-0038](../../docs/bugs/BUG-0038-tenant-commercial-panel-plan-dropdown-405s-and-never-loads.md) | Tenant commercial panel plan dropdown 405s and never loads | UX | MEDIUM | P2 | VERIFIED | apps/admin | DONE |
| [BUG-0040](../../docs/bugs/BUG-0040-apps-web-sets-no-security-response-headers.md) | apps/web sets no security response headers | SECURITY | MEDIUM | P2 | VERIFIED | apps/web | DONE |
| [BUG-0041](../../docs/bugs/BUG-0041-web-route-proxies-make-authorization-and-business-decisions.md) | Web route proxies make authorization and business decisions | SECURITY | MEDIUM | P2 | OPEN | apps/web | PLAN_REQUIRED |
| [BUG-0042](../../docs/bugs/BUG-0042-apps-web-reads-21-environment-variables-unregistered-in-turb.md) | apps/web reads 21 environment variables unregistered in turbo globalEnv | INFRA | MEDIUM | P2 | VERIFIED | apps/web, pkg:config | DONE |
| [BUG-0043](../../docs/bugs/BUG-0043-web-dialogs-have-no-focus-trap-and-filter-controls-are-unlab.md) | Web dialogs have no focus trap and filter controls are unlabelled | UX | MEDIUM | P2 | OPEN | apps/web | PLAN_REQUIRED |
| [BUG-0044](../../docs/bugs/BUG-0044-the-documented-new-module-workflow-for-apps-web-cannot-be-fo.md) | The documented new module workflow for apps/web cannot be followed | DOCUMENTATION | MEDIUM | P2 | VERIFIED | apps/web | DONE |
| [BUG-0045](../../docs/bugs/BUG-0045-the-canonical-settings-and-branding-contract-is-materially-s.md) | The canonical settings and branding contract is materially stale | DOCUMENTATION | MEDIUM | P2 | OPEN | apps/web, docs/architecture | PLAN_REQUIRED |
| [BUG-0046](../../docs/bugs/BUG-0046-tenant-theme-mode-and-runtime-settings-saves-do-not-take-eff.md) | Tenant theme mode and runtime settings saves do not take effect | UX | MEDIUM | P2 | VERIFIED | apps/web | DONE |
| [BUG-0050](../../docs/bugs/BUG-0050-notification-settings-offer-email-providers-whose-backend-al.md) | Notification settings offer email providers whose backend always fails | INTEGRATION | MEDIUM | P2 | VERIFIED | apps/web, api:notifications | DONE |
| [ITEM-0002](../../docs/backlog/items/ITEM-0002-no-live-api-session-test-harness.md) | Live API session and database proof for admin sign-out | TEST_GAP | MEDIUM | P2 | READY | services/api, apps/admin | FIX_NOW |
| [ITEM-0003](../../docs/backlog/items/ITEM-0003-tenant-erasure-never-exercised-against-a-database.md) | Tenant erasure has no cross-tenant survival assertion | TEST_GAP | MEDIUM | P2 | READY | api:tenant-control-plane | FIX_NOW |
| [ITEM-0005](../../docs/backlog/items/ITEM-0005-customeraccount-leadid-has-no-unique-constraint.md) | CustomerAccount.leadId has no unique constraint, so double conversion is unprevented | TECH_DEBT | MEDIUM | P2 | DONE | services/api/prisma, api:super-admin | DONE |
| [ITEM-0006](../../docs/backlog/items/ITEM-0006-adr-one-source-of-truth-for-the-tenant-base-domain.md) | ADR needed — one source of truth for the tenant base domain | ARCHITECTURE | MEDIUM | P2 | DONE | pkg:config, services/api, apps/web, apps/admin, apps/landing | DONE |
| [ITEM-0009](../../docs/backlog/items/ITEM-0009-no-observability-platform-exists.md) | No observability platform exists, so a release cannot be verified from outside | INFRA | MEDIUM | P2 | READY | services/api, apps/web, apps/admin | PLAN_REQUIRED |
| [ITEM-0010](../../docs/backlog/items/ITEM-0010-deployed-sha-is-not-exposed.md) | The running system does not expose its deployed SHA | INFRA | MEDIUM | P2 | DONE | services/api | DONE |
| [ITEM-0012](../../docs/backlog/items/ITEM-0012-cross-check-route-methods-against-their-callers.md) | Cross-check app/api route methods against the hrefs that target them | TEST_GAP | MEDIUM | P2 | DONE | apps/web, apps/admin | DONE |
| [ITEM-0013](../../docs/backlog/items/ITEM-0013-assert-every-public-controller-is-rate-limited.md) | Assert mechanically that every @Public() controller carries the rate-limit guard | TEST_GAP | MEDIUM | P2 | DONE | services/api | DONE |
| [ITEM-0014](../../docs/backlog/items/ITEM-0014-branch-protection-is-not-configured.md) | Branch protection is not configured on the remote | INFRA | MEDIUM | P2 | DONE | .github | DONE |
| [ITEM-0016](../../docs/backlog/items/ITEM-0016-product-decision-partner-onboarding-review-re-opening-and-po.md) | Product decision — partner review re-opening and post-activation demotion | PRODUCT_DECISION | MEDIUM | P2 | DONE | api:partner-experience, api:partners | DONE |
| [ITEM-0019](../../docs/backlog/items/ITEM-0019-no-market-or-region-model-maps-countries-to-plans-currencies.md) | No market or region model maps countries to plans, currencies and legal sets | ARCHITECTURE | MEDIUM | P2 | DONE | services/api/prisma, api:super-admin, apps/admin, apps/landing | DONE |
| [ITEM-0020](../../docs/backlog/items/ITEM-0020-contract-phase-drop-legacy-plan-pricing-columns.md) | Contract phase: drop legacy Plan pricing columns | TECH_DEBT | MEDIUM | P2 | READY | services/api/prisma, api:super-admin, apps/admin | PLAN_REQUIRED |
| [ITEM-0022](../../docs/backlog/items/ITEM-0022-governed-publish-and-archive-actions-for-commercial-configur.md) | Governed publish and archive actions for commercial configuration | FOLLOW_UP | MEDIUM | P2 | READY | api:super-admin, apps/admin | PLAN_REQUIRED |
| [ITEM-0025](../../docs/backlog/items/ITEM-0025-hidden-writes-remain-on-lookups-and-onboarding-read-paths.md) | Hidden writes remain on lookups and onboarding read paths | TECH_DEBT | MEDIUM | P2 | READY | api:lookups, api:onboarding | PLAN_REQUIRED |
| [ITEM-0026](../../docs/backlog/items/ITEM-0026-desktop-agent-windows-installer-is-unsigned.md) | Desktop agent Windows installer is unsigned | SECURITY | MEDIUM | P2 | READY | apps/agent-desktop | PLAN_REQUIRED |
| [ITEM-0027](../../docs/backlog/items/ITEM-0027-desktop-agent-has-no-retry-backoff-and-no-bounded-give-up.md) | Desktop agent has no retry backoff and no bounded give up | TECH_DEBT | MEDIUM | P2 | READY | apps/agent-desktop, api:agent | PLAN_REQUIRED |
| [ITEM-0028](../../docs/backlog/items/ITEM-0028-apps-agent-desktop-has-no-agents-md-and-no-test-coverage.md) | apps/agent-desktop has no AGENTS.md and no test coverage | TEST_GAP | MEDIUM | P2 | DONE | apps/agent-desktop, api:agent | DONE |
| [ITEM-0030](../../docs/backlog/items/ITEM-0030-partner-inquiry-form-does-not-yet-capture-partnership-model.md) | Partner inquiry form does not yet capture partnership model | FOLLOW_UP | MEDIUM | P2 | DONE | apps/landing, api:partners | DONE |
| [ITEM-0031](../../docs/backlog/items/ITEM-0031-replace-remaining-native-prompts-for-governed-input.md) | Replace remaining native prompts for governed input | UX | MEDIUM | P2 | READY | apps/admin, apps/web | FIX_NOW |
| [ITEM-0032](../../docs/backlog/items/ITEM-0032-recompute-productivity-totals-inflated-by-heartbeat-replays.md) | Recompute productivity totals inflated by heartbeat replays | DATA_MIGRATION | MEDIUM | P2 | PRODUCT_DECISION | api:agent | PRODUCT_DECISION |
| [ITEM-0033](../../docs/backlog/items/ITEM-0033-add-a-test-runner-and-unit-coverage-to-apps-agent-desktop.md) | Add a test runner and unit coverage to apps/agent-desktop | TEST_GAP | MEDIUM | P2 | READY | apps/agent-desktop | FIX_NOW |
| [ITEM-0035](../../docs/backlog/items/ITEM-0035-web-route-handlers-flatten-upstream-error-status-to-500.md) | Web route handlers flatten upstream error status to 500 | TECH_DEBT | MEDIUM | P2 | READY | apps/web | FIX_NOW |
| [ITEM-0036](../../docs/backlog/items/ITEM-0036-decide-the-fate-of-the-inert-runtime-registries-in-apps-web.md) | Decide the fate of the inert runtime registries in apps/web | ARCHITECTURE | MEDIUM | P2 | READY | apps/web | PLAN_REQUIRED |
| [ITEM-0037](../../docs/backlog/items/ITEM-0037-apps-web-depends-on-lucide-react-without-declaring-it.md) | apps/web depends on lucide-react without declaring it | TECH_DEBT | MEDIUM | P2 | DONE | apps/web | DONE |
| [ITEM-0038](../../docs/backlog/items/ITEM-0038-record-ids-collide-between-concurrent-branches.md) | Record ids collide between concurrent branches | TECH_DEBT | MEDIUM | P2 | DONE | scripts, docs/bugs, docs/backlog | DONE |
| [ITEM-0039](../../docs/backlog/items/ITEM-0039-promote-the-csp-from-report-only-to-enforced.md) | Promote the CSP from report-only to enforced | SECURITY | MEDIUM | P2 | READY | pkg:config, apps/web, apps/admin, apps/landing | PLAN_REQUIRED |
| [ITEM-0040](../../docs/backlog/items/ITEM-0040-develop-branch-protection-is-not-applied.md) | develop branch protection is not applied | INFRA | MEDIUM | P2 | DONE | .github | DONE |
| [ITEM-0043](../../docs/backlog/items/ITEM-0043-promote-the-security-invariant-job-to-a-required-gate.md) | Promote the security invariant job to a required gate | TEST_GAP | MEDIUM | P2 | DONE | services/api | DONE |
| [ITEM-0046](../../docs/backlog/items/ITEM-0046-add-landing-loading-error-and-not-found-boundaries.md) | Add landing loading error and not-found boundaries | UX | MEDIUM | P2 | READY | apps/landing | FIX_NOW |
| [ITEM-0050](../../docs/backlog/items/ITEM-0050-move-payroll-derivation-and-branding-upload-orchestration-out.md) | Move payroll derivation and branding upload orchestration out of web proxies | TECH_DEBT | MEDIUM | P2 | READY | apps/web, api:compensation, api:tenant-settings | PLAN_REQUIRED |
| [ITEM-0021](../../docs/backlog/items/ITEM-0021-mechanical-guard-against-country-and-currency-literals-in-fr.md) | Mechanical guard against country and currency literals in frontends | TEST_GAP | LOW | P2 | DONE | scripts, apps/landing, apps/web, apps/admin | DONE |
| [ITEM-0023](../../docs/backlog/items/ITEM-0023-tenant-dataregion-populated-from-market-at-provisioning.md) | Tenant.dataRegion populated from market at provisioning | FOLLOW_UP | LOW | P2 | READY | services/api/prisma, api:tenant-control-plane | PLAN_REQUIRED |
| [ITEM-0024](../../docs/backlog/items/ITEM-0024-landing-depends-on-lucide-react-without-declaring-it.md) | Landing depends on lucide-react without declaring it | TECH_DEBT | LOW | P2 | DONE | apps/landing | DONE |
| [BUG-0018](../../docs/bugs/BUG-0018-bulk-lead-delete-is-unreachable-for-every-role.md) | Bulk lead delete is unreachable for every role, including SUPER_ADMIN | AUTHORIZATION | LOW | P3 | DEFERRED | api:platform-auth, api:super-admin | DEFER |
| [BUG-0023](../../docs/bugs/BUG-0023-testing-architecture-context-claims-two-e2e-specs-do-not-exist.md) | The testing-architecture context claims two e2e specs do not exist | DOCUMENTATION | LOW | P3 | VERIFIED | .agent/context | DONE |
| [BUG-0024](../../docs/bugs/BUG-0024-start-onboarding-api-and-proxy-have-no-caller.md) | The start-onboarding API endpoint and its proxy have no caller | BUG | LOW | P3 | VERIFIED | apps/admin, api:super-admin | DONE |
| [BUG-0059](../../docs/bugs/BUG-0059-vault-wikilinks-to-task-records-and-four-module-notes-resolv.md) | Vault wikilinks to task records and four module notes resolve to nothing | DOCUMENTATION | LOW | P3 | VERIFIED | scripts, docs/tasks, docs/knowledge | DONE |
| [ITEM-0007](../../docs/backlog/items/ITEM-0007-should-duplicate-website-leads-be-deduplicated.md) | Product decision — should duplicate website leads be deduplicated? | PRODUCT_DECISION | LOW | P3 | DONE | api:leads, apps/landing | DONE |
| [ITEM-0008](../../docs/backlog/items/ITEM-0008-customeraccount-has-no-origin-channel.md) | Product decision — CustomerAccount carries no origin channel | PRODUCT_DECISION | LOW | P3 | DONE | services/api/prisma, api:super-admin | DONE |
| [ITEM-0011](../../docs/backlog/items/ITEM-0011-framework-validation-should-catch-absence-claims.md) | Framework validation should catch false absence claims in context documents | TECH_DEBT | LOW | P3 | DONE | .agent/context, scripts | DONE |
| [ITEM-0015](../../docs/backlog/items/ITEM-0015-make-the-tenant-readiness-assertion-auditable.md) | Make the tenant readiness() authorization assertion auditable | FOLLOW_UP | LOW | P3 | READY | api:tenant-control-plane | FIX_NOW |
| [ITEM-0017](../../docs/backlog/items/ITEM-0017-buildworkspaceurl-still-carries-an-internal-loopback-fallbac.md) | buildWorkspaceUrl still carries an internal loopback fallback | TECH_DEBT | LOW | P3 | DONE | pkg:config | DONE |
| [ITEM-0029](../../docs/backlog/items/ITEM-0029-validation-should-require-an-aliases-line-on-every-record.md) | Validation should require an aliases line on every record | TECH_DEBT | LOW | P3 | DONE | scripts, docs/backlog, docs/bugs | DONE |
| [ITEM-0041](../../docs/backlog/items/ITEM-0041-repository-ruleset-no-push-matches-no-branch-and-is-inert.md) | Repository ruleset No push matches no branch and is inert | INFRA | LOW | P3 | DONE | .github | DONE |
| [ITEM-0042](../../docs/backlog/items/ITEM-0042-burn-down-the-services-api-eslint-warning-baseline.md) | Burn down the services/api ESLint warning baseline | TECH_DEBT | LOW | P3 | READY | services/api | FIX_NOW |
| [ITEM-0045](../../docs/backlog/items/ITEM-0045-reconcile-tenant-web-root-domain-environment-examples.md) | Reconcile tenant web root-domain environment examples | DOCUMENTATION | LOW | P3 | READY | apps/web | FIX_NOW |
| [ITEM-0049](../../docs/backlog/items/ITEM-0049-register-services-api-environment-reads-or-scope-the-rule.md) | Register services/api environment reads or scope the rule to build inputs | INFRA | LOW | P3 | READY | services/api, turbo.json, docs/deployment | PLAN_REQUIRED |

## Views

- [Open](open.md) — active work
- [Blocked](blocked.md) — waiting on something external
- [Deferred](deferred.md) — deliberately not now
- [Product decisions](product-decisions.md) — waiting on a human product call
- [Completed](completed.md) — fixed, verified, closed, cancelled or accepted
