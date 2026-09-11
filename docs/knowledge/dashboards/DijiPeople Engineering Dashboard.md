# DijiPeople Engineering Dashboard

> **Generated file — do not edit by hand.** Rebuild with `node scripts/generate-dashboards.mjs`,
> then publish with `node scripts/sync-obsidian.mjs`. Edits made in the vault are lost on the next sync.

## At a glance

| | |
|---|---|
| Open CRITICAL | **4** |
| Open HIGH | **80** |
| Open total | 162 |
| Blocked | 2 |
| Awaiting a product decision | 6 |
| Deferred | 90 |
| Completed | 316 |
| Awaiting Architect triage | 0 |

## Open Critical Bugs

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[BUG-3110-a-live-production-database-password-sits-permanently-in-the-|BUG-3110]] | A live production database password sits permanently in the public git history | SECURITY | CRITICAL | OPEN | services/api | FIX_NOW |
| [[BUG-3152-post-users-userid-roles-lets-a-delegated-role-assignment-adm|BUG-3152]] | POST /users/:userId/roles lets a delegated role-assignment admin self-grant GLOBAL_ADMIN | AUTHORIZATION | CRITICAL | FIXED | api:users/users.service.ts, api:users/users.controller.ts | DONE |
| [[BUG-3154-employee-bank-accounts-ibans-cnics-and-tax-identifiers-are-s|BUG-3154]] | Employee bank accounts, IBANs, CNICs and tax identifiers are stored in plaintext beside an unused AES-256-GCM service | DATA_INTEGRITY | CRITICAL | OPEN | api:employees, api:compensation | PLAN_REQUIRED |
| [[BUG-3155-fieldsecurityrule-masking-is-enforced-only-in-the-browser-th|BUG-3155]] | FieldSecurityRule masking is enforced only in the browser; the API sends the unmasked value | AUTHORIZATION | CRITICAL | OPEN | api:employees | FIX_NOW |

## Open High Bugs

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[BUG-1543-stripe-webhook-rejected-as-validation-failed-during-a-live-p|BUG-1543]] | Stripe webhook rejected as VALIDATION_FAILED during a live payment | INTEGRATION | HIGH | FIXED | billing | DONE |
| [[BUG-1952-plan-entitlements-gate-nothing-so-a-starter-tenant-can-use-e|BUG-1952]] | Plan entitlements gate nothing, so a Starter tenant can use every module it has not bought | BUG | HIGH | FIXED | api:tenant-settings, apps/web | DONE |
| [[BUG-1954-the-starter-annual-price-tile-renders-pkr-120-000-00-for-a-p|BUG-1954]] | The Starter annual price tile renders PKR 120,000.00 for a PKR 3,000 annual price | BUG | HIGH | FIXED | apps/admin, api:super-admin | DONE |
| [[BUG-1957-a-department-with-no-business-unit-cannot-be-listed-opened-e|BUG-1957]] | A department with no business unit cannot be listed, opened, edited or deleted, yet still holds its name | DATA_INTEGRITY | HIGH | FIXED | api:organization | DONE |
| [[BUG-1965-the-leave-request-form-sends-ownerid-and-status-which-the-ap|BUG-1965]] | The leave request form sends ownerId and status, which the API rejects as forbidden properties | BUG | HIGH | FIXED | apps/web, api:leave | DONE |
| [[BUG-1966-a-failed-save-in-the-runtime-form-is-swallowed-with-no-messa|BUG-1966]] | A failed save in the runtime form is swallowed with no message, toast or inline error | UX | HIGH | FIXED | apps/web | DONE |
| [[BUG-1970-the-elevated-role-bypass-precedes-the-self-requester-check-o|BUG-1970]] | The elevated-role bypass precedes the self-requester check on leave approval steps | AUTHORIZATION | HIGH | FIXED | api:leave | DONE |
| [[BUG-1974-246-of-591-tenant-setting-keys-have-no-reader-and-230-of-the|BUG-1974]] | 246 of 591 tenant setting keys have no reader and 230 of them are editable in the UI | BUG | HIGH | FIXED | api:tenant-settings, apps/web | DONE |
| [[BUG-1976-eight-settings-controls-write-a-key-name-the-resolver-never-|BUG-1976]] | Eight settings controls write a key name the resolver never reads | BUG | HIGH | FIXED | api:tenant-settings, apps/web | DONE |
| [[BUG-1986-tenant-settings-has-four-blocking-accessibility-violations-i|BUG-1986]] | Tenant settings has four blocking accessibility violations including buttons with no name | UX | HIGH | FIXED | apps/web | DONE |
| [[BUG-2003-the-tenant-users-screen-crashes-into-the-error-boundary-for-|BUG-2003]] | The tenant Users screen requests an entity the data registry does not have, so it never renders | BUG | HIGH | FIXED | apps/web, api:data | DONE |
| [[BUG-2008-every-employee-is-counted-absent-on-a-non-working-day-and-ra|BUG-2008]] | Every employee is counted absent on a non-working day and raised as an exception | DATA_INTEGRITY | HIGH | FIXED | api:attendance, api:dashboard | DONE |
| [[BUG-2013-the-dashboard-error-boundary-classifies-server-component-fai|BUG-2013]] | The dashboard error boundary classifies server-component failures by a message it can never receive | BUG | HIGH | FIXED | apps/web | DONE |
| [[BUG-2043-the-audit-events-screen-reports-the-number-of-rows-it-loaded|BUG-2043]] | The Audit Events screen reports the number of rows it loaded as the tenant's total audit count | BUG | HIGH | FIXED | apps/web, api:audit | DONE |
| [[BUG-2044-no-employee-lifecycle-event-is-audited-including-employee-cr|BUG-2044]] | No employee lifecycle event is audited, including employee creation and reporting-manager assignment | DATA_INTEGRITY | HIGH | FIXED | api:employees, api:organization, api:leave | DONE |
| [[BUG-2331-permissions-policy-geolocation-makes-web-attendance-check-in|BUG-2331]] | Permissions-Policy geolocation=() makes web attendance check-in impossible | BUG | HIGH | FIXED | pkg:config, apps/web, apps/admin | FIX_NOW |
| [[BUG-2332-every-attendance-refusal-reaches-the-browser-as-validation-f|BUG-2332]] | Every attendance refusal reaches the browser as VALIDATION_FAILED and raises the technical error dialog | BUG | HIGH | FIXED | services/api/src/common/errors, api:attendance, apps/web | FIX_NOW |
| [[BUG-2458-token-refresh-is-throttled-by-the-public-login-rate-limiter-|BUG-2458]] | Token refresh is throttled by the public login rate limiter, signing users out | BUG | HIGH | FIXED | api:auth, api:common | FIX_NOW |
| [[BUG-2459-the-notification-bell-polls-forever-after-a-session-ends-flo|BUG-2459]] | The notification bell polls forever after a session ends, flooding the error log | PERFORMANCE | HIGH | FIXED | web:notifications, api:error-logs, api:notifications | FIX_NOW |
| [[BUG-2462-stripe-subscription-webhooks-fail-because-the-customer-resol|BUG-2462]] | Stripe subscription webhooks fail because the customer resolves to no tenant | INTEGRATION | HIGH | FIXED | api:billing, api:super-admin | DONE |
| [[BUG-2494-check-out-re-validates-check-in-preconditions-and-traps-the-|BUG-2494]] | Check-out re-validates check-in preconditions and traps the entry open for ever | STATE_MACHINE | HIGH | FIXED | api:attendance | DONE |
| [[BUG-2504-approving-a-correction-never-applies-the-requested-work-mode|BUG-2504]] | Approving a correction never applies the requested work mode, work site or overtime | STATE_MACHINE | HIGH | FIXED | api:attendance | DONE |
| [[BUG-2505-a-mode-or-location-correction-could-never-be-submitted-at-al|BUG-2505]] | A mode-or-location correction could never be submitted at all | BUG | HIGH | FIXED | apps/web, api:attendance | DONE |
| [[BUG-2506-sign-out-leaves-the-refresh-token-live-whenever-the-tenant-i|BUG-2506]] | Sign-out leaves the refresh token live whenever the tenant is busy | SECURITY | HIGH | FIXED | api:auth | DONE |
| [[BUG-2618-expired-subscription-orders-are-never-swept-abandonexpired-h|BUG-2618]] | Expired subscription orders are never swept: abandonExpired has no caller and the API has no scheduler | DATA_INTEGRITY | HIGH | FIXED | billing, super-admin | FIX_NOW |
| [[BUG-2623-buildscopedaccesswhere-filters-employee-on-ownerteamid-a-col|BUG-2623]] | buildScopedAccessWhere filters Employee on ownerTeamId, a column Employee does not have | AUTHORIZATION | HIGH | FIXED | services/api/src/common/security/rbac-query-scope.ts | DONE |
| [[BUG-2683-every-scheduled-report-fails-to-deliver-because-the-email-te|BUG-2683]] | Every scheduled report fails to deliver because the email template variable tenantName is never passed | BUG | HIGH | FIXED | api:reporting/schedule | DONE |
| [[BUG-2693-historical-headcount-reports-employee-days-instead-of-headco|BUG-2693]] | Historical headcount reports employee-days instead of headcount and grows with the length of the period | DATA_INTEGRITY | HIGH | FIXED | api:reporting | DONE |
| [[BUG-2718-the-approvals-record-page-reads-the-detail-response-envelope|BUG-2718]] | The approvals record page reads the detail response envelope, so every field is blank | UX | HIGH | FIXED | approvals, leave, attendance | FIX_NOW |
| [[BUG-2732-attendance-integration-cannot-be-activated-activation-requir|BUG-2732]] | Attendance integration cannot be activated: activation requires a verified device, but only an active integration is ever verified | STATE_MACHINE | HIGH | FIXED | api:attendance-integrations, gateway/src/DijiPeople.Gateway.Host | FIX_NOW |
| [[BUG-2741-a-workspace-whose-email-provider-is-a-sink-reports-every-mes|BUG-2741]] | A workspace whose email provider is a sink reports every message as SENT | BUG | HIGH | FIXED | notifications, reporting | FIX_NOW |
| [[BUG-2933-mapping-a-device-user-never-requeues-its-punches-so-backfill|BUG-2933]] | Mapping a device user never requeues its punches, so backfilled attendance is silently never built | INTEGRATION | HIGH | FIXED | api:attendance-integrations | FIX_NOW |
| [[BUG-2958-settings-shows-every-category-group-and-page-regardless-of-t|BUG-2958]] | Settings shows every category, group and page regardless of the tenant's plan | AUTHORIZATION | HIGH | FIXED | apps/web, api:tenant-settings | FIX_NOW |
| [[BUG-3007-reports-and-analytics-offers-surfaces-and-reports-for-capabi|BUG-3007]] | Reports and Analytics offers surfaces and reports for capabilities the plan does not include | AUTHORIZATION | HIGH | FIXED | apps/web, api:reporting | FIX_NOW |
| [[BUG-3020-records-behind-these-numbers-shows-raw-guids-and-a-count-tha|BUG-3020]] | Records behind these numbers shows raw GUIDs and a count that does not match the metric | UX | HIGH | FIXED | apps/web, api:reporting | FIX_NOW |
| [[BUG-3115-rate-limiter-trusts-a-forged-x-forwarded-for-and-covers-no-a|BUG-3115]] | Rate limiter trusts a forged X-Forwarded-For and covers no authenticated endpoint | SECURITY | HIGH | FIXED | services/api/src/common/security/client-ip.ts, services/api/src/common/guards/public-rate-limit.guard.ts, services/api/src/common/interceptors/authenticated-rate-limit.interceptor.ts | DONE |
| [[BUG-3137-live-password-reset-links-and-invite-tokens-sit-in-the-tenan|BUG-3137]] | Live password-reset links and invite tokens sit in the tenant-readable email delivery log | SECURITY | HIGH | OPEN | api:notifications | FIX_NOW |
| [[BUG-3138-password-reset-unconditionally-reactivates-a-disabled-accoun|BUG-3138]] | Password reset unconditionally reactivates a disabled account | SECURITY | HIGH | OPEN | api:auth | FIX_NOW |
| [[BUG-3139-tenant-password-reset-tokens-are-stateless-and-replayable-fo|BUG-3139]] | Tenant password-reset tokens are stateless and replayable for 24 hours after use | SECURITY | HIGH | OPEN | api:auth | FIX_NOW |
| [[BUG-3140-client-supplied-startnewsession-flag-on-the-public-agent-ref|BUG-3140]] | Client-supplied startNewSession flag on the public agent refresh endpoint resets absolute session lifetime | SECURITY | HIGH | OPEN | api:auth, api:agent | FIX_NOW |
| [[BUG-3141-branding-svg-served-unauthenticated-and-inline-enabled-store|BUG-3141]] | Branding SVG served unauthenticated and inline enabled stored XSS on the API origin | SECURITY | HIGH | OPEN | api:customization | FIX_NOW |
| [[BUG-3156-a-tenant-admin-can-create-rename-or-deactivate-the-platform-|BUG-3156]] | A tenant admin can create, rename or deactivate the platform-wide shared geography reference data | TENANT_ISOLATION | HIGH | OPEN | api:lookups | FIX_NOW |
| [[BUG-3157-the-lookups-usage-endpoint-discloses-a-cross-tenant-employee|BUG-3157]] | The lookups usage endpoint discloses a cross-tenant employee-count aggregate and lets one tenant block another tenant's delete | TENANT_ISOLATION | HIGH | OPEN | api:lookups | FIX_NOW |
| [[BUG-3162-public-tenant-resolve-cache-is-keyed-on-caller-supplied-sele|BUG-3162]] | Public tenant-resolve cache is keyed on caller-supplied selectors instead of the resolved tenant (downgraded from CRITICAL to HIGH on reconciliation) | SECURITY | HIGH | OPEN | api:tenants | FIX_NOW |
| [[BUG-3164-the-timesheet-restriction-allowlist-omits-the-api-prefix-so-|BUG-3164]] | The timesheet-restriction allowlist omits the /api prefix, so it never matches | BUG | HIGH | OPEN | api:timesheets | FIX_NOW |
| [[BUG-3165-every-authenticated-request-costs-roughly-26-database-round-|BUG-3165]] | Every authenticated request costs roughly 26 database round trips before the handler runs | PERFORMANCE | HIGH | OPEN | services/api/src/common | PLAN_REQUIRED |
| [[BUG-3166-production-deploys-before-the-deployed-commit-has-a-ci-verdi|BUG-3166]] | Production deploys before the deployed commit has a CI verdict | INFRA | HIGH | OPEN | .github/workflows | FIX_NOW |
| [[BUG-3167-the-required-browser-gate-executes-zero-tests-against-apps-w|BUG-3167]] | The required browser gate executes zero tests against apps/web | TEST_GAP | HIGH | OPEN | .github/workflows | FIX_NOW |
| [[BUG-3168-two-required-ci-gates-report-success-while-executing-nothing|BUG-3168]] | Two required CI gates report success while executing nothing | INFRA | HIGH | OPEN | .github/workflows | FIX_NOW |
| [[BUG-3169-notification-fan-out-runs-o-rules-x-recipients-sequential-ro|BUG-3169]] | Notification fan-out runs O(rules x recipients) sequential round trips inline on the triggering request | PERFORMANCE | HIGH | OPEN | api:notifications | PLAN_REQUIRED |
| [[BUG-3170-timesheet-bulk-import-confirmation-runs-an-unbounded-per-row|BUG-3170]] | Timesheet bulk-import confirmation runs an unbounded per-row loop inside one transaction on the default 5-second timeout | PERFORMANCE | HIGH | OPEN | api:timesheets | PLAN_REQUIRED |
| [[BUG-3171-the-audit-log-filter-metadata-query-does-an-unbounded-distin|BUG-3171]] | The Audit Log filter-metadata query does an unbounded DISTINCT scan over the tenant's entire audit history on every page load | PERFORMANCE | HIGH | OPEN | api:audit | FIX_NOW |
| [[BUG-3172-get-payslips-has-no-pagination-and-can-return-every-payslip-|BUG-3172]] | GET /payslips has no pagination and can return every payslip the tenant has ever generated | PERFORMANCE | HIGH | OPEN | api:payslips | FIX_NOW |
| [[BUG-3173-roughly-20-pages-redundantly-re-fetch-business-unit-access-a|BUG-3173]] | Roughly 20 pages redundantly re-fetch business-unit access and current-employee context the shell layout already loaded | PERFORMANCE | HIGH | OPEN | apps/web | PLAN_REQUIRED |
| [[BUG-3174-every-pagination-sort-or-filter-click-on-a-runtime-list-page|BUG-3174]] | Every pagination, sort or filter click on a runtime list page re-executes the whole server-side call fan-out, not just the list query | PERFORMANCE | HIGH | OPEN | apps/web, apps/admin | PLAN_REQUIRED |
| [[BUG-3175-nine-platform-admin-runtime-modules-fetch-entire-tables-into|BUG-3175]] | Nine platform-admin runtime modules fetch entire tables into Node memory and paginate/sort/search with JavaScript instead of the database | PERFORMANCE | HIGH | OPEN | apps/admin | FIX_NOW |
| [[BUG-3176-the-employees-list-search-box-and-every-server-mode-datatabl|BUG-3176]] | The Employees list search box, and every server-mode DataTable instance, never reaches the backend and only filters the already-loaded page | BUG | HIGH | OPEN | apps/web, apps/admin | FIX_NOW |
| [[BUG-3177-two-endpoints-accepted-a-caller-supplied-storagekey-and-read|BUG-3177]] | Two endpoints accepted a caller-supplied storageKey and read it back with no tenant-prefix check | AUTHORIZATION | HIGH | OPEN | api:recruitment, api:app-releases | FIX_NOW |
| [[BUG-3179-nine-upload-endpoints-had-no-multipart-size-limit-the-check-|BUG-3179]] | Nine/ten upload endpoints had no multipart size limit; the check ran after the whole file was already in the heap | SECURITY | HIGH | OPEN | services/api/src/common | FIX_NOW |
| [[BUG-3183-platform-ops-alerts-for-failed-payments-and-provisioning-are|BUG-3183]] | Platform-ops alerts for failed payments and provisioning are written to a log line that is never sent and is suppressed at the production log level | INFRA | HIGH | OPEN | api:platform-monitoring | FIX_NOW |
| [[BUG-3184-employee-termination-writes-no-audit-row-invisible-to-the-co|BUG-3184]] | Employee termination writes no audit row, invisible to the coverage spec designed to catch exactly this | DATA_INTEGRITY | HIGH | OPEN | api:employees | FIX_NOW |
| [[BUG-3185-reading-or-downloading-a-document-is-recorded-nowhere|BUG-3185]] | Reading or downloading a document is recorded nowhere | DATA_INTEGRITY | HIGH | OPEN | api:documents | FIX_NOW |
| [[BUG-3186-no-individual-erasure-or-anonymisation-path-exists-and-emplo|BUG-3186]] | No individual erasure or anonymisation path exists, and employee deletion is soft, so personal data survives deletion indefinitely | DATA_INTEGRITY | HIGH | OPEN | api:employees | PLAN_REQUIRED |
| [[BUG-3187-the-rate-limit-invariant-covers-writes-only-every-unprotecte|BUG-3187]] | The rate-limit invariant covers writes only; every unprotected public surface is a read | SECURITY | HIGH | OPEN | services/api/src/common | FIX_NOW |
| [[BUG-3188-every-rejected-rate-limited-request-writes-a-database-row-so|BUG-3188]] | Every rejected rate-limited request writes a database row, so throttling costs more than serving | PERFORMANCE | HIGH | OPEN | services/api/src/common | FIX_NOW |
| [[BUG-3189-one-unauthenticated-login-request-costs-about-1-1s-of-cpu-on|BUG-3189]] | One unauthenticated login request costs about 1.1s of CPU on a single-instance API | PERFORMANCE | HIGH | OPEN | api:auth | PLAN_REQUIRED |
| [[BUG-3195-the-postgres-connection-pool-is-entirely-default-and-waits-f|BUG-3195]] | The Postgres connection pool is entirely default and waits forever for a connection | PERFORMANCE | HIGH | OPEN | services/api/src/common | FIX_NOW |
| [[BUG-3196-payroll-calculation-runs-inline-on-the-http-request-per-empl|BUG-3196]] | Payroll calculation runs inline on the HTTP request, per employee, with no idempotency and no crash recovery | DATA_INTEGRITY | HIGH | OPEN | api:payroll | PLAN_REQUIRED |
| [[BUG-3197-leave-balance-is-checked-at-submission-and-decremented-at-ap|BUG-3197]] | Leave balance is checked at submission and decremented at approval, so pending requests are invisible and the balance can be overdrawn | DATA_INTEGRITY | HIGH | OPEN | api:leave | FIX_NOW |
| [[BUG-3198-api-health-is-a-static-ok-payload-so-a-broken-deploy-and-a-d|BUG-3198]] | api/health is a static ok payload, so a broken deploy and a dead database both report healthy | INFRA | HIGH | OPEN | services/api/src/common | FIX_NOW |
| [[BUG-3199-an-outbound-fetch-with-no-timeout-is-reachable-from-an-authe|BUG-3199]] | An outbound fetch with no timeout is reachable from an authenticated tenant endpoint; Stripe has no explicit timeout or circuit breaker | PERFORMANCE | HIGH | OPEN | api:billing | FIX_NOW |
| [[BUG-3200-the-notification-queue-is-a-synchronous-fallback-every-tenan|BUG-3200]] | The notification queue is a synchronous fallback: every tenant email is sent on the HTTP request thread with no retry | PERFORMANCE | HIGH | OPEN | api:notifications | PLAN_REQUIRED |
| [[BUG-3201-the-p2002-recovery-pattern-used-inside-interactive-transacti|BUG-3201]] | The P2002 recovery pattern used inside interactive transactions cannot work on Postgres, and it is on the tenant-provisioning path | DATA_INTEGRITY | HIGH | OPEN | api:tenants | FIX_NOW |
| [[BUG-3202-payroll-run-eligibility-never-checks-employee-isdeleted-an-a|BUG-3202]] | Payroll run eligibility never checks Employee.isDeleted; an archived employee with a stale employmentStatus is paid | DATA_INTEGRITY | HIGH | OPEN | api:payroll | FIX_NOW |
| [[BUG-3205-tenant-deletion-cascades-through-the-entire-tenant-owned-sch|BUG-3205]] | Tenant deletion cascades through the entire tenant-owned schema, including every audit and payroll table, with no database-level barrier | DATABASE | HIGH | OPEN | services/api/prisma | PLAN_REQUIRED |
| [[BUG-3241-legacy-role-permission-grant-and-employee-export-both-skip-t|BUG-3241]] | Legacy role-permission grant and employee export both skip the sibling endpoint's access check | AUTHORIZATION | HIGH | FIXED | api:roles/roles.service.ts, api:employees/employees.service.ts | DONE |
| [[ITEM-0133-tenant-isolation-is-proven-for-one-module-60-modules-have-no|ITEM-0133]] | Tenant isolation is proven for one module; 60+ modules have no isolation test | TEST_GAP | HIGH | READY | services/api/test | PLAN_REQUIRED |
| [[ITEM-0134-the-payroll-run-engine-has-no-tests|ITEM-0134]] | The payroll run engine has no tests | TEST_GAP | HIGH | READY | api:payroll | PLAN_REQUIRED |
| [[ITEM-0135-no-authenticated-endpoint-in-the-product-is-rate-limited-at-|ITEM-0135]] | No authenticated endpoint in the product is rate limited at all | SECURITY | HIGH | READY | services/api/src/common | PLAN_REQUIRED |
| [[ITEM-0136-electron-is-pinned-at-39-2-6-in-apps-agent-desktop-about-30-|ITEM-0136]] | electron is pinned at 39.2.6 in apps/agent-desktop, about 30 published CVEs behind the same major | SECURITY | HIGH | READY | apps/agent-desktop | FIX_NOW |

