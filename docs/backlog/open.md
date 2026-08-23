# Open Backlog

> **Generated file — do not edit by hand.** Rebuild with `node scripts/rebuild-backlog.mjs`.

Active work: bugs that are `OPEN` / `IN_PROGRESS` / `FIXED` (fixed but not yet
QA-verified), and items that are `NEW` / `TRIAGE_REQUIRED` / `READY` /
`IN_PROGRESS` / `VALIDATING`.

The Architect reads this before planning any substantial change —
`BACKLOG_PRECHECK` in [`.agent/agents/architect.md`](../../.agent/agents/architect.md).

## Awaiting Architect triage

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [ITEM-0086](../../docs/backlog/items/ITEM-0086-smoke-deployment-does-not-assert-that-a-launched-market-has-.md) | smoke:deployment does not assert that a launched market has a purchasable price or a running outbox worker | TEST_GAP | HIGH | P2 | TRIAGE_REQUIRED | scripts | FIX_NOW |
| [ITEM-0085](../../docs/backlog/items/ITEM-0085-no-bulk-command-exists-to-sync-plan-prices-to-stripe-so-a-la.md) | No bulk command exists to sync plan prices to Stripe, so a launch needs 36 manual admin edits | INFRA | MEDIUM | P2 | TRIAGE_REQUIRED | api:super-admin | PLAN_REQUIRED |

## CRITICAL

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [BUG-0898](../../docs/bugs/BUG-0898-self-service-checkout-is-blocked-for-every-plan-no-plan-pric.md) | Self-service checkout is blocked for every plan: no plan price has ever been synced to Stripe | BUG | CRITICAL | P0 | OPEN | api:super-admin, app:landing | BLOCKED_EXTERNAL |
| [BUG-0900](../../docs/bugs/BUG-0900-tenant-provisioning-exceeds-the-5s-transaction-timeout-a-pai.md) | Tenant provisioning exceeds the 5s transaction timeout: a paid order is left with no workspace | BUG | CRITICAL | P0 | FIXED | api:permissions | FIX_NOW |
| [BUG-0904](../../docs/bugs/BUG-0904-production-is-missing-outbox-worker-enabled-so-no-workspace-.md) | Production is missing OUTBOX_WORKER_ENABLED, so no workspace is provisioned after payment | BUG | CRITICAL | P0 | OPEN | api:outbox | BLOCKED_EXTERNAL |

## HIGH

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [BUG-0163](../../docs/bugs/BUG-0163-package-lock-json-cannot-be-regenerated-npm-overrides-are-si.md) | package-lock.json cannot be regenerated - npm overrides are silently ignored | INFRA | HIGH | P1 | FIXED | package-lock.json, apps/admin | DONE |
| [BUG-0714](../../docs/bugs/BUG-0714-customer-emails-link-to-the-vercel-app-host-and-api-base-url.md) | Customer emails link to the vercel.app host, and API_BASE_URL is plain HTTP | INFRA | HIGH | P1 | FIXED | services/api, apps/web, docs/deployment | FIX_NOW |
| [BUG-0767](../../docs/bugs/BUG-0767-render-yaml-is-not-what-production-runs-so-no-seed-or-legal-.md) | render.yaml is not what production runs, so no seed or legal publication has ever executed | INFRA | HIGH | P1 | FIXED | render.yaml, services/api/prisma, docs/deployment | DONE |
| [BUG-0792](../../docs/bugs/BUG-0792-qatar-market-resolves-to-gcc-because-its-country-row-is-neve.md) | Qatar market resolves to GCC because its country row is never repaired, so Doha visitors are quoted USD | DATA_INTEGRITY | HIGH | P1 | FIXED | api:super-admin | FIX_NOW |
| [BUG-0793](../../docs/bugs/BUG-0793-checkout-quotes-the-alphabetically-first-plan-price-currency.md) | Checkout quotes the alphabetically first plan price currency instead of the visitor market currency | BUG | HIGH | P1 | FIXED | apps/landing | FIX_NOW |
| [BUG-0794](../../docs/bugs/BUG-0794-plan-record-page-pricing-tab-is-filtered-out-leaving-plan-pr.md) | Plan record page Pricing tab is filtered out, leaving plan price configuration unreachable | UX | HIGH | P1 | FIXED | apps/admin | FIX_NOW |
| [BUG-0901](../../docs/bugs/BUG-0901-a-paid-order-records-totalamount-0-00-for-every-flat-plan-wh.md) | A paid order records totalAmount 0.00 for every FLAT plan while Stripe charges the full price | BUG | HIGH | P1 | FIXED | api:billing | FIX_NOW |
| [BUG-0902](../../docs/bugs/BUG-0902-marktenantready-has-no-caller-so-a-paid-workspace-is-never-m.md) | markTenantReady has no caller, so a paid workspace is never marked ready and its URL is never shown | BUG | HIGH | P1 | FIXED | api:super-admin | FIX_NOW |
| [BUG-0903](../../docs/bugs/BUG-0903-production-runs-stripe-in-test-mode-so-no-real-payment-can-b.md) | Production runs Stripe in test mode, so no real payment can be collected | BUG | HIGH | P1 | OPEN | api:billing | BLOCKED_EXTERNAL |
| [ITEM-0034](../../docs/backlog/items/ITEM-0034-apps-web-has-zero-browser-e2e-coverage.md) | apps/web has zero browser E2E coverage | TEST_GAP | HIGH | P1 | READY | apps/web, e2e | PLAN_REQUIRED |
| [ITEM-0086](../../docs/backlog/items/ITEM-0086-smoke-deployment-does-not-assert-that-a-launched-market-has-.md) | smoke:deployment does not assert that a launched market has a purchasable price or a running outbox worker | TEST_GAP | HIGH | P2 | TRIAGE_REQUIRED | scripts | FIX_NOW |

