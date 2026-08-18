# DijiPeople Engineering Dashboard

> **Generated file — do not edit by hand.** Rebuild with `node scripts/generate-dashboards.mjs`,
> then publish with `node scripts/sync-obsidian.mjs`. Edits made in the vault are lost on the next sync.

## At a glance

| | |
|---|---|
| Open CRITICAL | **0** |
| Open HIGH | **5** |
| Open total | 29 |
| Blocked | 0 |
| Awaiting a product decision | 2 |
| Deferred | 4 |
| Completed | 88 |
| Awaiting Architect triage | 0 |

## Open Critical Bugs

_None. Nothing open at CRITICAL._

## Open High Bugs

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[BUG-0052-production-dependency-graph-carries-critical-and-high-securi|BUG-0052]] | Production dependency graph carries critical and high security advisories | SECURITY | HIGH | OPEN | package-lock.json, apps/agent-desktop, apps/web, apps/admin, apps/landing, services/api | FIX_NOW |
| [[ITEM-0004-tenant-activation-never-proven-end-to-end|ITEM-0004]] | Tenant activation to ACTIVE has never been reached in any test | TEST_GAP | HIGH | READY | api:tenant-control-plane | FIX_NOW |
| [[ITEM-0034-apps-web-has-zero-browser-e2e-coverage|ITEM-0034]] | apps/web has zero browser E2E coverage | TEST_GAP | HIGH | READY | apps/web, e2e | PLAN_REQUIRED |
| [[ITEM-0047-database-e2e-suites-fail-against-an-ephemeral-postgresql|ITEM-0047]] | Database e2e suites fail against an ephemeral PostgreSQL | TEST_GAP | HIGH | READY | services/api/test, .github/workflows, database | PLAN_REQUIRED |
| [[ITEM-0048-replace-or-contain-active-win-and-the-xlsx-export-path|ITEM-0048]] | Replace or contain active-win and the xlsx export path | SECURITY | HIGH | READY | apps/agent-desktop, services/api/src/common/excel, package-lock.json | PLAN_REQUIRED |

## Product Decisions Needed

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[ITEM-0032-recompute-productivity-totals-inflated-by-heartbeat-replays|ITEM-0032]] | Recompute productivity totals inflated by heartbeat replays | DATA_MIGRATION | MEDIUM | PRODUCT_DECISION | api:agent | PRODUCT_DECISION |
| [[ITEM-0053-publish-privacy-policy-and-terms-for-the-public-landing-site|ITEM-0053]] | Publish privacy policy and terms for the public landing site | PRODUCT_DECISION | MEDIUM | PRODUCT_DECISION | apps/landing | PRODUCT_DECISION |

## Blocked Items

_None._

## Current Test Gaps

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[ITEM-0004-tenant-activation-never-proven-end-to-end|ITEM-0004]] | Tenant activation to ACTIVE has never been reached in any test | TEST_GAP | HIGH | READY | api:tenant-control-plane | FIX_NOW |
| [[ITEM-0034-apps-web-has-zero-browser-e2e-coverage|ITEM-0034]] | apps/web has zero browser E2E coverage | TEST_GAP | HIGH | READY | apps/web, e2e | PLAN_REQUIRED |
| [[ITEM-0047-database-e2e-suites-fail-against-an-ephemeral-postgresql|ITEM-0047]] | Database e2e suites fail against an ephemeral PostgreSQL | TEST_GAP | HIGH | READY | services/api/test, .github/workflows, database | PLAN_REQUIRED |
| [[ITEM-0002-no-live-api-session-test-harness|ITEM-0002]] | Live API session and database proof for admin sign-out | TEST_GAP | MEDIUM | READY | services/api, apps/admin | FIX_NOW |
| [[ITEM-0003-tenant-erasure-never-exercised-against-a-database|ITEM-0003]] | Tenant erasure has no cross-tenant survival assertion | TEST_GAP | MEDIUM | READY | api:tenant-control-plane | FIX_NOW |
| [[ITEM-0033-add-a-test-runner-and-unit-coverage-to-apps-agent-desktop|ITEM-0033]] | Add a test runner and unit coverage to apps/agent-desktop | TEST_GAP | MEDIUM | READY | apps/agent-desktop | FIX_NOW |
| [[ITEM-0052-verify-the-agent-update-feed-against-a-real-published-artefact|ITEM-0052]] | Verify the agent update feed against a real published artefact | TEST_GAP | MEDIUM | READY | apps/agent-desktop, api:app-releases | PLAN_REQUIRED |

