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
| [BUG-1543](../../docs/bugs/BUG-1543-stripe-webhook-rejected-as-validation-failed-during-a-live-p.md) | Stripe webhook rejected as VALIDATION_FAILED during a live payment | INTEGRATION | HIGH | P1 | FIXED | billing | DONE |
| [BUG-1952](../../docs/bugs/BUG-1952-plan-entitlements-gate-nothing-so-a-starter-tenant-can-use-e.md) | Plan entitlements gate nothing, so a Starter tenant can use every module it has not bought | BUG | HIGH | P1 | FIXED | api:tenant-settings, apps/web | DONE |
| [BUG-1954](../../docs/bugs/BUG-1954-the-starter-annual-price-tile-renders-pkr-120-000-00-for-a-p.md) | The Starter annual price tile renders PKR 120,000.00 for a PKR 3,000 annual price | BUG | HIGH | P1 | FIXED | apps/admin, api:super-admin | DONE |
| [BUG-1957](../../docs/bugs/BUG-1957-a-department-with-no-business-unit-cannot-be-listed-opened-e.md) | A department with no business unit cannot be listed, opened, edited or deleted, yet still holds its name | DATA_INTEGRITY | HIGH | P1 | FIXED | api:organization | DONE |
| [BUG-1965](../../docs/bugs/BUG-1965-the-leave-request-form-sends-ownerid-and-status-which-the-ap.md) | The leave request form sends ownerId and status, which the API rejects as forbidden properties | BUG | HIGH | P1 | FIXED | apps/web, api:leave | DONE |
| [BUG-1966](../../docs/bugs/BUG-1966-a-failed-save-in-the-runtime-form-is-swallowed-with-no-messa.md) | A failed save in the runtime form is swallowed with no message, toast or inline error | UX | HIGH | P1 | FIXED | apps/web | DONE |
| [BUG-1970](../../docs/bugs/BUG-1970-the-elevated-role-bypass-precedes-the-self-requester-check-o.md) | The elevated-role bypass precedes the self-requester check on leave approval steps | AUTHORIZATION | HIGH | P1 | FIXED | api:leave | DONE |
| [BUG-1974](../../docs/bugs/BUG-1974-246-of-591-tenant-setting-keys-have-no-reader-and-230-of-the.md) | 246 of 591 tenant setting keys have no reader and 230 of them are editable in the UI | BUG | HIGH | P1 | FIXED | api:tenant-settings, apps/web | DONE |
| [BUG-1976](../../docs/bugs/BUG-1976-eight-settings-controls-write-a-key-name-the-resolver-never-.md) | Eight settings controls write a key name the resolver never reads | BUG | HIGH | P1 | FIXED | api:tenant-settings, apps/web | DONE |
| [BUG-1986](../../docs/bugs/BUG-1986-tenant-settings-has-four-blocking-accessibility-violations-i.md) | Tenant settings has four blocking accessibility violations including buttons with no name | UX | HIGH | P1 | FIXED | apps/web | DONE |
| [BUG-2003](../../docs/bugs/BUG-2003-the-tenant-users-screen-crashes-into-the-error-boundary-for-.md) | The tenant Users screen requests an entity the data registry does not have, so it never renders | BUG | HIGH | P1 | FIXED | apps/web, api:data | DONE |
| [BUG-2008](../../docs/bugs/BUG-2008-every-employee-is-counted-absent-on-a-non-working-day-and-ra.md) | Every employee is counted absent on a non-working day and raised as an exception | DATA_INTEGRITY | HIGH | P1 | FIXED | api:attendance, api:dashboard | DONE |
| [BUG-2013](../../docs/bugs/BUG-2013-the-dashboard-error-boundary-classifies-server-component-fai.md) | The dashboard error boundary classifies server-component failures by a message it can never receive | BUG | HIGH | P1 | FIXED | apps/web | DONE |
| [BUG-2043](../../docs/bugs/BUG-2043-the-audit-events-screen-reports-the-number-of-rows-it-loaded.md) | The Audit Events screen reports the number of rows it loaded as the tenant's total audit count | BUG | HIGH | P1 | FIXED | apps/web, api:audit | DONE |
| [BUG-2044](../../docs/bugs/BUG-2044-no-employee-lifecycle-event-is-audited-including-employee-cr.md) | No employee lifecycle event is audited, including employee creation and reporting-manager assignment | DATA_INTEGRITY | HIGH | P1 | FIXED | api:employees, api:organization, api:leave | DONE |