## Product Decisions Needed

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[ITEM-0131-production-hr-and-payroll-data-has-no-backup-the-database-is|ITEM-0131]] | Production HR and payroll data has no backup: the database is on the Neon free plan | INFRA | CRITICAL | PRODUCT_DECISION | services/api | PRODUCT_DECISION |
| [[BUG-3178-no-malware-scanning-exists-anywhere-the-tenant-setting-that-|BUG-3178]] | No malware scanning exists anywhere; the tenant setting that claims it does is inert | SECURITY | HIGH | PRODUCT_DECISION | services/api/src/common | PRODUCT_DECISION |
| [[BUG-3180-the-render-service-cannot-be-rebuilt-from-the-repository-sev|BUG-3180]] | The Render service cannot be rebuilt from the repository: seven boot-required env vars are absent from render.yaml | INFRA | HIGH | PRODUCT_DECISION | render.yaml | PRODUCT_DECISION |
| [[BUG-3181-single-environment-no-staging-one-neon-branch-one-stripe-acc|BUG-3181]] | Single environment: no staging, one Neon branch, one Stripe account, one email sender, and demo data in production | INFRA | HIGH | PRODUCT_DECISION | docs/deployment | PRODUCT_DECISION |
| [[BUG-3182-no-per-tenant-restore-is-possible-restoring-one-tenant-means|BUG-3182]] | No per-tenant restore is possible: restoring one tenant means rolling back all of them | INFRA | HIGH | PRODUCT_DECISION | api:tenants | PRODUCT_DECISION |
| [[ITEM-0132-no-multi-factor-authentication-exists-anywhere-including-for|ITEM-0132]] | No multi-factor authentication exists anywhere, including for platform super admins | SECURITY | HIGH | PRODUCT_DECISION | api:auth | PRODUCT_DECISION |

## Blocked Items

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[ITEM-0048-replace-or-contain-active-win-and-the-xlsx-export-path|ITEM-0048]] | Replace or contain active-win and the xlsx export path | SECURITY | HIGH | BLOCKED | apps/agent-desktop, services/api/src/common/excel, package-lock.json | BLOCKED_EXTERNAL |
| [[BUG-0084-seven-unique-constraints-in-schema-prisma-are-absent-from-th|BUG-0084]] | Seven unique constraints in schema.prisma are absent from the migration chain | DATA_INTEGRITY | MEDIUM | BLOCKED | contracts, partner-experience, support-cases, approvals, tenant-settings | BLOCKED_EXTERNAL |

## Current Test Gaps

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[BUG-3167-the-required-browser-gate-executes-zero-tests-against-apps-w|BUG-3167]] | The required browser gate executes zero tests against apps/web | TEST_GAP | HIGH | OPEN | .github/workflows | FIX_NOW |
| [[ITEM-0133-tenant-isolation-is-proven-for-one-module-60-modules-have-no|ITEM-0133]] | Tenant isolation is proven for one module; 60+ modules have no isolation test | TEST_GAP | HIGH | READY | services/api/test | PLAN_REQUIRED |
| [[ITEM-0134-the-payroll-run-engine-has-no-tests|ITEM-0134]] | The payroll run engine has no tests | TEST_GAP | HIGH | READY | api:payroll | PLAN_REQUIRED |
| [[BUG-3254-the-forwarded-for-hop-guard-rejected-every-honest-chain-coll|BUG-3254]] | The rate-limit e2e suite sent a forwarded chain one hop short, and the guard was misread as an off-by-one | TEST_GAP | MEDIUM | FIXED | pkg:config, services/api/src/common/security, services/api/test | DONE |
| [[BUG-3263-the-provisioning-queue-e2e-fixture-raced-the-clock-so-an-exa|BUG-3263]] | The provisioning queue e2e fixture raced the clock, so an exact five-minute interval came out 300001ms | TEST_GAP | MEDIUM | FIXED | services/api/test | DONE |
| [[ITEM-0052-verify-the-agent-update-feed-against-a-real-published-artefact|ITEM-0052]] | Verify the agent update feed against a real published artefact | TEST_GAP | MEDIUM | READY | apps/agent-desktop, api:app-releases | PLAN_REQUIRED |
| [[ITEM-0077-re-read-the-packaged-agent-archive-after-the-node-pre-gyp-up|ITEM-0077]] | Re-read the packaged agent archive after the node-pre-gyp upgrade | TEST_GAP | MEDIUM | READY | apps/agent-desktop, package-lock.json | PLAN_REQUIRED |
| [[ITEM-0078-no-end-to-end-payment-to-provisioned-tenant-run-against-stri|ITEM-0078]] | No end-to-end payment to provisioned tenant run against Stripe test mode | TEST_GAP | MEDIUM | READY | api:billing, api:tenant-control-plane, api:outbox, apps/landing | PLAN_REQUIRED |
| [[ITEM-0116-53-bug-fixes-are-regression-covered-but-have-never-been-qa-r|ITEM-0116]] | 53 bug fixes are regression-covered but have never been QA-retested | TEST_GAP | MEDIUM | READY | — | FIX_NOW |

## Current Infrastructure Gaps

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[BUG-3166-production-deploys-before-the-deployed-commit-has-a-ci-verdi|BUG-3166]] | Production deploys before the deployed commit has a CI verdict | INFRA | HIGH | OPEN | .github/workflows | FIX_NOW |
| [[BUG-3168-two-required-ci-gates-report-success-while-executing-nothing|BUG-3168]] | Two required CI gates report success while executing nothing | INFRA | HIGH | OPEN | .github/workflows | FIX_NOW |
| [[BUG-3183-platform-ops-alerts-for-failed-payments-and-provisioning-are|BUG-3183]] | Platform-ops alerts for failed payments and provisioning are written to a log line that is never sent and is suppressed at the production log level | INFRA | HIGH | OPEN | api:platform-monitoring | FIX_NOW |
| [[BUG-3198-api-health-is-a-static-ok-payload-so-a-broken-deploy-and-a-d|BUG-3198]] | api/health is a static ok payload, so a broken deploy and a dead database both report healthy | INFRA | HIGH | OPEN | services/api/src/common | FIX_NOW |
| [[ITEM-0009-no-observability-platform-exists|ITEM-0009]] | No observability platform exists, so a release cannot be verified from outside | INFRA | MEDIUM | READY | services/api, apps/web, apps/admin | PLAN_REQUIRED |
| [[ITEM-0158-public-traffic-that-bypasses-cloudflare-shares-one-rate-limi|ITEM-0158]] | Public traffic that bypasses Cloudflare shares one rate-limit bucket, by design and untested | INFRA | MEDIUM | READY | pkg:config, services/api/src/common/security | PLAN_REQUIRED |

