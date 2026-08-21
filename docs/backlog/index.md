# Backlog Index

> **Generated file — do not edit by hand.** Rebuild with `node scripts/rebuild-backlog.mjs`.

Every durable Bug and Backlog record in the repository, whatever its state.

**168 records** — 92 bugs under [`docs/bugs/`](../bugs/), 76 non-bug items under [`items/`](items/).

A bug record **is** its own backlog entry. There is no parallel item for it —
see [`README.md`](README.md) for why.

## At a glance

| | Count |
|---|---|
| Open (active work) | 46 |
| Blocked | 1 |
| Deferred | 16 |
| Awaiting a product decision | 6 |
| Completed / closed | 99 |
| **Open CRITICAL** | **0** |
| **Open HIGH** | **15** |
| **Awaiting Architect triage** | **0** |

## Open by severity

| Severity | Count |
|---|---|
| HIGH | 15 |
| MEDIUM | 26 |
| LOW | 5 |

## Open by type

| Type | Count |
|---|---|
| ARCHITECTURE | 2 |
| BUG | 1 |
| DATA_INTEGRITY | 5 |
| DOCUMENTATION | 2 |
| FOLLOW_UP | 3 |
| INFRA | 6 |
| PERFORMANCE | 1 |
| SECURITY | 6 |
| STATE_MACHINE | 1 |
| TECH_DEBT | 6 |
| TEST_GAP | 7 |
| UX | 6 |

## All records by status

| Status | Count |
|---|---|
| OPEN | 7 |
| BLOCKED | 1 |
| DEFERRED | 16 |
| PRODUCT_DECISION | 6 |
| FIXED | 13 |
| VERIFIED | 68 |
| DUPLICATE | 1 |
| READY | 26 |
| DONE | 30 |

