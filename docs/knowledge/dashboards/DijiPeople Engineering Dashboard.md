# DijiPeople Engineering Dashboard

> **Generated file — do not edit by hand.** Rebuild with `node scripts/generate-dashboards.mjs`,
> then publish with `node scripts/sync-obsidian.mjs`. Edits made in the vault are lost on the next sync.

## At a glance

| | |
|---|---|
| Open CRITICAL | **0** |
| Open HIGH | **24** |
| Open total | 75 |
| Blocked | 1 |
| Awaiting a product decision | 6 |
| Deferred | 16 |
| Completed | 100 |
| Awaiting Architect triage | 0 |

## Open Critical Bugs

_None. Nothing open at CRITICAL._

## Open High Bugs

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[BUG-0052-production-dependency-graph-carries-critical-and-high-securi|BUG-0052]] | Production dependency graph carries critical and high security advisories | SECURITY | HIGH | OPEN | package-lock.json, apps/agent-desktop, apps/web, apps/admin, apps/landing, services/api | FIX_NOW |
| [[BUG-0075-public-subscribe-checkout-has-no-rate-limit-and-the-invarian|BUG-0075]] | Public subscribe checkout has no rate limit and the invariant that should catch it is inert | SECURITY | HIGH | FIXED | billing, common/guards | FIX_NOW |
| [[BUG-0076-repository-health-never-inspected-the-primary-worktree-so-a-|BUG-0076]] | Repository health never inspected the primary worktree, so a clean task worktree passed as CLEANUP_STATUS DONE | INFRA | HIGH | FIXED | scripts/repo-health.mjs, scripts/session.mjs | FIX_NOW |
| [[BUG-0077-public-subscribe-creates-a-tenant-and-a-second-customeraccou|BUG-0077]] | Public subscribe creates a Tenant and a second CustomerAccount before payment | DATA_INTEGRITY | HIGH | FIXED | billing, super-admin, tenants | FIX_NOW |
| [[BUG-0078-provisioning-requested-has-no-consumer-so-a-paid-self-servic|BUG-0078]] | PROVISIONING_REQUESTED has no consumer so a paid self-service customer is never provisioned | STATE_MACHINE | HIGH | FIXED | billing, outbox, super-admin | FIX_NOW |
| [[BUG-0079-browser-e2e-spends-its-whole-install-step-on-apt-work-that-i|BUG-0079]] | Browser e2e spends its whole install step on apt work that installs no browser library | PERFORMANCE | HIGH | FIXED | .github/workflows, e2e | FIX_NOW |
| [[BUG-0080-seeded-prices-bill-a-flat-fee-while-the-terms-say-the-billab|BUG-0080]] | Seeded prices bill a flat fee while the Terms say the billable unit is an active employee | DATA_INTEGRITY | HIGH | FIXED | billing, super-admin, legal | FIX_NOW |
| [[BUG-0082-the-onboarding-wizard-collects-five-steps-of-data-it-cannot-|BUG-0082]] | The onboarding wizard collects five steps of data it cannot submit | UX | HIGH | FIXED | landing | FIX_NOW |
| [[BUG-0086-prisma-migrate-deploy-cannot-acquire-its-advisory-lock-throu|BUG-0086]] | Prisma migrate deploy cannot acquire its advisory lock through Neon pooled endpoint | INFRA | HIGH | OPEN | services/api/prisma | FIX_NOW |
| [[BUG-0220-saving-a-plan-from-the-runtime-record-page-always-returns-40|BUG-0220]] | Saving a plan from the runtime record page always returns 400 | BUG | HIGH | FIXED | apps/admin, api:platform-runtime, api:super-admin | FIX_NOW |
| [[BUG-0280-self-service-checkout-leaves-a-customer-with-no-plan-billing|BUG-0280]] | Self-service checkout leaves a customer with no plan, billing cycle or origin channel | DATA_INTEGRITY | HIGH | FIXED | api:billing, api:super-admin, apps/admin | FIX_NOW |
| [[BUG-0282-the-platform-runtime-schema-manifest-drifted-from-schema-pri|BUG-0282]] | The platform runtime schema manifest drifted from schema.prisma and no check noticed | DATA_INTEGRITY | HIGH | FIXED | pkg:config, apps/admin, services/api/prisma | FIX_NOW |
| [[BUG-0312-provisioning-issues-no-workspace-hostname-when-no-tenant-bas|BUG-0312]] | Provisioning issues no workspace hostname when no tenant base domain is configured | INFRA | HIGH | FIXED | services/api, pkg:config, apps/admin | FIX_NOW |
| [[BUG-0313-admin-builds-workspace-urls-from-a-second-divergent-copy-of-|BUG-0313]] | Admin builds workspace URLs from a second, divergent copy of the rule | BUG | HIGH | FIXED | apps/admin, pkg:config | FIX_NOW |
| [[BUG-0353-the-api-resolved-a-workspace-hostname-from-a-variable-nothin|BUG-0353]] | The API resolved a workspace hostname from a variable nothing sets | INTEGRATION | HIGH | FIXED | api:tenants, pkg:config | FIX_NOW |
| [[BUG-0418-contract-placeholders-declared-a-formatting-rule-that-nothin|BUG-0418]] | Contract placeholders declared a formatting rule that nothing applied | DATA_INTEGRITY | HIGH | FIXED | api:contracts | FIX_NOW |
| [[BUG-0419-preview-sample-data-replaced-the-live-template-and-rendered-|BUG-0419]] | Preview sample data replaced the live template and rendered one paint late | UX | HIGH | FIXED | apps/admin | FIX_NOW |
| [[BUG-0422-an-abandoned-provisioning-run-blocked-every-retry-with-no-ro|BUG-0422]] | An abandoned provisioning run blocked every retry with no route out | STATE_MACHINE | HIGH | FIXED | api:tenant-control-plane, apps/admin | FIX_NOW |
| [[BUG-0463-an-active-reachable-tenant-reported-that-its-workspace-was-n|BUG-0463]] | An active reachable tenant reported that its workspace was not provisioned | STATE_MACHINE | HIGH | FIXED | api:tenant-control-plane, apps/admin | FIX_NOW |
| [[BUG-0531-flat-prices-were-sellable-on-the-public-site-at-invented-amo|BUG-0531]] | Flat prices were sellable on the public site at invented amounts | DATA_INTEGRITY | HIGH | FIXED | super-admin, apps/admin | FIX_NOW |
| [[BUG-0533-seeding-the-commercial-catalogue-never-corrected-an-existing|BUG-0533]] | Seeding the commercial catalogue never corrected an existing plan or price | DATA_INTEGRITY | HIGH | FIXED | super-admin, apps/admin | FIX_NOW |
| [[ITEM-0004-tenant-activation-never-proven-end-to-end|ITEM-0004]] | Tenant activation to ACTIVE has never been reached in any test | TEST_GAP | HIGH | READY | api:tenant-control-plane | FIX_NOW |
| [[ITEM-0034-apps-web-has-zero-browser-e2e-coverage|ITEM-0034]] | apps/web has zero browser E2E coverage | TEST_GAP | HIGH | READY | apps/web, e2e | PLAN_REQUIRED |
| [[ITEM-0062-no-multi-tenant-membership-one-user-belongs-to-one-tenant-so|ITEM-0062]] | No multi-tenant membership — one user belongs to one tenant, so discovery and switching cannot exist | ARCHITECTURE | HIGH | READY | auth, users, tenant-domains, web | PLAN_REQUIRED |