## Recently Fixed Bugs

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[BUG-0005-cross-tenant-error-log-read-via-support-role|BUG-0005]] | A support-role user could read another tenant's error log | TENANT_ISOLATION | CRITICAL | VERIFIED | api:error-logs | DONE |
| [[BUG-0006-organization-structure-mutable-by-any-authenticated-user|BUG-0006]] | Organization and business-unit structure was mutable by any authenticated user | AUTHORIZATION | CRITICAL | VERIFIED | api:organization | DONE |
| [[BUG-0027-admin-plan-pricing-and-checkout-pricing-come-from-different-|BUG-0027]] | Admin plan pricing and checkout pricing come from different models | DATA_INTEGRITY | CRITICAL | VERIFIED | services/api/prisma, apps/admin, apps/landing | DONE |
| [[BUG-0030-plan-list-get-mutates-commercial-pricing-and-can-fail-on-pla|BUG-0030]] | Plan list GET mutates commercial pricing and can fail on PlanPrice unique constraint | DATA_INTEGRITY | CRITICAL | VERIFIED | services/api, services/api/prisma | DONE |
| [[BUG-0047-seven-bug-records-are-verified-while-their-fixes-exist-only|BUG-0047]] | Seven bug records are VERIFIED while their fixes exist only on unmerged branches | SECURITY | CRITICAL | VERIFIED | api:organization, api:error-logs, api:employees, api:attendance, docs/qa/regressions | DONE |
| [[BUG-0071-tenant-users-reach-every-platform-super-admin-endpoint|BUG-0071]] | Tenant users reach every platform super-admin endpoint | AUTHORIZATION | CRITICAL | VERIFIED | super-admin, platform-auth, platform-communications | DONE |
| [[BUG-0899-production-cannot-deploy-the-release-chain-always-fails-beca|BUG-0899]] | Production cannot deploy: the release chain always fails because seeded legal documents declare themselves drafts | BUG | CRITICAL | VERIFIED | services/api/prisma | DONE |
| [[BUG-0900-tenant-provisioning-exceeds-the-5s-transaction-timeout-a-pai|BUG-0900]] | Tenant provisioning exceeds the 5s transaction timeout: a paid order is left with no workspace | BUG | CRITICAL | VERIFIED | api:permissions | DONE |
| [[BUG-0904-production-is-missing-outbox-worker-enabled-so-no-workspace-|BUG-0904]] | Production is missing OUTBOX_WORKER_ENABLED, so no workspace is provisioned after payment | BUG | CRITICAL | VERIFIED | api:outbox | DONE |
| [[BUG-0989-every-stripe-webhook-delivery-to-production-fails-so-a-payme|BUG-0989]] | Every Stripe webhook delivery to production fails, so a payment never reaches the platform | INFRA | CRITICAL | VERIFIED | api:billing | DONE |
| [[BUG-0994-plan-entitlements-blank-out-on-save-and-the-next-save-delete|BUG-0994]] | Plan entitlements blank out on save and the next save deletes them | DATA_INTEGRITY | CRITICAL | VERIFIED | platform-runtime, super-admin, admin | DONE |
| [[BUG-1128-stripe-api-version-skew-invoice-paid-cannot-map-to-a-subscri|BUG-1128]] | Stripe API version skew: invoice.paid cannot map to a subscription because invoice.subscription no longer exists | INTEGRATION | CRITICAL | VERIFIED | api:billing | DONE |
| [[BUG-1133-saving-a-plan-price-deactivates-every-sibling-price-on-a-nar|BUG-1133]] | Saving a plan price deactivates every sibling price on a narrower key than the unique index | DATA_INTEGRITY | CRITICAL | VERIFIED | api:super-admin, apps/admin | DONE |
| [[BUG-1595-production-has-no-tenant-email-provider-so-no-tenant-can-sen|BUG-1595]] | Production has no tenant email provider so no tenant can send any email | INFRA | CRITICAL | VERIFIED | notifications, tenants | DONE |
| [[BUG-1644-tenant-root-domain-is-misconfigured-so-no-customer-can-reach|BUG-1644]] | Tenant root domain is misconfigured so no customer can reach their workspace login | INFRA | CRITICAL | VERIFIED | tenant-domains, tenants | DONE |
| [[BUG-1742-lead-creation-is-impossible-the-runtime-form-always-sends-pa|BUG-1742]] | Lead creation is impossible: the runtime form always sends partnerId as an empty string | BUG | CRITICAL | VERIFIED | apps/admin, api:platform-runtime, api:super-admin | DONE |
| [[BUG-1743-customers-and-partners-cannot-be-edited-the-runtime-form-ech|BUG-1743]] | Customers and partners cannot be edited: the runtime form echoes fields the update DTO forbids | BUG | CRITICAL | VERIFIED | apps/admin, api:platform-runtime, api:super-admin | DONE |
| [[BUG-1744-every-subscription-has-a-zero-length-billing-period-and-a-re|BUG-1744]] | Every subscription has a zero-length billing period and a renewal date in the past | DATA_INTEGRITY | CRITICAL | VERIFIED | api:super-admin, api:billing, integration:stripe | DONE |
| [[BUG-3152-post-users-userid-roles-lets-a-delegated-role-assignment-adm|BUG-3152]] | POST /users/:userId/roles lets a delegated role-assignment admin self-grant GLOBAL_ADMIN | AUTHORIZATION | CRITICAL | FIXED | api:users/users.service.ts, api:users/users.controller.ts | DONE |
| [[BUG-1494-git-worktree-remove-follows-node-modules-junctions-and-delet|BUG-1494]] | git worktree remove follows node_modules junctions and deletes the primary checkout | INFRA | CRITICAL | VERIFIED | scripts | DONE |
| [[BUG-0049-report-only-ci-jobs-swallow-security-and-database-e2e-failur|BUG-0049]] | Report-only CI jobs swallow security and database E2E failures | INFRA | HIGH | VERIFIED | .github/workflows, services/api/src/common/constants, services/api/test, docs/qa | DONE |
| [[BUG-0052-production-dependency-graph-carries-critical-and-high-securi|BUG-0052]] | Production dependency graph carries critical and high security advisories | SECURITY | HIGH | VERIFIED | package-lock.json, apps/agent-desktop, apps/web, apps/admin, apps/landing, services/api | DONE |
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
| [[BUG-0075-public-subscribe-checkout-has-no-rate-limit-and-the-invarian|BUG-0075]] | Public subscribe checkout has no rate limit and the invariant that should catch it is inert | SECURITY | HIGH | VERIFIED | billing, common/guards | DONE |
| [[BUG-0076-repository-health-never-inspected-the-primary-worktree-so-a-|BUG-0076]] | Repository health never inspected the primary worktree, so a clean task worktree passed as CLEANUP_STATUS DONE | INFRA | HIGH | VERIFIED | scripts/repo-health.mjs, scripts/session.mjs | DONE |
| [[BUG-0077-public-subscribe-creates-a-tenant-and-a-second-customeraccou|BUG-0077]] | Public subscribe creates a Tenant and a second CustomerAccount before payment | DATA_INTEGRITY | HIGH | VERIFIED | billing, super-admin, tenants | DONE |
| [[BUG-0078-provisioning-requested-has-no-consumer-so-a-paid-self-servic|BUG-0078]] | PROVISIONING_REQUESTED has no consumer so a paid self-service customer is never provisioned | STATE_MACHINE | HIGH | VERIFIED | billing, outbox, super-admin | DONE |
| [[BUG-0079-browser-e2e-spends-its-whole-install-step-on-apt-work-that-i|BUG-0079]] | Browser e2e spends its whole install step on apt work that installs no browser library | PERFORMANCE | HIGH | VERIFIED | .github/workflows, e2e | DONE |
| [[BUG-0080-seeded-prices-bill-a-flat-fee-while-the-terms-say-the-billab|BUG-0080]] | Seeded prices bill a flat fee while the Terms say the billable unit is an active employee | DATA_INTEGRITY | HIGH | VERIFIED | billing, super-admin, legal | DONE |
| [[BUG-0082-the-onboarding-wizard-collects-five-steps-of-data-it-cannot-|BUG-0082]] | The onboarding wizard collects five steps of data it cannot submit | UX | HIGH | VERIFIED | landing | DONE |
| [[BUG-0083-the-database-agent-preflight-reports-pass-on-a-database-with|BUG-0083]] | The Database Agent preflight reports PASS on a database with every migration unapplied | INFRA | HIGH | VERIFIED | scripts, .agent, services/api | DONE |
| [[BUG-0085-the-release-command-aborted-a-first-deploy-and-otherwise-res|BUG-0085]] | The release command aborted a first deploy, and otherwise reset the super admin password | INFRA | HIGH | VERIFIED | platform-users, legal | DONE |
| [[BUG-0086-prisma-migrate-deploy-cannot-acquire-its-advisory-lock-throu|BUG-0086]] | Prisma migrate deploy cannot acquire its advisory lock through Neon pooled endpoint | INFRA | HIGH | VERIFIED | services/api/prisma | DONE |
| [[BUG-0163-package-lock-json-cannot-be-regenerated-npm-overrides-are-si|BUG-0163]] | package-lock.json cannot be regenerated - npm overrides are silently ignored | INFRA | HIGH | VERIFIED | package-lock.json, apps/admin | DONE |
| [[BUG-0220-saving-a-plan-from-the-runtime-record-page-always-returns-40|BUG-0220]] | Saving a plan from the runtime record page always returns 400 | BUG | HIGH | VERIFIED | apps/admin, api:platform-runtime, api:super-admin | DONE |
| [[BUG-0280-self-service-checkout-leaves-a-customer-with-no-plan-billing|BUG-0280]] | Self-service checkout leaves a customer with no plan, billing cycle or origin channel | DATA_INTEGRITY | HIGH | VERIFIED | api:billing, api:super-admin, apps/admin | DONE |
| [[BUG-0282-the-platform-runtime-schema-manifest-drifted-from-schema-pri|BUG-0282]] | The platform runtime schema manifest drifted from schema.prisma and no check noticed | DATA_INTEGRITY | HIGH | VERIFIED | pkg:config, apps/admin, services/api/prisma | DONE |
| [[BUG-0312-provisioning-issues-no-workspace-hostname-when-no-tenant-bas|BUG-0312]] | Provisioning issues no workspace hostname when no tenant base domain is configured | INFRA | HIGH | VERIFIED | services/api, pkg:config, apps/admin | DONE |
| [[BUG-0313-admin-builds-workspace-urls-from-a-second-divergent-copy-of-|BUG-0313]] | Admin builds workspace URLs from a second, divergent copy of the rule | BUG | HIGH | VERIFIED | apps/admin, pkg:config | DONE |
| [[BUG-0353-the-api-resolved-a-workspace-hostname-from-a-variable-nothin|BUG-0353]] | The API resolved a workspace hostname from a variable nothing sets | INTEGRATION | HIGH | VERIFIED | api:tenants, pkg:config | DONE |
| [[BUG-0418-contract-placeholders-declared-a-formatting-rule-that-nothin|BUG-0418]] | Contract placeholders declared a formatting rule that nothing applied | DATA_INTEGRITY | HIGH | VERIFIED | api:contracts | DONE |
| [[BUG-0419-preview-sample-data-replaced-the-live-template-and-rendered-|BUG-0419]] | Preview sample data replaced the live template and rendered one paint late | UX | HIGH | VERIFIED | apps/admin | DONE |
| [[BUG-0422-an-abandoned-provisioning-run-blocked-every-retry-with-no-ro|BUG-0422]] | An abandoned provisioning run blocked every retry with no route out | STATE_MACHINE | HIGH | VERIFIED | api:tenant-control-plane, apps/admin | DONE |
| [[BUG-0463-an-active-reachable-tenant-reported-that-its-workspace-was-n|BUG-0463]] | An active reachable tenant reported that its workspace was not provisioned | STATE_MACHINE | HIGH | VERIFIED | api:tenant-control-plane, apps/admin | DONE |
| [[BUG-0531-flat-prices-were-sellable-on-the-public-site-at-invented-amo|BUG-0531]] | Flat prices were sellable on the public site at invented amounts | DATA_INTEGRITY | HIGH | VERIFIED | super-admin, apps/admin | DONE |
| [[BUG-0533-seeding-the-commercial-catalogue-never-corrected-an-existing|BUG-0533]] | Seeding the commercial catalogue never corrected an existing plan or price | DATA_INTEGRITY | HIGH | VERIFIED | super-admin, apps/admin | DONE |
| [[BUG-0627-admin-sign-out-does-not-revoke-the-platform-session-when-the|BUG-0627]] | Admin sign-out does not revoke the platform session when the refresh cookie has expired | AUTHORIZATION | HIGH | VERIFIED | api:auth, apps/admin | DONE |
| [[BUG-0714-customer-emails-link-to-the-vercel-app-host-and-api-base-url|BUG-0714]] | Customer emails link to the vercel.app host, and API_BASE_URL is plain HTTP | INFRA | HIGH | VERIFIED | services/api, apps/web, docs/deployment | DONE |
| [[BUG-0767-render-yaml-is-not-what-production-runs-so-no-seed-or-legal-|BUG-0767]] | render.yaml is not what production runs, so no seed or legal publication has ever executed | INFRA | HIGH | VERIFIED | render.yaml, services/api/prisma, docs/deployment | DONE |
| [[BUG-0792-qatar-market-resolves-to-gcc-because-its-country-row-is-neve|BUG-0792]] | Qatar market resolves to GCC because its country row is never repaired, so Doha visitors are quoted USD | DATA_INTEGRITY | HIGH | VERIFIED | api:super-admin | DONE |
| [[BUG-0793-checkout-quotes-the-alphabetically-first-plan-price-currency|BUG-0793]] | Checkout quotes the alphabetically first plan price currency instead of the visitor market currency | BUG | HIGH | VERIFIED | apps/landing | DONE |
| [[BUG-0794-plan-record-page-pricing-tab-is-filtered-out-leaving-plan-pr|BUG-0794]] | Plan record page Pricing tab is filtered out, leaving plan price configuration unreachable | UX | HIGH | VERIFIED | apps/admin | DONE |
| [[BUG-0877-editing-a-plan-price-always-fails-with-property-synctostripe|BUG-0877]] | Editing a plan price always fails with property syncToStripe should not exist | BUG | HIGH | VERIFIED | apps/admin | DONE |
| [[BUG-0901-a-paid-order-records-totalamount-0-00-for-every-flat-plan-wh|BUG-0901]] | A paid order records totalAmount 0.00 for every FLAT plan while Stripe charges the full price | BUG | HIGH | VERIFIED | api:billing | DONE |
| [[BUG-0902-marktenantready-has-no-caller-so-a-paid-workspace-is-never-m|BUG-0902]] | markTenantReady has no caller, so a paid workspace is never marked ready and its URL is never shown | BUG | HIGH | VERIFIED | api:super-admin | DONE |
| [[BUG-0906-production-has-no-published-legal-documents-so-purchases-rec|BUG-0906]] | Production has no published legal documents, so purchases record no consent and the footer links to nothing | BUG | HIGH | VERIFIED | api:legal, apps/landing | DONE |
| [[BUG-0976-a-disallowed-cors-origin-returns-500-and-writes-an-error-log|BUG-0976]] | A disallowed CORS origin returns 500 and writes an error-log row, so anyone can fill the table | SECURITY | HIGH | VERIFIED | services/api/src/config | DONE |
| [[BUG-0995-editing-any-plan-price-500s-once-its-stripe-product-id-goes-|BUG-0995]] | Editing any plan price 500s once its Stripe product id goes stale | INTEGRATION | HIGH | VERIFIED | billing, super-admin | DONE |
| [[BUG-1134-a-stale-stripe-price-id-500s-the-plan-pricing-screen-because|BUG-1134]] | A stale Stripe price id 500s the plan pricing screen because verifyRecurringPrice is unguarded | INTEGRATION | HIGH | VERIFIED | api:billing, api:super-admin, apps/admin | DONE |
| [[BUG-1203-repo-health-reports-changed-by-this-task-for-another-session|BUG-1203]] | repo-health reports CHANGED_BY_THIS_TASK for another session's merge | INFRA | HIGH | VERIFIED | framework | DONE |
| [[BUG-1302-annual-per-seat-price-is-labelled-per-month-on-the-checkout-|BUG-1302]] | Annual per-seat price is labelled per month on the checkout page | UX | HIGH | VERIFIED | apps/landing | DONE |
| [[BUG-1303-the-dp-chk-01-checkout-unavailable-link-writes-a-diagnostic-|BUG-1303]] | The DP-CHK-01 checkout-unavailable link writes a diagnostic code into the partner referral cookie | DATA_INTEGRITY | HIGH | VERIFIED | apps/landing | DONE |
| [[BUG-1369-checkout-resolves-a-plan-price-by-currency-and-cycle-only-so|BUG-1369]] | Checkout resolves a plan price by currency and cycle only, so it can quote a billing model the plans page never advertises | BUG | HIGH | VERIFIED | apps/landing | DONE |
| [[BUG-1378-the-public-plans-endpoint-publishes-sales-assisted-internal-|BUG-1378]] | The public plans endpoint publishes sales-assisted internal pricing to anonymous visitors | SECURITY | HIGH | VERIFIED | api:billing | DONE |
| [[BUG-1419-every-incident-on-the-monitoring-overview-links-to-a-route-t|BUG-1419]] | Every incident on the monitoring overview links to a route that does not exist | BUG | HIGH | VERIFIED | apps/admin | DONE |
| [[BUG-1420-the-monitoring-severity-filter-cannot-match-99-7-percent-of-|BUG-1420]] | The monitoring severity filter cannot match 99.7 percent of stored incidents | DATA_INTEGRITY | HIGH | VERIFIED | apps/admin, api:error-logs | DONE |
| [[BUG-1422-runtime-form-validation-discards-every-field-reason-and-show|BUG-1422]] | Runtime form validation discards every field reason and shows the user Bad Request Exception | BUG | HIGH | VERIFIED | api:platform-runtime, apps/admin | DONE |
| [[BUG-1423-runtime-form-controls-have-no-accessible-name-so-screen-read|BUG-1423]] | Runtime form controls have no accessible name so screen readers announce every field as blank | UX | HIGH | VERIFIED | apps/admin | DONE |
| [[BUG-1515-tenant-activation-invitation-reported-as-sent-when-it-was-ne|BUG-1515]] | Tenant activation invitation reported as sent when it was never delivered | STATE_MACHINE | HIGH | VERIFIED | auth, tenant-control-plane, notifications | DONE |
| [[BUG-1516-public-signup-creates-duplicate-customer-records-breaking-st|BUG-1516]] | Public signup creates duplicate customer records, breaking Stripe tenant resolution | DATA_INTEGRITY | HIGH | VERIFIED | super-admin, billing, landing | DONE |
| [[BUG-1541-generated-agreement-pdfs-render-unsubstituted-template-place|BUG-1541]] | Generated agreement PDFs render unsubstituted template placeholders | BUG | HIGH | VERIFIED | contracts, legal | DONE |
| [[BUG-1543-stripe-webhook-rejected-as-validation-failed-during-a-live-p|BUG-1543]] | Stripe webhook rejected as VALIDATION_FAILED during a live payment | INTEGRATION | HIGH | FIXED | billing | DONE |
| [[BUG-1544-public-signup-advertises-a-workspace-domain-that-does-not-re|BUG-1544]] | Public signup advertises a workspace domain that does not resolve | UX | HIGH | VERIFIED | tenant-domains, leads | DONE |
| [[BUG-1578-admin-customer-form-stores-a-country-lookup-id-where-every-r|BUG-1578]] | Admin customer form stores a country lookup id where every reader expects a name | DATA_INTEGRITY | HIGH | VERIFIED | super-admin, contracts, lookups | DONE |
| [[BUG-1649-api-proxy-routes-copy-the-upstream-content-encoding-onto-an-|BUG-1649]] | API proxy routes copy the upstream Content-Encoding onto an already-decompressed body | BUG | HIGH | VERIFIED | settings-runtime, tenant-settings | DONE |
| [[BUG-1745-the-executive-dashboard-reports-zero-revenue-because-reporti|BUG-1745]] | The executive dashboard reports zero revenue because reporting currency is PKR and all money is QAR | BUG | HIGH | VERIFIED | apps/admin, api:super-admin | DONE |
| [[BUG-1747-partner-currency-is-a-required-numeric-input-so-partner-crea|BUG-1747]] | Partner Currency is a required numeric input so partner creation forces a corrupt currency code | BUG | HIGH | VERIFIED | apps/admin, api:super-admin | DONE |
| [[BUG-1749-admin-creates-plans-that-can-never-be-sold-and-can-never-be-|BUG-1749]] | Admin creates plans that can never be sold and can never be deleted | BUG | HIGH | VERIFIED | apps/admin, api:super-admin | DONE |
| [[BUG-1750-the-monitoring-critical-tile-miscounts-and-links-to-a-filter|BUG-1750]] | The monitoring critical tile miscounts and links to a filter that matches nothing | BUG | HIGH | VERIFIED | apps/admin, api:platform-monitoring | DONE |
| [[BUG-1751-a-promotion-goes-live-against-every-subscription-the-instant|BUG-1751]] | A promotion goes live against every subscription the instant it is created | BUG | HIGH | VERIFIED | apps/admin, api:super-admin, integration:stripe | DONE |
| [[BUG-1755-the-plans-list-cannot-show-publication-status-or-sales-model|BUG-1755]] | The plans list cannot show publication status or sales model because the API omits them | BUG | HIGH | VERIFIED | apps/admin, api:super-admin | DONE |
| [[BUG-1952-plan-entitlements-gate-nothing-so-a-starter-tenant-can-use-e|BUG-1952]] | Plan entitlements gate nothing, so a Starter tenant can use every module it has not bought | BUG | HIGH | FIXED | api:tenant-settings, apps/web | DONE |
| [[BUG-1954-the-starter-annual-price-tile-renders-pkr-120-000-00-for-a-p|BUG-1954]] | The Starter annual price tile renders PKR 120,000.00 for a PKR 3,000 annual price | BUG | HIGH | FIXED | apps/admin, api:super-admin | DONE |
| [[BUG-1957-a-department-with-no-business-unit-cannot-be-listed-opened-e|BUG-1957]] | A department with no business unit cannot be listed, opened, edited or deleted, yet still holds its name | DATA_INTEGRITY | HIGH | FIXED | api:organization | DONE |
| [[BUG-1961-a-leave-policy-assignment-cannot-be-created-from-the-ui-beca|BUG-1961]] | A leave policy assignment cannot be created from the UI because the parent id is never sent | BUG | HIGH | VERIFIED | apps/web, api:leave | DONE |
| [[BUG-1965-the-leave-request-form-sends-ownerid-and-status-which-the-ap|BUG-1965]] | The leave request form sends ownerId and status, which the API rejects as forbidden properties | BUG | HIGH | FIXED | apps/web, api:leave | DONE |
| [[BUG-1966-a-failed-save-in-the-runtime-form-is-swallowed-with-no-messa|BUG-1966]] | A failed save in the runtime form is swallowed with no message, toast or inline error | UX | HIGH | FIXED | apps/web | DONE |
| [[BUG-1967-leave-entitlement-is-never-allocated-to-a-balance-so-every-l|BUG-1967]] | Leave entitlement is never allocated to a balance, so every leave request is refused | BUG | HIGH | VERIFIED | api:leave | DONE |
| [[BUG-1968-leave-approval-routing-requires-an-active-reporting-manager-|BUG-1968]] | Leave approval routing rejects the submission unless every rule in the chain resolves to an active approver | BUG | HIGH | VERIFIED | api:leave, api:approvals | DONE |
| [[BUG-1970-the-elevated-role-bypass-precedes-the-self-requester-check-o|BUG-1970]] | The elevated-role bypass precedes the self-requester check on leave approval steps | AUTHORIZATION | HIGH | FIXED | api:leave | DONE |
| [[BUG-1974-246-of-591-tenant-setting-keys-have-no-reader-and-230-of-the|BUG-1974]] | 246 of 591 tenant setting keys have no reader and 230 of them are editable in the UI | BUG | HIGH | FIXED | api:tenant-settings, apps/web | DONE |
| [[BUG-1976-eight-settings-controls-write-a-key-name-the-resolver-never-|BUG-1976]] | Eight settings controls write a key name the resolver never reads | BUG | HIGH | FIXED | api:tenant-settings, apps/web | DONE |
| [[BUG-1986-tenant-settings-has-four-blocking-accessibility-violations-i|BUG-1986]] | Tenant settings has four blocking accessibility violations including buttons with no name | UX | HIGH | FIXED | apps/web | DONE |
| [[BUG-2003-the-tenant-users-screen-crashes-into-the-error-boundary-for-|BUG-2003]] | The tenant Users screen requests an entity the data registry does not have, so it never renders | BUG | HIGH | FIXED | apps/web, api:data | DONE |
| [[BUG-2008-every-employee-is-counted-absent-on-a-non-working-day-and-ra|BUG-2008]] | Every employee is counted absent on a non-working day and raised as an exception | DATA_INTEGRITY | HIGH | FIXED | api:attendance, api:dashboard | DONE |
| [[BUG-2011-seven-related-list-dialogs-never-send-the-parent-foreign-key|BUG-2011]] | Seven related-list dialogs never send the parent foreign key and one of them creates an orphan | BUG | HIGH | VERIFIED | apps/web | DONE |
| [[BUG-2013-the-dashboard-error-boundary-classifies-server-component-fai|BUG-2013]] | The dashboard error boundary classifies server-component failures by a message it can never receive | BUG | HIGH | FIXED | apps/web | DONE |
| [[BUG-2015-approving-and-rejecting-leave-is-gated-on-read-permission-an|BUG-2015]] | Approving and rejecting leave is gated on read permission and the dedicated approve keys are never required | AUTHORIZATION | HIGH | VERIFIED | api:leave | DONE |
| [[BUG-2043-the-audit-events-screen-reports-the-number-of-rows-it-loaded|BUG-2043]] | The Audit Events screen reports the number of rows it loaded as the tenant's total audit count | BUG | HIGH | FIXED | apps/web, api:audit | DONE |
| [[BUG-2044-no-employee-lifecycle-event-is-audited-including-employee-cr|BUG-2044]] | No employee lifecycle event is audited, including employee creation and reporting-manager assignment | DATA_INTEGRITY | HIGH | FIXED | api:employees, api:organization, api:leave | DONE |
| [[BUG-2331-permissions-policy-geolocation-makes-web-attendance-check-in|BUG-2331]] | Permissions-Policy geolocation=() makes web attendance check-in impossible | BUG | HIGH | FIXED | pkg:config, apps/web, apps/admin | FIX_NOW |
| [[BUG-2332-every-attendance-refusal-reaches-the-browser-as-validation-f|BUG-2332]] | Every attendance refusal reaches the browser as VALIDATION_FAILED and raises the technical error dialog | BUG | HIGH | FIXED | services/api/src/common/errors, api:attendance, apps/web | FIX_NOW |
| [[BUG-2458-token-refresh-is-throttled-by-the-public-login-rate-limiter-|BUG-2458]] | Token refresh is throttled by the public login rate limiter, signing users out | BUG | HIGH | FIXED | api:auth, api:common | FIX_NOW |
| [[BUG-2459-the-notification-bell-polls-forever-after-a-session-ends-flo|BUG-2459]] | The notification bell polls forever after a session ends, flooding the error log | PERFORMANCE | HIGH | FIXED | web:notifications, api:error-logs, api:notifications | FIX_NOW |
| [[BUG-2462-stripe-subscription-webhooks-fail-because-the-customer-resol|BUG-2462]] | Stripe subscription webhooks fail because the customer resolves to no tenant | INTEGRATION | HIGH | FIXED | api:billing, api:super-admin | DONE |
| [[BUG-2494-check-out-re-validates-check-in-preconditions-and-traps-the-|BUG-2494]] | Check-out re-validates check-in preconditions and traps the entry open for ever | STATE_MACHINE | HIGH | FIXED | api:attendance | DONE |
| [[BUG-2504-approving-a-correction-never-applies-the-requested-work-mode|BUG-2504]] | Approving a correction never applies the requested work mode, work site or overtime | STATE_MACHINE | HIGH | FIXED | api:attendance | DONE |
| [[BUG-2505-a-mode-or-location-correction-could-never-be-submitted-at-al|BUG-2505]] | A mode-or-location correction could never be submitted at all | BUG | HIGH | FIXED | apps/web, api:attendance | DONE |
| [[BUG-2506-sign-out-leaves-the-refresh-token-live-whenever-the-tenant-i|BUG-2506]] | Sign-out leaves the refresh token live whenever the tenant is busy | SECURITY | HIGH | FIXED | api:auth | DONE |
| [[BUG-2530-self-service-checkout-still-creates-two-customer-records-the|BUG-2530]] | Self-service checkout still creates two customer records: the wizard's draft id is dropped between the controller and the order service | DATA_INTEGRITY | HIGH | VERIFIED | billing, super-admin, landing | DONE |
| [[BUG-2618-expired-subscription-orders-are-never-swept-abandonexpired-h|BUG-2618]] | Expired subscription orders are never swept: abandonExpired has no caller and the API has no scheduler | DATA_INTEGRITY | HIGH | FIXED | billing, super-admin | FIX_NOW |
| [[BUG-2623-buildscopedaccesswhere-filters-employee-on-ownerteamid-a-col|BUG-2623]] | buildScopedAccessWhere filters Employee on ownerTeamId, a column Employee does not have | AUTHORIZATION | HIGH | FIXED | services/api/src/common/security/rbac-query-scope.ts | DONE |
| [[BUG-2624-the-reports-endpoints-return-tenant-wide-aggregates-regardle|BUG-2624]] | The reports endpoints return tenant-wide aggregates regardless of the caller's row scope | AUTHORIZATION | HIGH | VERIFIED | api:reports/reports.service.ts | DONE |
| [[BUG-2683-every-scheduled-report-fails-to-deliver-because-the-email-te|BUG-2683]] | Every scheduled report fails to deliver because the email template variable tenantName is never passed | BUG | HIGH | FIXED | api:reporting/schedule | DONE |
| [[BUG-2693-historical-headcount-reports-employee-days-instead-of-headco|BUG-2693]] | Historical headcount reports employee-days instead of headcount and grows with the length of the period | DATA_INTEGRITY | HIGH | FIXED | api:reporting | DONE |
| [[BUG-2718-the-approvals-record-page-reads-the-detail-response-envelope|BUG-2718]] | The approvals record page reads the detail response envelope, so every field is blank | UX | HIGH | FIXED | approvals, leave, attendance | FIX_NOW |
| [[BUG-2732-attendance-integration-cannot-be-activated-activation-requir|BUG-2732]] | Attendance integration cannot be activated: activation requires a verified device, but only an active integration is ever verified | STATE_MACHINE | HIGH | FIXED | api:attendance-integrations, gateway/src/DijiPeople.Gateway.Host | FIX_NOW |
| [[BUG-2741-a-workspace-whose-email-provider-is-a-sink-reports-every-mes|BUG-2741]] | A workspace whose email provider is a sink reports every message as SENT | BUG | HIGH | FIXED | notifications, reporting | FIX_NOW |
| [[BUG-2933-mapping-a-device-user-never-requeues-its-punches-so-backfill|BUG-2933]] | Mapping a device user never requeues its punches, so backfilled attendance is silently never built | INTEGRATION | HIGH | FIXED | api:attendance-integrations | FIX_NOW |
| [[BUG-2958-settings-shows-every-category-group-and-page-regardless-of-t|BUG-2958]] | Settings shows every category, group and page regardless of the tenant's plan | AUTHORIZATION | HIGH | FIXED | apps/web, api:tenant-settings | FIX_NOW |
| [[BUG-3007-reports-and-analytics-offers-surfaces-and-reports-for-capabi|BUG-3007]] | Reports and Analytics offers surfaces and reports for capabilities the plan does not include | AUTHORIZATION | HIGH | FIXED | apps/web, api:reporting | FIX_NOW |
| [[BUG-3020-records-behind-these-numbers-shows-raw-guids-and-a-count-tha|BUG-3020]] | Records behind these numbers shows raw GUIDs and a count that does not match the metric | UX | HIGH | FIXED | apps/web, api:reporting | FIX_NOW |
| [[BUG-3115-rate-limiter-trusts-a-forged-x-forwarded-for-and-covers-no-a|BUG-3115]] | Rate limiter trusts a forged X-Forwarded-For and covers no authenticated endpoint | SECURITY | HIGH | FIXED | services/api/src/common/security/client-ip.ts, services/api/src/common/guards/public-rate-limit.guard.ts, services/api/src/common/interceptors/authenticated-rate-limit.interceptor.ts | DONE |
| [[BUG-3241-legacy-role-permission-grant-and-employee-export-both-skip-t|BUG-3241]] | Legacy role-permission grant and employee export both skip the sibling endpoint's access check | AUTHORIZATION | HIGH | FIXED | api:roles/roles.service.ts, api:employees/employees.service.ts | DONE |
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
| [[BUG-0041-web-route-proxies-make-authorization-and-business-decisions|BUG-0041]] | Web route proxies make authorization and business decisions | SECURITY | MEDIUM | VERIFIED | apps/web | DONE |
| [[BUG-0042-apps-web-reads-21-environment-variables-unregistered-in-turb|BUG-0042]] | apps/web reads 21 environment variables unregistered in turbo globalEnv | INFRA | MEDIUM | VERIFIED | apps/web, pkg:config | DONE |
| [[BUG-0043-web-dialogs-have-no-focus-trap-and-filter-controls-are-unlab|BUG-0043]] | Web dialogs have no focus trap and filter controls are unlabelled | UX | MEDIUM | VERIFIED | apps/web | DONE |
| [[BUG-0044-the-documented-new-module-workflow-for-apps-web-cannot-be-fo|BUG-0044]] | The documented new module workflow for apps/web cannot be followed | DOCUMENTATION | MEDIUM | VERIFIED | apps/web | DONE |
| [[BUG-0045-the-canonical-settings-and-branding-contract-is-materially-s|BUG-0045]] | The canonical settings and branding contract is materially stale | DOCUMENTATION | MEDIUM | VERIFIED | apps/web, docs/architecture | DONE |
| [[BUG-0046-tenant-theme-mode-and-runtime-settings-saves-do-not-take-eff|BUG-0046]] | Tenant theme mode and runtime settings saves do not take effect | UX | MEDIUM | VERIFIED | apps/web | DONE |
| [[BUG-0050-notification-settings-offer-email-providers-whose-backend-al|BUG-0050]] | Notification settings offer email providers whose backend always fails | INTEGRATION | MEDIUM | VERIFIED | apps/web, api:notifications | DONE |
| [[BUG-0065-public-commercial-config-omits-featurecatalog-when-no-market|BUG-0065]] | Public commercial-config omits featureCatalog when no market resolves | BUG | MEDIUM | VERIFIED | api:billing, apps/landing | DONE |
| [[BUG-0066-subscribe-page-renders-an-editable-form-with-no-way-to-submi|BUG-0066]] | Subscribe page renders an editable form with no way to submit when checkout is unavailable | UX | MEDIUM | VERIFIED | apps/landing | DONE |
| [[BUG-0073-small-uppercase-labels-in-slate-400-fail-wcag-aa-contrast-ac|BUG-0073]] | Small uppercase labels in slate-400 fail WCAG AA contrast across admin | UX | MEDIUM | VERIFIED | apps/admin | DONE |
| [[BUG-0074-the-provisioning-queue-scroll-container-was-unreachable-by-k|BUG-0074]] | The provisioning queue scroll container was unreachable by keyboard | UX | MEDIUM | VERIFIED | apps/admin | DONE |
| [[BUG-0081-three-apps-claimed-a-forwarded-headers-invariant-test-that-d|BUG-0081]] | Three apps claimed a forwarded-headers invariant test that did not exist | TEST_GAP | MEDIUM | VERIFIED | landing, web, admin | DONE |
| [[BUG-0221-schema-completed-form-fields-render-on-a-tab-the-form-never-|BUG-0221]] | Schema-completed form fields render on a tab the form never declares | UX | MEDIUM | VERIFIED | apps/admin | DONE |
| [[BUG-0222-plan-related-record-panels-declare-no-tab-so-they-never-rend|BUG-0222]] | Plan related-record panels declare no tab, so they never render | UX | MEDIUM | VERIFIED | apps/admin | DONE |
| [[BUG-0281-partner-attribution-is-lost-when-a-referred-buyer-purchases-|BUG-0281]] | Partner attribution is lost when a referred buyer purchases through self-service checkout | DATA_INTEGRITY | MEDIUM | VERIFIED | apps/landing, api:billing, api:partner-experience | DONE |
| [[BUG-0283-a-regenerated-prisma-client-against-an-un-migrated-database-|BUG-0283]] | A regenerated Prisma client against an un-migrated database 500s every affected screen | INFRA | MEDIUM | VERIFIED | services/api, services/api/prisma, apps/admin | DONE |
| [[BUG-0314-the-notifications-page-is-a-placeholder-under-a-permanently-|BUG-0314]] | The notifications page is a placeholder under a permanently lit badge | UX | MEDIUM | VERIFIED | apps/admin, api:platform-events | DONE |
| [[BUG-0315-workspace-preferences-are-stored-in-localstorage-and-never-a|BUG-0315]] | Workspace preferences are stored in localStorage and never applied | UX | MEDIUM | VERIFIED | apps/admin, api:platform-users, services/api/prisma | DONE |
| [[BUG-0316-country-industry-and-contact-fields-are-free-text-where-a-ca|BUG-0316]] | Country industry and contact fields are free text where a canonical list exists | DATA_INTEGRITY | MEDIUM | VERIFIED | apps/landing, apps/admin, api:lookups, pkg:config | DONE |
| [[BUG-0317-the-subscribe-wizard-shows-five-identical-pills-and-labels-t|BUG-0317]] | The subscribe wizard shows five identical pills and labels three address fields only by placeholder | UX | MEDIUM | VERIFIED | apps/landing | DONE |
| [[BUG-0350-the-subscribe-wizard-s-country-field-silently-degraded-to-fr|BUG-0350]] | The subscribe wizard's country field silently degraded to free text | DATA_INTEGRITY | MEDIUM | VERIFIED | apps/landing | DONE |
| [[BUG-0351-the-subscribe-wizard-progress-rail-truncated-every-step-labe|BUG-0351]] | The subscribe wizard progress rail truncated every step label | UX | MEDIUM | VERIFIED | apps/landing | DONE |
| [[BUG-0420-the-console-dark-theme-set-color-scheme-and-repainted-nothin|BUG-0420]] | The console dark theme set color-scheme and repainted nothing | UX | MEDIUM | VERIFIED | apps/admin | DONE |
| [[BUG-0421-an-overflow-declaration-in-the-shell-disabled-every-sticky-e|BUG-0421]] | An overflow declaration in the shell disabled every sticky element | UX | MEDIUM | VERIFIED | apps/admin | DONE |
| [[BUG-0439-the-subscribe-form-was-disabled-without-looking-disabled-or-|BUG-0439]] | The subscribe form was disabled without looking disabled or saying why beside it | UX | MEDIUM | VERIFIED | apps/landing, apps/admin | DONE |
| [[BUG-0460-the-notification-badge-counted-over-a-window-sized-by-the-pa|BUG-0460]] | The notification badge counted over a window sized by the page it was fetching | UX | MEDIUM | VERIFIED | api:platform-events, apps/admin | DONE |
| [[BUG-0461-the-cost-estimator-listed-flat-priced-plans-under-a-headcoun|BUG-0461]] | The cost estimator listed flat-priced plans under a headcount input | UX | MEDIUM | VERIFIED | apps/landing | DONE |
| [[BUG-0462-monitoring-opened-on-a-twelve-thousand-row-queue-with-five-u|BUG-0462]] | Monitoring opened on a twelve thousand row queue with five unactionable tiles | UX | MEDIUM | VERIFIED | apps/admin | DONE |
| [[BUG-0492-the-workspace-url-was-built-by-hand-in-two-more-places|BUG-0492]] | The workspace URL was built by hand in two more places | INTEGRATION | MEDIUM | VERIFIED | api:tenant-control-plane, pkg:config | DONE |
| [[BUG-0493-open-tenant-reported-success-while-opening-nothing|BUG-0493]] | Open Tenant reported success while opening nothing | UX | MEDIUM | VERIFIED | apps/admin | DONE |
| [[BUG-0494-workspace-hostnames-stayed-pending-for-ever-with-nothing-to-|BUG-0494]] | Workspace hostnames stayed Pending for ever with nothing to explain or reconcile it | STATE_MACHINE | MEDIUM | VERIFIED | api:tenant-domains, api:super-admin, apps/admin | DONE |
| [[BUG-0495-the-console-painted-light-on-every-load-before-the-dark-them|BUG-0495]] | The console painted light on every load before the dark theme arrived | UX | MEDIUM | VERIFIED | apps/admin | DONE |
| [[BUG-0496-the-monitoring-landing-page-showed-real-data-an-agent-could-|BUG-0496]] | The monitoring landing page showed real data an agent could not act on | UX | MEDIUM | VERIFIED | apps/admin | DONE |
| [[BUG-0497-fifteen-modules-offered-no-delete-and-no-reason-for-its-abse|BUG-0497]] | Fifteen modules offered no Delete and no reason for its absence | UX | MEDIUM | VERIFIED | apps/admin, api:partners, api:platform-runtime | DONE |
| [[BUG-0534-plan-form-offered-editable-legacy-price-fields-that-bill-nob|BUG-0534]] | Plan form offered editable legacy price fields that bill nobody | UX | MEDIUM | VERIFIED | super-admin, apps/admin | DONE |
| [[BUG-0668-exchange-rate-resolution-ignored-the-effective-date-it-was-g|BUG-0668]] | Exchange rate resolution ignored the effective date it was given | DATA_INTEGRITY | MEDIUM | VERIFIED | api:tenant-settings | DONE |
| [[BUG-0795-saved-table-preferences-hide-every-column-added-to-a-module-|BUG-0795]] | Saved table preferences hide every column added to a module afterwards | UX | MEDIUM | VERIFIED | apps/admin | DONE |
| [[BUG-0905-production-defines-direct-url-but-the-code-reads-direct-data|BUG-0905]] | Production defines DIRECT_URL but the code reads DIRECT_DATABASE_URL, so migrations run over the pooled endpoint | BUG | MEDIUM | VERIFIED | services/api/prisma, pkg:config | DONE |
| [[BUG-0907-an-unknown-legal-slug-answers-200-and-hangs-on-the-loading-s|BUG-0907]] | An unknown legal slug answers 200 and hangs on the loading shell instead of returning 404 | BUG | MEDIUM | VERIFIED | apps/landing | DONE |
| [[BUG-1208-component-index-check-fails-on-every-windows-checkout-passes|BUG-1208]] | component-index --check fails on every Windows checkout, passes in CI | INFRA | MEDIUM | VERIFIED | framework | DONE |
| [[BUG-1261-the-admin-theme-bootstrap-script-runs-in-head-where-react-hy|BUG-1261]] | The admin theme bootstrap script runs in head where React hydrates it against extension-injected scripts | UX | MEDIUM | VERIFIED | apps/admin | DONE |
| [[BUG-1304-production-subscribe-wizard-offers-only-eight-countries-beca|BUG-1304]] | Production subscribe wizard offers only eight countries because the ISO country sync never populates production | DATABASE | MEDIUM | VERIFIED | api:lookups, apps/landing | DONE |
| [[BUG-1305-priority-country-sortorder-collides-with-alphabetical-sortor|BUG-1305]] | Priority country sortOrder collides with alphabetical sortOrder, scattering key markets mid-list | DATABASE | MEDIUM | VERIFIED | api:lookups | DONE |
| [[BUG-1364-a-coordinate-leak-assertion-substring-matches-json-and-fails|BUG-1364]] | A coordinate-leak assertion substring-matches JSON and fails when the clock spells a coordinate | TEST_GAP | MEDIUM | VERIFIED | services/api/test | DONE |
| [[BUG-1421-every-admin-screen-shares-one-page-title-two-main-landmarks-|BUG-1421]] | Every admin screen shares one page title, two main landmarks and a duplicate h1 | UX | MEDIUM | VERIFIED | apps/admin | DONE |
| [[BUG-1424-the-admin-console-serves-no-content-security-policy-header|BUG-1424]] | The admin console serves no Content-Security-Policy header | SECURITY | MEDIUM | VERIFIED | apps/admin | DONE |
| [[BUG-1425-currencycode-accepts-any-string-of-three-characters-or-fewer|BUG-1425]] | currencyCode accepts any string of three characters or fewer | DATA_INTEGRITY | MEDIUM | VERIFIED | api:partners | DONE |
| [[BUG-1545-manual-customer-onboarding-creation-fails-on-an-owner-foreig|BUG-1545]] | Manual customer onboarding creation fails on an owner foreign key | BUG | MEDIUM | VERIFIED | platform-runtime, onboarding | DONE |
| [[BUG-1546-required-fields-on-unfocused-tabs-give-no-indication-of-wher|BUG-1546]] | Required fields on unfocused tabs give no indication of where they are | UX | MEDIUM | VERIFIED | customization | DONE |
| [[BUG-1547-onboarding-prerequisite-message-states-the-inverse-of-the-tr|BUG-1547]] | Onboarding prerequisite message states the inverse of the truth | UX | MEDIUM | VERIFIED | onboarding | DONE |
| [[BUG-1548-customer-onboarding-validate-accepts-payloads-that-create-re|BUG-1548]] | Customer onboarding validate accepts payloads that create rejects | BUG | MEDIUM | FIXED | onboarding | DONE |
| [[BUG-1549-database-and-validator-internals-are-surfaced-in-user-facing|BUG-1549]] | Database and validator internals are surfaced in user-facing errors | UX | MEDIUM | VERIFIED | error-logs | DONE |
| [[BUG-1550-lead-record-shows-two-different-owners-on-the-same-screen|BUG-1550]] | Lead record shows two different owners on the same screen | BUG | MEDIUM | VERIFIED | leads | DONE |
| [[BUG-1551-desktop-agent-auto-update-manifest-returns-404|BUG-1551]] | Desktop agent auto-update manifest returns 404 | INTEGRATION | MEDIUM | FIXED | agent, app-releases | DONE |
| [[BUG-1553-owner-and-template-pickers-list-indistinguishable-duplicate-|BUG-1553]] | Owner and template pickers list indistinguishable duplicate entries | UX | MEDIUM | VERIFIED | contracts, platform-users | DONE |
| [[BUG-1554-admin-requests-its-own-partners-api-with-a-rejected-pagesize|BUG-1554]] | Admin requests its own partners API with a rejected pageSize | BUG | MEDIUM | VERIFIED | partners | DONE |
| [[BUG-1555-an-inactive-plan-with-no-prices-is-offered-as-a-customer-pre|BUG-1555]] | An inactive plan with no prices is offered as a customer preferred plan | BUG | MEDIUM | VERIFIED | super-admin, billing | DONE |
| [[BUG-1654-every-empty-list-in-a-new-workspace-blames-filters-that-are-|BUG-1654]] | Every empty list in a new workspace blames filters that are not set | UX | MEDIUM | VERIFIED | views, employees | DONE |
| [[BUG-1655-tenant-login-password-field-has-no-accessible-name-and-no-au|BUG-1655]] | Tenant login password field has no accessible name and no autocomplete hint | UX | MEDIUM | VERIFIED | auth | DONE |
| [[BUG-1668-tenant-workspace-pages-scroll-horizontally-at-mobile-width|BUG-1668]] | Tenant workspace pages scroll horizontally at mobile width | UX | MEDIUM | FIXED | views | DONE |
| [[BUG-1673-tenant-workspace-shell-repeats-three-h1-headings-and-two-mai|BUG-1673]] | Tenant workspace shell repeats three h1 headings and two main landmarks on every screen | UX | MEDIUM | VERIFIED | views | DONE |
| [[BUG-1746-required-fields-on-unselected-tabs-are-undiscoverable-so-cre|BUG-1746]] | Required fields on unselected tabs are undiscoverable so create forms dead-end | UX | MEDIUM | VERIFIED | apps/admin | DONE |
| [[BUG-1748-the-subscription-record-page-cannot-resolve-its-own-tenant-p|BUG-1748]] | The subscription record page cannot resolve its own tenant plan or price | BUG | MEDIUM | VERIFIED | apps/admin, api:platform-runtime | DONE |
| [[BUG-1754-the-incident-queue-counts-routine-401s-and-unknown-route-404|BUG-1754]] | The incident queue counts routine 401s and unknown-route 404s as incidents needing triage | BUG | MEDIUM | VERIFIED | api:platform-monitoring, api:error-logs | DONE |
| [[BUG-1756-bulk-delete-confirms-without-naming-how-many-records-or-whic|BUG-1756]] | Bulk delete confirms without naming how many records or which ones | UX | MEDIUM | VERIFIED | apps/admin | DONE |
| [[BUG-1757-promotions-cannot-be-deleted-and-the-delete-route-silently-d|BUG-1757]] | Promotions cannot be deleted and the DELETE route silently deactivates instead | BUG | MEDIUM | VERIFIED | apps/admin, api:super-admin | DONE |
| [[BUG-1822-landing-csp-permits-the-api-over-http-so-its-own-connect-src|BUG-1822]] | Landing CSP permits the API over http, so its own connect-src does not match | INFRA | MEDIUM | VERIFIED | apps/landing, pkg:config | DONE |
| [[BUG-1883-app-releases-and-agent-rollout-render-on-a-shell-no-other-ad|BUG-1883]] | App releases and Agent rollout render on a shell no other admin screen uses | UX | MEDIUM | VERIFIED | apps/admin | DONE |
| [[BUG-1884-the-re-check-payment-action-is-offered-on-every-customer-inc|BUG-1884]] | The re-check payment action is offered on every customer, including ones who have paid | UX | MEDIUM | VERIFIED | apps/admin, api:billing | DONE |
| [[BUG-1950-every-tenant-workspace-screen-renders-the-same-h1-so-no-page|BUG-1950]] | Every tenant workspace screen renders the same h1, so no page announces what it is | UX | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-1951-most-tenant-workspace-pages-render-no-main-landmark-includin|BUG-1951]] | Most tenant workspace pages render no main landmark, including every settings category | UX | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-1953-plan-detail-reports-zero-subscriptions-while-the-plans-list-|BUG-1953]] | Plan detail reports zero subscriptions while the plans list and subscriptions both show two | BUG | MEDIUM | FIXED | apps/admin, api:super-admin | DONE |
| [[BUG-1955-every-404-is-reported-to-the-user-as-database-record-not-fou|BUG-1955]] | Every 404 is reported to the user as DATABASE_RECORD_NOT_FOUND with the raw HTML body as its message | UX | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-1956-runtime-lookup-comboboxes-expose-no-listbox-or-option-semant|BUG-1956]] | Runtime lookup comboboxes expose no listbox or option semantics to assistive technology | UX | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-1958-deleting-a-department-never-releases-its-name-so-it-can-neve|BUG-1958]] | Deleting a department never releases its name, so it can never be recreated | DATA_INTEGRITY | MEDIUM | FIXED | api:organization | DONE |
| [[BUG-1959-the-departments-list-returns-a-bare-array-and-rejects-the-pa|BUG-1959]] | The departments list returns a bare array and rejects the page size its own table offers | BUG | MEDIUM | FIXED | api:organization, apps/web | DONE |
| [[BUG-1962-assigned-on-is-required-by-the-leave-assignment-api-and-rend|BUG-1962]] | Assigned On is required by the leave assignment API and rendered as an optional field | UX | MEDIUM | FIXED | apps/web, api:leave | DONE |
| [[BUG-1963-runtime-dialogs-show-the-end-user-the-raw-server-message-and|BUG-1963]] | Runtime dialogs show the end user the raw server message and the HTTP method and path | UX | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-1969-an-invited-approver-is-rejected-with-a-message-that-blames-t|BUG-1969]] | An invited approver is rejected with a message that blames tenancy instead of account status | BUG | MEDIUM | FIXED | api:approvals | DONE |
| [[BUG-1977-the-platform-localization-panel-queries-dotted-setting-keys-|BUG-1977]] | The platform Localization panel queries dotted setting keys that no row can ever hold | BUG | MEDIUM | FIXED | api:tenant-control-plane, apps/admin | DONE |
| [[BUG-1978-two-attendance-checkboxes-are-not-catalog-keys-so-touching-e|BUG-1978]] | Two attendance checkboxes are not catalog keys, so touching either rejects the whole settings save | BUG | MEDIUM | FIXED | apps/web, api:tenant-settings | DONE |
| [[BUG-1979-seven-attendance-settings-are-overwritten-on-write-and-the-a|BUG-1979]] | Seven mandated attendance settings are still rendered editable and the refusal is never reported | BUG | MEDIUM | FIXED | api:tenant-settings | DONE |
| [[BUG-1981-resolvepolicy-hardcodes-seven-location-values-and-inverts-tw|BUG-1981]] | resolvePolicy hardcodes seven location values and two AttendancePolicy columns are dead | BUG | MEDIUM | FIXED | api:attendance | DONE |
| [[BUG-2004-the-approvals-inbox-offers-a-new-action-whose-page-crashes-i|BUG-2004]] | The approvals module emits a New action for a page that does not exist, and the detail route throws on it | BUG | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-2005-manual-attendance-accepts-a-date-arbitrarily-far-in-the-futu|BUG-2005]] | Manual attendance accepts a date arbitrarily far in the future | DATA_INTEGRITY | MEDIUM | FIXED | api:attendance | DONE |
| [[BUG-2006-a-successful-save-reports-nothing-to-the-user-on-the-runtime|BUG-2006]] | A successful save reports nothing to the user on the runtime forms and the branding page | UX | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-2009-display-labels-fall-through-to-the-raw-field-key-or-raw-enum|BUG-2009]] | Display labels fall through to the raw field key or raw enum value on three tenant surfaces | UX | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-2012-the-related-list-create-dialog-pre-fills-child-fields-with-t|BUG-2012]] | The related-list create dialog pre-fills child fields with the parent record values | DATA_INTEGRITY | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-2014-users-new-and-users-import-are-shadowed-by-the-user-detail-r|BUG-2014]] | Users new and Users import fall through to the user detail route and report a permissions refusal | BUG | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-2016-cancelling-a-leave-request-leaves-its-needs-approval-notific|BUG-2016]] | Cancelling a leave request leaves its needs-approval notification outstanding in the inbox | BUG | MEDIUM | FIXED | api:notifications, api:leave | DONE |
| [[BUG-2026-the-employee-export-produces-columns-the-employee-import-tem|BUG-2026]] | The employee export produces columns the employee import template does not accept | BUG | MEDIUM | FIXED | api:employees | DONE |
| [[BUG-2045-timesheet-background-job-completions-make-up-71-percent-of-t|BUG-2045]] | Timesheet background-job completions make up 71 percent of the tenant audit trail | BUG | MEDIUM | VERIFIED | api:timesheets, api:audit, api:tenant-settings | DONE |
| [[BUG-2091-the-canonical-settings-contract-still-describes-attendance-g|BUG-2091]] | The canonical settings contract still describes attendance geolocation as configurable and Remote-Hybrid only | DOCUMENTATION | MEDIUM | FIXED | docs/architecture | DONE |
| [[BUG-2148-dashboard-widget-severity-is-conveyed-by-colour-alone-and-hi|BUG-2148]] | Dashboard widget severity is conveyed by colour alone, and hidden from assistive technology | UX | MEDIUM | FIXED | views, dashboard | DONE |
| [[BUG-2206-three-timesheet-audit-toggles-render-on-screen-and-are-read-|BUG-2206]] | Three timesheet audit toggles render on screen and are read by nothing | BUG | MEDIUM | FIXED | api:timesheets, api:tenant-settings, apps/web | DONE |
| [[BUG-2333-storeuseragent-is-ignored-on-the-attendance-module-check-in-|BUG-2333]] | storeUserAgent is ignored on the attendance module check-in path | BUG | MEDIUM | FIXED | apps/web | FIX_NOW |
| [[BUG-2334-a-location-capture-failure-is-rethrown-as-a-bare-error-disca|BUG-2334]] | A location capture failure is rethrown as a bare Error, discarding the reason code | BUG | MEDIUM | FIXED | apps/web | FIX_NOW |
| [[BUG-2335-allow-approximate-ip-fallback-is-a-live-setting-whose-provid|BUG-2335]] | Allow approximate IP fallback is a live setting whose provider is a permanent stub | BUG | MEDIUM | FIXED | apps/web, api:tenant-settings | FIX_NOW |
| [[BUG-2413-allocate-id-plan-scans-only-docs-qa-test-plans-so-execplan-i|BUG-2413]] | allocate-id plan scans only docs qa test-plans so ExecPlan ids collide | DATA_INTEGRITY | MEDIUM | FIXED | scripts | DONE |
| [[BUG-2460-client-error-reports-store-the-whole-html-error-page-as-the-|BUG-2460]] | Client error reports store the whole HTML error page as the incident message | BUG | MEDIUM | FIXED | web:error-reporting, api:error-logs, admin:monitoring | FIX_NOW |
| [[BUG-2465-session-revoked-401s-and-client-reported-failures-escape-the|BUG-2465]] | Session-revoked 401s and client-reported failures escape the not-an-incident filter | BUG | MEDIUM | FIXED | api:error-logs, api:platform-monitoring | FIX_NOW |
| [[BUG-2495-the-under-investigation-tile-counts-incidents-nobody-is-inve|BUG-2495]] | The Under investigation tile counts incidents nobody is investigating | UX | MEDIUM | FIXED | admin:monitoring, api:platform-monitoring | DONE |
| [[BUG-2507-the-manager-s-correction-screen-hides-four-of-the-eight-kind|BUG-2507]] | The manager's correction screen hides four of the eight kinds of change | UX | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-2508-the-correction-work-site-selector-is-never-populated-for-an-|BUG-2508]] | The correction work-site selector is never populated for an employee | BUG | MEDIUM | FIXED | apps/web, api:attendance-integrations | DONE |
| [[BUG-2547-a-revoked-session-still-answers-on-auth-me|BUG-2547]] | A revoked session still answers on /auth/me | SECURITY | MEDIUM | FIXED | api:auth | DONE |
| [[BUG-2560-the-requester-is-shown-approve-and-reject-buttons-that-alway|BUG-2560]] | The requester is shown Approve and Reject buttons that always refuse | AUTHORIZATION | MEDIUM | FIXED | api:attendance, apps/web | DONE |
| [[BUG-2573-a-correction-request-cannot-be-withdrawn-by-the-person-who-f|BUG-2573]] | A correction request cannot be withdrawn by the person who filed it | UX | MEDIUM | FIXED | api:attendance, apps/web | DONE |
| [[BUG-2625-reports-headcount-counts-soft-deleted-employees-and-disagree|BUG-2625]] | Reports headcount counts soft-deleted employees and disagrees with the Employees screen | DATA_INTEGRITY | MEDIUM | VERIFIED | api:reports/reports.service.ts | DONE |
| [[BUG-2647-reporting-record-tables-and-metric-tiles-format-without-the-|BUG-2647]] | Reporting record tables and metric tiles format without the tenant context, causing a hydration mismatch | UX | MEDIUM | FIXED | app:web, app:web | DONE |
| [[BUG-2648-reports-pages-scroll-sideways-at-1440-because-grid-items-can|BUG-2648]] | Reports pages scroll sideways at 1440 because grid items cannot shrink below their content | UX | MEDIUM | FIXED | app:web | DONE |
| [[BUG-2662-an-expired-refresh-token-puts-the-tenant-app-into-a-redirect|BUG-2662]] | An expired refresh token puts the tenant app into a redirect loop instead of the login page | UX | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-2822-a-business-refusal-is-rendered-as-a-fatal-error-dialog-with-|BUG-2822]] | A business refusal is rendered as a fatal error dialog with a reference id and a log download | UX | MEDIUM | FIXED | runtime, approvals, attendance | FIX_NOW |
| [[BUG-2839-a-dashboard-fx-test-asserted-on-the-last-month-bucket-so-it-|BUG-2839]] | A dashboard FX test asserted on the last month bucket, so it passed in August and failed on 1 September | BUG | MEDIUM | FIXED | super-admin | FIX_NOW |
| [[BUG-2888-an-externally-hosted-release-is-invisible-to-the-desktop-age|BUG-2888]] | An externally hosted release is invisible to the desktop agent update feed, because the platform publish route cannot record a SHA-512 | INTEGRATION | MEDIUM | FIXED | api:app-releases | DONE |
| [[BUG-3254-the-forwarded-for-hop-guard-rejected-every-honest-chain-coll|BUG-3254]] | The rate-limit e2e suite sent a forwarded chain one hop short, and the guard was misread as an off-by-one | TEST_GAP | MEDIUM | FIXED | pkg:config, services/api/src/common/security, services/api/test | DONE |
| [[BUG-3263-the-provisioning-queue-e2e-fixture-raced-the-clock-so-an-exa|BUG-3263]] | The provisioning queue e2e fixture raced the clock, so an exact five-minute interval came out 300001ms | TEST_GAP | MEDIUM | FIXED | services/api/test | DONE |
| [[BUG-0018-bulk-lead-delete-is-unreachable-for-every-role|BUG-0018]] | Bulk lead delete is unreachable for every role, including SUPER_ADMIN | AUTHORIZATION | LOW | VERIFIED | api:platform-auth, api:super-admin | DONE |
| [[BUG-0023-testing-architecture-context-claims-two-e2e-specs-do-not-exist|BUG-0023]] | The testing-architecture context claims two e2e specs do not exist | DOCUMENTATION | LOW | VERIFIED | .agent/context | DONE |
| [[BUG-0024-start-onboarding-api-and-proxy-have-no-caller|BUG-0024]] | The start-onboarding API endpoint and its proxy have no caller | BUG | LOW | VERIFIED | apps/admin, api:super-admin | DONE |
| [[BUG-0059-vault-wikilinks-to-task-records-and-four-module-notes-resolv|BUG-0059]] | Vault wikilinks to task records and four module notes resolve to nothing | DOCUMENTATION | LOW | VERIFIED | scripts, docs/tasks, docs/knowledge | DONE |
| [[BUG-0352-the-tenant-timeline-rendered-every-entry-with-no-count-and-n|BUG-0352]] | The tenant timeline rendered every entry with no count and no paging | UX | LOW | VERIFIED | apps/admin | DONE |
| [[BUG-0669-patch-my-preferences-never-used-its-dto-so-the-body-was-unva|BUG-0669]] | PATCH my-preferences never used its DTO so the body was unvalidated | SECURITY | LOW | VERIFIED | api:tenant-settings | DONE |
| [[BUG-0796-tenant-and-plan-list-summaries-omit-createdbyid-so-the-creat|BUG-0796]] | Tenant and plan list summaries omit createdById so the Created by me view is always empty | BUG | LOW | VERIFIED | api:super-admin | DONE |
| [[BUG-1306-the-production-footer-publishes-a-reserved-fictional-us-phon|BUG-1306]] | The production footer publishes a reserved fictional US phone number as a tel link | UX | LOW | VERIFIED | apps/landing | DONE |
| [[BUG-1307-a-raw-monthly-enum-value-appears-in-customer-facing-timeshee|BUG-1307]] | A raw MONTHLY enum value appears in customer-facing timesheets copy | UX | LOW | VERIFIED | api:tenant-settings, apps/landing | DONE |
| [[BUG-1556-contract-dates-with-no-value-render-as-the-unix-epoch|BUG-1556]] | Contract dates with no value render as the Unix epoch | UX | LOW | VERIFIED | contracts | DONE |
| [[BUG-1557-react-hydration-error-418-on-the-admin-dashboard|BUG-1557]] | React hydration error 418 on the admin dashboard | BUG | LOW | VERIFIED | dashboard | DONE |
| [[BUG-1558-admin-list-copy-uses-incorrect-pluralisation-and-articles|BUG-1558]] | Admin list copy uses incorrect pluralisation and articles | UX | LOW | VERIFIED | super-admin | DONE |
| [[BUG-1559-empty-states-instruct-the-user-to-create-records-on-screens-|BUG-1559]] | Empty states instruct the user to create records on screens with no create control | UX | LOW | VERIFIED | billing | DONE |
| [[BUG-1560-delete-confirmation-does-not-name-the-record-being-deleted|BUG-1560]] | Delete confirmation does not name the record being deleted | UX | LOW | VERIFIED | leads | DONE |
| [[BUG-1561-signup-verification-step-has-no-way-back-to-correct-a-mistyp|BUG-1561]] | Signup verification step has no way back to correct a mistyped email | UX | LOW | VERIFIED | leads | DONE |
| [[BUG-1752-admin-empty-states-blame-filters-that-are-not-set|BUG-1752]] | Admin empty states blame filters that are not set | UX | LOW | VERIFIED | apps/admin | DONE |
| [[BUG-1753-lookup-display-labels-mangle-acronyms-and-numeric-ranges-acr|BUG-1753]] | Lookup display labels mangle acronyms and numeric ranges across the admin console | BUG | LOW | VERIFIED | apps/admin | DONE |
| [[BUG-1964-record-headings-and-dialog-titles-are-singularised-by-stripp|BUG-1964]] | Record headings and dialog titles are singularised by stripping a trailing s | UX | LOW | FIXED | apps/web | DONE |
| [[BUG-2007-projects-and-customers-can-be-created-but-never-deleted|BUG-2007]] | Projects and customers can be created but never deleted | BUG | LOW | FIXED | api:projects, apps/web | DONE |
| [[BUG-2010-the-dashboard-recent-changes-list-renders-unformatted-iso-86|BUG-2010]] | The dashboard Recent changes list renders unformatted ISO-8601 timestamps | UX | LOW | FIXED | apps/web | DONE |
| [[BUG-2017-the-inbox-related-record-column-renders-a-bare-uuid-with-no-|BUG-2017]] | The inbox Related record column renders a bare UUID with no label and no link | UX | LOW | FIXED | apps/web | DONE |
| [[BUG-2046-audit-actions-use-two-naming-conventions-and-the-result-colu|BUG-2046]] | Audit actions use two naming conventions and the Result column is populated only by login events | BUG | LOW | FIXED | api:audit | DONE |
| [[BUG-2149-every-dashboard-metric-card-offers-a-link-named-only-open|BUG-2149]] | Every dashboard metric card offers a link named only Open | UX | LOW | FIXED | views, dashboard | DONE |
| [[BUG-2384-tenant-record-shows-primary-tenant-owner-unassigned-while-it|BUG-2384]] | Tenant record shows Primary Tenant Owner Unassigned while its readiness check reports one active Tenant Owner | UX | LOW | FIXED | api:tenant-control-plane, apps/admin | DONE |
| [[BUG-2461-get-employees-me-direct-reports-is-shadowed-by-the-employeei|BUG-2461]] | GET employees me direct-reports is shadowed by the employeeId route and returns 400 | BUG | LOW | FIXED | api:employees | FIX_NOW |
| [[BUG-2657-analytics-caveat-panels-list-the-same-note-twice-in-differen|BUG-2657]] | Analytics caveat panels list the same note twice in different wording | UX | LOW | FIXED | api:reporting | DONE |
| [[BUG-3021-workspace-switcher-in-the-avatar-menu-overflows-horizontally|BUG-3021]] | Workspace switcher in the avatar menu overflows horizontally and shows a scrollbar | UX | LOW | FIXED | apps/web | FIX_NOW |

