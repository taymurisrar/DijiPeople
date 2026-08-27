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
| [BUG-0898](../../docs/bugs/BUG-0898-self-service-checkout-is-blocked-for-every-plan-no-plan-pric.md) | Self-service checkout is blocked for every plan: no plan price has ever been synced to Stripe | BUG | CRITICAL | P0 | OPEN | api:super-admin, app:landing | BLOCKED_EXTERNAL |
| [BUG-0900](../../docs/bugs/BUG-0900-tenant-provisioning-exceeds-the-5s-transaction-timeout-a-pai.md) | Tenant provisioning exceeds the 5s transaction timeout: a paid order is left with no workspace | BUG | CRITICAL | P0 | FIXED | api:permissions | FIX_NOW |
| [BUG-0904](../../docs/bugs/BUG-0904-production-is-missing-outbox-worker-enabled-so-no-workspace-.md) | Production is missing OUTBOX_WORKER_ENABLED, so no workspace is provisioned after payment | BUG | CRITICAL | P0 | OPEN | api:outbox | BLOCKED_EXTERNAL |
| [BUG-1128](../../docs/bugs/BUG-1128-stripe-api-version-skew-invoice-paid-cannot-map-to-a-subscri.md) | Stripe API version skew: invoice.paid cannot map to a subscription because invoice.subscription no longer exists | INTEGRATION | CRITICAL | P0 | FIXED | api:billing | FIX_NOW |
| [BUG-1644](../../docs/bugs/BUG-1644-tenant-root-domain-is-misconfigured-so-no-customer-can-reach.md) | Tenant root domain is misconfigured so no customer can reach their workspace login | INFRA | CRITICAL | P0 | OPEN | tenant-domains, tenants | FIX_NOW |
| [BUG-1494](../../docs/bugs/BUG-1494-git-worktree-remove-follows-node-modules-junctions-and-delet.md) | git worktree remove follows node_modules junctions and deletes the primary checkout | INFRA | CRITICAL | P1 | FIXED | scripts | DONE |

## HIGH

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [BUG-0015](../../docs/bugs/BUG-0015-a-tenant-that-fails-before-identities-and-billing-is-unrecoverable.md) | A tenant that fails before identities-and-billing is permanently unrecoverable | STATE_MACHINE | HIGH | P1 | OPEN | api:tenant-control-plane | PLAN_REQUIRED |
| [BUG-0016](../../docs/bugs/BUG-0016-partner-onboarding-review-has-no-state-machine.md) | Partner onboarding review has no state machine | STATE_MACHINE | HIGH | P1 | OPEN | api:partner-experience | PLAN_REQUIRED |
| [BUG-0903](../../docs/bugs/BUG-0903-production-runs-stripe-in-test-mode-so-no-real-payment-can-b.md) | Production runs Stripe in test mode, so no real payment can be collected | BUG | HIGH | P1 | OPEN | api:billing | BLOCKED_EXTERNAL |
| [BUG-1203](../../docs/bugs/BUG-1203-repo-health-reports-changed-by-this-task-for-another-session.md) | repo-health reports CHANGED_BY_THIS_TASK for another session's merge | INFRA | HIGH | P1 | FIXED | framework | FIX_NOW |
| [BUG-1419](../../docs/bugs/BUG-1419-every-incident-on-the-monitoring-overview-links-to-a-route-t.md) | Every incident on the monitoring overview links to a route that does not exist | BUG | HIGH | P1 | FIXED | apps/admin | FIX_NOW |
| [BUG-1420](../../docs/bugs/BUG-1420-the-monitoring-severity-filter-cannot-match-99-7-percent-of-.md) | The monitoring severity filter cannot match 99.7 percent of stored incidents | DATA_INTEGRITY | HIGH | P1 | FIXED | apps/admin, api:error-logs | FIX_NOW |
| [BUG-1422](../../docs/bugs/BUG-1422-runtime-form-validation-discards-every-field-reason-and-show.md) | Runtime form validation discards every field reason and shows the user Bad Request Exception | BUG | HIGH | P1 | FIXED | api:platform-runtime, apps/admin | DONE |
| [BUG-1423](../../docs/bugs/BUG-1423-runtime-form-controls-have-no-accessible-name-so-screen-read.md) | Runtime form controls have no accessible name so screen readers announce every field as blank | UX | HIGH | P1 | OPEN | apps/admin | PLAN_REQUIRED |
| [BUG-1516](../../docs/bugs/BUG-1516-public-signup-creates-duplicate-customer-records-breaking-st.md) | Public signup creates duplicate customer records, breaking Stripe tenant resolution | DATA_INTEGRITY | HIGH | P1 | FIXED | super-admin, billing, landing | FIX_NOW |
| [BUG-1541](../../docs/bugs/BUG-1541-generated-agreement-pdfs-render-unsubstituted-template-place.md) | Generated agreement PDFs render unsubstituted template placeholders | BUG | HIGH | P1 | FIXED | contracts, legal | FIX_NOW |
| [BUG-1544](../../docs/bugs/BUG-1544-public-signup-advertises-a-workspace-domain-that-does-not-re.md) | Public signup advertises a workspace domain that does not resolve | UX | HIGH | P1 | OPEN | tenant-domains, leads | FIX_NOW |
| [BUG-1578](../../docs/bugs/BUG-1578-admin-customer-form-stores-a-country-lookup-id-where-every-r.md) | Admin customer form stores a country lookup id where every reader expects a name | DATA_INTEGRITY | HIGH | P1 | FIXED | super-admin, contracts, lookups | FIX_NOW |
| [BUG-1649](../../docs/bugs/BUG-1649-api-proxy-routes-copy-the-upstream-content-encoding-onto-an-.md) | API proxy routes copy the upstream Content-Encoding onto an already-decompressed body | BUG | HIGH | P1 | FIXED | settings-runtime, tenant-settings | FIX_NOW |
| [ITEM-0034](../../docs/backlog/items/ITEM-0034-apps-web-has-zero-browser-e2e-coverage.md) | apps/web has zero browser E2E coverage | TEST_GAP | HIGH | P1 | READY | apps/web, e2e | PLAN_REQUIRED |
| [ITEM-0094](../../docs/backlog/items/ITEM-0094-go-live-sh-reports-no-blocker-for-a-webhook-endpoint-that-re.md) | go-live.sh reports no blocker for a webhook endpoint that rejects every delivery | TEST_GAP | HIGH | P1 | READY | scripts, api:billing, api:outbox | FIX_NOW |