## Product Decisions Needed

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[BUG-0163-package-lock-json-cannot-be-regenerated-npm-overrides-are-si|BUG-0163]] | package-lock.json cannot be regenerated - npm overrides are silently ignored | INFRA | HIGH | PRODUCT_DECISION | package-lock.json, apps/admin | PRODUCT_DECISION |
| [[BUG-0223-admin-cannot-set-a-plan-ispublic-flag-which-gates-self-servi|BUG-0223]] | Admin cannot set a plan isPublic flag which gates self-service checkout | UX | MEDIUM | PRODUCT_DECISION | apps/admin, api:super-admin, api:billing | PRODUCT_DECISION |
| [[ITEM-0032-recompute-productivity-totals-inflated-by-heartbeat-replays|ITEM-0032]] | Recompute productivity totals inflated by heartbeat replays | DATA_MIGRATION | MEDIUM | PRODUCT_DECISION | api:agent | PRODUCT_DECISION |
| [[ITEM-0053-publish-privacy-policy-and-terms-for-the-public-landing-site|ITEM-0053]] | Publish privacy policy and terms for the public landing site | PRODUCT_DECISION | MEDIUM | PRODUCT_DECISION | apps/landing | PRODUCT_DECISION |
| [[ITEM-0076-operators-cannot-recover-an-order-whose-stripe-webhook-never|ITEM-0076]] | Operators cannot recover an order whose Stripe webhook never arrived | PRODUCT_DECISION | MEDIUM | PRODUCT_DECISION | api:billing, apps/admin | PRODUCT_DECISION |
| [[ITEM-0057-landing-production-env-examples-still-name-the-vercel-and-re|ITEM-0057]] | Landing production env examples still name the vercel and render hosts, not the dijipeople.com apex | PRODUCT_DECISION | — | PRODUCT_DECISION | apps/landing | PRODUCT_DECISION |

## Blocked Items

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[ITEM-0048-replace-or-contain-active-win-and-the-xlsx-export-path|ITEM-0048]] | Replace or contain active-win and the xlsx export path | SECURITY | HIGH | BLOCKED | apps/agent-desktop, services/api/src/common/excel, package-lock.json | BLOCKED_EXTERNAL |