## Recent QA Runs

- [[2026-08-31-reports-analytics-platform-96ff155|QA Run — reports-analytics-platform]]
- [[2026-08-29-starter-plan-e2e-pass-2-8ab1cbf|QA Run — starter-plan-e2e-pass-2]]
- [[2026-08-29-starter-plan-e2e-eb457d9|QA Run — starter-plan-e2e]]
- [[2026-08-28-regression-guard-sweep-9e55663|QA Run — regression-guard-sweep]]
- [[2026-08-28-admin-console-e2e-912f4e6|QA Run — Admin console end-to-end, browser-driven]]
- [[2026-08-26-admin-prod-e2e-8d6be21|QA Run — admin-prod-e2e]]
- [[2026-08-25-landing-fixes-verification|QA Run — landing-fixes-verification]]
- [[2026-08-25-landing-e2e-local-and-prod-42435d5|QA Run — landing-e2e-local-and-prod]]

## Recent Implementations

- [[2026-08-29-workspace-switcher-avatar-menu|Workspace Switcher Moves Into the Avatar Menu]]
- [[2026-08-20-self-service-acquisition-path|Self-Service Acquisition Path]]
- [[2026-08-20-identity-and-membership|Identity and Multi-Tenant Membership]]
- [[2026-08-17-web-app-documentation|2026-08-17 — Documenting `apps/web`, the tenant product]]
- [[2026-08-16-monorepo-app-documentation|2026-08-16 — Documenting `apps/docs`, `apps/landing` and `apps/agent-desktop`]]
- [[2026-08-15-database-ci-and-gh-access|Database CI, GitHub access, and the first four framework merges]]
- [[2026-08-14-tenant-control-plane|Tenant Control Plane]]

