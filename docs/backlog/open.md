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
| [BUG-0052](../../docs/bugs/BUG-0052-production-dependency-graph-carries-critical-and-high-securi.md) | Production dependency graph carries critical and high security advisories | SECURITY | HIGH | P0 | OPEN | package-lock.json, apps/agent-desktop, apps/web, apps/admin, apps/landing, services/api | FIX_NOW |
| [BUG-0075](../../docs/bugs/BUG-0075-public-subscribe-checkout-has-no-rate-limit-and-the-invarian.md) | Public subscribe checkout has no rate limit and the invariant that should catch it is inert | SECURITY | HIGH | P1 | FIXED | billing, common/guards | FIX_NOW |
| [BUG-0076](../../docs/bugs/BUG-0076-repository-health-never-inspected-the-primary-worktree-so-a-.md) | Repository health never inspected the primary worktree, so a clean task worktree passed as CLEANUP_STATUS DONE | INFRA | HIGH | P1 | FIXED | scripts/repo-health.mjs, scripts/session.mjs | FIX_NOW |
| [BUG-0077](../../docs/bugs/BUG-0077-public-subscribe-creates-a-tenant-and-a-second-customeraccou.md) | Public subscribe creates a Tenant and a second CustomerAccount before payment | DATA_INTEGRITY | HIGH | P1 | FIXED | billing, super-admin, tenants | FIX_NOW |
| [BUG-0078](../../docs/bugs/BUG-0078-provisioning-requested-has-no-consumer-so-a-paid-self-servic.md) | PROVISIONING_REQUESTED has no consumer so a paid self-service customer is never provisioned | STATE_MACHINE | HIGH | P1 | FIXED | billing, outbox, super-admin | FIX_NOW |
| [BUG-0079](../../docs/bugs/BUG-0079-browser-e2e-spends-its-whole-install-step-on-apt-work-that-i.md) | Browser e2e spends its whole install step on apt work that installs no browser library | PERFORMANCE | HIGH | P1 | FIXED | .github/workflows, e2e | FIX_NOW |
| [BUG-0080](../../docs/bugs/BUG-0080-seeded-prices-bill-a-flat-fee-while-the-terms-say-the-billab.md) | Seeded prices bill a flat fee while the Terms say the billable unit is an active employee | DATA_INTEGRITY | HIGH | P1 | FIXED | billing, super-admin, legal | FIX_NOW |
| [BUG-0082](../../docs/bugs/BUG-0082-the-onboarding-wizard-collects-five-steps-of-data-it-cannot-.md) | The onboarding wizard collects five steps of data it cannot submit | UX | HIGH | P1 | FIXED | landing | FIX_NOW |
| [BUG-0086](../../docs/bugs/BUG-0086-prisma-migrate-deploy-cannot-acquire-its-advisory-lock-throu.md) | Prisma migrate deploy cannot acquire its advisory lock through Neon pooled endpoint | INFRA | HIGH | P1 | OPEN | services/api/prisma | FIX_NOW |
| [ITEM-0004](../../docs/backlog/items/ITEM-0004-tenant-activation-never-proven-end-to-end.md) | Tenant activation to ACTIVE has never been reached in any test | TEST_GAP | HIGH | P1 | READY | api:tenant-control-plane | FIX_NOW |
| [ITEM-0034](../../docs/backlog/items/ITEM-0034-apps-web-has-zero-browser-e2e-coverage.md) | apps/web has zero browser E2E coverage | TEST_GAP | HIGH | P1 | READY | apps/web, e2e | PLAN_REQUIRED |
| [ITEM-0062](../../docs/backlog/items/ITEM-0062-no-multi-tenant-membership-one-user-belongs-to-one-tenant-so.md) | No multi-tenant membership — one user belongs to one tenant, so discovery and switching cannot exist | ARCHITECTURE | HIGH | P1 | READY | auth, users, tenant-domains, web | PLAN_REQUIRED |
| [ITEM-0048](../../docs/backlog/items/ITEM-0048-replace-or-contain-active-win-and-the-xlsx-export-path.md) | Replace or contain active-win and the xlsx export path | SECURITY | HIGH | P2 | READY | apps/agent-desktop, services/api/src/common/excel, package-lock.json | PLAN_REQUIRED |