## Current Test Gaps

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[ITEM-0004-tenant-activation-never-proven-end-to-end|ITEM-0004]] | Tenant activation to ACTIVE has never been reached in any test | TEST_GAP | HIGH | READY | api:tenant-control-plane | FIX_NOW |
| [[ITEM-0034-apps-web-has-zero-browser-e2e-coverage|ITEM-0034]] | apps/web has zero browser E2E coverage | TEST_GAP | HIGH | READY | apps/web, e2e | PLAN_REQUIRED |
| [[BUG-0081-three-apps-claimed-a-forwarded-headers-invariant-test-that-d|BUG-0081]] | Three apps claimed a forwarded-headers invariant test that did not exist | TEST_GAP | MEDIUM | FIXED | landing, web, admin | FIX_NOW |
| [[ITEM-0002-no-live-api-session-test-harness|ITEM-0002]] | Live API session and database proof for admin sign-out | TEST_GAP | MEDIUM | READY | services/api, apps/admin | FIX_NOW |
| [[ITEM-0003-tenant-erasure-never-exercised-against-a-database|ITEM-0003]] | Tenant erasure has no cross-tenant survival assertion | TEST_GAP | MEDIUM | READY | api:tenant-control-plane | FIX_NOW |
| [[ITEM-0033-add-a-test-runner-and-unit-coverage-to-apps-agent-desktop|ITEM-0033]] | Add a test runner and unit coverage to apps/agent-desktop | TEST_GAP | MEDIUM | READY | apps/agent-desktop | FIX_NOW |
| [[ITEM-0052-verify-the-agent-update-feed-against-a-real-published-artefact|ITEM-0052]] | Verify the agent update feed against a real published artefact | TEST_GAP | MEDIUM | READY | apps/agent-desktop, api:app-releases | PLAN_REQUIRED |

## Current Infrastructure Gaps

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[BUG-0076-repository-health-never-inspected-the-primary-worktree-so-a-|BUG-0076]] | Repository health never inspected the primary worktree, so a clean task worktree passed as CLEANUP_STATUS DONE | INFRA | HIGH | FIXED | scripts/repo-health.mjs, scripts/session.mjs | FIX_NOW |
| [[BUG-0086-prisma-migrate-deploy-cannot-acquire-its-advisory-lock-throu|BUG-0086]] | Prisma migrate deploy cannot acquire its advisory lock through Neon pooled endpoint | INFRA | HIGH | OPEN | services/api/prisma | FIX_NOW |
| [[BUG-0312-provisioning-issues-no-workspace-hostname-when-no-tenant-bas|BUG-0312]] | Provisioning issues no workspace hostname when no tenant base domain is configured | INFRA | HIGH | FIXED | services/api, pkg:config, apps/admin | FIX_NOW |
| [[BUG-0283-a-regenerated-prisma-client-against-an-un-migrated-database-|BUG-0283]] | A regenerated Prisma client against an un-migrated database 500s every affected screen | INFRA | MEDIUM | OPEN | services/api, services/api/prisma, apps/admin | PLAN_REQUIRED |
| [[ITEM-0009-no-observability-platform-exists|ITEM-0009]] | No observability platform exists, so a release cannot be verified from outside | INFRA | MEDIUM | READY | services/api, apps/web, apps/admin | PLAN_REQUIRED |
| [[ITEM-0074-allocate-id-and-session-tooling-accept-a-session-id-that-doe|ITEM-0074]] | allocate-id and session tooling accept a session id that does not exist | INFRA | MEDIUM | READY | framework | PLAN_REQUIRED |
| [[ITEM-0049-register-services-api-environment-reads-or-scope-the-rule|ITEM-0049]] | Register services/api environment reads or scope the rule to build inputs | INFRA | LOW | READY | services/api, turbo.json, docs/deployment | PLAN_REQUIRED |