## Current Infrastructure Gaps

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[ITEM-0009-no-observability-platform-exists|ITEM-0009]] | No observability platform exists, so a release cannot be verified from outside | INFRA | MEDIUM | READY | services/api, apps/web, apps/admin | PLAN_REQUIRED |
| [[ITEM-0049-register-services-api-environment-reads-or-scope-the-rule|ITEM-0049]] | Register services/api environment reads or scope the rule to build inputs | INFRA | LOW | READY | services/api, turbo.json, docs/deployment | PLAN_REQUIRED |

## Recently Fixed Bugs

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[BUG-0005-cross-tenant-error-log-read-via-support-role|BUG-0005]] | A support-role user could read another tenant's error log | TENANT_ISOLATION | CRITICAL | VERIFIED | api:error-logs | DONE |
| [[BUG-0006-organization-structure-mutable-by-any-authenticated-user|BUG-0006]] | Organization and business-unit structure was mutable by any authenticated user | AUTHORIZATION | CRITICAL | VERIFIED | api:organization | DONE |
| [[BUG-0027-admin-plan-pricing-and-checkout-pricing-come-from-different-|BUG-0027]] | Admin plan pricing and checkout pricing come from different models | DATA_INTEGRITY | CRITICAL | VERIFIED | services/api/prisma, apps/admin, apps/landing | DONE |
| [[BUG-0030-plan-list-get-mutates-commercial-pricing-and-can-fail-on-pla|BUG-0030]] | Plan list GET mutates commercial pricing and can fail on PlanPrice unique constraint | DATA_INTEGRITY | CRITICAL | VERIFIED | services/api, services/api/prisma | DONE |
| [[BUG-0047-seven-bug-records-are-verified-while-their-fixes-exist-only|BUG-0047]] | Seven bug records are VERIFIED while their fixes exist only on unmerged branches | SECURITY | CRITICAL | VERIFIED | api:organization, api:error-logs, api:employees, api:attendance, docs/qa/regressions | DONE |
| [[BUG-0049-report-only-ci-jobs-swallow-security-and-database-e2e-failur|BUG-0049]] | Report-only CI jobs swallow security and database E2E failures | INFRA | HIGH | VERIFIED | .github/workflows, services/api/src/common/constants, services/api/test, docs/qa | DONE |
| [[BUG-0053-documents-self-scoped-users-can-read-tenant-wide-documents|BUG-0053]] | Self-scoped document readers can list and open tenant-wide documents | AUTHORIZATION | HIGH | VERIFIED | api:documents | DONE |
| [[BUG-0055-partner-routes-use-tenant-role-aliases-instead-of-platform-permissions|BUG-0055]] | Partner administration routes use tenant role aliases instead of platform permissions | AUTHORIZATION | HIGH | VERIFIED | api:partners | DONE |
| [[BUG-0056-billing-routes-authorize-by-role-instead-of-billing-capability|BUG-0056]] | Billing routes authorize by role instead of billing capability | AUTHORIZATION | HIGH | VERIFIED | api:billing | DONE |
| [[BUG-0057-settings-context-allows-arbitrary-organization-preview|BUG-0057]] | Self-service settings context allows arbitrary organization preview | AUTHORIZATION | HIGH | VERIFIED | api:tenant-settings | DONE |
| [[BUG-0058-organization-structure-reads-ignore-caller-scope|BUG-0058]] | Organization structure reads ignore caller scope | AUTHORIZATION | HIGH | VERIFIED | api:organization | DONE |
| [[BUG-0001-compensation-and-bank-data-behind-employee-record-read|BUG-0001]] | Compensation and bank data returned behind an employee-record read | AUTHORIZATION | HIGH | VERIFIED | api:employees | DONE |
| [[BUG-0002-self-approval-of-attendance-corrections|BUG-0002]] | A manager could file and approve their own attendance correction | AUTHORIZATION | HIGH | VERIFIED | api:attendance | DONE |
| [[BUG-0003-readteam-granted-tenant-wide-visibility|BUG-0003]] | readTeam permissions granted tenant-wide visibility | AUTHORIZATION | HIGH | VERIFIED | api:attendance, api:approvals | DONE |
| [[BUG-0004-search-filter-overwrote-the-access-scope|BUG-0004]] | A search filter silently overwrote the access scope | AUTHORIZATION | HIGH | VERIFIED | api:approvals | DONE |
| [[BUG-0007-unguarded-duplicate-of-a-permission-gated-route|BUG-0007]] | An unguarded duplicate route aliased a permission-gated one | AUTHORIZATION | HIGH | VERIFIED | api:tenant-settings | DONE |
| [[BUG-0008-session-expired-sign-in-again-returned-405|BUG-0008]] | Session-expired "Sign in again" returned 405 and stranded admin operators | BUG | HIGH | VERIFIED | app:admin, app:admin | DONE |
| [[BUG-0011-signed-agreement-editable-defeating-the-lead-conversion-gate|BUG-0011]] | Signed agreements were editable, defeating the lead-conversion gate | STATE_MACHINE | HIGH | VERIFIED | api:contracts | DONE |
| [[BUG-0012-onboarding-created-by-lead-conversion-was-born-uneditable|BUG-0012]] | Every onboarding created by lead conversion was born un-editable | STATE_MACHINE | HIGH | VERIFIED | api:super-admin | DONE |
| [[BUG-0014-no-tenant-that-failed-provisioning-could-be-retried|BUG-0014]] | No tenant that failed provisioning could be retried | STATE_MACHINE | HIGH | VERIFIED | api:tenant-control-plane | DONE |
| [[BUG-0015-a-tenant-that-fails-before-identities-and-billing-is-unrecoverable|BUG-0015]] | A tenant that fails before identities-and-billing is permanently unrecoverable | STATE_MACHINE | HIGH | VERIFIED | api:tenant-control-plane | DONE |
| [[BUG-0016-partner-onboarding-review-has-no-state-machine|BUG-0016]] | Partner onboarding review has no state machine | STATE_MACHINE | HIGH | VERIFIED | api:partner-experience | DONE |
| [[BUG-0019-partner-inquiry-and-onboarding-review-screens-are-unreachable|BUG-0019]] | Partner inquiry and onboarding review screens have no inbound link | UX | HIGH | VERIFIED | apps/admin | DONE |
| [[BUG-0026-public-login-and-tenant-email-links-resolved-to-localhost-in|BUG-0026]] | Public Login and tenant email links resolved to localhost in production | INFRA | HIGH | VERIFIED | apps/landing, apps/web, apps/admin, services/api, pkg:config | DONE |
| [[BUG-0031-public-subscribe-endpoint-has-no-rate-limiting|BUG-0031]] | Public subscribe endpoint has no rate limiting | SECURITY | HIGH | VERIFIED | api:billing, apps/landing | DONE |
| [[BUG-0032-landing-proxies-collapse-every-visitor-into-one-rate-limit-b|BUG-0032]] | Landing proxies collapse every visitor into one rate limit bucket | SECURITY | HIGH | VERIFIED | apps/landing, services/api/src/common | DONE |
| [[BUG-0033-desktop-agent-login-is-unthrottled-and-enumerates-users-acro|BUG-0033]] | Desktop agent login is unthrottled and enumerates users across every tenant | SECURITY | HIGH | VERIFIED | api:agent, apps/agent-desktop | DONE |
| [[BUG-0034-desktop-agent-auto-update-points-at-an-endpoint-that-does-no|BUG-0034]] | Desktop agent auto update points at an endpoint that does not exist | INTEGRATION | HIGH | VERIFIED | apps/agent-desktop, api:agent, api:app-releases | DONE |
| [[BUG-0035-desktop-agent-logout-never-revokes-the-refresh-token|BUG-0035]] | Desktop agent logout never revokes the refresh token | SECURITY | HIGH | VERIFIED | apps/agent-desktop, api:agent | DONE |
| [[BUG-0036-agent-heartbeat-has-no-idempotency-so-retries-double-count-p|BUG-0036]] | Agent heartbeat has no idempotency so retries double count productivity | DATA_INTEGRITY | HIGH | VERIFIED | api:agent, services/api/prisma, apps/agent-desktop | DONE |
| [[BUG-0039-employee-payslip-and-bank-account-proxies-return-the-callers|BUG-0039]] | Employee payslip and bank account proxies return the callers own data on 403 | DATA_INTEGRITY | HIGH | VERIFIED | apps/web, api:payroll, api:employees | DONE |
| [[BUG-0048-partner-inquiry-form-rejects-every-submission-that-leaves-th|BUG-0048]] | Partner inquiry form rejects every submission that leaves the optional website blank | BUG | HIGH | VERIFIED | apps/landing, api:partner-experience | DONE |
| [[BUG-0060-stale-generated-prisma-client-breaks-local-api-development|BUG-0060]] | A stale generated Prisma client breaks local API development with 60 misleading errors | INFRA | HIGH | VERIFIED | services/api, scripts, package.json | DONE |
| [[BUG-0061-landing-home-and-subscribe-pages-return-500-when-the-plans-f|BUG-0061]] | Landing home and subscribe pages return 500 when the plans fetch fails | BUG | HIGH | VERIFIED | apps/landing | DONE |
| [[BUG-0062-landing-mobile-navigation-menu-stays-open-after-navigating-a|BUG-0062]] | Landing mobile navigation menu stays open after navigating and ignores Escape | UX | HIGH | VERIFIED | apps/landing | DONE |
| [[BUG-0063-request-demo-form-blocks-submission-with-no-feedback-and-is-|BUG-0063]] | Request demo form blocks submission with no feedback and is unusable by assistive technology | UX | HIGH | VERIFIED | apps/landing | DONE |
| [[BUG-0064-landing-public-pages-fail-wcag-bypass-blocks-and-text-contra|BUG-0064]] | Landing public pages fail WCAG bypass blocks and text contrast on every route | UX | HIGH | VERIFIED | apps/landing | DONE |
| [[BUG-0068-prisma-client-freshness-check-is-blind-to-field-level-drift|BUG-0068]] | Prisma client freshness check is blind to field-level drift | INFRA | HIGH | VERIFIED | scripts, services/api | DONE |
| [[BUG-0070-outbox-deduplication-aborted-the-caller-transaction-on-postg|BUG-0070]] | Outbox deduplication aborted the caller transaction on PostgreSQL | BUG | HIGH | VERIFIED | outbox | DONE |
| [[BUG-0051-backlog-and-qa-validators-accept-contradictory-record-state|BUG-0051]] | Backlog and QA validators accept contradictory record state | INFRA | MEDIUM | VERIFIED | scripts/lib/backlog-records.mjs, scripts/lib/qa-records.mjs, docs/bugs, docs/backlog, docs/qa | DONE |
| [[BUG-0009-session-revocation-depended-on-the-refresh-cookie|BUG-0009]] | Server-side session revocation depended on the refresh cookie surviving | SECURITY | MEDIUM | VERIFIED | app:admin, api:auth | DONE |
| [[BUG-0010-unguarded-cookie-options-could-turn-sign-out-into-a-500|BUG-0010]] | Unguarded cookie options could turn admin sign-out into a 500 | INFRA | MEDIUM | VERIFIED | app:admin | DONE |
| [[BUG-0013-public-lead-endpoint-had-no-rate-limiting|BUG-0013]] | The public lead endpoint had no rate limiting | SECURITY | MEDIUM | VERIFIED | api:leads | DONE |
| [[BUG-0017-tenant-base-domain-setting-does-not-drive-hostname-issuance|BUG-0017]] | The admin-editable tenant base domain does not drive hostname issuance | INTEGRATION | MEDIUM | VERIFIED | pkg:config, api:tenant-control-plane | DONE |
| [[BUG-0020-window-prompt-used-for-governed-reasons|BUG-0020]] | window.prompt collects governed reasons instead of the design system dialog | UX | MEDIUM | VERIFIED | apps/admin, apps/web | DONE |
| [[BUG-0021-landing-contact-form-fabricates-lead-data|BUG-0021]] | The landing contact form fabricates lead data and has no honeypot | DATA_INTEGRITY | MEDIUM | VERIFIED | apps/landing, api:leads | DONE |
| [[BUG-0022-provision-tenant-has-no-confirmation-step|BUG-0022]] | "Provision tenant" has no confirmation step and no idempotency key | UX | MEDIUM | VERIFIED | apps/admin, api:tenant-control-plane | DONE |
| [[BUG-0025-a-live-partner-could-be-demoted-through-the-generic-partner-|BUG-0025]] | A live partner could be demoted through the generic partner update | STATE_MACHINE | MEDIUM | VERIFIED | api:partners | DONE |
| [[BUG-0028-country-to-currency-mapping-is-hardcoded-in-the-landing-fron|BUG-0028]] | Country to currency mapping is hardcoded in the landing frontend | INTEGRATION | MEDIUM | VERIFIED | apps/landing | DONE |
| [[BUG-0029-public-features-page-advertised-capabilities-the-product-doe|BUG-0029]] | Public features page advertised capabilities the product does not gate and omitted ones it does | DOCUMENTATION | MEDIUM | VERIFIED | apps/landing | DONE |
| [[BUG-0037-integration-patterns-context-denies-four-subsystems-that-exi|BUG-0037]] | Integration patterns context denies four subsystems that exist | DOCUMENTATION | MEDIUM | VERIFIED | .agent/context | DONE |
| [[BUG-0038-tenant-commercial-panel-plan-dropdown-405s-and-never-loads|BUG-0038]] | Tenant commercial panel plan dropdown 405s and never loads | UX | MEDIUM | VERIFIED | apps/admin | DONE |
| [[BUG-0040-apps-web-sets-no-security-response-headers|BUG-0040]] | apps/web sets no security response headers | SECURITY | MEDIUM | VERIFIED | apps/web | DONE |
| [[BUG-0042-apps-web-reads-21-environment-variables-unregistered-in-turb|BUG-0042]] | apps/web reads 21 environment variables unregistered in turbo globalEnv | INFRA | MEDIUM | VERIFIED | apps/web, pkg:config | DONE |
| [[BUG-0044-the-documented-new-module-workflow-for-apps-web-cannot-be-fo|BUG-0044]] | The documented new module workflow for apps/web cannot be followed | DOCUMENTATION | MEDIUM | VERIFIED | apps/web | DONE |
| [[BUG-0046-tenant-theme-mode-and-runtime-settings-saves-do-not-take-eff|BUG-0046]] | Tenant theme mode and runtime settings saves do not take effect | UX | MEDIUM | VERIFIED | apps/web | DONE |
| [[BUG-0050-notification-settings-offer-email-providers-whose-backend-al|BUG-0050]] | Notification settings offer email providers whose backend always fails | INTEGRATION | MEDIUM | VERIFIED | apps/web, api:notifications | DONE |
| [[BUG-0065-public-commercial-config-omits-featurecatalog-when-no-market|BUG-0065]] | Public commercial-config omits featureCatalog when no market resolves | BUG | MEDIUM | VERIFIED | api:billing, apps/landing | DONE |
| [[BUG-0066-subscribe-page-renders-an-editable-form-with-no-way-to-submi|BUG-0066]] | Subscribe page renders an editable form with no way to submit when checkout is unavailable | UX | MEDIUM | VERIFIED | apps/landing | DONE |
| [[BUG-0023-testing-architecture-context-claims-two-e2e-specs-do-not-exist|BUG-0023]] | The testing-architecture context claims two e2e specs do not exist | DOCUMENTATION | LOW | VERIFIED | .agent/context | DONE |
| [[BUG-0024-start-onboarding-api-and-proxy-have-no-caller|BUG-0024]] | The start-onboarding API endpoint and its proxy have no caller | BUG | LOW | VERIFIED | apps/admin, api:super-admin | DONE |
| [[BUG-0059-vault-wikilinks-to-task-records-and-four-module-notes-resolv|BUG-0059]] | Vault wikilinks to task records and four module notes resolve to nothing | DOCUMENTATION | LOW | VERIFIED | scripts, docs/tasks, docs/knowledge | DONE |