## All records

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [BUG-0005](../../docs/bugs/BUG-0005-cross-tenant-error-log-read-via-support-role.md) | A support-role user could read another tenant's error log | TENANT_ISOLATION | CRITICAL | P0 | VERIFIED | api:error-logs | DONE |
| [BUG-0006](../../docs/bugs/BUG-0006-organization-structure-mutable-by-any-authenticated-user.md) | Organization and business-unit structure was mutable by any authenticated user | AUTHORIZATION | CRITICAL | P0 | VERIFIED | api:organization | DONE |
| [BUG-0027](../../docs/bugs/BUG-0027-admin-plan-pricing-and-checkout-pricing-come-from-different-.md) | Admin plan pricing and checkout pricing come from different models | DATA_INTEGRITY | CRITICAL | P0 | VERIFIED | services/api/prisma, apps/admin, apps/landing | DONE |
| [BUG-0030](../../docs/bugs/BUG-0030-plan-list-get-mutates-commercial-pricing-and-can-fail-on-pla.md) | Plan list GET mutates commercial pricing and can fail on PlanPrice unique constraint | DATA_INTEGRITY | CRITICAL | P0 | VERIFIED | services/api, services/api/prisma | DONE |
| [BUG-0047](../../docs/bugs/BUG-0047-seven-bug-records-are-verified-while-their-fixes-exist-only.md) | Seven bug records are VERIFIED while their fixes exist only on unmerged branches | SECURITY | CRITICAL | P0 | VERIFIED | api:organization, api:error-logs, api:employees, api:attendance, docs/qa/regressions | DONE |
| [BUG-0071](../../docs/bugs/BUG-0071-tenant-users-reach-every-platform-super-admin-endpoint.md) | Tenant users reach every platform super-admin endpoint | AUTHORIZATION | CRITICAL | P0 | VERIFIED | super-admin, platform-auth, platform-communications | DONE |
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
| [BUG-0034](../../docs/bugs/BUG-0034-desktop-agent-auto-update-points-at-an-endpoint-that-does-no.md) | Desktop agent auto update points at an endpoint that does not exist | INTEGRATION | HIGH | P1 | VERIFIED | apps/agent-desktop, api:agent, api:app-releases | DONE |
| [BUG-0035](../../docs/bugs/BUG-0035-desktop-agent-logout-never-revokes-the-refresh-token.md) | Desktop agent logout never revokes the refresh token | SECURITY | HIGH | P1 | VERIFIED | apps/agent-desktop, api:agent | DONE |
| [BUG-0036](../../docs/bugs/BUG-0036-agent-heartbeat-has-no-idempotency-so-retries-double-count-p.md) | Agent heartbeat has no idempotency so retries double count productivity | DATA_INTEGRITY | HIGH | P1 | VERIFIED | api:agent, services/api/prisma, apps/agent-desktop | DONE |
| [BUG-0039](../../docs/bugs/BUG-0039-employee-payslip-and-bank-account-proxies-return-the-callers.md) | Employee payslip and bank account proxies return the callers own data on 403 | DATA_INTEGRITY | HIGH | P1 | VERIFIED | apps/web, api:payroll, api:employees | DONE |
| [BUG-0048](../../docs/bugs/BUG-0048-partner-inquiry-form-rejects-every-submission-that-leaves-th.md) | Partner inquiry form rejects every submission that leaves the optional website blank | BUG | HIGH | P1 | VERIFIED | apps/landing, api:partner-experience | DONE |
| [BUG-0060](../../docs/bugs/BUG-0060-stale-generated-prisma-client-breaks-local-api-development.md) | A stale generated Prisma client breaks local API development with 60 misleading errors | INFRA | HIGH | P1 | VERIFIED | services/api, scripts, package.json | DONE |
| [BUG-0061](../../docs/bugs/BUG-0061-landing-home-and-subscribe-pages-return-500-when-the-plans-f.md) | Landing home and subscribe pages return 500 when the plans fetch fails | BUG | HIGH | P1 | VERIFIED | apps/landing | DONE |
| [BUG-0062](../../docs/bugs/BUG-0062-landing-mobile-navigation-menu-stays-open-after-navigating-a.md) | Landing mobile navigation menu stays open after navigating and ignores Escape | UX | HIGH | P1 | VERIFIED | apps/landing | DONE |
| [BUG-0063](../../docs/bugs/BUG-0063-request-demo-form-blocks-submission-with-no-feedback-and-is-.md) | Request demo form blocks submission with no feedback and is unusable by assistive technology | UX | HIGH | P1 | VERIFIED | apps/landing | DONE |
| [BUG-0064](../../docs/bugs/BUG-0064-landing-public-pages-fail-wcag-bypass-blocks-and-text-contra.md) | Landing public pages fail WCAG bypass blocks and text contrast on every route | UX | HIGH | P1 | VERIFIED | apps/landing | DONE |
| [BUG-0068](../../docs/bugs/BUG-0068-prisma-client-freshness-check-is-blind-to-field-level-drift.md) | Prisma client freshness check is blind to field-level drift | INFRA | HIGH | P1 | VERIFIED | scripts, services/api | DONE |
| [BUG-0070](../../docs/bugs/BUG-0070-outbox-deduplication-aborted-the-caller-transaction-on-postg.md) | Outbox deduplication aborted the caller transaction on PostgreSQL | BUG | HIGH | P1 | VERIFIED | outbox | DONE |
| [BUG-0072](../../docs/bugs/BUG-0072-platform-mutations-map-to-read-permissions-letting-the-read-.md) | Platform mutations map to read permissions, letting the read-only auditor write | AUTHORIZATION | HIGH | P1 | VERIFIED | super-admin, platform-auth | DONE |
| [BUG-0075](../../docs/bugs/BUG-0075-public-subscribe-checkout-has-no-rate-limit-and-the-invarian.md) | Public subscribe checkout has no rate limit and the invariant that should catch it is inert | SECURITY | HIGH | P1 | FIXED | billing, common/guards | FIX_NOW |
| [BUG-0076](../../docs/bugs/BUG-0076-repository-health-never-inspected-the-primary-worktree-so-a-.md) | Repository health never inspected the primary worktree, so a clean task worktree passed as CLEANUP_STATUS DONE | INFRA | HIGH | P1 | FIXED | scripts/repo-health.mjs, scripts/session.mjs | FIX_NOW |
| [BUG-0077](../../docs/bugs/BUG-0077-public-subscribe-creates-a-tenant-and-a-second-customeraccou.md) | Public subscribe creates a Tenant and a second CustomerAccount before payment | DATA_INTEGRITY | HIGH | P1 | FIXED | billing, super-admin, tenants | FIX_NOW |
| [BUG-0078](../../docs/bugs/BUG-0078-provisioning-requested-has-no-consumer-so-a-paid-self-servic.md) | PROVISIONING_REQUESTED has no consumer so a paid self-service customer is never provisioned | STATE_MACHINE | HIGH | P1 | FIXED | billing, outbox, super-admin | FIX_NOW |
| [BUG-0079](../../docs/bugs/BUG-0079-browser-e2e-spends-its-whole-install-step-on-apt-work-that-i.md) | Browser e2e spends its whole install step on apt work that installs no browser library | PERFORMANCE | HIGH | P1 | FIXED | .github/workflows, e2e | FIX_NOW |
| [BUG-0080](../../docs/bugs/BUG-0080-seeded-prices-bill-a-flat-fee-while-the-terms-say-the-billab.md) | Seeded prices bill a flat fee while the Terms say the billable unit is an active employee | DATA_INTEGRITY | HIGH | P1 | FIXED | billing, super-admin, legal | FIX_NOW |
| [BUG-0082](../../docs/bugs/BUG-0082-the-onboarding-wizard-collects-five-steps-of-data-it-cannot-.md) | The onboarding wizard collects five steps of data it cannot submit | UX | HIGH | P1 | FIXED | landing | FIX_NOW |
| [BUG-0083](../../docs/bugs/BUG-0083-the-database-agent-preflight-reports-pass-on-a-database-with.md) | The Database Agent preflight reports PASS on a database with every migration unapplied | INFRA | HIGH | P1 | VERIFIED | scripts, .agent, services/api | DONE |
| [BUG-0085](../../docs/bugs/BUG-0085-the-release-command-aborted-a-first-deploy-and-otherwise-res.md) | The release command aborted a first deploy, and otherwise reset the super admin password | INFRA | HIGH | P1 | VERIFIED | platform-users, legal | DONE |
| [BUG-0086](../../docs/bugs/BUG-0086-prisma-migrate-deploy-cannot-acquire-its-advisory-lock-throu.md) | Prisma migrate deploy cannot acquire its advisory lock through Neon pooled endpoint | INFRA | HIGH | P1 | OPEN | services/api/prisma | FIX_NOW |
| [BUG-0163](../../docs/bugs/BUG-0163-package-lock-json-cannot-be-regenerated-npm-overrides-are-si.md) | package-lock.json cannot be regenerated - npm overrides are silently ignored | INFRA | HIGH | P1 | PRODUCT_DECISION | package-lock.json, apps/admin | PRODUCT_DECISION |
| [BUG-0220](../../docs/bugs/BUG-0220-saving-a-plan-from-the-runtime-record-page-always-returns-40.md) | Saving a plan from the runtime record page always returns 400 | BUG | HIGH | P1 | FIXED | apps/admin, api:platform-runtime, api:super-admin | FIX_NOW |
| [BUG-0280](../../docs/bugs/BUG-0280-self-service-checkout-leaves-a-customer-with-no-plan-billing.md) | Self-service checkout leaves a customer with no plan, billing cycle or origin channel | DATA_INTEGRITY | HIGH | P1 | FIXED | api:billing, api:super-admin, apps/admin | FIX_NOW |
| [BUG-0282](../../docs/bugs/BUG-0282-the-platform-runtime-schema-manifest-drifted-from-schema-pri.md) | The platform runtime schema manifest drifted from schema.prisma and no check noticed | DATA_INTEGRITY | HIGH | P1 | FIXED | pkg:config, apps/admin, services/api/prisma | FIX_NOW |
| [ITEM-0001](../../docs/backlog/items/ITEM-0001-no-browser-e2e-tooling-exists.md) | No browser E2E tooling exists in any workspace | TEST_GAP | HIGH | P1 | DONE | apps/web, apps/admin, apps/landing | DONE |
| [ITEM-0004](../../docs/backlog/items/ITEM-0004-tenant-activation-never-proven-end-to-end.md) | Tenant activation to ACTIVE has never been reached in any test | TEST_GAP | HIGH | P1 | READY | api:tenant-control-plane | FIX_NOW |
| [ITEM-0034](../../docs/backlog/items/ITEM-0034-apps-web-has-zero-browser-e2e-coverage.md) | apps/web has zero browser E2E coverage | TEST_GAP | HIGH | P1 | READY | apps/web, e2e | PLAN_REQUIRED |
| [ITEM-0047](../../docs/backlog/items/ITEM-0047-database-e2e-suites-fail-against-an-ephemeral-postgresql.md) | Database e2e suites fail against an ephemeral PostgreSQL | TEST_GAP | HIGH | P1 | DONE | services/api/test, .github/workflows, database | DONE |
| [ITEM-0062](../../docs/backlog/items/ITEM-0062-no-multi-tenant-membership-one-user-belongs-to-one-tenant-so.md) | No multi-tenant membership — one user belongs to one tenant, so discovery and switching cannot exist | ARCHITECTURE | HIGH | P1 | READY | auth, users, tenant-domains, web | PLAN_REQUIRED |
| [ITEM-0063](../../docs/backlog/items/ITEM-0063-self-service-checkout-must-prove-the-owner-email-before-char.md) | Self-service checkout must prove the owner email before charging | SECURITY | HIGH | P1 | DONE | billing, platform-communications, landing | DONE |
| [ITEM-0048](../../docs/backlog/items/ITEM-0048-replace-or-contain-active-win-and-the-xlsx-export-path.md) | Replace or contain active-win and the xlsx export path | SECURITY | HIGH | P2 | BLOCKED | apps/agent-desktop, services/api/src/common/excel, package-lock.json | BLOCKED_EXTERNAL |
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
| [BUG-0065](../../docs/bugs/BUG-0065-public-commercial-config-omits-featurecatalog-when-no-market.md) | Public commercial-config omits featureCatalog when no market resolves | BUG | MEDIUM | P2 | VERIFIED | api:billing, apps/landing | DONE |
| [BUG-0066](../../docs/bugs/BUG-0066-subscribe-page-renders-an-editable-form-with-no-way-to-submi.md) | Subscribe page renders an editable form with no way to submit when checkout is unavailable | UX | MEDIUM | P2 | VERIFIED | apps/landing | DONE |
| [BUG-0073](../../docs/bugs/BUG-0073-small-uppercase-labels-in-slate-400-fail-wcag-aa-contrast-ac.md) | Small uppercase labels in slate-400 fail WCAG AA contrast across admin | UX | MEDIUM | P2 | VERIFIED | apps/admin | DONE |
| [BUG-0074](../../docs/bugs/BUG-0074-the-provisioning-queue-scroll-container-was-unreachable-by-k.md) | The provisioning queue scroll container was unreachable by keyboard | UX | MEDIUM | P2 | VERIFIED | apps/admin | DONE |
| [BUG-0081](../../docs/bugs/BUG-0081-three-apps-claimed-a-forwarded-headers-invariant-test-that-d.md) | Three apps claimed a forwarded-headers invariant test that did not exist | TEST_GAP | MEDIUM | P2 | FIXED | landing, web, admin | FIX_NOW |
| [BUG-0084](../../docs/bugs/BUG-0084-seven-unique-constraints-in-schema-prisma-are-absent-from-th.md) | Seven unique constraints in schema.prisma are absent from the migration chain | DATA_INTEGRITY | MEDIUM | P2 | DEFERRED | contracts, partner-experience, support-cases, approvals, tenant-settings | DEFER |
| [BUG-0221](../../docs/bugs/BUG-0221-schema-completed-form-fields-render-on-a-tab-the-form-never-.md) | Schema-completed form fields render on a tab the form never declares | UX | MEDIUM | P2 | FIXED | apps/admin | FIX_NOW |
| [BUG-0222](../../docs/bugs/BUG-0222-plan-related-record-panels-declare-no-tab-so-they-never-rend.md) | Plan related-record panels declare no tab, so they never render | UX | MEDIUM | P2 | FIXED | apps/admin | FIX_NOW |
| [BUG-0223](../../docs/bugs/BUG-0223-admin-cannot-set-a-plan-ispublic-flag-which-gates-self-servi.md) | Admin cannot set a plan isPublic flag which gates self-service checkout | UX | MEDIUM | P2 | PRODUCT_DECISION | apps/admin, api:super-admin, api:billing | PRODUCT_DECISION |
| [BUG-0281](../../docs/bugs/BUG-0281-partner-attribution-is-lost-when-a-referred-buyer-purchases-.md) | Partner attribution is lost when a referred buyer purchases through self-service checkout | DATA_INTEGRITY | MEDIUM | P2 | OPEN | apps/landing, api:billing, api:partner-experience | PLAN_REQUIRED |
| [BUG-0283](../../docs/bugs/BUG-0283-a-regenerated-prisma-client-against-an-un-migrated-database-.md) | A regenerated Prisma client against an un-migrated database 500s every affected screen | INFRA | MEDIUM | P2 | OPEN | services/api, services/api/prisma, apps/admin | PLAN_REQUIRED |
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
| [ITEM-0046](../../docs/backlog/items/ITEM-0046-add-landing-loading-error-and-not-found-boundaries.md) | Add landing loading error and not-found boundaries | UX | MEDIUM | P2 | DONE | apps/landing | DONE |
| [ITEM-0050](../../docs/backlog/items/ITEM-0050-move-payroll-derivation-and-branding-upload-orchestration-out.md) | Move payroll derivation and branding upload orchestration out of web proxies | TECH_DEBT | MEDIUM | P2 | READY | apps/web, api:compensation, api:tenant-settings | PLAN_REQUIRED |
| [ITEM-0051](../../docs/backlog/items/ITEM-0051-align-landing-public-form-conventions-and-minor-accessibilit.md) | Align landing public form conventions and minor accessibility gaps | UX | MEDIUM | P2 | DONE | apps/landing | DONE |
| [ITEM-0052](../../docs/backlog/items/ITEM-0052-verify-the-agent-update-feed-against-a-real-published-artefact.md) | Verify the agent update feed against a real published artefact | TEST_GAP | MEDIUM | P2 | READY | apps/agent-desktop, api:app-releases | PLAN_REQUIRED |
| [ITEM-0053](../../docs/backlog/items/ITEM-0053-publish-privacy-policy-and-terms-for-the-public-landing-site.md) | Publish privacy policy and terms for the public landing site | PRODUCT_DECISION | MEDIUM | P2 | PRODUCT_DECISION | apps/landing | PRODUCT_DECISION |
| [ITEM-0054](../../docs/backlog/items/ITEM-0054-contract-placeholder-examples-fabricate-a-saudi-legal-entity.md) | Contract placeholder examples fabricate a Saudi legal entity, CR number and tax ID | DOCUMENTATION | MEDIUM | P2 | DEFERRED | contracts | DEFER |
| [ITEM-0055](../../docs/backlog/items/ITEM-0055-database-e2e-runs-serially-and-now-dominates-its-own-job.md) | Database e2e runs serially and now dominates its own job | PERFORMANCE | MEDIUM | P2 | DEFERRED | api, ci | DEFER |
| [ITEM-0060](../../docs/backlog/items/ITEM-0060-schema-prisma-and-the-applied-migration-history-do-not-agree.md) | schema.prisma and the applied migration history do not agree | TECH_DEBT | MEDIUM | P2 | DEFERRED | prisma, timesheets, attendance, payroll, billing | DEFER |
| [ITEM-0068](../../docs/backlog/items/ITEM-0068-legal-documents-have-no-operator-ui-so-publishing-is-a-scrip.md) | Legal documents have no operator UI, so publishing is a script | UX | MEDIUM | P2 | READY | legal, admin | PLAN_REQUIRED |
| [ITEM-0069](../../docs/backlog/items/ITEM-0069-a-global-identity-lock-can-be-triggered-by-an-unauthenticate.md) | A global identity lock can be triggered by an unauthenticated attacker | SECURITY | MEDIUM | P2 | DONE | auth, users | DONE |
| [ITEM-0071](../../docs/backlog/items/ITEM-0071-a-terminal-bug-record-may-claim-fixed-while-its-resolution-s.md) | A terminal bug record may claim FIXED while its Resolution says pending | TEST_GAP | MEDIUM | P2 | DONE | scripts | DONE |
| [ITEM-0073](../../docs/backlog/items/ITEM-0073-agent-role-names-are-spelled-inconsistently-across-bug-and-t.md) | Agent role names are spelled inconsistently across bug and task records | TECH_DEBT | MEDIUM | P2 | DEFERRED | framework | DEFER |
| [ITEM-0074](../../docs/backlog/items/ITEM-0074-allocate-id-and-session-tooling-accept-a-session-id-that-doe.md) | allocate-id and session tooling accept a session id that does not exist | INFRA | MEDIUM | P2 | READY | framework | PLAN_REQUIRED |
| [ITEM-0076](../../docs/backlog/items/ITEM-0076-operators-cannot-recover-an-order-whose-stripe-webhook-never.md) | Operators cannot recover an order whose Stripe webhook never arrived | PRODUCT_DECISION | MEDIUM | P2 | PRODUCT_DECISION | api:billing, apps/admin | PRODUCT_DECISION |
| [ITEM-0021](../../docs/backlog/items/ITEM-0021-mechanical-guard-against-country-and-currency-literals-in-fr.md) | Mechanical guard against country and currency literals in frontends | TEST_GAP | LOW | P2 | DONE | scripts, apps/landing, apps/web, apps/admin | DONE |
| [ITEM-0023](../../docs/backlog/items/ITEM-0023-tenant-dataregion-populated-from-market-at-provisioning.md) | Tenant.dataRegion populated from market at provisioning | FOLLOW_UP | LOW | P2 | READY | services/api/prisma, api:tenant-control-plane | PLAN_REQUIRED |
| [ITEM-0024](../../docs/backlog/items/ITEM-0024-landing-depends-on-lucide-react-without-declaring-it.md) | Landing depends on lucide-react without declaring it | TECH_DEBT | LOW | P2 | DONE | apps/landing | DONE |
| [ITEM-0070](../../docs/backlog/items/ITEM-0070-move-the-excel-write-path-off-xlsx-and-drop-the-dependency.md) | Move the Excel write path off xlsx and drop the dependency | SECURITY | LOW | P2 | DEFERRED | payroll, timesheets | DEFER |
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
| [ITEM-0056](../../docs/backlog/items/ITEM-0056-ci-cache-hit-rate-is-not-observable-from-the-actions-rest-ap.md) | CI cache hit rate is not observable from the Actions REST API | INFRA | LOW | P3 | DEFERRED | ci | DEFER |
| [ITEM-0061](../../docs/backlog/items/ITEM-0061-notification-coverage-is-asymmetric-seat-change-applied-and-.md) | Notification coverage is asymmetric — SEAT_CHANGE_APPLIED and SUBSCRIPTION_TERMINATED notify nobody | FOLLOW_UP | LOW | P3 | DEFERRED | notifications, billing | DEFER |
| [ITEM-0064](../../docs/backlog/items/ITEM-0064-unscoped-duplicate-planprice-rows-shadow-every-real-price.md) | Unscoped duplicate PlanPrice rows shadow every real price | TECH_DEBT | LOW | P3 | DEFERRED | billing, super-admin | DEFER |
| [ITEM-0065](../../docs/backlog/items/ITEM-0065-two-e2e-suites-still-borrow-a-customeraccount-which-is-what-.md) | Two e2e suites still borrow a CustomerAccount, which is what blocks parallel execution | TEST_GAP | LOW | P3 | DEFERRED | services/api/test | DEFER |
| [ITEM-0066](../../docs/backlog/items/ITEM-0066-verify-database-mjs-cannot-spawn-npm-on-windows.md) | verify-database.mjs cannot spawn npm on Windows | TECH_DEBT | LOW | P3 | DEFERRED | scripts | DEFER |
| [ITEM-0067](../../docs/backlog/items/ITEM-0067-three-e2e-suites-need-two-seeded-tenants-and-no-seed-produce.md) | Three e2e suites need two seeded tenants and no seed produces them | TEST_GAP | LOW | P3 | DUPLICATE | attendance, attendance-integrations, agent | DUPLICATE |
| [ITEM-0072](../../docs/backlog/items/ITEM-0072-six-published-self-service-prices-with-no-market-and-a-zero-.md) | Six published self-service prices with no market and a zero amount exist on every database | TECH_DEBT | LOW | P3 | DEFERRED | billing, super-admin | DEFER |
| [ITEM-0075](../../docs/backlog/items/ITEM-0075-the-subscribe-wizard-never-collects-companysize-which-the-ap.md) | The subscribe wizard never collects companySize, which the API and Customers module both expect | UX | LOW | P3 | DEFERRED | apps/landing, api:billing | DEFER |
| [ITEM-0057](../../docs/backlog/items/ITEM-0057-landing-production-env-examples-still-name-the-vercel-and-re.md) | Landing production env examples still name the vercel and render hosts, not the dijipeople.com apex | PRODUCT_DECISION | — | P2 | PRODUCT_DECISION | apps/landing | PRODUCT_DECISION |
| [ITEM-0058](../../docs/backlog/items/ITEM-0058-next-env-d-ts-churns-between-dev-and-build-forms-and-the-fou.md) | next-env.d.ts churns between dev and build forms and the four apps disagree | TECH_DEBT | — | P3 | DEFERRED | apps/landing, apps/web, apps/admin | DEFER |
| [ITEM-0059](../../docs/backlog/items/ITEM-0059-49-tracked-text-files-have-no-final-newline-and-nothing-enfo.md) | 49 tracked text files have no final newline, and nothing enforces one | TECH_DEBT | — | P3 | DEFERRED | apps/admin, apps/web, apps/agent-desktop | DEFER |

## Views

- [Open](open.md) — active work
- [Blocked](blocked.md) — waiting on something external
- [Deferred](deferred.md) — deliberately not now
- [Product decisions](product-decisions.md) — waiting on a human product call
- [Completed](completed.md) — fixed, verified, closed, cancelled or accepted