## MEDIUM

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [BUG-1548](../../docs/bugs/BUG-1548-customer-onboarding-validate-accepts-payloads-that-create-re.md) | Customer onboarding validate accepts payloads that create rejects | BUG | MEDIUM | P2 | FIXED | onboarding | DONE |
| [BUG-1551](../../docs/bugs/BUG-1551-desktop-agent-auto-update-manifest-returns-404.md) | Desktop agent auto-update manifest returns 404 | INTEGRATION | MEDIUM | P2 | FIXED | agent, app-releases | DONE |
| [BUG-1950](../../docs/bugs/BUG-1950-every-tenant-workspace-screen-renders-the-same-h1-so-no-page.md) | Every tenant workspace screen renders the same h1, so no page announces what it is | UX | MEDIUM | P2 | FIXED | apps/web | DONE |
| [BUG-1951](../../docs/bugs/BUG-1951-most-tenant-workspace-pages-render-no-main-landmark-includin.md) | Most tenant workspace pages render no main landmark, including every settings category | UX | MEDIUM | P2 | FIXED | apps/web | DONE |
| [BUG-1953](../../docs/bugs/BUG-1953-plan-detail-reports-zero-subscriptions-while-the-plans-list-.md) | Plan detail reports zero subscriptions while the plans list and subscriptions both show two | BUG | MEDIUM | P2 | FIXED | apps/admin, api:super-admin | DONE |
| [BUG-1955](../../docs/bugs/BUG-1955-every-404-is-reported-to-the-user-as-database-record-not-fou.md) | Every 404 is reported to the user as DATABASE_RECORD_NOT_FOUND with the raw HTML body as its message | UX | MEDIUM | P2 | FIXED | apps/web | DONE |
| [BUG-1956](../../docs/bugs/BUG-1956-runtime-lookup-comboboxes-expose-no-listbox-or-option-semant.md) | Runtime lookup comboboxes expose no listbox or option semantics to assistive technology | UX | MEDIUM | P2 | FIXED | apps/web | DONE |
| [BUG-1958](../../docs/bugs/BUG-1958-deleting-a-department-never-releases-its-name-so-it-can-neve.md) | Deleting a department never releases its name, so it can never be recreated | DATA_INTEGRITY | MEDIUM | P2 | FIXED | api:organization | DONE |
| [BUG-1959](../../docs/bugs/BUG-1959-the-departments-list-returns-a-bare-array-and-rejects-the-pa.md) | The departments list returns a bare array and rejects the page size its own table offers | BUG | MEDIUM | P2 | FIXED | api:organization, apps/web | DONE |
| [BUG-1962](../../docs/bugs/BUG-1962-assigned-on-is-required-by-the-leave-assignment-api-and-rend.md) | Assigned On is required by the leave assignment API and rendered as an optional field | UX | MEDIUM | P2 | FIXED | apps/web, api:leave | DONE |
| [BUG-1963](../../docs/bugs/BUG-1963-runtime-dialogs-show-the-end-user-the-raw-server-message-and.md) | Runtime dialogs show the end user the raw server message and the HTTP method and path | UX | MEDIUM | P2 | FIXED | apps/web | DONE |
| [BUG-1969](../../docs/bugs/BUG-1969-an-invited-approver-is-rejected-with-a-message-that-blames-t.md) | An invited approver is rejected with a message that blames tenancy instead of account status | BUG | MEDIUM | P2 | FIXED | api:approvals | DONE |
| [BUG-1977](../../docs/bugs/BUG-1977-the-platform-localization-panel-queries-dotted-setting-keys-.md) | The platform Localization panel queries dotted setting keys that no row can ever hold | BUG | MEDIUM | P2 | FIXED | api:tenant-control-plane, apps/admin | DONE |
| [BUG-1978](../../docs/bugs/BUG-1978-two-attendance-checkboxes-are-not-catalog-keys-so-touching-e.md) | Two attendance checkboxes are not catalog keys, so touching either rejects the whole settings save | BUG | MEDIUM | P2 | FIXED | apps/web, api:tenant-settings | DONE |
| [BUG-1979](../../docs/bugs/BUG-1979-seven-attendance-settings-are-overwritten-on-write-and-the-a.md) | Seven mandated attendance settings are still rendered editable and the refusal is never reported | BUG | MEDIUM | P2 | FIXED | api:tenant-settings | DONE |
| [BUG-1980](../../docs/bugs/BUG-1980-one-saved-attendance-policy-permanently-overrides-the-attend.md) | One saved attendance policy permanently overrides the attendance settings category | BUG | MEDIUM | P2 | OPEN | api:attendance | FIX_NOW |
| [BUG-1981](../../docs/bugs/BUG-1981-resolvepolicy-hardcodes-seven-location-values-and-inverts-tw.md) | resolvePolicy hardcodes seven location values and two AttendancePolicy columns are dead | BUG | MEDIUM | P2 | FIXED | api:attendance | DONE |
| [BUG-2004](../../docs/bugs/BUG-2004-the-approvals-inbox-offers-a-new-action-whose-page-crashes-i.md) | The approvals module emits a New action for a page that does not exist, and the detail route throws on it | BUG | MEDIUM | P2 | FIXED | apps/web | DONE |
| [BUG-2005](../../docs/bugs/BUG-2005-manual-attendance-accepts-a-date-arbitrarily-far-in-the-futu.md) | Manual attendance accepts a date arbitrarily far in the future | DATA_INTEGRITY | MEDIUM | P2 | FIXED | api:attendance | DONE |
| [BUG-2006](../../docs/bugs/BUG-2006-a-successful-save-reports-nothing-to-the-user-on-the-runtime.md) | A successful save reports nothing to the user on the runtime forms and the branding page | UX | MEDIUM | P2 | FIXED | apps/web | DONE |
| [BUG-2009](../../docs/bugs/BUG-2009-display-labels-fall-through-to-the-raw-field-key-or-raw-enum.md) | Display labels fall through to the raw field key or raw enum value on three tenant surfaces | UX | MEDIUM | P2 | FIXED | apps/web | DONE |
| [BUG-2012](../../docs/bugs/BUG-2012-the-related-list-create-dialog-pre-fills-child-fields-with-t.md) | The related-list create dialog pre-fills child fields with the parent record values | DATA_INTEGRITY | MEDIUM | P2 | FIXED | apps/web | DONE |
| [BUG-2014](../../docs/bugs/BUG-2014-users-new-and-users-import-are-shadowed-by-the-user-detail-r.md) | Users new and Users import fall through to the user detail route and report a permissions refusal | BUG | MEDIUM | P2 | FIXED | apps/web | DONE |
| [BUG-2016](../../docs/bugs/BUG-2016-cancelling-a-leave-request-leaves-its-needs-approval-notific.md) | Cancelling a leave request leaves its needs-approval notification outstanding in the inbox | BUG | MEDIUM | P2 | FIXED | api:notifications, api:leave | DONE |
| [BUG-2026](../../docs/bugs/BUG-2026-the-employee-export-produces-columns-the-employee-import-tem.md) | The employee export produces columns the employee import template does not accept | BUG | MEDIUM | P2 | FIXED | api:employees | DONE |
| [BUG-2091](../../docs/bugs/BUG-2091-the-canonical-settings-contract-still-describes-attendance-g.md) | The canonical settings contract still describes attendance geolocation as configurable and Remote-Hybrid only | DOCUMENTATION | MEDIUM | P2 | FIXED | docs/architecture | DONE |
| [BUG-2148](../../docs/bugs/BUG-2148-dashboard-widget-severity-is-conveyed-by-colour-alone-and-hi.md) | Dashboard widget severity is conveyed by colour alone, and hidden from assistive technology | UX | MEDIUM | P2 | FIXED | views, dashboard | DONE |
| [BUG-2206](../../docs/bugs/BUG-2206-three-timesheet-audit-toggles-render-on-screen-and-are-read-.md) | Three timesheet audit toggles render on screen and are read by nothing | BUG | MEDIUM | P2 | FIXED | api:timesheets, api:tenant-settings, apps/web | DONE |
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
| [ITEM-0084](../../docs/backlog/items/ITEM-0084-detect-drift-between-render-yaml-and-the-live-render-service.md) | Detect drift between render.yaml and the live Render service | INFRA | MEDIUM | P2 | READY | render.yaml, scripts | FIX_NOW |
| [ITEM-0092](../../docs/backlog/items/ITEM-0092-widget-runtime-contract-test-js-fails-and-no-script-or-ci-jo.md) | widget-runtime-contract.test.js fails and no script or CI job runs it | TEST_GAP | MEDIUM | P2 | READY | pkg:config, apps/web | PLAN_REQUIRED |
| [ITEM-0105](../../docs/backlog/items/ITEM-0105-the-leave-entitlement-dialog-cannot-set-accrualtype-which-th.md) | The leave entitlement dialog cannot set accrualType, which the API requires | UX | MEDIUM | P2 | READY | apps/web, api:leave | FIX_NOW |
| [ITEM-0107](../../docs/backlog/items/ITEM-0107-three-separate-users-screens-exist-in-the-tenant-app.md) | Four Users screens exist in the tenant app and two of them are unreachable | ARCHITECTURE | MEDIUM | P2 | READY | apps/web | FIX_NOW |
| [ITEM-0112](../../docs/backlog/items/ITEM-0112-enforcecriticalattendancesetting-has-no-test-coverage-despit.md) | enforceCriticalAttendanceSetting has no test coverage despite enforcing a mandatory integrity control | TEST_GAP | MEDIUM | P2 | READY | api:tenant-settings | FIX_NOW |