## Recent Engineering History

- [[2026-09-11-closeout-sweep-658eb39c|Engineering History — Closeout sweep]]
- [[2026-09-10-release-settings-entitlements-254e8d2b|Engineering History — Release settings entitlements]]
- [[2026-09-10-r2-durable-object-storage-11afbd50|Engineering History — Durable object storage on Cloudflare R2 (FILE-01/INF-05)]]
- [[2026-09-09-settings-plan-entitlements-c3627cad|Engineering History — Settings plan entitlements]]
- [[2026-08-31-session-redirect-loop-77abf947|Engineering History — Session redirect loop]]
- [[2026-08-31-reports-analytics-platform-d833e694|Engineering History — Reports analytics platform]]
- [[2026-08-31-email-sink-visibility-1b60690f|Engineering History — Email sink visibility]]
- [[2026-08-31-approvals-inbox-decisions-d084dd7b|Engineering History — Approvals inbox decisions]]

## Recent Releases

- [[2026-09-11-production-5a1afa64|Deployment Report — PRODUCTION — 5a1afa64]]
- [[2026-09-09-production-1c04776|Deployment Report — PRODUCTION — 1c04776]]
- [[2026-09-08-production-fe1cd3d|Deployment Report — PRODUCTION — fe1cd3d]]
- [[2026-08-31-production-dae0e37|Deployment Report — PRODUCTION — dae0e37]]
- [[2026-08-31-production-cace6cd|Deployment Report — PRODUCTION — cace6cd]]