## Recently Fixed Bugs

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[BUG-0005-cross-tenant-error-log-read-via-support-role|BUG-0005]] | A support-role user could read another tenant's error log | TENANT_ISOLATION | CRITICAL | VERIFIED | api:error-logs | DONE |
| [[BUG-0006-organization-structure-mutable-by-any-authenticated-user|BUG-0006]] | Organization and business-unit structure was mutable by any authenticated user | AUTHORIZATION | CRITICAL | VERIFIED | api:organization | DONE |
| [[BUG-0027-admin-plan-pricing-and-checkout-pricing-come-from-different-|BUG-0027]] | Admin plan pricing and checkout pricing come from different models | DATA_INTEGRITY | CRITICAL | VERIFIED | services/api/prisma, apps/admin, apps/landing | DONE |
| [[BUG-0030-plan-list-get-mutates-commercial-pricing-and-can-fail-on-pla|BUG-0030]] | Plan list GET mutates commercial pricing and can fail on PlanPrice unique constraint | DATA_INTEGRITY | CRITICAL | VERIFIED | services/api, services/api/prisma | DONE |
| [[BUG-0047-seven-bug-records-are-verified-while-their-fixes-exist-only|BUG-0047]] | Seven bug records are VERIFIED while their fixes exist only on unmerged branches | SECURITY | CRITICAL | VERIFIED | api:organization, api:error-logs, api:employees, api:attendance, docs/qa/regressions | DONE |
| [[BUG-0071-tenant-users-reach-every-platform-super-admin-endpoint|BUG-0071]] | Tenant users reach every platform super-admin endpoint | AUTHORIZATION | CRITICAL | VERIFIED | super-admin, platform-auth, platform-communications | DONE |
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
| [[BUG-0072-platform-mutations-map-to-read-permissions-letting-the-read-|BUG-0072]] | Platform mutations map to read permissions, letting the read-only auditor write | AUTHORIZATION | HIGH | VERIFIED | super-admin, platform-auth | DONE |
| [[BUG-0075-public-subscribe-checkout-has-no-rate-limit-and-the-invarian|BUG-0075]] | Public subscribe checkout has no rate limit and the invariant that should catch it is inert | SECURITY | HIGH | FIXED | billing, common/guards | FIX_NOW |
| [[BUG-0076-repository-health-never-inspected-the-primary-worktree-so-a-|BUG-0076]] | Repository health never inspected the primary worktree, so a clean task worktree passed as CLEANUP_STATUS DONE | INFRA | HIGH | FIXED | scripts/repo-health.mjs, scripts/session.mjs | FIX_NOW |
| [[BUG-0077-public-subscribe-creates-a-tenant-and-a-second-customeraccou|BUG-0077]] | Public subscribe creates a Tenant and a second CustomerAccount before payment | DATA_INTEGRITY | HIGH | FIXED | billing, super-admin, tenants | FIX_NOW |
| [[BUG-0078-provisioning-requested-has-no-consumer-so-a-paid-self-servic|BUG-0078]] | PROVISIONING_REQUESTED has no consumer so a paid self-service customer is never provisioned | STATE_MACHINE | HIGH | FIXED | billing, outbox, super-admin | FIX_NOW |
| [[BUG-0079-browser-e2e-spends-its-whole-install-step-on-apt-work-that-i|BUG-0079]] | Browser e2e spends its whole install step on apt work that installs no browser library | PERFORMANCE | HIGH | FIXED | .github/workflows, e2e | FIX_NOW |
| [[BUG-0080-seeded-prices-bill-a-flat-fee-while-the-terms-say-the-billab|BUG-0080]] | Seeded prices bill a flat fee while the Terms say the billable unit is an active employee | DATA_INTEGRITY | HIGH | FIXED | billing, super-admin, legal | FIX_NOW |
| [[BUG-0082-the-onboarding-wizard-collects-five-steps-of-data-it-cannot-|BUG-0082]] | The onboarding wizard collects five steps of data it cannot submit | UX | HIGH | FIXED | landing | FIX_NOW |
| [[BUG-0083-the-database-agent-preflight-reports-pass-on-a-database-with|BUG-0083]] | The Database Agent preflight reports PASS on a database with every migration unapplied | INFRA | HIGH | VERIFIED | scripts, .agent, services/api | DONE |
| [[BUG-0085-the-release-command-aborted-a-first-deploy-and-otherwise-res|BUG-0085]] | The release command aborted a first deploy, and otherwise reset the super admin password | INFRA | HIGH | VERIFIED | platform-users, legal | DONE |
| [[BUG-0220-saving-a-plan-from-the-runtime-record-page-always-returns-40|BUG-0220]] | Saving a plan from the runtime record page always returns 400 | BUG | HIGH | FIXED | apps/admin, api:platform-runtime, api:super-admin | FIX_NOW |
| [[BUG-0280-self-service-checkout-leaves-a-customer-with-no-plan-billing|BUG-0280]] | Self-service checkout leaves a customer with no plan, billing cycle or origin channel | DATA_INTEGRITY | HIGH | FIXED | api:billing, api:super-admin, apps/admin | FIX_NOW |
| [[BUG-0282-the-platform-runtime-schema-manifest-drifted-from-schema-pri|BUG-0282]] | The platform runtime schema manifest drifted from schema.prisma and no check noticed | DATA_INTEGRITY | HIGH | FIXED | pkg:config, apps/admin, services/api/prisma | FIX_NOW |
| [[BUG-0312-provisioning-issues-no-workspace-hostname-when-no-tenant-bas|BUG-0312]] | Provisioning issues no workspace hostname when no tenant base domain is configured | INFRA | HIGH | FIXED | services/api, pkg:config, apps/admin | FIX_NOW |
| [[BUG-0313-admin-builds-workspace-urls-from-a-second-divergent-copy-of-|BUG-0313]] | Admin builds workspace URLs from a second, divergent copy of the rule | BUG | HIGH | FIXED | apps/admin, pkg:config | FIX_NOW |
| [[BUG-0353-the-api-resolved-a-workspace-hostname-from-a-variable-nothin|BUG-0353]] | The API resolved a workspace hostname from a variable nothing sets | INTEGRATION | HIGH | FIXED | api:tenants, pkg:config | FIX_NOW |
| [[BUG-0418-contract-placeholders-declared-a-formatting-rule-that-nothin|BUG-0418]] | Contract placeholders declared a formatting rule that nothing applied | DATA_INTEGRITY | HIGH | FIXED | api:contracts | FIX_NOW |
| [[BUG-0419-preview-sample-data-replaced-the-live-template-and-rendered-|BUG-0419]] | Preview sample data replaced the live template and rendered one paint late | UX | HIGH | FIXED | apps/admin | FIX_NOW |
| [[BUG-0422-an-abandoned-provisioning-run-blocked-every-retry-with-no-ro|BUG-0422]] | An abandoned provisioning run blocked every retry with no route out | STATE_MACHINE | HIGH | FIXED | api:tenant-control-plane, apps/admin | FIX_NOW |
| [[BUG-0463-an-active-reachable-tenant-reported-that-its-workspace-was-n|BUG-0463]] | An active reachable tenant reported that its workspace was not provisioned | STATE_MACHINE | HIGH | FIXED | api:tenant-control-plane, apps/admin | FIX_NOW |
| [[BUG-0531-flat-prices-were-sellable-on-the-public-site-at-invented-amo|BUG-0531]] | Flat prices were sellable on the public site at invented amounts | DATA_INTEGRITY | HIGH | FIXED | super-admin, apps/admin | FIX_NOW |
| [[BUG-0533-seeding-the-commercial-catalogue-never-corrected-an-existing|BUG-0533]] | Seeding the commercial catalogue never corrected an existing plan or price | DATA_INTEGRITY | HIGH | FIXED | super-admin, apps/admin | FIX_NOW |
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
| [[BUG-0073-small-uppercase-labels-in-slate-400-fail-wcag-aa-contrast-ac|BUG-0073]] | Small uppercase labels in slate-400 fail WCAG AA contrast across admin | UX | MEDIUM | VERIFIED | apps/admin | DONE |
| [[BUG-0074-the-provisioning-queue-scroll-container-was-unreachable-by-k|BUG-0074]] | The provisioning queue scroll container was unreachable by keyboard | UX | MEDIUM | VERIFIED | apps/admin | DONE |
| [[BUG-0081-three-apps-claimed-a-forwarded-headers-invariant-test-that-d|BUG-0081]] | Three apps claimed a forwarded-headers invariant test that did not exist | TEST_GAP | MEDIUM | FIXED | landing, web, admin | FIX_NOW |
| [[BUG-0221-schema-completed-form-fields-render-on-a-tab-the-form-never-|BUG-0221]] | Schema-completed form fields render on a tab the form never declares | UX | MEDIUM | FIXED | apps/admin | FIX_NOW |
| [[BUG-0222-plan-related-record-panels-declare-no-tab-so-they-never-rend|BUG-0222]] | Plan related-record panels declare no tab, so they never render | UX | MEDIUM | FIXED | apps/admin | FIX_NOW |
| [[BUG-0314-the-notifications-page-is-a-placeholder-under-a-permanently-|BUG-0314]] | The notifications page is a placeholder under a permanently lit badge | UX | MEDIUM | FIXED | apps/admin, api:platform-events | FIX_NOW |
| [[BUG-0315-workspace-preferences-are-stored-in-localstorage-and-never-a|BUG-0315]] | Workspace preferences are stored in localStorage and never applied | UX | MEDIUM | FIXED | apps/admin, api:platform-users, services/api/prisma | FIX_NOW |
| [[BUG-0316-country-industry-and-contact-fields-are-free-text-where-a-ca|BUG-0316]] | Country industry and contact fields are free text where a canonical list exists | DATA_INTEGRITY | MEDIUM | FIXED | apps/landing, apps/admin, api:lookups, pkg:config | FIX_NOW |
| [[BUG-0317-the-subscribe-wizard-shows-five-identical-pills-and-labels-t|BUG-0317]] | The subscribe wizard shows five identical pills and labels three address fields only by placeholder | UX | MEDIUM | FIXED | apps/landing | FIX_NOW |
| [[BUG-0350-the-subscribe-wizard-s-country-field-silently-degraded-to-fr|BUG-0350]] | The subscribe wizard's country field silently degraded to free text | DATA_INTEGRITY | MEDIUM | FIXED | apps/landing | FIX_NOW |
| [[BUG-0351-the-subscribe-wizard-progress-rail-truncated-every-step-labe|BUG-0351]] | The subscribe wizard progress rail truncated every step label | UX | MEDIUM | FIXED | apps/landing | FIX_NOW |
| [[BUG-0420-the-console-dark-theme-set-color-scheme-and-repainted-nothin|BUG-0420]] | The console dark theme set color-scheme and repainted nothing | UX | MEDIUM | FIXED | apps/admin | FIX_NOW |
| [[BUG-0421-an-overflow-declaration-in-the-shell-disabled-every-sticky-e|BUG-0421]] | An overflow declaration in the shell disabled every sticky element | UX | MEDIUM | FIXED | apps/admin | FIX_NOW |
| [[BUG-0439-the-subscribe-form-was-disabled-without-looking-disabled-or-|BUG-0439]] | The subscribe form was disabled without looking disabled or saying why beside it | UX | MEDIUM | FIXED | apps/landing, apps/admin | FIX_NOW |
| [[BUG-0460-the-notification-badge-counted-over-a-window-sized-by-the-pa|BUG-0460]] | The notification badge counted over a window sized by the page it was fetching | UX | MEDIUM | FIXED | api:platform-events, apps/admin | FIX_NOW |
| [[BUG-0461-the-cost-estimator-listed-flat-priced-plans-under-a-headcoun|BUG-0461]] | The cost estimator listed flat-priced plans under a headcount input | UX | MEDIUM | FIXED | apps/landing | FIX_NOW |
| [[BUG-0462-monitoring-opened-on-a-twelve-thousand-row-queue-with-five-u|BUG-0462]] | Monitoring opened on a twelve thousand row queue with five unactionable tiles | UX | MEDIUM | FIXED | apps/admin | FIX_NOW |
| [[BUG-0492-the-workspace-url-was-built-by-hand-in-two-more-places|BUG-0492]] | The workspace URL was built by hand in two more places | INTEGRATION | MEDIUM | FIXED | api:tenant-control-plane, pkg:config | FIX_NOW |
| [[BUG-0493-open-tenant-reported-success-while-opening-nothing|BUG-0493]] | Open Tenant reported success while opening nothing | UX | MEDIUM | FIXED | apps/admin | FIX_NOW |
| [[BUG-0494-workspace-hostnames-stayed-pending-for-ever-with-nothing-to-|BUG-0494]] | Workspace hostnames stayed Pending for ever with nothing to explain or reconcile it | STATE_MACHINE | MEDIUM | FIXED | api:tenant-domains, api:super-admin, apps/admin | FIX_NOW |
| [[BUG-0495-the-console-painted-light-on-every-load-before-the-dark-them|BUG-0495]] | The console painted light on every load before the dark theme arrived | UX | MEDIUM | FIXED | apps/admin | FIX_NOW |
| [[BUG-0496-the-monitoring-landing-page-showed-real-data-an-agent-could-|BUG-0496]] | The monitoring landing page showed real data an agent could not act on | UX | MEDIUM | FIXED | apps/admin | FIX_NOW |
| [[BUG-0497-fifteen-modules-offered-no-delete-and-no-reason-for-its-abse|BUG-0497]] | Fifteen modules offered no Delete and no reason for its absence | UX | MEDIUM | FIXED | apps/admin, api:partners, api:platform-runtime | FIX_NOW |
| [[BUG-0534-plan-form-offered-editable-legacy-price-fields-that-bill-nob|BUG-0534]] | Plan form offered editable legacy price fields that bill nobody | UX | MEDIUM | FIXED | super-admin, apps/admin | FIX_NOW |
| [[BUG-0023-testing-architecture-context-claims-two-e2e-specs-do-not-exist|BUG-0023]] | The testing-architecture context claims two e2e specs do not exist | DOCUMENTATION | LOW | VERIFIED | .agent/context | DONE |
| [[BUG-0024-start-onboarding-api-and-proxy-have-no-caller|BUG-0024]] | The start-onboarding API endpoint and its proxy have no caller | BUG | LOW | VERIFIED | apps/admin, api:super-admin | DONE |
| [[BUG-0059-vault-wikilinks-to-task-records-and-four-module-notes-resolv|BUG-0059]] | Vault wikilinks to task records and four module notes resolve to nothing | DOCUMENTATION | LOW | VERIFIED | scripts, docs/tasks, docs/knowledge | DONE |
| [[BUG-0352-the-tenant-timeline-rendered-every-entry-with-no-count-and-n|BUG-0352]] | The tenant timeline rendered every entry with no count and no paging | UX | LOW | FIXED | apps/admin | FIX_NOW |

