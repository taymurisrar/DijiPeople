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
| [BUG-0900](../../docs/bugs/BUG-0900-tenant-provisioning-exceeds-the-5s-transaction-timeout-a-pai.md) | Tenant provisioning exceeds the 5s transaction timeout: a paid order is left with no workspace | BUG | CRITICAL | P0 | FIXED | api:permissions | FIX_NOW |
| [BUG-1128](../../docs/bugs/BUG-1128-stripe-api-version-skew-invoice-paid-cannot-map-to-a-subscri.md) | Stripe API version skew: invoice.paid cannot map to a subscription because invoice.subscription no longer exists | INTEGRATION | CRITICAL | P0 | FIXED | api:billing | FIX_NOW |
| [BUG-1742](../../docs/bugs/BUG-1742-lead-creation-is-impossible-the-runtime-form-always-sends-pa.md) | Lead creation is impossible: the runtime form always sends partnerId as an empty string | BUG | CRITICAL | P0 | FIXED | apps/admin, api:platform-runtime, api:super-admin | FIX_NOW |
| [BUG-1743](../../docs/bugs/BUG-1743-customers-and-partners-cannot-be-edited-the-runtime-form-ech.md) | Customers and partners cannot be edited: the runtime form echoes fields the update DTO forbids | BUG | CRITICAL | P0 | FIXED | apps/admin, api:platform-runtime, api:super-admin | FIX_NOW |
| [BUG-1744](../../docs/bugs/BUG-1744-every-subscription-has-a-zero-length-billing-period-and-a-re.md) | Every subscription has a zero-length billing period and a renewal date in the past | DATA_INTEGRITY | CRITICAL | P0 | FIXED | api:super-admin, api:billing, integration:stripe | FIX_NOW |
| [BUG-1494](../../docs/bugs/BUG-1494-git-worktree-remove-follows-node-modules-junctions-and-delet.md) | git worktree remove follows node_modules junctions and deletes the primary checkout | INFRA | CRITICAL | P1 | FIXED | scripts | DONE |