## LOW and unrated

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [ITEM-0023](../../docs/backlog/items/ITEM-0023-tenant-dataregion-populated-from-market-at-provisioning.md) | Tenant.dataRegion populated from market at provisioning | FOLLOW_UP | LOW | P2 | READY | services/api/prisma, api:tenant-control-plane | PLAN_REQUIRED |
| [BUG-1964](../../docs/bugs/BUG-1964-record-headings-and-dialog-titles-are-singularised-by-stripp.md) | Record headings and dialog titles are singularised by stripping a trailing s | UX | LOW | P3 | FIXED | apps/web | DONE |
| [BUG-2010](../../docs/bugs/BUG-2010-the-dashboard-recent-changes-list-renders-unformatted-iso-86.md) | The dashboard Recent changes list renders unformatted ISO-8601 timestamps | UX | LOW | P3 | FIXED | apps/web | DONE |
| [BUG-2017](../../docs/bugs/BUG-2017-the-inbox-related-record-column-renders-a-bare-uuid-with-no-.md) | The inbox Related record column renders a bare UUID with no label and no link | UX | LOW | P3 | FIXED | apps/web | DONE |
| [BUG-2046](../../docs/bugs/BUG-2046-audit-actions-use-two-naming-conventions-and-the-result-colu.md) | Audit actions use two naming conventions and the Result column is populated only by login events | BUG | LOW | P3 | FIXED | api:audit | DONE |
| [BUG-2149](../../docs/bugs/BUG-2149-every-dashboard-metric-card-offers-a-link-named-only-open.md) | Every dashboard metric card offers a link named only Open | UX | LOW | P3 | FIXED | views, dashboard | DONE |
| [ITEM-0049](../../docs/backlog/items/ITEM-0049-register-services-api-environment-reads-or-scope-the-rule.md) | Register services/api environment reads or scope the rule to build inputs | INFRA | LOW | P3 | READY | services/api, turbo.json, docs/deployment | PLAN_REQUIRED |
| [ITEM-0080](../../docs/backlog/items/ITEM-0080-type-the-remaining-services-api-no-unsafe-warnings-module-by.md) | Type the remaining services/api no-unsafe warnings module by module | TECH_DEBT | LOW | P3 | READY | services/api | FIX_NOW |
| [ITEM-0093](../../docs/backlog/items/ITEM-0093-link-validation-skips-untracked-files-so-a-new-record-s-brok.md) | Link validation skips untracked files, so a new record's broken links only surface in CI | TECH_DEBT | LOW | P3 | READY | scripts | FIX_NOW |
| [ITEM-0109](../../docs/backlog/items/ITEM-0109-the-disabled-check-in-button-explains-itself-only-in-a-title.md) | The disabled Check In button explains itself only in a title tooltip | UX | LOW | P3 | READY | apps/web | FIX_NOW |
| [ITEM-0111](../../docs/backlog/items/ITEM-0111-protected-route-prefixes-omits-twelve-authenticated-route-tr.md) | PROTECTED_ROUTE_PREFIXES omits twelve authenticated route trees, so deep links to them are lost at sign-in | UX | LOW | P3 | READY | apps/web | FIX_NOW |