## Recent QA Runs

- [[2026-08-18-landing-uiux-remediation-verification-c332992|QA Run — landing-uiux-remediation-verification]]
- [[2026-08-17-web-app-documentation-1af3690|QA Run — apps/web documentation audit (TASK-0003)]]
- [[2026-08-17-record-state-reconciliation-d919e1a|QA Run — record-state-reconciliation]]
- [[2026-08-17-landing-uiux-browser-qa-f58ee1d|QA Run — landing-uiux-browser-qa]]
- [[2026-08-17-global-remediation-discovery-0051180|QA Run — global-remediation-discovery]]
- [[2026-08-17-framework-remediation-e6a173d|QA Run — framework-remediation]]
- [[2026-08-16-public-commercial-wave2-7686bb0|QA Run — Wave 2: Public Plans + Features Experience]]
- [[2026-08-16-production-url-integrity-344a832|QA Run — Production URL integrity (BUG-0026)]]

## Recent Implementations

- [[2026-08-17-web-app-documentation|2026-08-17 — Documenting `apps/web`, the tenant product]]
- [[2026-08-16-monorepo-app-documentation|2026-08-16 — Documenting `apps/docs`, `apps/landing` and `apps/agent-desktop`]]
- [[2026-08-15-database-ci-and-gh-access|Database CI, GitHub access, and the first four framework merges]]
- [[2026-08-14-tenant-control-plane|Tenant Control Plane]]