## HIGH

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [BUG-1203](../../docs/bugs/BUG-1203-repo-health-reports-changed-by-this-task-for-another-session.md) | repo-health reports CHANGED_BY_THIS_TASK for another session's merge | INFRA | HIGH | P1 | FIXED | framework | FIX_NOW |
| [BUG-1420](../../docs/bugs/BUG-1420-the-monitoring-severity-filter-cannot-match-99-7-percent-of-.md) | The monitoring severity filter cannot match 99.7 percent of stored incidents | DATA_INTEGRITY | HIGH | P1 | FIXED | apps/admin, api:error-logs | FIX_NOW |
| [BUG-1423](../../docs/bugs/BUG-1423-runtime-form-controls-have-no-accessible-name-so-screen-read.md) | Runtime form controls have no accessible name so screen readers announce every field as blank | UX | HIGH | P1 | FIXED | apps/admin | FIX_NOW |
| [BUG-1516](../../docs/bugs/BUG-1516-public-signup-creates-duplicate-customer-records-breaking-st.md) | Public signup creates duplicate customer records, breaking Stripe tenant resolution | DATA_INTEGRITY | HIGH | P1 | FIXED | super-admin, billing, landing | FIX_NOW |
| [BUG-1649](../../docs/bugs/BUG-1649-api-proxy-routes-copy-the-upstream-content-encoding-onto-an-.md) | API proxy routes copy the upstream Content-Encoding onto an already-decompressed body | BUG | HIGH | P1 | FIXED | settings-runtime, tenant-settings | FIX_NOW |
| [BUG-1745](../../docs/bugs/BUG-1745-the-executive-dashboard-reports-zero-revenue-because-reporti.md) | The executive dashboard reports zero revenue because reporting currency is PKR and all money is QAR | BUG | HIGH | P1 | FIXED | apps/admin, api:super-admin | FIX_NOW |
| [BUG-1747](../../docs/bugs/BUG-1747-partner-currency-is-a-required-numeric-input-so-partner-crea.md) | Partner Currency is a required numeric input so partner creation forces a corrupt currency code | BUG | HIGH | P1 | FIXED | apps/admin, api:super-admin | FIX_NOW |
| [BUG-1749](../../docs/bugs/BUG-1749-admin-creates-plans-that-can-never-be-sold-and-can-never-be-.md) | Admin creates plans that can never be sold and can never be deleted | BUG | HIGH | P1 | FIXED | apps/admin, api:super-admin | FIX_NOW |
| [BUG-1750](../../docs/bugs/BUG-1750-the-monitoring-critical-tile-miscounts-and-links-to-a-filter.md) | The monitoring critical tile miscounts and links to a filter that matches nothing | BUG | HIGH | P1 | FIXED | apps/admin, api:platform-monitoring | FIX_NOW |
| [BUG-1751](../../docs/bugs/BUG-1751-a-promotion-goes-live-against-every-subscription-the-instant.md) | A promotion goes live against every subscription the instant it is created | BUG | HIGH | P1 | FIXED | apps/admin, api:super-admin, integration:stripe | FIX_NOW |
| [BUG-1755](../../docs/bugs/BUG-1755-the-plans-list-cannot-show-publication-status-or-sales-model.md) | The plans list cannot show publication status or sales model because the API omits them | BUG | HIGH | P1 | FIXED | apps/admin, api:super-admin | FIX_NOW |
| [ITEM-0034](../../docs/backlog/items/ITEM-0034-apps-web-has-zero-browser-e2e-coverage.md) | apps/web has zero browser E2E coverage | TEST_GAP | HIGH | P1 | READY | apps/web, e2e | PLAN_REQUIRED |
| [ITEM-0094](../../docs/backlog/items/ITEM-0094-go-live-sh-reports-no-blocker-for-a-webhook-endpoint-that-re.md) | go-live.sh reports no blocker for a webhook endpoint that rejects every delivery | TEST_GAP | HIGH | P1 | READY | scripts, api:billing, api:outbox | FIX_NOW |
| [ITEM-0103](../../docs/backlog/items/ITEM-0103-deployment-check-the-composed-tenant-workspace-host-must-res.md) | Deployment check: the composed tenant workspace host must resolve | TEST_GAP | HIGH | P1 | READY | web, tenant-domains | PLAN_REQUIRED |