## Recent QA Runs

- [[2026-08-20-identity-and-membership-3008a13|QA Run — identity-and-membership]]
- [[2026-08-19-self-service-onboarding-provisioning-f5bd870|QA Run — self-service-onboarding-provisioning]]
- [[2026-08-19-ci-e2e-remediation-3f03571|QA Run — ci-e2e-remediation]]
- [[2026-08-18-primary-worktree-repository-health-494c44d|QA Run — primary-worktree-repository-health]]
- [[2026-08-18-landing-uiux-remediation-verification-c332992|QA Run — landing-uiux-remediation-verification]]
- [[2026-08-17-web-app-documentation-1af3690|QA Run — apps/web documentation audit (TASK-0003)]]
- [[2026-08-17-record-state-reconciliation-d919e1a|QA Run — record-state-reconciliation]]
- [[2026-08-17-landing-uiux-browser-qa-f58ee1d|QA Run — landing-uiux-browser-qa]]

## Recent Implementations

- [[2026-08-20-self-service-acquisition-path|Self-Service Acquisition Path]]
- [[2026-08-20-identity-and-membership|Identity and Multi-Tenant Membership]]
- [[2026-08-17-web-app-documentation|2026-08-17 — Documenting `apps/web`, the tenant product]]
- [[2026-08-16-monorepo-app-documentation|2026-08-16 — Documenting `apps/docs`, `apps/landing` and `apps/agent-desktop`]]
- [[2026-08-15-database-ci-and-gh-access|Database CI, GitHub access, and the first four framework merges]]
- [[2026-08-14-tenant-control-plane|Tenant Control Plane]]