## Recent Engineering History

- [[2026-08-19-agent-framework-hardening|Engineering History — Database Agent, Security Agent, agent reliability and Obsidian ownership]]
- [[2026-08-18-landing-uiux-remediation-ab3bc73|Engineering History — Landing UI/UX remediation]]
- [[2026-08-18-commercial-platform-outbox-and-legal|Engineering History — Commercial platform: transactional outbox and legal documents]]
- [[2026-08-18-ci-performance-cancellation-rca-3f6775e|Engineering History — CI performance, cancellation RCA and autonomous CI adaptation]]
- [[2026-08-17-landing-uiux-browser-qa-and-agent-hardening-1f6e842|Engineering History — Landing UI/UX browser QA and UI/UX agent hardening]]
- [[2026-08-17-framework-remediation-e6a173d|Engineering History — Framework remediation]]
- [[2026-08-16-web-app-documentation-1af3690|Engineering History — Web app documentation]]
- [[2026-08-16-public-commercial-wave2-301a397|Engineering History — Wave 2: Public Plans + Features Experience]]

## Recent Releases

_None. Nothing has been deployed through the release process._

## Active / Recent Backlog

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[ITEM-0044-validate-forwarded-host-before-tenant-web-workspace-resoluti|ITEM-0044]] | Validate forwarded host before tenant web workspace resolution | SECURITY | MEDIUM | READY | apps/web | PLAN_REQUIRED |
| [[BUG-0041-web-route-proxies-make-authorization-and-business-decisions|BUG-0041]] | Web route proxies make authorization and business decisions | SECURITY | MEDIUM | OPEN | apps/web | PLAN_REQUIRED |
| [[BUG-0043-web-dialogs-have-no-focus-trap-and-filter-controls-are-unlab|BUG-0043]] | Web dialogs have no focus trap and filter controls are unlabelled | UX | MEDIUM | OPEN | apps/web | PLAN_REQUIRED |
| [[BUG-0045-the-canonical-settings-and-branding-contract-is-materially-s|BUG-0045]] | The canonical settings and branding contract is materially stale | DOCUMENTATION | MEDIUM | OPEN | apps/web, docs/architecture | PLAN_REQUIRED |
| [[ITEM-0002-no-live-api-session-test-harness|ITEM-0002]] | Live API session and database proof for admin sign-out | TEST_GAP | MEDIUM | READY | services/api, apps/admin | FIX_NOW |
| [[ITEM-0003-tenant-erasure-never-exercised-against-a-database|ITEM-0003]] | Tenant erasure has no cross-tenant survival assertion | TEST_GAP | MEDIUM | READY | api:tenant-control-plane | FIX_NOW |
| [[ITEM-0009-no-observability-platform-exists|ITEM-0009]] | No observability platform exists, so a release cannot be verified from outside | INFRA | MEDIUM | READY | services/api, apps/web, apps/admin | PLAN_REQUIRED |
| [[ITEM-0020-contract-phase-drop-legacy-plan-pricing-columns|ITEM-0020]] | Contract phase: drop legacy Plan pricing columns | TECH_DEBT | MEDIUM | READY | services/api/prisma, api:super-admin, apps/admin | PLAN_REQUIRED |
| [[ITEM-0022-governed-publish-and-archive-actions-for-commercial-configur|ITEM-0022]] | Governed publish and archive actions for commercial configuration | FOLLOW_UP | MEDIUM | READY | api:super-admin, apps/admin | PLAN_REQUIRED |
| [[ITEM-0025-hidden-writes-remain-on-lookups-and-onboarding-read-paths|ITEM-0025]] | Hidden writes remain on lookups and onboarding read paths | TECH_DEBT | MEDIUM | READY | api:lookups, api:onboarding | PLAN_REQUIRED |
| [[ITEM-0026-desktop-agent-windows-installer-is-unsigned|ITEM-0026]] | Desktop agent Windows installer is unsigned | SECURITY | MEDIUM | READY | apps/agent-desktop | PLAN_REQUIRED |
| [[ITEM-0027-desktop-agent-has-no-retry-backoff-and-no-bounded-give-up|ITEM-0027]] | Desktop agent has no retry backoff and no bounded give up | TECH_DEBT | MEDIUM | READY | apps/agent-desktop, api:agent | PLAN_REQUIRED |
| [[ITEM-0031-replace-remaining-native-prompts-for-governed-input|ITEM-0031]] | Replace remaining native prompts for governed input | UX | MEDIUM | READY | apps/admin, apps/web | FIX_NOW |
| [[ITEM-0033-add-a-test-runner-and-unit-coverage-to-apps-agent-desktop|ITEM-0033]] | Add a test runner and unit coverage to apps/agent-desktop | TEST_GAP | MEDIUM | READY | apps/agent-desktop | FIX_NOW |
| [[ITEM-0035-web-route-handlers-flatten-upstream-error-status-to-500|ITEM-0035]] | Web route handlers flatten upstream error status to 500 | TECH_DEBT | MEDIUM | READY | apps/web | FIX_NOW |
| [[ITEM-0036-decide-the-fate-of-the-inert-runtime-registries-in-apps-web|ITEM-0036]] | Decide the fate of the inert runtime registries in apps/web | ARCHITECTURE | MEDIUM | READY | apps/web | PLAN_REQUIRED |
| [[ITEM-0039-promote-the-csp-from-report-only-to-enforced|ITEM-0039]] | Promote the CSP from report-only to enforced | SECURITY | MEDIUM | READY | pkg:config, apps/web, apps/admin, apps/landing | PLAN_REQUIRED |
| [[ITEM-0050-move-payroll-derivation-and-branding-upload-orchestration-out|ITEM-0050]] | Move payroll derivation and branding upload orchestration out of web proxies | TECH_DEBT | MEDIUM | READY | apps/web, api:compensation, api:tenant-settings | PLAN_REQUIRED |
| [[ITEM-0052-verify-the-agent-update-feed-against-a-real-published-artefact|ITEM-0052]] | Verify the agent update feed against a real published artefact | TEST_GAP | MEDIUM | READY | apps/agent-desktop, api:app-releases | PLAN_REQUIRED |
| [[ITEM-0023-tenant-dataregion-populated-from-market-at-provisioning|ITEM-0023]] | Tenant.dataRegion populated from market at provisioning | FOLLOW_UP | LOW | READY | services/api/prisma, api:tenant-control-plane | PLAN_REQUIRED |
| [[ITEM-0015-make-the-tenant-readiness-assertion-auditable|ITEM-0015]] | Make the tenant readiness() authorization assertion auditable | FOLLOW_UP | LOW | READY | api:tenant-control-plane | FIX_NOW |
| [[ITEM-0042-burn-down-the-services-api-eslint-warning-baseline|ITEM-0042]] | Burn down the services/api ESLint warning baseline | TECH_DEBT | LOW | READY | services/api | FIX_NOW |
| [[ITEM-0045-reconcile-tenant-web-root-domain-environment-examples|ITEM-0045]] | Reconcile tenant web root-domain environment examples | DOCUMENTATION | LOW | READY | apps/web | FIX_NOW |
| [[ITEM-0049-register-services-api-environment-reads-or-scope-the-rule|ITEM-0049]] | Register services/api environment reads or scope the rule to build inputs | INFRA | LOW | READY | services/api, turbo.json, docs/deployment | PLAN_REQUIRED |

## Key Architecture Decisions

- [[ADR-0001-ai-agent-workflow|ADR-0001 — AI-assisted engineering workflow for DijiPeople]]
- [[ADR-0002-tenant-base-domain-single-source|ADR-0002 — Configuration is the single source of the tenant base domain]]
- [[decision-a-bug-record-is-its-own-backlog-item|Decision — A bug record **is** its own backlog item]]
- [[decision-ci-verdict-gates-shared-merges|Decision — A shared-target merge requires a read CI verdict on the exact SHA]]
- [[decision-platform-admin-is-a-separate-identity|Decision — Platform admin is a separate identity, not an elevated tenant user]]
- [[decision-tenantid-is-the-isolation-identity|Decision — `tenantId` is the isolation identity, enforced by convention]]

## Knowledge Health

| Knowledge | Count |
|---|---|
| Bug records | 67 |
| Backlog items | 56 |
| Known bug patterns | 19 |
| QA runs | 17 |
| Engineering history records | 17 |
| Release records | 0 |
| Module notes | 24 |
| Architecture notes | 20 |
| Decision notes (ADR + generated) | 6 |
| Implementation records | 4 |

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