## MEDIUM

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [BUG-0905](../../docs/bugs/BUG-0905-production-defines-direct-url-but-the-code-reads-direct-data.md) | Production defines DIRECT_URL but the code reads DIRECT_DATABASE_URL, so migrations run over the pooled endpoint | BUG | MEDIUM | P2 | FIXED | services/api/prisma, pkg:config | FIX_NOW |
| [BUG-1208](../../docs/bugs/BUG-1208-component-index-check-fails-on-every-windows-checkout-passes.md) | component-index --check fails on every Windows checkout, passes in CI | INFRA | MEDIUM | P2 | FIXED | framework | FIX_NOW |
| [BUG-1421](../../docs/bugs/BUG-1421-every-admin-screen-shares-one-page-title-two-main-landmarks-.md) | Every admin screen shares one page title, two main landmarks and a duplicate h1 | UX | MEDIUM | P2 | FIXED | apps/admin | FIX_NOW |
| [BUG-1425](../../docs/bugs/BUG-1425-currencycode-accepts-any-string-of-three-characters-or-fewer.md) | currencyCode accepts any string of three characters or fewer | DATA_INTEGRITY | MEDIUM | P2 | FIXED | api:partners | FIX_NOW |
| [BUG-1545](../../docs/bugs/BUG-1545-manual-customer-onboarding-creation-fails-on-an-owner-foreig.md) | Manual customer onboarding creation fails on an owner foreign key | BUG | MEDIUM | P2 | FIXED | platform-runtime, onboarding | FIX_NOW |
| [BUG-1546](../../docs/bugs/BUG-1546-required-fields-on-unfocused-tabs-give-no-indication-of-wher.md) | Required fields on unfocused tabs give no indication of where they are | UX | MEDIUM | P2 | FIXED | customization | FIX_NOW |
| [BUG-1547](../../docs/bugs/BUG-1547-onboarding-prerequisite-message-states-the-inverse-of-the-tr.md) | Onboarding prerequisite message states the inverse of the truth | UX | MEDIUM | P2 | FIXED | onboarding | FIX_NOW |
| [BUG-1549](../../docs/bugs/BUG-1549-database-and-validator-internals-are-surfaced-in-user-facing.md) | Database and validator internals are surfaced in user-facing errors | UX | MEDIUM | P2 | FIXED | error-logs | FIX_NOW |
| [BUG-1550](../../docs/bugs/BUG-1550-lead-record-shows-two-different-owners-on-the-same-screen.md) | Lead record shows two different owners on the same screen | BUG | MEDIUM | P2 | FIXED | leads | FIX_NOW |
| [BUG-1553](../../docs/bugs/BUG-1553-owner-and-template-pickers-list-indistinguishable-duplicate-.md) | Owner and template pickers list indistinguishable duplicate entries | UX | MEDIUM | P2 | FIXED | contracts, platform-users | FIX_NOW |
| [BUG-1554](../../docs/bugs/BUG-1554-admin-requests-its-own-partners-api-with-a-rejected-pagesize.md) | Admin requests its own partners API with a rejected pageSize | BUG | MEDIUM | P2 | FIXED | partners | FIX_NOW |
| [BUG-1555](../../docs/bugs/BUG-1555-an-inactive-plan-with-no-prices-is-offered-as-a-customer-pre.md) | An inactive plan with no prices is offered as a customer preferred plan | BUG | MEDIUM | P2 | FIXED | super-admin, billing | FIX_NOW |
| [BUG-1654](../../docs/bugs/BUG-1654-every-empty-list-in-a-new-workspace-blames-filters-that-are-.md) | Every empty list in a new workspace blames filters that are not set | UX | MEDIUM | P2 | FIXED | views, employees | FIX_NOW |
| [BUG-1655](../../docs/bugs/BUG-1655-tenant-login-password-field-has-no-accessible-name-and-no-au.md) | Tenant login password field has no accessible name and no autocomplete hint | UX | MEDIUM | P2 | FIXED | auth | FIX_NOW |
| [BUG-1673](../../docs/bugs/BUG-1673-tenant-workspace-shell-repeats-three-h1-headings-and-two-mai.md) | Tenant workspace shell repeats three h1 headings and two main landmarks on every screen | UX | MEDIUM | P2 | FIXED | views | FIX_NOW |
| [BUG-1746](../../docs/bugs/BUG-1746-required-fields-on-unselected-tabs-are-undiscoverable-so-cre.md) | Required fields on unselected tabs are undiscoverable so create forms dead-end | UX | MEDIUM | P2 | FIXED | apps/admin | FIX_NOW |
| [BUG-1748](../../docs/bugs/BUG-1748-the-subscription-record-page-cannot-resolve-its-own-tenant-p.md) | The subscription record page cannot resolve its own tenant plan or price | BUG | MEDIUM | P2 | FIXED | apps/admin, api:platform-runtime | FIX_NOW |
| [BUG-1754](../../docs/bugs/BUG-1754-the-incident-queue-counts-routine-401s-and-unknown-route-404.md) | The incident queue counts routine 401s and unknown-route 404s as incidents needing triage | BUG | MEDIUM | P2 | FIXED | api:platform-monitoring, api:error-logs | FIX_NOW |
| [BUG-1756](../../docs/bugs/BUG-1756-bulk-delete-confirms-without-naming-how-many-records-or-whic.md) | Bulk delete confirms without naming how many records or which ones | UX | MEDIUM | P2 | FIXED | apps/admin | FIX_NOW |
| [BUG-1757](../../docs/bugs/BUG-1757-promotions-cannot-be-deleted-and-the-delete-route-silently-d.md) | Promotions cannot be deleted and the DELETE route silently deactivates instead | BUG | MEDIUM | P2 | FIXED | apps/admin, api:super-admin | FIX_NOW |
| [ITEM-0009](../../docs/backlog/items/ITEM-0009-no-observability-platform-exists.md) | No observability platform exists, so a release cannot be verified from outside | INFRA | MEDIUM | P2 | READY | services/api, apps/web, apps/admin | PLAN_REQUIRED |
| [ITEM-0020](../../docs/backlog/items/ITEM-0020-contract-phase-drop-legacy-plan-pricing-columns.md) | Contract phase: drop legacy Plan pricing columns | TECH_DEBT | MEDIUM | P2 | READY | services/api/prisma, api:super-admin, apps/admin | PLAN_REQUIRED |
| [ITEM-0022](../../docs/backlog/items/ITEM-0022-governed-publish-and-archive-actions-for-commercial-configur.md) | Governed publish and archive actions for commercial configuration | FOLLOW_UP | MEDIUM | P2 | READY | api:super-admin, apps/admin | PLAN_REQUIRED |
| [ITEM-0025](../../docs/backlog/items/ITEM-0025-hidden-writes-remain-on-lookups-and-onboarding-read-paths.md) | Hidden writes remain on lookups and onboarding read paths | TECH_DEBT | MEDIUM | P2 | READY | api:lookups, api:onboarding | PLAN_REQUIRED |
| [ITEM-0026](../../docs/backlog/items/ITEM-0026-desktop-agent-windows-installer-is-unsigned.md) | Desktop agent Windows installer is unsigned | SECURITY | MEDIUM | P2 | READY | apps/agent-desktop | PLAN_REQUIRED |
| [ITEM-0027](../../docs/backlog/items/ITEM-0027-desktop-agent-has-no-retry-backoff-and-no-bounded-give-up.md) | Desktop agent has no retry backoff and no bounded give up | TECH_DEBT | MEDIUM | P2 | READY | apps/agent-desktop, api:agent | PLAN_REQUIRED |
| [ITEM-0036](../../docs/backlog/items/ITEM-0036-decide-the-fate-of-the-inert-runtime-registries-in-apps-web.md) | Decide the fate of the inert runtime registries in apps/web | ARCHITECTURE | MEDIUM | P2 | READY | apps/web | PLAN_REQUIRED |
| [ITEM-0039](../../docs/backlog/items/ITEM-0039-promote-the-csp-from-report-only-to-enforced.md) | Promote the CSP from report-only to enforced | SECURITY | MEDIUM | P2 | READY | pkg:config, apps/web, apps/admin, apps/landing | PLAN_REQUIRED |
| [ITEM-0052](../../docs/backlog/items/ITEM-0052-verify-the-agent-update-feed-against-a-real-published-artefact.md) | Verify the agent update feed against a real published artefact | TEST_GAP | MEDIUM | P2 | READY | apps/agent-desktop, api:app-releases | PLAN_REQUIRED |
| [ITEM-0068](../../docs/backlog/items/ITEM-0068-legal-documents-have-no-operator-ui-so-publishing-is-a-scrip.md) | Legal publication has an operator UI, but no diff before publishing | UX | MEDIUM | P2 | READY | legal, admin | FIX_NOW |
| [ITEM-0074](../../docs/backlog/items/ITEM-0074-allocate-id-and-session-tooling-accept-a-session-id-that-doe.md) | allocate-id and session tooling accept a session id that does not exist | INFRA | MEDIUM | P2 | READY | framework | PLAN_REQUIRED |
| [ITEM-0077](../../docs/backlog/items/ITEM-0077-re-read-the-packaged-agent-archive-after-the-node-pre-gyp-up.md) | Re-read the packaged agent archive after the node-pre-gyp upgrade | TEST_GAP | MEDIUM | P2 | READY | apps/agent-desktop, package-lock.json | PLAN_REQUIRED |
| [ITEM-0078](../../docs/backlog/items/ITEM-0078-no-end-to-end-payment-to-provisioned-tenant-run-against-stri.md) | No end-to-end payment to provisioned tenant run against Stripe test mode | TEST_GAP | MEDIUM | P2 | READY | api:billing, api:tenant-control-plane, api:outbox, apps/landing | PLAN_REQUIRED |
| [ITEM-0081](../../docs/backlog/items/ITEM-0081-nine-test-plans-are-needs-review-against-a-five-day-old-comm.md) | Nine test plans are NEEDS_REVIEW against a five-day-old commit | TEST_GAP | MEDIUM | P2 | READY | docs/qa/test-plans | FIX_NOW |
| [ITEM-0084](../../docs/backlog/items/ITEM-0084-detect-drift-between-render-yaml-and-the-live-render-service.md) | Detect drift between render.yaml and the live Render service | INFRA | MEDIUM | P2 | READY | render.yaml, scripts | FIX_NOW |
| [ITEM-0092](../../docs/backlog/items/ITEM-0092-widget-runtime-contract-test-js-fails-and-no-script-or-ci-jo.md) | widget-runtime-contract.test.js fails and no script or CI job runs it | TEST_GAP | MEDIUM | P2 | READY | pkg:config, apps/web | PLAN_REQUIRED |