## MEDIUM

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [ITEM-0044](../../docs/backlog/items/ITEM-0044-validate-forwarded-host-before-tenant-web-workspace-resoluti.md) | Validate forwarded host before tenant web workspace resolution | SECURITY | MEDIUM | P1 | READY | apps/web | PLAN_REQUIRED |
| [BUG-0041](../../docs/bugs/BUG-0041-web-route-proxies-make-authorization-and-business-decisions.md) | Web route proxies make authorization and business decisions | SECURITY | MEDIUM | P2 | OPEN | apps/web | PLAN_REQUIRED |
| [BUG-0043](../../docs/bugs/BUG-0043-web-dialogs-have-no-focus-trap-and-filter-controls-are-unlab.md) | Web dialogs have no focus trap and filter controls are unlabelled | UX | MEDIUM | P2 | OPEN | apps/web | PLAN_REQUIRED |
| [BUG-0045](../../docs/bugs/BUG-0045-the-canonical-settings-and-branding-contract-is-materially-s.md) | The canonical settings and branding contract is materially stale | DOCUMENTATION | MEDIUM | P2 | OPEN | apps/web, docs/architecture | PLAN_REQUIRED |
| [BUG-0081](../../docs/bugs/BUG-0081-three-apps-claimed-a-forwarded-headers-invariant-test-that-d.md) | Three apps claimed a forwarded-headers invariant test that did not exist | TEST_GAP | MEDIUM | P2 | FIXED | landing, web, admin | FIX_NOW |
| [ITEM-0002](../../docs/backlog/items/ITEM-0002-no-live-api-session-test-harness.md) | Live API session and database proof for admin sign-out | TEST_GAP | MEDIUM | P2 | READY | services/api, apps/admin | FIX_NOW |
| [ITEM-0003](../../docs/backlog/items/ITEM-0003-tenant-erasure-never-exercised-against-a-database.md) | Tenant erasure has no cross-tenant survival assertion | TEST_GAP | MEDIUM | P2 | READY | api:tenant-control-plane | FIX_NOW |
| [ITEM-0009](../../docs/backlog/items/ITEM-0009-no-observability-platform-exists.md) | No observability platform exists, so a release cannot be verified from outside | INFRA | MEDIUM | P2 | READY | services/api, apps/web, apps/admin | PLAN_REQUIRED |
| [ITEM-0020](../../docs/backlog/items/ITEM-0020-contract-phase-drop-legacy-plan-pricing-columns.md) | Contract phase: drop legacy Plan pricing columns | TECH_DEBT | MEDIUM | P2 | READY | services/api/prisma, api:super-admin, apps/admin | PLAN_REQUIRED |
| [ITEM-0022](../../docs/backlog/items/ITEM-0022-governed-publish-and-archive-actions-for-commercial-configur.md) | Governed publish and archive actions for commercial configuration | FOLLOW_UP | MEDIUM | P2 | READY | api:super-admin, apps/admin | PLAN_REQUIRED |
| [ITEM-0025](../../docs/backlog/items/ITEM-0025-hidden-writes-remain-on-lookups-and-onboarding-read-paths.md) | Hidden writes remain on lookups and onboarding read paths | TECH_DEBT | MEDIUM | P2 | READY | api:lookups, api:onboarding | PLAN_REQUIRED |
| [ITEM-0026](../../docs/backlog/items/ITEM-0026-desktop-agent-windows-installer-is-unsigned.md) | Desktop agent Windows installer is unsigned | SECURITY | MEDIUM | P2 | READY | apps/agent-desktop | PLAN_REQUIRED |
| [ITEM-0027](../../docs/backlog/items/ITEM-0027-desktop-agent-has-no-retry-backoff-and-no-bounded-give-up.md) | Desktop agent has no retry backoff and no bounded give up | TECH_DEBT | MEDIUM | P2 | READY | apps/agent-desktop, api:agent | PLAN_REQUIRED |
| [ITEM-0031](../../docs/backlog/items/ITEM-0031-replace-remaining-native-prompts-for-governed-input.md) | Replace remaining native prompts for governed input | UX | MEDIUM | P2 | READY | apps/admin, apps/web | FIX_NOW |
| [ITEM-0033](../../docs/backlog/items/ITEM-0033-add-a-test-runner-and-unit-coverage-to-apps-agent-desktop.md) | Add a test runner and unit coverage to apps/agent-desktop | TEST_GAP | MEDIUM | P2 | READY | apps/agent-desktop | FIX_NOW |
| [ITEM-0035](../../docs/backlog/items/ITEM-0035-web-route-handlers-flatten-upstream-error-status-to-500.md) | Web route handlers flatten upstream error status to 500 | TECH_DEBT | MEDIUM | P2 | READY | apps/web | FIX_NOW |
| [ITEM-0036](../../docs/backlog/items/ITEM-0036-decide-the-fate-of-the-inert-runtime-registries-in-apps-web.md) | Decide the fate of the inert runtime registries in apps/web | ARCHITECTURE | MEDIUM | P2 | READY | apps/web | PLAN_REQUIRED |
| [ITEM-0039](../../docs/backlog/items/ITEM-0039-promote-the-csp-from-report-only-to-enforced.md) | Promote the CSP from report-only to enforced | SECURITY | MEDIUM | P2 | READY | pkg:config, apps/web, apps/admin, apps/landing | PLAN_REQUIRED |
| [ITEM-0050](../../docs/backlog/items/ITEM-0050-move-payroll-derivation-and-branding-upload-orchestration-out.md) | Move payroll derivation and branding upload orchestration out of web proxies | TECH_DEBT | MEDIUM | P2 | READY | apps/web, api:compensation, api:tenant-settings | PLAN_REQUIRED |
| [ITEM-0052](../../docs/backlog/items/ITEM-0052-verify-the-agent-update-feed-against-a-real-published-artefact.md) | Verify the agent update feed against a real published artefact | TEST_GAP | MEDIUM | P2 | READY | apps/agent-desktop, api:app-releases | PLAN_REQUIRED |
| [ITEM-0068](../../docs/backlog/items/ITEM-0068-legal-documents-have-no-operator-ui-so-publishing-is-a-scrip.md) | Legal documents have no operator UI, so publishing is a script | UX | MEDIUM | P2 | READY | legal, admin | PLAN_REQUIRED |