## Active / Recent Backlog

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[BUG-1548-customer-onboarding-validate-accepts-payloads-that-create-re|BUG-1548]] | Customer onboarding validate accepts payloads that create rejects | BUG | MEDIUM | FIXED | onboarding | DONE |
| [[BUG-1551-desktop-agent-auto-update-manifest-returns-404|BUG-1551]] | Desktop agent auto-update manifest returns 404 | INTEGRATION | MEDIUM | FIXED | agent, app-releases | DONE |
| [[BUG-1668-tenant-workspace-pages-scroll-horizontally-at-mobile-width|BUG-1668]] | Tenant workspace pages scroll horizontally at mobile width | UX | MEDIUM | FIXED | views | DONE |
| [[BUG-1950-every-tenant-workspace-screen-renders-the-same-h1-so-no-page|BUG-1950]] | Every tenant workspace screen renders the same h1, so no page announces what it is | UX | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-1951-most-tenant-workspace-pages-render-no-main-landmark-includin|BUG-1951]] | Most tenant workspace pages render no main landmark, including every settings category | UX | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-1953-plan-detail-reports-zero-subscriptions-while-the-plans-list-|BUG-1953]] | Plan detail reports zero subscriptions while the plans list and subscriptions both show two | BUG | MEDIUM | FIXED | apps/admin, api:super-admin | DONE |
| [[BUG-1955-every-404-is-reported-to-the-user-as-database-record-not-fou|BUG-1955]] | Every 404 is reported to the user as DATABASE_RECORD_NOT_FOUND with the raw HTML body as its message | UX | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-1956-runtime-lookup-comboboxes-expose-no-listbox-or-option-semant|BUG-1956]] | Runtime lookup comboboxes expose no listbox or option semantics to assistive technology | UX | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-1958-deleting-a-department-never-releases-its-name-so-it-can-neve|BUG-1958]] | Deleting a department never releases its name, so it can never be recreated | DATA_INTEGRITY | MEDIUM | FIXED | api:organization | DONE |
| [[BUG-1959-the-departments-list-returns-a-bare-array-and-rejects-the-pa|BUG-1959]] | The departments list returns a bare array and rejects the page size its own table offers | BUG | MEDIUM | FIXED | api:organization, apps/web | DONE |
| [[BUG-1962-assigned-on-is-required-by-the-leave-assignment-api-and-rend|BUG-1962]] | Assigned On is required by the leave assignment API and rendered as an optional field | UX | MEDIUM | FIXED | apps/web, api:leave | DONE |
| [[BUG-1963-runtime-dialogs-show-the-end-user-the-raw-server-message-and|BUG-1963]] | Runtime dialogs show the end user the raw server message and the HTTP method and path | UX | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-1969-an-invited-approver-is-rejected-with-a-message-that-blames-t|BUG-1969]] | An invited approver is rejected with a message that blames tenancy instead of account status | BUG | MEDIUM | FIXED | api:approvals | DONE |
| [[BUG-1977-the-platform-localization-panel-queries-dotted-setting-keys-|BUG-1977]] | The platform Localization panel queries dotted setting keys that no row can ever hold | BUG | MEDIUM | FIXED | api:tenant-control-plane, apps/admin | DONE |
| [[BUG-1978-two-attendance-checkboxes-are-not-catalog-keys-so-touching-e|BUG-1978]] | Two attendance checkboxes are not catalog keys, so touching either rejects the whole settings save | BUG | MEDIUM | FIXED | apps/web, api:tenant-settings | DONE |
| [[BUG-1979-seven-attendance-settings-are-overwritten-on-write-and-the-a|BUG-1979]] | Seven mandated attendance settings are still rendered editable and the refusal is never reported | BUG | MEDIUM | FIXED | api:tenant-settings | DONE |
| [[BUG-1980-one-saved-attendance-policy-permanently-overrides-the-attend|BUG-1980]] | One saved attendance policy permanently overrides the attendance settings category | BUG | MEDIUM | OPEN | api:attendance | FIX_NOW |
| [[BUG-1981-resolvepolicy-hardcodes-seven-location-values-and-inverts-tw|BUG-1981]] | resolvePolicy hardcodes seven location values and two AttendancePolicy columns are dead | BUG | MEDIUM | FIXED | api:attendance | DONE |
| [[BUG-2004-the-approvals-inbox-offers-a-new-action-whose-page-crashes-i|BUG-2004]] | The approvals module emits a New action for a page that does not exist, and the detail route throws on it | BUG | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-2005-manual-attendance-accepts-a-date-arbitrarily-far-in-the-futu|BUG-2005]] | Manual attendance accepts a date arbitrarily far in the future | DATA_INTEGRITY | MEDIUM | FIXED | api:attendance | DONE |
| [[BUG-2006-a-successful-save-reports-nothing-to-the-user-on-the-runtime|BUG-2006]] | A successful save reports nothing to the user on the runtime forms and the branding page | UX | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-2009-display-labels-fall-through-to-the-raw-field-key-or-raw-enum|BUG-2009]] | Display labels fall through to the raw field key or raw enum value on three tenant surfaces | UX | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-2012-the-related-list-create-dialog-pre-fills-child-fields-with-t|BUG-2012]] | The related-list create dialog pre-fills child fields with the parent record values | DATA_INTEGRITY | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-2014-users-new-and-users-import-are-shadowed-by-the-user-detail-r|BUG-2014]] | Users new and Users import fall through to the user detail route and report a permissions refusal | BUG | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-2016-cancelling-a-leave-request-leaves-its-needs-approval-notific|BUG-2016]] | Cancelling a leave request leaves its needs-approval notification outstanding in the inbox | BUG | MEDIUM | FIXED | api:notifications, api:leave | DONE |
| [[BUG-2026-the-employee-export-produces-columns-the-employee-import-tem|BUG-2026]] | The employee export produces columns the employee import template does not accept | BUG | MEDIUM | FIXED | api:employees | DONE |
| [[BUG-2091-the-canonical-settings-contract-still-describes-attendance-g|BUG-2091]] | The canonical settings contract still describes attendance geolocation as configurable and Remote-Hybrid only | DOCUMENTATION | MEDIUM | FIXED | docs/architecture | DONE |
| [[BUG-2148-dashboard-widget-severity-is-conveyed-by-colour-alone-and-hi|BUG-2148]] | Dashboard widget severity is conveyed by colour alone, and hidden from assistive technology | UX | MEDIUM | FIXED | views, dashboard | DONE |
| [[BUG-2206-three-timesheet-audit-toggles-render-on-screen-and-are-read-|BUG-2206]] | Three timesheet audit toggles render on screen and are read by nothing | BUG | MEDIUM | FIXED | api:timesheets, api:tenant-settings, apps/web | DONE |
| [[BUG-2333-storeuseragent-is-ignored-on-the-attendance-module-check-in-|BUG-2333]] | storeUserAgent is ignored on the attendance module check-in path | BUG | MEDIUM | FIXED | apps/web | FIX_NOW |
| [[BUG-2334-a-location-capture-failure-is-rethrown-as-a-bare-error-disca|BUG-2334]] | A location capture failure is rethrown as a bare Error, discarding the reason code | BUG | MEDIUM | FIXED | apps/web | FIX_NOW |
| [[BUG-2335-allow-approximate-ip-fallback-is-a-live-setting-whose-provid|BUG-2335]] | Allow approximate IP fallback is a live setting whose provider is a permanent stub | BUG | MEDIUM | FIXED | apps/web, api:tenant-settings | FIX_NOW |
| [[BUG-2413-allocate-id-plan-scans-only-docs-qa-test-plans-so-execplan-i|BUG-2413]] | allocate-id plan scans only docs qa test-plans so ExecPlan ids collide | DATA_INTEGRITY | MEDIUM | FIXED | scripts | DONE |
| [[BUG-2460-client-error-reports-store-the-whole-html-error-page-as-the-|BUG-2460]] | Client error reports store the whole HTML error page as the incident message | BUG | MEDIUM | FIXED | web:error-reporting, api:error-logs, admin:monitoring | FIX_NOW |
| [[BUG-2465-session-revoked-401s-and-client-reported-failures-escape-the|BUG-2465]] | Session-revoked 401s and client-reported failures escape the not-an-incident filter | BUG | MEDIUM | FIXED | api:error-logs, api:platform-monitoring | FIX_NOW |
| [[BUG-2495-the-under-investigation-tile-counts-incidents-nobody-is-inve|BUG-2495]] | The Under investigation tile counts incidents nobody is investigating | UX | MEDIUM | FIXED | admin:monitoring, api:platform-monitoring | DONE |
| [[BUG-2507-the-manager-s-correction-screen-hides-four-of-the-eight-kind|BUG-2507]] | The manager's correction screen hides four of the eight kinds of change | UX | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-2508-the-correction-work-site-selector-is-never-populated-for-an-|BUG-2508]] | The correction work-site selector is never populated for an employee | BUG | MEDIUM | FIXED | apps/web, api:attendance-integrations | DONE |
| [[BUG-2509-platform-admin-remember-me-has-no-policy-able-to-refuse-it|BUG-2509]] | Platform admin remember-me has no policy able to refuse it | SECURITY | MEDIUM | OPEN | api:auth | PLAN_REQUIRED |
| [[BUG-2547-a-revoked-session-still-answers-on-auth-me|BUG-2547]] | A revoked session still answers on /auth/me | SECURITY | MEDIUM | FIXED | api:auth | DONE |
| [[BUG-2560-the-requester-is-shown-approve-and-reject-buttons-that-alway|BUG-2560]] | The requester is shown Approve and Reject buttons that always refuse | AUTHORIZATION | MEDIUM | FIXED | api:attendance, apps/web | DONE |
| [[BUG-2573-a-correction-request-cannot-be-withdrawn-by-the-person-who-f|BUG-2573]] | A correction request cannot be withdrawn by the person who filed it | UX | MEDIUM | FIXED | api:attendance, apps/web | DONE |
| [[BUG-2647-reporting-record-tables-and-metric-tiles-format-without-the-|BUG-2647]] | Reporting record tables and metric tiles format without the tenant context, causing a hydration mismatch | UX | MEDIUM | FIXED | app:web, app:web | DONE |
| [[BUG-2648-reports-pages-scroll-sideways-at-1440-because-grid-items-can|BUG-2648]] | Reports pages scroll sideways at 1440 because grid items cannot shrink below their content | UX | MEDIUM | FIXED | app:web | DONE |
| [[BUG-2662-an-expired-refresh-token-puts-the-tenant-app-into-a-redirect|BUG-2662]] | An expired refresh token puts the tenant app into a redirect loop instead of the login page | UX | MEDIUM | FIXED | apps/web | DONE |
| [[BUG-2822-a-business-refusal-is-rendered-as-a-fatal-error-dialog-with-|BUG-2822]] | A business refusal is rendered as a fatal error dialog with a reference id and a log download | UX | MEDIUM | FIXED | runtime, approvals, attendance | FIX_NOW |
| [[BUG-2839-a-dashboard-fx-test-asserted-on-the-last-month-bucket-so-it-|BUG-2839]] | A dashboard FX test asserted on the last month bucket, so it passed in August and failed on 1 September | BUG | MEDIUM | FIXED | super-admin | FIX_NOW |
| [[BUG-2888-an-externally-hosted-release-is-invisible-to-the-desktop-age|BUG-2888]] | An externally hosted release is invisible to the desktop agent update feed, because the platform publish route cannot record a SHA-512 | INTEGRATION | MEDIUM | FIXED | api:app-releases | DONE |
| [[BUG-3254-the-forwarded-for-hop-guard-rejected-every-honest-chain-coll|BUG-3254]] | The rate-limit e2e suite sent a forwarded chain one hop short, and the guard was misread as an off-by-one | TEST_GAP | MEDIUM | FIXED | pkg:config, services/api/src/common/security, services/api/test | DONE |
| [[BUG-3263-the-provisioning-queue-e2e-fixture-raced-the-clock-so-an-exa|BUG-3263]] | The provisioning queue e2e fixture raced the clock, so an exact five-minute interval came out 300001ms | TEST_GAP | MEDIUM | FIXED | services/api/test | DONE |
| [[ITEM-0009-no-observability-platform-exists|ITEM-0009]] | No observability platform exists, so a release cannot be verified from outside | INFRA | MEDIUM | READY | services/api, apps/web, apps/admin | PLAN_REQUIRED |
| [[ITEM-0020-contract-phase-drop-legacy-plan-pricing-columns|ITEM-0020]] | Contract phase: drop legacy Plan pricing columns | TECH_DEBT | MEDIUM | READY | services/api/prisma, api:super-admin, apps/admin | PLAN_REQUIRED |
| [[ITEM-0022-governed-publish-and-archive-actions-for-commercial-configur|ITEM-0022]] | Governed publish and archive actions for commercial configuration | FOLLOW_UP | MEDIUM | READY | api:super-admin, apps/admin | PLAN_REQUIRED |
| [[ITEM-0025-hidden-writes-remain-on-lookups-and-onboarding-read-paths|ITEM-0025]] | Hidden writes remain on lookups and onboarding read paths | TECH_DEBT | MEDIUM | READY | api:lookups, api:onboarding | PLAN_REQUIRED |
| [[ITEM-0026-desktop-agent-windows-installer-is-unsigned|ITEM-0026]] | Desktop agent Windows installer is unsigned | SECURITY | MEDIUM | READY | apps/agent-desktop | PLAN_REQUIRED |
| [[ITEM-0027-desktop-agent-has-no-retry-backoff-and-no-bounded-give-up|ITEM-0027]] | Desktop agent has no retry backoff and no bounded give up | TECH_DEBT | MEDIUM | READY | apps/agent-desktop, api:agent | PLAN_REQUIRED |
| [[ITEM-0039-promote-the-csp-from-report-only-to-enforced|ITEM-0039]] | Promote the CSP from report-only to enforced | SECURITY | MEDIUM | READY | pkg:config, apps/web, apps/admin, apps/landing | PLAN_REQUIRED |
| [[ITEM-0052-verify-the-agent-update-feed-against-a-real-published-artefact|ITEM-0052]] | Verify the agent update feed against a real published artefact | TEST_GAP | MEDIUM | READY | apps/agent-desktop, api:app-releases | PLAN_REQUIRED |
| [[ITEM-0077-re-read-the-packaged-agent-archive-after-the-node-pre-gyp-up|ITEM-0077]] | Re-read the packaged agent archive after the node-pre-gyp upgrade | TEST_GAP | MEDIUM | READY | apps/agent-desktop, package-lock.json | PLAN_REQUIRED |
| [[ITEM-0078-no-end-to-end-payment-to-provisioned-tenant-run-against-stri|ITEM-0078]] | No end-to-end payment to provisioned tenant run against Stripe test mode | TEST_GAP | MEDIUM | READY | api:billing, api:tenant-control-plane, api:outbox, apps/landing | PLAN_REQUIRED |
| [[ITEM-0115-provisioning-seeds-four-departments-with-no-business-unit-on|ITEM-0115]] | Provisioning seeds four departments with no business unit on every tenant | PRODUCT_DECISION | MEDIUM | READY | services/api/prisma, api:organization | PLAN_REQUIRED |
| [[ITEM-0116-53-bug-fixes-are-regression-covered-but-have-never-been-qa-r|ITEM-0116]] | 53 bug fixes are regression-covered but have never been QA-retested | TEST_GAP | MEDIUM | READY | — | FIX_NOW |
| [[ITEM-0119-stop-writing-a-placeholder-e-mail-into-an-identity-column-wh|ITEM-0119]] | Stop writing a placeholder e-mail into an identity column when the wizard opens a draft | TECH_DEBT | MEDIUM | READY | billing, landing, super-admin | PLAN_REQUIRED |
| [[ITEM-0158-public-traffic-that-bypasses-cloudflare-shares-one-rate-limi|ITEM-0158]] | Public traffic that bypasses Cloudflare shares one rate-limit bucket, by design and untested | INFRA | MEDIUM | READY | pkg:config, services/api/src/common/security | PLAN_REQUIRED |
| [[ITEM-0023-tenant-dataregion-populated-from-market-at-provisioning|ITEM-0023]] | Tenant.dataRegion populated from market at provisioning | FOLLOW_UP | LOW | READY | services/api/prisma, api:tenant-control-plane | PLAN_REQUIRED |
| [[ITEM-0108-decide-whether-the-roughly-one-hour-session-lifetime-is-idle|ITEM-0108]] | Decide whether the roughly one-hour session lifetime is idle or absolute | PRODUCT_DECISION | LOW | READY | api:auth | PLAN_REQUIRED |
| [[BUG-1964-record-headings-and-dialog-titles-are-singularised-by-stripp|BUG-1964]] | Record headings and dialog titles are singularised by stripping a trailing s | UX | LOW | FIXED | apps/web | DONE |
| [[BUG-2007-projects-and-customers-can-be-created-but-never-deleted|BUG-2007]] | Projects and customers can be created but never deleted | BUG | LOW | FIXED | api:projects, apps/web | DONE |
| [[BUG-2010-the-dashboard-recent-changes-list-renders-unformatted-iso-86|BUG-2010]] | The dashboard Recent changes list renders unformatted ISO-8601 timestamps | UX | LOW | FIXED | apps/web | DONE |
| [[BUG-2017-the-inbox-related-record-column-renders-a-bare-uuid-with-no-|BUG-2017]] | The inbox Related record column renders a bare UUID with no label and no link | UX | LOW | FIXED | apps/web | DONE |
| [[BUG-2046-audit-actions-use-two-naming-conventions-and-the-result-colu|BUG-2046]] | Audit actions use two naming conventions and the Result column is populated only by login events | BUG | LOW | FIXED | api:audit | DONE |
| [[BUG-2149-every-dashboard-metric-card-offers-a-link-named-only-open|BUG-2149]] | Every dashboard metric card offers a link named only Open | UX | LOW | FIXED | views, dashboard | DONE |
| [[BUG-2384-tenant-record-shows-primary-tenant-owner-unassigned-while-it|BUG-2384]] | Tenant record shows Primary Tenant Owner Unassigned while its readiness check reports one active Tenant Owner | UX | LOW | FIXED | api:tenant-control-plane, apps/admin | DONE |
| [[BUG-2461-get-employees-me-direct-reports-is-shadowed-by-the-employeei|BUG-2461]] | GET employees me direct-reports is shadowed by the employeeId route and returns 400 | BUG | LOW | FIXED | api:employees | FIX_NOW |
| [[BUG-2657-analytics-caveat-panels-list-the-same-note-twice-in-differen|BUG-2657]] | Analytics caveat panels list the same note twice in different wording | UX | LOW | FIXED | api:reporting | DONE |
| [[BUG-3021-workspace-switcher-in-the-avatar-menu-overflows-horizontally|BUG-3021]] | Workspace switcher in the avatar menu overflows horizontally and shows a scrollbar | UX | LOW | FIXED | apps/web | FIX_NOW |
| [[ITEM-0080-type-the-remaining-services-api-no-unsafe-warnings-module-by|ITEM-0080]] | Type the remaining services/api no-unsafe warnings module by module | TECH_DEBT | LOW | READY | services/api | FIX_NOW |
| [[ITEM-0129-tenants-should-inherit-the-platform-email-provider-by-defaul|ITEM-0129]] | Tenants should inherit the platform email provider by default, and may override it | ARCHITECTURE | — | READY | services/api, apps/web | PLAN_REQUIRED |