## MEDIUM

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [BUG-0905](../../docs/bugs/BUG-0905-production-defines-direct-url-but-the-code-reads-direct-data.md) | Production defines DIRECT_URL but the code reads DIRECT_DATABASE_URL, so migrations run over the pooled endpoint | BUG | MEDIUM | P2 | OPEN | services/api/prisma, pkg:config | BLOCKED_EXTERNAL |
| [BUG-1208](../../docs/bugs/BUG-1208-component-index-check-fails-on-every-windows-checkout-passes.md) | component-index --check fails on every Windows checkout, passes in CI | INFRA | MEDIUM | P2 | FIXED | framework | FIX_NOW |
| [BUG-1424](../../docs/bugs/BUG-1424-the-admin-console-serves-no-content-security-policy-header.md) | The admin console serves no Content-Security-Policy header | SECURITY | MEDIUM | P2 | OPEN | apps/admin | PLAN_REQUIRED |
| [BUG-1545](../../docs/bugs/BUG-1545-manual-customer-onboarding-creation-fails-on-an-owner-foreig.md) | Manual customer onboarding creation fails on an owner foreign key | BUG | MEDIUM | P2 | OPEN | platform-runtime, onboarding | PLAN_REQUIRED |
| [BUG-1555](../../docs/bugs/BUG-1555-an-inactive-plan-with-no-prices-is-offered-as-a-customer-pre.md) | An inactive plan with no prices is offered as a customer preferred plan | BUG | MEDIUM | P2 | OPEN | super-admin, billing | FIX_NOW |
| [BUG-1654](../../docs/bugs/BUG-1654-every-empty-list-in-a-new-workspace-blames-filters-that-are-.md) | Every empty list in a new workspace blames filters that are not set | UX | MEDIUM | P2 | FIXED | views, employees | FIX_NOW |
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
| [ITEM-0049](../../docs/backlog/items/ITEM-0049-register-services-api-environment-reads-or-scope-the-rule.md) | Register services/api environment reads or scope the rule to build inputs | INFRA | LOW | P3 | READY | services/api, turbo.json, docs/deployment | PLAN_REQUIRED |
| [ITEM-0080](../../docs/backlog/items/ITEM-0080-type-the-remaining-services-api-no-unsafe-warnings-module-by.md) | Type the remaining services/api no-unsafe warnings module by module | TECH_DEBT | LOW | P3 | READY | services/api | FIX_NOW |
| [ITEM-0093](../../docs/backlog/items/ITEM-0093-link-validation-skips-untracked-files-so-a-new-record-s-brok.md) | Link validation skips untracked files, so a new record's broken links only surface in CI | TECH_DEBT | LOW | P3 | READY | scripts | FIX_NOW |