## LOW and unrated

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [ITEM-0023](../../docs/backlog/items/ITEM-0023-tenant-dataregion-populated-from-market-at-provisioning.md) | Tenant.dataRegion populated from market at provisioning | FOLLOW_UP | LOW | P2 | READY | services/api/prisma, api:tenant-control-plane | PLAN_REQUIRED |
| [BUG-0018](../../docs/bugs/BUG-0018-bulk-lead-delete-is-unreachable-for-every-role.md) | Bulk lead delete is unreachable for every role, including SUPER_ADMIN | AUTHORIZATION | LOW | P3 | FIXED | api:platform-auth, api:super-admin | FIX_NOW |
| [BUG-1556](../../docs/bugs/BUG-1556-contract-dates-with-no-value-render-as-the-unix-epoch.md) | Contract dates with no value render as the Unix epoch | UX | LOW | P3 | FIXED | contracts | FIX_NOW |
| [BUG-1557](../../docs/bugs/BUG-1557-react-hydration-error-418-on-the-admin-dashboard.md) | React hydration error 418 on the admin dashboard | BUG | LOW | P3 | FIXED | dashboard | FIX_NOW |
| [BUG-1558](../../docs/bugs/BUG-1558-admin-list-copy-uses-incorrect-pluralisation-and-articles.md) | Admin list copy uses incorrect pluralisation and articles | UX | LOW | P3 | FIXED | super-admin | FIX_NOW |
| [BUG-1559](../../docs/bugs/BUG-1559-empty-states-instruct-the-user-to-create-records-on-screens-.md) | Empty states instruct the user to create records on screens with no create control | UX | LOW | P3 | FIXED | billing | FIX_NOW |
| [BUG-1560](../../docs/bugs/BUG-1560-delete-confirmation-does-not-name-the-record-being-deleted.md) | Delete confirmation does not name the record being deleted | UX | LOW | P3 | FIXED | leads | FIX_NOW |
| [BUG-1561](../../docs/bugs/BUG-1561-signup-verification-step-has-no-way-back-to-correct-a-mistyp.md) | Signup verification step has no way back to correct a mistyped email | UX | LOW | P3 | FIXED | leads | FIX_NOW |
| [BUG-1752](../../docs/bugs/BUG-1752-admin-empty-states-blame-filters-that-are-not-set.md) | Admin empty states blame filters that are not set | UX | LOW | P3 | FIXED | apps/admin | FIX_NOW |
| [BUG-1753](../../docs/bugs/BUG-1753-lookup-display-labels-mangle-acronyms-and-numeric-ranges-acr.md) | Lookup display labels mangle acronyms and numeric ranges across the admin console | BUG | LOW | P3 | FIXED | apps/admin | FIX_NOW |
| [ITEM-0049](../../docs/backlog/items/ITEM-0049-register-services-api-environment-reads-or-scope-the-rule.md) | Register services/api environment reads or scope the rule to build inputs | INFRA | LOW | P3 | READY | services/api, turbo.json, docs/deployment | PLAN_REQUIRED |
| [ITEM-0080](../../docs/backlog/items/ITEM-0080-type-the-remaining-services-api-no-unsafe-warnings-module-by.md) | Type the remaining services/api no-unsafe warnings module by module | TECH_DEBT | LOW | P3 | READY | services/api | FIX_NOW |
| [ITEM-0093](../../docs/backlog/items/ITEM-0093-link-validation-skips-untracked-files-so-a-new-record-s-brok.md) | Link validation skips untracked files, so a new record's broken links only surface in CI | TECH_DEBT | LOW | P3 | READY | scripts | FIX_NOW |