## LOW and unrated

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [ITEM-0023](../../docs/backlog/items/ITEM-0023-tenant-dataregion-populated-from-market-at-provisioning.md) | Tenant.dataRegion populated from market at provisioning | FOLLOW_UP | LOW | P2 | READY | services/api/prisma, api:tenant-control-plane | PLAN_REQUIRED |
| [ITEM-0015](../../docs/backlog/items/ITEM-0015-make-the-tenant-readiness-assertion-auditable.md) | Make the tenant readiness() authorization assertion auditable | FOLLOW_UP | LOW | P3 | READY | api:tenant-control-plane | FIX_NOW |
| [ITEM-0042](../../docs/backlog/items/ITEM-0042-burn-down-the-services-api-eslint-warning-baseline.md) | Burn down the services/api ESLint warning baseline | TECH_DEBT | LOW | P3 | READY | services/api | FIX_NOW |
| [ITEM-0045](../../docs/backlog/items/ITEM-0045-reconcile-tenant-web-root-domain-environment-examples.md) | Reconcile tenant web root-domain environment examples | DOCUMENTATION | LOW | P3 | READY | apps/web | FIX_NOW |
| [ITEM-0049](../../docs/backlog/items/ITEM-0049-register-services-api-environment-reads-or-scope-the-rule.md) | Register services/api environment reads or scope the rule to build inputs | INFRA | LOW | P3 | READY | services/api, turbo.json, docs/deployment | PLAN_REQUIRED |