## Key Architecture Decisions

- [[ADR-0001-ai-agent-workflow|ADR-0001 — AI-assisted engineering workflow for DijiPeople]]
- [[ADR-0002-tenant-base-domain-single-source|ADR-0002 — Configuration is the single source of the tenant base domain]]
- [[ADR-0003-attendance-location-capture-is-mandatory|ADR-0003 — Attendance location capture is a platform mandate, not tenant configuration]]
- [[ADR-0004-recurring-background-jobs-in-the-api-process|ADR-0004 — Recurring background jobs run in the API process, on a claim-and-guard pattern]]
- [[ADR-0005-settings-capability-attribution|ADR-0005 — Which capability each settings page belongs to]]
- [[ADR-0006-product-decisions-from-the-2026-09-11-backlog-review|ADR-0006 — Seven product decisions from the 2026-09-11 backlog review]]
- [[ADR-0007-remove-inert-apps-web-runtime-registries|ADR-0007 — Remove the inert `apps/web` runtime registries rather than revive them]]
- [[ADR-0008-unregistered-agent-branch-warns-not-blocks|ADR-0008 — An `agent/*` branch with no registered session warns, it does not block]]
- [[decision-a-bug-record-is-its-own-backlog-item|Decision — A bug record **is** its own backlog item]]
- [[decision-ci-verdict-gates-shared-merges|Decision — A shared-target merge requires a read CI verdict on the exact SHA]]
- [[decision-platform-admin-is-a-separate-identity|Decision — Platform admin is a separate identity, not an elevated tenant user]]
- [[decision-tenantid-is-the-isolation-identity|Decision — `tenantId` is the isolation identity, enforced by convention]]

## Knowledge Health

| Knowledge | Count |
|---|---|
| Bug records | 418 |
| Backlog items | 158 |
| Known bug patterns | 34 |
| QA runs | 32 |
| Engineering history records | 77 |
| Release records | 10 |
| Module notes | 30 |
| Architecture notes | 22 |
| Decision notes (ADR + generated) | 12 |
| Implementation records | 7 |

**Awaiting Architect triage: 0.** A record nobody has
triaged is work nobody has decided about — the number that should stay near
zero between tasks.

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