## MEDIUM

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [ITEM-0044](../../docs/backlog/items/ITEM-0044-validate-forwarded-host-before-tenant-web-workspace-resoluti.md) | Validate forwarded host before tenant web workspace resolution | SECURITY | MEDIUM | P1 | READY | apps/web | PLAN_REQUIRED |
| [BUG-0795](../../docs/bugs/BUG-0795-saved-table-preferences-hide-every-column-added-to-a-module-.md) | Saved table preferences hide every column added to a module afterwards | UX | MEDIUM | P2 | FIXED | apps/admin | FIX_NOW |
| [BUG-0905](../../docs/bugs/BUG-0905-production-defines-direct-url-but-the-code-reads-direct-data.md) | Production defines DIRECT_URL but the code reads DIRECT_DATABASE_URL, so migrations run over the pooled endpoint | BUG | MEDIUM | P2 | OPEN | services/api/prisma, pkg:config | BLOCKED_EXTERNAL |
| [BUG-0907](../../docs/bugs/BUG-0907-an-unknown-legal-slug-answers-200-and-hangs-on-the-loading-s.md) | An unknown legal slug answers 200 and hangs on the loading shell instead of returning 404 | BUG | MEDIUM | P2 | FIXED | apps/landing | FIX_NOW |
| [ITEM-0009](../../docs/backlog/items/ITEM-0009-no-observability-platform-exists.md) | No observability platform exists, so a release cannot be verified from outside | INFRA | MEDIUM | P2 | READY | services/api, apps/web, apps/admin | PLAN_REQUIRED |
| [ITEM-0020](../../docs/backlog/items/ITEM-0020-contract-phase-drop-legacy-plan-pricing-columns.md) | Contract phase: drop legacy Plan pricing columns | TECH_DEBT | MEDIUM | P2 | READY | services/api/prisma, api:super-admin, apps/admin | PLAN_REQUIRED |
| [ITEM-0022](../../docs/backlog/items/ITEM-0022-governed-publish-and-archive-actions-for-commercial-configur.md) | Governed publish and archive actions for commercial configuration | FOLLOW_UP | MEDIUM | P2 | READY | api:super-admin, apps/admin | PLAN_REQUIRED |
| [ITEM-0025](../../docs/backlog/items/ITEM-0025-hidden-writes-remain-on-lookups-and-onboarding-read-paths.md) | Hidden writes remain on lookups and onboarding read paths | TECH_DEBT | MEDIUM | P2 | READY | api:lookups, api:onboarding | PLAN_REQUIRED |
| [ITEM-0026](../../docs/backlog/items/ITEM-0026-desktop-agent-windows-installer-is-unsigned.md) | Desktop agent Windows installer is unsigned | SECURITY | MEDIUM | P2 | READY | apps/agent-desktop | PLAN_REQUIRED |
| [ITEM-0027](../../docs/backlog/items/ITEM-0027-desktop-agent-has-no-retry-backoff-and-no-bounded-give-up.md) | Desktop agent has no retry backoff and no bounded give up | TECH_DEBT | MEDIUM | P2 | READY | apps/agent-desktop, api:agent | PLAN_REQUIRED |
| [ITEM-0036](../../docs/backlog/items/ITEM-0036-decide-the-fate-of-the-inert-runtime-registries-in-apps-web.md) | Decide the fate of the inert runtime registries in apps/web | ARCHITECTURE | MEDIUM | P2 | READY | apps/web | PLAN_REQUIRED |
| [ITEM-0039](../../docs/backlog/items/ITEM-0039-promote-the-csp-from-report-only-to-enforced.md) | Promote the CSP from report-only to enforced | SECURITY | MEDIUM | P2 | READY | pkg:config, apps/web, apps/admin, apps/landing | PLAN_REQUIRED |
| [ITEM-0052](../../docs/backlog/items/ITEM-0052-verify-the-agent-update-feed-against-a-real-published-artefact.md) | Verify the agent update feed against a real published artefact | TEST_GAP | MEDIUM | P2 | READY | apps/agent-desktop, api:app-releases | PLAN_REQUIRED |
| [ITEM-0053](../../docs/backlog/items/ITEM-0053-publish-privacy-policy-and-terms-for-the-public-landing-site.md) | Publish privacy policy and terms for the public landing site | PRODUCT_DECISION | MEDIUM | P2 | READY | apps/landing | FIX_NOW |
| [ITEM-0068](../../docs/backlog/items/ITEM-0068-legal-documents-have-no-operator-ui-so-publishing-is-a-scrip.md) | Legal documents have no operator UI, so publishing is a script | UX | MEDIUM | P2 | READY | legal, admin | PLAN_REQUIRED |
| [ITEM-0074](../../docs/backlog/items/ITEM-0074-allocate-id-and-session-tooling-accept-a-session-id-that-doe.md) | allocate-id and session tooling accept a session id that does not exist | INFRA | MEDIUM | P2 | READY | framework | PLAN_REQUIRED |
| [ITEM-0077](../../docs/backlog/items/ITEM-0077-re-read-the-packaged-agent-archive-after-the-node-pre-gyp-up.md) | Re-read the packaged agent archive after the node-pre-gyp upgrade | TEST_GAP | MEDIUM | P2 | READY | apps/agent-desktop, package-lock.json | PLAN_REQUIRED |
| [ITEM-0078](../../docs/backlog/items/ITEM-0078-no-end-to-end-payment-to-provisioned-tenant-run-against-stri.md) | No end-to-end payment to provisioned tenant run against Stripe test mode | TEST_GAP | MEDIUM | P2 | READY | api:billing, api:tenant-control-plane, api:outbox, apps/landing | PLAN_REQUIRED |
| [ITEM-0081](../../docs/backlog/items/ITEM-0081-nine-test-plans-are-needs-review-against-a-five-day-old-comm.md) | Nine test plans are NEEDS_REVIEW against a five-day-old commit | TEST_GAP | MEDIUM | P2 | READY | docs/qa/test-plans | FIX_NOW |
| [ITEM-0084](../../docs/backlog/items/ITEM-0084-detect-drift-between-render-yaml-and-the-live-render-service.md) | Detect drift between render.yaml and the live Render service | INFRA | MEDIUM | P2 | READY | render.yaml, scripts | FIX_NOW |
| [ITEM-0085](../../docs/backlog/items/ITEM-0085-no-bulk-command-exists-to-sync-plan-prices-to-stripe-so-a-la.md) | No bulk command exists to sync plan prices to Stripe, so a launch needs 36 manual admin edits | INFRA | MEDIUM | P2 | TRIAGE_REQUIRED | api:super-admin | PLAN_REQUIRED |

## LOW and unrated

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [ITEM-0023](../../docs/backlog/items/ITEM-0023-tenant-dataregion-populated-from-market-at-provisioning.md) | Tenant.dataRegion populated from market at provisioning | FOLLOW_UP | LOW | P2 | READY | services/api/prisma, api:tenant-control-plane | PLAN_REQUIRED |
| [BUG-0796](../../docs/bugs/BUG-0796-tenant-and-plan-list-summaries-omit-createdbyid-so-the-creat.md) | Tenant and plan list summaries omit createdById so the Created by me view is always empty | BUG | LOW | P3 | FIXED | api:super-admin | FIX_NOW |
| [ITEM-0049](../../docs/backlog/items/ITEM-0049-register-services-api-environment-reads-or-scope-the-rule.md) | Register services/api environment reads or scope the rule to build inputs | INFRA | LOW | P3 | READY | services/api, turbo.json, docs/deployment | PLAN_REQUIRED |
| [ITEM-0080](../../docs/backlog/items/ITEM-0080-type-the-remaining-services-api-no-unsafe-warnings-module-by.md) | Type the remaining services/api no-unsafe warnings module by module | TECH_DEBT | LOW | P3 | READY | services/api | FIX_NOW |