## Recent Engineering History

- [[2026-08-22-tenant-repair-and-console-ux-f87335d|Engineering History — Tenant repair and console ux]]
- [[2026-08-22-tenant-commands-monitoring-bulk-delete-0f9addc|Engineering History — Tenant commands monitoring bulk delete]]
- [[2026-08-22-plans-catalogue-converge-ffb188c|Engineering History — Plans catalogue converge]]
- [[2026-08-22-document-render-theme-and-tenant-recovery-a701eeb|Engineering History — Document render theme and tenant recovery]]
- [[2026-08-21-second-ux-round-5d9f74b|Engineering History — Second ux round]]
- [[2026-08-21-final-agent-operating-system-upgrade-f023512|Engineering History — Final agent operating system upgrade]]
- [[2026-08-21-checkout-account-and-payment-confirmation-d8d27ab|Engineering History — Checkout customer fidelity, payment confirmation, and a database four migrations behind]]
- [[2026-08-21-admin-record-status-header-08b8661|Engineering History — Platform Admin record header status group and default command bar]]

## Recent Releases

_None. Nothing has been deployed through the release process._

## Active / Recent Backlog

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[ITEM-0044-validate-forwarded-host-before-tenant-web-workspace-resoluti|ITEM-0044]] | Validate forwarded host before tenant web workspace resolution | SECURITY | MEDIUM | READY | apps/web | PLAN_REQUIRED |
| [[BUG-0041-web-route-proxies-make-authorization-and-business-decisions|BUG-0041]] | Web route proxies make authorization and business decisions | SECURITY | MEDIUM | OPEN | apps/web | PLAN_REQUIRED |
| [[BUG-0043-web-dialogs-have-no-focus-trap-and-filter-controls-are-unlab|BUG-0043]] | Web dialogs have no focus trap and filter controls are unlabelled | UX | MEDIUM | OPEN | apps/web | PLAN_REQUIRED |
| [[BUG-0045-the-canonical-settings-and-branding-contract-is-materially-s|BUG-0045]] | The canonical settings and branding contract is materially stale | DOCUMENTATION | MEDIUM | OPEN | apps/web, docs/architecture | PLAN_REQUIRED |
| [[BUG-0081-three-apps-claimed-a-forwarded-headers-invariant-test-that-d|BUG-0081]] | Three apps claimed a forwarded-headers invariant test that did not exist | TEST_GAP | MEDIUM | FIXED | landing, web, admin | FIX_NOW |
| [[BUG-0221-schema-completed-form-fields-render-on-a-tab-the-form-never-|BUG-0221]] | Schema-completed form fields render on a tab the form never declares | UX | MEDIUM | FIXED | apps/admin | FIX_NOW |
| [[BUG-0222-plan-related-record-panels-declare-no-tab-so-they-never-rend|BUG-0222]] | Plan related-record panels declare no tab, so they never render | UX | MEDIUM | FIXED | apps/admin | FIX_NOW |
| [[BUG-0281-partner-attribution-is-lost-when-a-referred-buyer-purchases-|BUG-0281]] | Partner attribution is lost when a referred buyer purchases through self-service checkout | DATA_INTEGRITY | MEDIUM | OPEN | apps/landing, api:billing, api:partner-experience | PLAN_REQUIRED |
| [[BUG-0283-a-regenerated-prisma-client-against-an-un-migrated-database-|BUG-0283]] | A regenerated Prisma client against an un-migrated database 500s every affected screen | INFRA | MEDIUM | OPEN | services/api, services/api/prisma, apps/admin | PLAN_REQUIRED |
| [[BUG-0314-the-notifications-page-is-a-placeholder-under-a-permanently-|BUG-0314]] | The notifications page is a placeholder under a permanently lit badge | UX | MEDIUM | FIXED | apps/admin, api:platform-events | FIX_NOW |
| [[BUG-0315-workspace-preferences-are-stored-in-localstorage-and-never-a|BUG-0315]] | Workspace preferences are stored in localStorage and never applied | UX | MEDIUM | FIXED | apps/admin, api:platform-users, services/api/prisma | FIX_NOW |
| [[BUG-0316-country-industry-and-contact-fields-are-free-text-where-a-ca|BUG-0316]] | Country industry and contact fields are free text where a canonical list exists | DATA_INTEGRITY | MEDIUM | FIXED | apps/landing, apps/admin, api:lookups, pkg:config | FIX_NOW |
| [[BUG-0317-the-subscribe-wizard-shows-five-identical-pills-and-labels-t|BUG-0317]] | The subscribe wizard shows five identical pills and labels three address fields only by placeholder | UX | MEDIUM | FIXED | apps/landing | FIX_NOW |
| [[BUG-0350-the-subscribe-wizard-s-country-field-silently-degraded-to-fr|BUG-0350]] | The subscribe wizard's country field silently degraded to free text | DATA_INTEGRITY | MEDIUM | FIXED | apps/landing | FIX_NOW |
| [[BUG-0351-the-subscribe-wizard-progress-rail-truncated-every-step-labe|BUG-0351]] | The subscribe wizard progress rail truncated every step label | UX | MEDIUM | FIXED | apps/landing | FIX_NOW |
| [[BUG-0420-the-console-dark-theme-set-color-scheme-and-repainted-nothin|BUG-0420]] | The console dark theme set color-scheme and repainted nothing | UX | MEDIUM | FIXED | apps/admin | FIX_NOW |
| [[BUG-0421-an-overflow-declaration-in-the-shell-disabled-every-sticky-e|BUG-0421]] | An overflow declaration in the shell disabled every sticky element | UX | MEDIUM | FIXED | apps/admin | FIX_NOW |
| [[BUG-0439-the-subscribe-form-was-disabled-without-looking-disabled-or-|BUG-0439]] | The subscribe form was disabled without looking disabled or saying why beside it | UX | MEDIUM | FIXED | apps/landing, apps/admin | FIX_NOW |
| [[BUG-0460-the-notification-badge-counted-over-a-window-sized-by-the-pa|BUG-0460]] | The notification badge counted over a window sized by the page it was fetching | UX | MEDIUM | FIXED | api:platform-events, apps/admin | FIX_NOW |
| [[BUG-0461-the-cost-estimator-listed-flat-priced-plans-under-a-headcoun|BUG-0461]] | The cost estimator listed flat-priced plans under a headcount input | UX | MEDIUM | FIXED | apps/landing | FIX_NOW |
| [[BUG-0462-monitoring-opened-on-a-twelve-thousand-row-queue-with-five-u|BUG-0462]] | Monitoring opened on a twelve thousand row queue with five unactionable tiles | UX | MEDIUM | FIXED | apps/admin | FIX_NOW |
| [[BUG-0492-the-workspace-url-was-built-by-hand-in-two-more-places|BUG-0492]] | The workspace URL was built by hand in two more places | INTEGRATION | MEDIUM | FIXED | api:tenant-control-plane, pkg:config | FIX_NOW |
| [[BUG-0493-open-tenant-reported-success-while-opening-nothing|BUG-0493]] | Open Tenant reported success while opening nothing | UX | MEDIUM | FIXED | apps/admin | FIX_NOW |
| [[BUG-0494-workspace-hostnames-stayed-pending-for-ever-with-nothing-to-|BUG-0494]] | Workspace hostnames stayed Pending for ever with nothing to explain or reconcile it | STATE_MACHINE | MEDIUM | FIXED | api:tenant-domains, api:super-admin, apps/admin | FIX_NOW |
| [[BUG-0495-the-console-painted-light-on-every-load-before-the-dark-them|BUG-0495]] | The console painted light on every load before the dark theme arrived | UX | MEDIUM | FIXED | apps/admin | FIX_NOW |
| [[BUG-0496-the-monitoring-landing-page-showed-real-data-an-agent-could-|BUG-0496]] | The monitoring landing page showed real data an agent could not act on | UX | MEDIUM | FIXED | apps/admin | FIX_NOW |
| [[BUG-0497-fifteen-modules-offered-no-delete-and-no-reason-for-its-abse|BUG-0497]] | Fifteen modules offered no Delete and no reason for its absence | UX | MEDIUM | FIXED | apps/admin, api:partners, api:platform-runtime | FIX_NOW |
| [[BUG-0534-plan-form-offered-editable-legacy-price-fields-that-bill-nob|BUG-0534]] | Plan form offered editable legacy price fields that bill nobody | UX | MEDIUM | FIXED | super-admin, apps/admin | FIX_NOW |
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
| [[ITEM-0068-legal-documents-have-no-operator-ui-so-publishing-is-a-scrip|ITEM-0068]] | Legal documents have no operator UI, so publishing is a script | UX | MEDIUM | READY | legal, admin | PLAN_REQUIRED |
| [[ITEM-0074-allocate-id-and-session-tooling-accept-a-session-id-that-doe|ITEM-0074]] | allocate-id and session tooling accept a session id that does not exist | INFRA | MEDIUM | READY | framework | PLAN_REQUIRED |
| [[ITEM-0023-tenant-dataregion-populated-from-market-at-provisioning|ITEM-0023]] | Tenant.dataRegion populated from market at provisioning | FOLLOW_UP | LOW | READY | services/api/prisma, api:tenant-control-plane | PLAN_REQUIRED |
| [[BUG-0352-the-tenant-timeline-rendered-every-entry-with-no-count-and-n|BUG-0352]] | The tenant timeline rendered every entry with no count and no paging | UX | LOW | FIXED | apps/admin | FIX_NOW |
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
| Bug records | 122 |
| Backlog items | 76 |
| Known bug patterns | 25 |
| QA runs | 21 |
| Engineering history records | 31 |
| Release records | 0 |
| Module notes | 27 |
| Architecture notes | 20 |
| Decision notes (ADR + generated) | 6 |
| Implementation records | 6 |

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
