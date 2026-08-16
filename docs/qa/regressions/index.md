# Regression Register

Every material defect that has been fixed, and the test that stops it returning.

**QA reads the entries for the modules under test before designing scenarios.**
**Architect reads them during planning.** That is what makes this register more
than a changelog.

This is an evergreen document — update entries in place. Historical execution
detail lives in `docs/qa/runs/`.

---

## How to add an entry

When a material defect is fixed:

1. Give it the next `REG-nnn` id.
2. Record the bug class from [`../known-bug-patterns/`](../known-bug-patterns/).
3. Name the regression test file **and prove it fails without the fix**.
4. State the scenario in one line a future QA agent can re-run.
5. Keep `Active` accurate — a deleted or skipped test means `Active: no`, and
   that is a signal, not an embarrassment.

Do not add a typo. Add engineering lessons that could plausibly recur.

---

## Entries

### REG-001 — Compensation and bank data behind employee-record read

| | |
|---|---|
| **Bug class** | `sensitive-field-overexposure` |
| **Module** | `services/api/src/modules/employees` |
| **Root cause** | `getCurrentCompensation` gated only on `assertEmployeeAccess` (employee-record READ) and returned the whole `EmployeeCompensation` row with no `select`. `getProfile` embeds the same value, so `GET /employees/:id` leaked it too. Reporting managers clear that check for their whole subtree without any payroll permission. |
| **Regression test** | `services/api/src/modules/employees/employee-compensation-access.spec.ts` |
| **Scenario** | A reporting manager with `employees.read` but no compensation/payroll permission requests a report's compensation → receives `null`, and `basicSalary` / `bankAccountNumber` / `bankIban` / `bankRoutingNumber` / `taxIdentifier` appear nowhere in the response. |
| **Fixed** | 2026-08-14, branch `agent/authz-batch0-compensation` |
| **Active** | yes |

### REG-002 — Self-approval of attendance corrections

| | |
|---|---|
| **Bug class** | `self-approval` |
| **Module** | `services/api/src/modules/attendance` |
| **Root cause** | `assertCanActionCorrection` never compared the actor to the request's parties, and `canActionAttendanceCorrection` passes on a bare `attendance.correction.approve` — which the seeded `manager` bundle grants. A manager could file a correction rewriting their own attendance and approve it. |
| **Regression test** | `services/api/src/modules/attendance/attendance.correction-authorization.spec.ts` |
| **Scenario** | A manager holding approve/reject files a correction for themselves → approve and reject both 403. Also blocked when they filed it on someone else's behalf, and when they are the subject but someone else filed it. A manager acting on a subordinate's correction still succeeds. |
| **Fixed** | 2026-08-14, branch `agent/authz-batch0-attendance` |
| **Active** | yes |

### REG-003 — `readTeam` granted tenant-wide visibility

| | |
|---|---|
| **Bug class** | `fail-open-scope` |
| **Module** | `services/api/src/modules/attendance`, `services/api/src/modules/approvals` |
| **Root cause** | `attendance.correction.readTeam` and `approvals.readTeam` were both bundled into a branch returning `{}` — an unrestricted `where` — making each a synonym for its `manage` permission. Two independent occurrences of the same misreading. |
| **Regression test** | `attendance.correction-authorization.spec.ts`, `approvals.scope.spec.ts` |
| **Scenario** | A user holding only `*.readTeam` lists records → the query carries a scope predicate limited to own + direct reports, never `{}`. `manage` still yields tenant-wide. |
| **Fixed** | 2026-08-14, branches `agent/authz-batch0-attendance`, `agent/authz-batch0-readteam` |
| **Active** | yes |

### REG-004 — Search filter overwrote the access scope

| | |
|---|---|
| **Bug class** | `search-filter-scope-overwrite` |
| **Module** | `services/api/src/modules/approvals` |
| **Root cause** | `buildWhere` spread the access scope and the search filter into one object literal; both render as `OR`, so the later key won. Any caller supplying `?search=` lost their scope restriction and the query fell back to `tenantId` alone. |
| **Regression test** | `services/api/src/modules/approvals/approvals.scope.spec.ts` |
| **Scenario** | A plain `approvals.read` user lists with `?search=` → the emitted `where` still contains the own/assigned scope predicate alongside the search clause. |
| **Fixed** | 2026-08-14, branch `agent/authz-batch0-readteam` |
| **Active** | yes |

### REG-005 — Cross-tenant error-log read via support role

| | |
|---|---|
| **Bug class** | `tenant-filter-missing` |
| **Module** | `services/api/src/modules/error-logs` |
| **Root cause** | `findForUser` returned the log on support role alone with no `log.tenantId === user.tenantId` comparison, while the owner branch directly beneath it did compare. A tenant `system-admin` with a foreign traceId read another tenant's log. |
| **Regression test** | `services/api/src/modules/error-logs/error-logs.service.spec.ts` |
| **Scenario** | A support-role user in tenant A requests a traceId belonging to tenant B → `null`, and the response is indistinguishable from a traceId that does not exist. |
| **Fixed** | 2026-08-14, branch `agent/authz-batch0-errorlogs` |
| **Active** | yes |

### REG-006 — Organization and business-unit structure mutable by any authenticated user

| | |
|---|---|
| **Bug class** | `authorization-missing` |
| **Module** | `services/api/src/modules/organization` |
| **Root cause** | `OrganizationsController` and `BusinessUnitsController` carried `JwtAuthGuard` alone and none of the six mutating service methods performed authorization. Because business-unit membership feeds `accessContext.accessibleBusinessUnitIds` and therefore `buildScopedAccessWhere()`, this was privilege escalation, not just unauthorized writes. |
| **Regression test** | `services/api/src/modules/organization/organization-structure-authorization.spec.ts`, `organization-structure-tenant-scope.spec.ts` |
| **Scenario** | An ordinary employee attempts create/update/delete on an organization or business unit → 403 on all six routes. HR holding `organization.manage` still succeeds. A newly added mutating route with no `@Permissions` declaration fails the coverage test. |
| **Fixed** | 2026-08-14, branch `agent/authz-org-bu` |
| **Active** | yes |

### REG-007 — Unguarded duplicate of a permission-gated route

| | |
|---|---|
| **Bug class** | `duplicate-route-bypass` |
| **Module** | `services/api/src/modules/tenant-settings` |
| **Root cause** | `GET /tenant-settings/features/availability` declared no permission and called the same service method as the `settings.read`-gated `GET /tenant-settings/features`. `PermissionsGuard` returns true when neither family is declared, so it was an open alias. The payload also carried `subscription.finalPrice`. |
| **Regression test** | `services/api/src/modules/tenant-settings/feature-availability-authorization.spec.ts` |
| **Scenario** | An authenticated user without `tenant-settings.resolved.read` → 403; the four ordinary roles still succeed; the response contains no `subscription` block; the two routes remain on deliberately different keys. |
| **Fixed** | 2026-08-14, branch `agent/authz-feature-availability` |
| **Active** | yes |

### REG-008 — Session-expired "Sign in again" returned 405

| | |
|---|---|
| **Bug class** | `route-method-mismatch` |
| **Module** | `apps/admin/app/api/auth/logout`, `apps/admin/components/errors/error-provider.tsx` |
| **Root cause** | The session-expired modal offers "Sign in again" as an `<a href>` to `/api/auth/logout?reason=session-expired`, which is a GET, but the route exported only `POST`. Next answered 405 and the browser rendered its own error page — outside the app, so no `error.tsx` and no route back to `/login`. `apps/web` already exported both methods, so the identical flow worked on the tenant product and hid the admin gap. Two latent failures sat on the same path: revocation was gated on the refresh cookie alone, so a "sign out" could leave the platform session live server-side; and `getClearAuthCookieOptions()` was unguarded, so a rejected cookie configuration (an `ADMIN_COOKIE_DOMAIN` on the `.vercel.app` host) would have turned sign-out into a 500. |
| **Regression test** | `apps/admin/app/api/auth/logout/logout-route.spec.ts` |
| **Scenario** | Expire the admin session, trigger the error modal, click "Sign in again" → 307 to `/login?reason=session-expired&next=…`, the login page renders the "Session expired" notice, and all four auth cookies come back expired. The topbar sign-out still returns 200. An off-site or protocol-relative `next` collapses to `/tenants`. |
| **Fixed** | 2026-08-15, branch `agent/admin-session-expired-logout-auth` |
| **Active** | yes |

### REG-009 — Signed agreement editable, defeating the lead-conversion gate

| | |
|---|---|
| **Bug class** | `divergent-duplicate-guard` |
| **Module** | `services/api/src/modules/contracts` |
| **Root cause** | `ContractsService.update()` carried its own inline copy of the blocked-status list and it had drifted from the shared `assertAgreementEditable`: `SENT`, `VIEWED`, `FULLY_EXECUTED`, `SUPERSEDED` and `TERMINATED` were missing. A `FULLY_EXECUTED` agreement was therefore freely mutable via `PATCH /contracts/:id`, including `relatedLeadId`, `customerAccountId`, `contractType` and `isGoverningAgreement`. Because `assertGoverningAgreementExecuted` decides lead conversion by matching contracts on exactly those columns, one edit moved the gate. |
| **Regression test** | `services/api/src/modules/contracts/contracts.agreement-immutability.spec.ts` |
| **Scenario** | `PATCH /contracts/:id {relatedLeadId: <another lead>}` on a `FULLY_EXECUTED` agreement → 4xx and no write. Repeat for `customerAccountId` and for each of the five drifted statuses. Drafts through `APPROVED_FOR_SENDING` stay editable. |
| **Fixed** | 2026-08-15, branch `agent/qa-commercial-onboarding-e2e` |
| **Active** | yes |

### REG-010 — Onboarding created by lead conversion was born un-editable

| | |
|---|---|
| **Bug class** | `unvalidated-seed-state` |
| **Module** | `services/api/src/modules/super-admin` |
| **Root cause** | `convertLeadToCustomer` seeded `CustomerOnboarding` with `status: NOT_STARTED` and `subStatus: 'Agreement executed'`, a pair absent from `CUSTOMER_ONBOARDING_SUB_STATUS_OPTIONS[NOT_STARTED]` (`['Awaiting kickoff','Kickoff scheduled']`). `updateCustomerOnboarding` validates the effective sub-status on every call, so every later PATCH — including notes-only — returned 400 until the caller also sent a status change. |
| **Regression test** | `services/api/src/modules/super-admin/platform-lifecycle.onboarding-seed.spec.ts` |
| **Scenario** | Convert a qualified lead with an executed agreement → the seeded onboarding's sub-status is valid for its status, and `PATCH /super-admin/customer-onboarding/:id {notes}` returns 200. Every `CustomerOnboardingStatus` has a valid default sub-status. |
| **Fixed** | 2026-08-15, branch `agent/qa-commercial-onboarding-e2e` |
| **Active** | yes |

### REG-011 — Public lead endpoint had no rate limiting

| | |
|---|---|
| **Bug class** | `authorization-missing` (guard omitted on a public surface) |
| **Module** | `services/api/src/modules/leads` |
| **Root cause** | `PublicLeadsController` carried `@Public()` but no `PublicRateLimitGuard`, the only public surface in the codebase without it. Each accepted submission also emails every active platform user in the sales/admin roles, so the endpoint was both an unbounded `Lead` growth vector and an outbound email amplifier. 25/25 rapid anonymous submissions were accepted while the same burst against `/public/partners/inquiries` was throttled. |
| **Regression test** | `services/api/src/modules/leads/public-leads.rate-limit.spec.ts` |
| **Scenario** | `PublicLeadsController`'s guard metadata is exactly `[PublicRateLimitGuard]` — present, and never joined by an auth guard that would break the public funnel. |
| **Fixed** | 2026-08-15, branch `agent/qa-commercial-onboarding-e2e` |
| **Active** | yes |

### REG-012 — No tenant that failed provisioning could be retried

| | |
|---|---|
| **Bug class** | `declared-but-unwired-step` |
| **Module** | `services/api/src/modules/tenant-control-plane` |
| **Root cause** | `TENANT_PROVISIONING_STEPS` declared `workspace-slug-reserved` and `workspace-routing-verified` as `isRetryable: true`, but `TenantOperationsService.runRetryableStep` had no branch for either and fell through to `Step ${key} cannot be replayed automatically.` Retry replays retryable steps in catalogue order and `workspace-slug-reserved` is the first, so every retry died on its first step and left the tenant in `PROVISIONING_FAILED` — permanently, retry being the only recovery path — while the admin UI kept offering the button. |
| **Regression test** | `services/api/src/modules/tenant-control-plane/tenant-provisioning-retry.spec.ts` |
| **Scenario** | Every step `TENANT_PROVISIONING_STEPS` marks `isRetryable` resolves through `runRetryableStep` without throwing; an unknown key still throws; `workspace-routing-verified` fails when the hostname resolves to a different tenant. |
| **Fixed** | 2026-08-15, branch `agent/qa-commercial-onboarding-e2e` |
| **Active** | yes |

### REG-013 — A tenant that failed before identities-and-billing was unrecoverable

| | |
|---|---|
| **Bug class** | `non-idempotent-work-in-a-non-retryable-step` |
| **Module** | `services/api/src/modules/tenant-control-plane`, `services/api/src/modules/super-admin` |
| **Root cause** | `identities-and-billing` was declared `isRetryable: false` because replaying it created a second owner and a second invoice. It is also the only step that creates the tenant's business unit, owner, service account and subscription, so a tenant failing at or before it never obtained an owner — and `POST /access` refuses to add one to a tenant with no business unit. After REG-012 made retry work, retry *skipped* this step and reported **SUCCEEDED**, producing a tenant that looked healthy and could never be activated. Fixing one bug made the next one worse, which is the point of this entry: the step had been classified by its least safe member instead of being given the property that member lacked. |
| **Regression test** | `services/api/src/modules/super-admin/tenant-identities-provisioning.service.spec.ts`, `services/api/src/modules/tenant-control-plane/tenant-provisioning-retry.spec.ts`, `services/api/test/tenant-provisioning-recovery.e2e-spec.ts` (DB-backed) |
| **Scenario** | Replaying `ensureIdentitiesAndBilling` creates no second owner, service account, role grant, subscription, feature override or invoice, and reports nothing as newly created so nobody is re-invited; `identities-and-billing` is declared retryable and resolves through `runRetryableStep`; `tenant-record` is the only non-retryable step; a retry may not report SUCCEEDED while the tenant lacks a business unit, an owner or a subscription. The DB-backed suite proves the four uniqueness constraints the idempotency actually rests on, including that the same owner email is still permitted in a *different* tenant. |
| **Fixed** | 2026-08-15, branch `agent/autonomous-framework-triage` |
| **Active** | yes |

### REG-014 — Partner onboarding review had no state machine

| | |
|---|---|
| **Bug class** | `state-machine-as-setter` |
| **Module** | `services/api/src/modules/partner-experience` |
| **Root cause** | `reviewOnboarding` derived the new status from the `decision` argument alone and wrote it with no check on the current one, so every decision was legal from every state in either direction. An application still in `INVITED` — never submitted, `legalName` and `iban` null — could be approved and the partner activated, satisfying the compliance gate without the compliance data it exists to review; and an already-`APPROVED` application could be flipped to `REJECTED` after activation, cascading a live `ACTIVE` partner to `REJECTED`. |
| **Regression test** | `services/api/src/modules/partner-experience/partner-onboarding.state-machine.spec.ts` |
| **Scenario** | A decision requires a submission (`submittedAt` present and status in `SUBMITTED`/`UNDER_REVIEW`/`CHANGES_REQUESTED`); `INVITED` and `IN_PROGRESS` are refused and are pinned by name as non-reviewable; an already-decided application cannot be re-decided; any decision is refused once the partner is `ACTIVE`, `SUSPENDED`, `INACTIVE` or `TERMINATED`, and the refusal names the governed lifecycle actions. |
| **Fixed** | 2026-08-15, branch `agent/autonomous-framework-triage` |
| **Active** | yes |

### REG-015 — A live partner could be demoted through the generic partner update

| | |
|---|---|
| **Bug class** | `state-machine-as-setter` |
| **Module** | `services/api/src/modules/partners` |
| **Root cause** | `PartnersService.update` guarded the way *into* `ACTIVE` and not the way out, so `PATCH /partners/:id` with `status: REJECTED` took a live partner out of service with no from-set check and no `PartnerTimeline` entry — while `partnerTransition`, in the same file, already declared `reject` illegal from `ACTIVE` and already owned suspend/deactivate/reactivate. Found while fixing REG-014, as the adjacent writer with the same shape. |
| **Regression test** | `services/api/src/modules/partners/partner-lifecycle-guards.spec.ts` |
| **Scenario** | Both directions are pinned — the generic update cannot activate a partner and cannot move a live one to `REJECTED`, `TERMINATED`, `SUSPENDED` or `INACTIVE`; the refusal names the governed actions; ordinary edits and early-stage status moves that no governed action owns still succeed, so the guard cannot be "simplified" into refusing legitimate work. |
| **Fixed** | 2026-08-15, branch `agent/autonomous-framework-triage` |
| **Active** | yes |

### REG-016 — Public "Login" and tenant email links resolved to localhost in production

| | |
|---|---|
| **Bug class** | `silent-config-fallback` |
| **Module** | `pkg:config`, `apps/landing`, `apps/web`, `apps/admin`, `services/api` |
| **Root cause** | Seven call sites resolved another app's URL themselves and ended in a hardcoded loopback literal, bypassing `getAppOrigin`, which already threw in production. `validateDeploymentEnv` required only `NEXT_PUBLIC_API_BASE_URL` for frontends, so nothing forced the cross-app URLs to be set — a production build succeeded and Next inlined `http://localhost:3001/dashboard` into the shipped HTML. The landing header additionally fell through `NEXT_PUBLIC_APP_PORTAL_URL`, a variable defined nowhere in the repository, so the literal was always the effective value. The same class put loopback URLs into tenant activation and invitation **emails** via `tenant-url.config.ts`. |
| **Regression test** | `packages/config/app-urls.test.js` (16 assertions, CI: `npm run test:app-urls`) · `scripts/check-no-hardcoded-urls.mjs` (CI: `npm run check:no-hardcoded-urls`) · `services/api/src/common/config/tenant-url.config.spec.ts` |
| **Scenario** | Both directions, because tightening this has its own failure mode. **Too little:** building `apps/landing` with `VERCEL=1` and no `NEXT_PUBLIC_WEB_APP_URL` fails with an actionable message. **Too much:** building it with exactly what `REQUIRED_APP_URLS` declares and nothing more — no `NEXT_PUBLIC_ADMIN_APP_URL`, no `API_ORIGIN` — succeeds, and the output carries `https://app.dijipeople.com/login`. Loopback, malformed and non-HTTP values are rejected. A local `npm run build` and CI, which set neither `APP_ENV` nor `VERCEL`, still build against loopback defaults. |
| **Note** | Three "too much" defects were introduced while fixing this and were caught only by running the real build — every unit test passed at the time. `resolveAppUrls` and the `validateDeploymentEnv` return value resolve **lazily** for that reason, so `REQUIRED_APP_URLS` stays the single declaration of what a deployment must configure. |
| **Fixed** | 2026-08-16, branch `agent/production-url-integrity` |
| **Active** | yes |

### REG-017 — Admin and checkout pricing came from different models

| | |
|---|---|
| **Bug class** | `duplicate-source-of-truth` |
| **Module** | `services/api/prisma`, `api:super-admin`, `api:billing`, `apps/admin`, `apps/landing` |
| **Root cause** | `Plan.monthlyBasePrice` / `annualBasePrice` / `currency` survived alongside `PlanPrice` after the latter became the real commercial model. `SuperAdminBillingService.calculateSubscriptionPricing` fell back to the legacy columns whenever no `PlanPrice` resolved, and `upsertSubscription` wrote that result into `Subscription.basePrice` and `finalPrice` — so the legacy columns were an independent pricing authority in a live money path, not merely a display value. The seed created plans with **no `PlanPrice` at all**, which made that fallback the normal path rather than an edge case. First recorded as HIGH on the belief that only display was affected; re-rated CRITICAL once the operator subscription path was traced. |
| **Regression test** | `services/api/src/modules/super-admin/billing.legacy-pricing.spec.ts` (6 assertions) · `services/api/src/modules/billing/commercial-offer.resolver.spec.ts` (26 assertions) |
| **Scenario** | A plan whose legacy columns hold 199/1990 and whose `PlanPrice` holds 15 per seat prices at 15 × seats, never 199. A plan with no published price raises `BadRequestException` naming the plan, cycle and currency instead of billing the legacy amount — for both monthly and annual. Resolution filters on `publicationStatus = PUBLISHED` and orders by `effectiveFrom` then `version`, so a price staged for a future date cannot displace the one in force. |
| **Fixed** | 2026-08-16, branch `agent/commercial-config-wave1` |
| **Active** | yes |

### REG-018 — Country-to-currency was decided by a table inside the landing bundle

| | |
|---|---|
| **Bug class** | `silent-config-fallback` |
| **Module** | `apps/landing`, `api:billing`, `services/api/prisma` |
| **Root cause** | `detectRegionCurrency` in `apps/landing/lib/plans.ts` mapped country codes to currencies from a literal table compiled into the shipped bundle, with a hardcoded 19-entry "Europe" set that omitted several eurozone members. Opening or correcting a market was a frontend deploy, the mapping could not be audited, and `findPlanPrice` silently fell back to a USD price when the detected currency had none — quoting a plan in a currency the visitor's market does not use. Same class as BUG-0026: a decision belonging in configuration, inlined where it cannot be changed without a deploy. |
| **Regression test** | `services/api/src/modules/billing/commercial-offer.resolver.spec.ts` — market gating, market-default currency always sellable, unsupported currency refused, null-market price refused rather than treated as a wildcard |
| **Scenario** | Currency is resolved server-side from published `Market` configuration via the visitor's edge country header. A country with no configured market gets the published default market, not a literal `"USD"`. A price with no market is refused rather than being purchasable everywhere. The public currency selector is not rendered, so a visitor cannot pick a currency their market has no price in; multi-currency support remains intact underneath. |
| **Fixed** | 2026-08-16, branch `agent/commercial-config-wave1` |
| **Active** | yes |

### REG-019 — The public features page drifted from the product's feature catalogue

| | |
|---|---|
| **Bug class** | `doc-code-drift` |
| **Module** | `apps/landing`, `api:billing`, `api:tenant-settings` |
| **Root cause** | `/features` rendered a hardcoded twelve-entry array with no path to the catalogue the product actually gates modules on. It drifted in both directions: it advertised "Reporting", "Role-based access" and "Multi-tenant architecture" — none of which are entitlement features — while omitting `organization`, `projects` and `notifications`, which are. Growth and Enterprise both include Projects and no prospect could tell. One card also put five internal terms ("workspace isolation", "feature flags", "admin lifecycle"…) on a customer-facing page. `/plans` had no entitlement source at all, so a plan comparison could not be rendered honestly. |
| **Regression test** | `services/api/src/modules/billing/public-feature-catalog.spec.ts` (6 assertions) · `apps/landing/lib/plan-presentation.spec.ts` (26) · `apps/landing/lib/subscribe-selection.spec.ts` (12) |
| **Scenario** | Every plan grants only features present in `TENANT_FEATURE_DEFINITIONS`; every catalogue feature carries the label, description and category the public page renders; the seeded plans nest so "everything in X, plus" is accurate; and the top plan grants every visible feature, so no comparison row is unreachable. The public pages render from `featureCatalog` on the commercial config API, so adding a feature server-side reaches the site without a frontend change. |
| **Fixed** | 2026-08-16, branch `agent/public-commercial-wave2` |
| **Active** | yes |

### REG-020 — A plan list GET created commercial pricing and failed on a unique constraint

| | |
|---|---|
| **Bug class** | `hidden-write-on-read` |
| **Module** | `api:super-admin`, `api:platform-runtime`, `services/api/prisma` |
| **Root cause** | Three causes, only one of them concurrency. **Primary:** the bootstrap's existence check named `{ planId, marketId, currency, billingInterval }` while the database enforced a partial unique index on `(planId, billingCycle, currency) WHERE isActive = true` — disagreeing on the market, on `billingInterval` versus `billingCycle`, and on `isActive`, all at once. Any pre-existing active price scoped to a different or null market defeated the check and violated the index, deterministically. **Secondary:** check-then-create had no atomicity, so concurrent readers could both insert. **Structural:** the index predates markets, and every seeded market defaults to USD, so it could not tell two legitimate market prices apart. All of it was reachable only because `listPlans` and `getPlanDetail` called a mutating initializer — a pattern that pre-dated Wave 1 for `Plan` rows and that Wave 1 extended into `PlanPrice`. |
| **Regression test** | `services/api/test/commercial-bootstrap.e2e-spec.ts` (real PostgreSQL, promoted into the `database-migration` required gate) · `services/api/src/modules/super-admin/plan-read-path-purity.spec.ts` |
| **Scenario** | Reads write nothing: the purity spec asserts the read methods contain no bootstrap call and was verified to fail when the call is restored. Against real PostgreSQL: bootstrap is idempotent across repeated runs; eight concurrent bootstraps all succeed with the row count unchanged; two markets may each hold an active price for the same plan/cycle/currency; two active prices in one market are still rejected; two active unscoped rows are still rejected via `NULLS NOT DISTINCT`; active plus archived plus future draft coexist; and bootstrap never activates or publishes a draft. |
| **Fixed** | 2026-08-16, branch `agent/hotfix-plan-list-hidden-write` |
| **Active** | yes |

### REG-021 — The public contact form fabricated Lead data

| | |
|---|---|
| **Bug class** | `fabricated-required-field` |
| **Module** | `apps/landing`, `api:leads`, `services/api/prisma` |
| **Root cause** | `Lead.industry`, `Lead.companySize` and `Lead.contactLastName` were `NOT NULL`, and the public contact form does not ask for any of them — so it invented values to satisfy the columns. Worse than first recorded: `industry` received the visitor's **interest area** (`form.interestArea \|\| 'General HR operations'`), so a contact interested in payroll was recorded as being in the payroll industry and the real interest was lost; `LeadsService` then wrote the same value into `interestedPlan`, conflating "which modules interest you" with "which plan do you want". `subStatus` was additionally hardcoded to `'Demo requested'` on every lead regardless of what was asked, making the column say the same thing for everyone. |
| **Regression test** | `services/api/src/modules/leads/public-lead-acquisition.spec.ts` (21 assertions) · `apps/landing/lib/acquisition-options.spec.ts` (14 assertions) |
| **Scenario** | A submission with no industry and no company size records null for both — asserted against the specific invented strings `'General HR operations'` and `'Unknown'`. Interest areas land in their own column, validated against the feature catalogue the product gates modules on, with unknown keys dropped rather than the inquiry rejected. `subStatus` is derived from the stated intent and null when none was given, never `'Demo requested'` by default. Attribution is persisted exactly as captured and absent UTM values stay null rather than being defaulted. The privacy notice version is recorded by the server, so a client-supplied version is ignored. Marketing consent is optional: submitting without it succeeds and records false. |
| **Fixed** | 2026-08-16, branch `agent/lead-partner-acquisition-wave3` |
| **Active** | yes |

### REG-022 — Partnership model was indistinguishable from contracting entity type

| | |
|---|---|
| **Bug class** | `overloaded-enum` |
| **Module** | `apps/landing`, `api:partner-experience`, `apps/admin` |
| **Root cause** | `PartnerInquiry.type` is `PartnerType { INDIVIDUAL, COMPANY }` — the contracting entity type. The public partner form collected only that, so a referral partner, a reseller, an implementation partner and a technology integrator all arrived commercially identical, and nothing downstream could route or qualify them differently. Wave 3 added the `PartnershipModel` enum and column but left the form unwired; this wave completed it. |
| **Regression test** | `services/api/src/modules/partner-experience/partner-inquiry-acquisition.spec.ts` |
| **Scenario** | `PartnerType` and `PartnershipModel` are asserted to share no values in either direction, so neither can be overloaded into the other later. Every model the public form offers is one the enum can store, and every enum value is offered, so no option is unreachable. `isPartnershipModel` rejects `'COMPANY'` and `'INDIVIDUAL'` explicitly — the precise confusion the field exists to prevent. Every option carries a human label rather than a raw enum name. |
| **Fixed** | 2026-08-16, branch `agent/final-consolidation` |
| **Active** | yes |

### REG-023 — Every public write handler is rate limited

| | |
|---|---|
| **Bug class** | `authorization-missing` |
| **Module** | `services/api/src/common/guards` |
| **Bug record** | BUG-0031 |
| **Root cause** | The rate limit was applied per controller by hand with no mechanical check that a `@Public()` write path had one. Three separate endpoints shipped without it (BUG-0013, BUG-0031, BUG-0033) before the check existed. |
| **Regression test** | `services/api/src/common/guards/public-write-rate-limit.invariant.spec.ts` (13 assertions) |
| **Scenario** | Add a `@Public()` `@Post()` handler to any controller under `src/modules` without `PublicRateLimitGuard` → the suite names the file and the handler signature and fails. |
| **Proven to fail without the fix** | Before the guards were applied it reported all 4 offending controllers and all 14 handlers. |
| **Fixed** | 2026-08-16, branch `agent/bug-closure-stabilization` |
| **Active** | yes |

### REG-024 — Public rate limiting identifies the visitor, not the proxy

| | |
|---|---|
| **Bug class** | `shared-identity-bucket` |
| **Module** | `packages/config`, `services/api/src/common/security`, all three Next apps |
| **Bug record** | BUG-0032 |
| **Root cause** | `PublicRateLimitGuard` keyed on `request.ip`, but all 20 Next route handlers that proxy to the API call `fetch()` server-side without forwarding the visitor, so the API saw one address for the entire world. One visitor could 429 everybody, and the limit could not tell an attacker from a customer. |
| **Regression test** | `services/api/src/common/security/client-ip.spec.ts` (6) · `services/api/src/common/guards/public-rate-limit.guard.spec.ts` (bucket separation) · `scripts/check-proxy-forwards-client-ip.mjs` (CI) |
| **Scenario** | Two visitors behind one proxy hit the same public write path; one exhausts its 20-per-10-minutes allowance → the other is still served. And: delete `...forwardedClientHeaders(request)` from any proxy handler → the CI script reports `(0/1 fetches covered)` and exits 1. |
| **Proven to fail without the fix** | The guard assertion fails against the old `request.ip` key; the CI script fails with the spread removed. |
| **Fixed** | 2026-08-16, branch `agent/bug-closure-stabilization` |
| **Active** | yes |

### REG-025 — Desktop agent login does not enumerate accounts

| | |
|---|---|
| **Bug class** | `account-enumeration` |
| **Module** | `services/api/src/modules/agent` |
| **Bug record** | BUG-0033 |
| **Root cause** | `POST /agent/auth/login` returned different messages for 'no such user' and 'wrong password', skipped bcrypt entirely when the address did not exist (a timing oracle), and resolved the account with `findFirst({ where: { email } })` although `User` is unique on `[tenantId, email]`. |
| **Regression test** | `services/api/src/modules/agent/agent-login-enumeration.spec.ts` (5 assertions) |
| **Scenario** | Post a login for an address that does not exist and one that does with a wrong password → identical `Invalid credentials.`, and the non-existent address still costs a bcrypt comparison (>50 ms). An address present in two tenants resolves to the account whose password matches. |
| **Proven to fail without the fix** | Restoring the original `findFirst` + two-message shape fails 4 of the 5. |
| **Fixed** | 2026-08-16, branch `agent/bug-closure-stabilization` |
| **Active** | yes |

### REG-026 — Desktop agent request payloads satisfy the DTOs that receive them

| | |
|---|---|
| **Bug class** | `cross-workspace-contract-drift` |
| **Module** | `services/api/src/modules/agent`, `apps/agent-desktop` |
| **Bug record** | BUG-0035 |
| **Root cause** | The agent sent `deviceFingerprint` on logout and `AgentLogoutDto` never declared it. With `forbidNonWhitelisted: true` an undeclared field is a 400, so every logout failed, the agent swallowed it, and the refresh token stayed live for its full TTL. The two sides are validated in different workspaces and no test crossed the boundary. |
| **Regression test** | `services/api/src/modules/agent/agent-client-contract.spec.ts` (10 assertions) |
| **Scenario** | Validate the exact bodies `apps/agent-desktop/src/main/api-client.ts` sends against their DTOs through a `ValidationPipe` built with `main.ts`'s options → all accepted; a field no agent sends is still refused. A heartbeat batch of 1000 is accepted and 1001 refused. |
| **Proven to fail without the fix** | Removing `deviceFingerprint` from the DTO fails the logout case; removing `@ArrayMaxSize(1000)` fails the batch bound. |
| **Fixed** | 2026-08-16, branch `agent/bug-closure-stabilization` |
| **Active** | yes |

### REG-027 — Tenant base domain has one source of truth

| | |
|---|---|
| **Bug class** | `duplicate-source-of-truth` |
| **Module** | `services/api/src/modules/super-admin` |
| **Bug record** | BUG-0017 |
| **Root cause** | The base domain was editable in the admin UI and stored in the `tenant-provisioning` PlatformSetting while hostname issuance read environment configuration, so the operator control was inert. Configuration was kept as the single source — the edge router matches hostnames with no database access — and the setting retired, leaving a stale key in stored JSON that a future reader could helpfully read again. |
| **Regression test** | `services/api/src/modules/super-admin/tenant-provisioning.service.spec.ts` |
| **Scenario** | Store `tenantBaseDomain` and `defaultProtocol` in the `tenant-provisioning` setting → `settings()` returns the values from `getPlatformDomainConfig()`, while the one genuinely stored key `wildcardDnsReady` is still read. |
| **Proven to fail without the fix** | Reintroducing `stored.tenantBaseDomain || config.tenantBaseDomain` fails the assertion. |
| **Fixed** | 2026-08-16, branch `agent/bug-closure-stabilization` |
| **Active** | yes |

### REG-028 — A runtime module's route renders that module

| | |
|---|---|
| **Bug class** | `unreachable-surface` |
| **Module** | `apps/admin` |
| **Bug record** | BUG-0019 |
| **Root cause** | `partner-inquiries` and `partner-onboarding` were fully defined runtime modules whose list routes `redirect()`ed to `/partners?viewId=…` — a different entity, whose row ids the detail screens cannot resolve. The partner compliance review step was unperformable through the product while every individual piece looked correct. |
| **Regression test** | `apps/admin/lib/runtime/module-routes.invariant.spec.ts` (20 assertions) |
| **Scenario** | For every module declaring a `routeBase`, the page at that route must render the module rather than call `redirect()`. |
| **Proven to fail without the fix** | It found all three instances on its first run — including `/signature-requests`, which no bug record mentioned. |
| **Fixed** | 2026-08-16, branch `agent/bug-closure-stabilization` |
| **Active** | yes |

### REG-029 — Governed reasons are collected through the design system

| | |
|---|---|
| **Bug class** | `ungoverned-input` |
| **Module** | `apps/admin`, `apps/web` |
| **Bug record** | BUG-0020 |
| **Root cause** | `window.prompt` collected reasons for lead disqualification and moving a contract backward — values that land in an audited record — unstyled, unlabelled, unvalidated and untestable. The action handler is a plain module that cannot render, which is why a native prompt was reached for. |
| **Regression test** | `scripts/check-no-native-prompt.mjs` (CI) · `apps/admin/app/_components/runtime/use-reason-prompt.tsx` |
| **Scenario** | Introduce a `window.prompt` into any file under `apps/*` that is not in the named allowlist → the check reports the file and exits 1. A stale allowlist entry also fails. |
| **Proven to fail without the fix** | Reintroducing a prompt into `runtime-record-action-handler.ts` reports it and exits 1. Six known call sites remain, named in the allowlist and tracked as ITEM-0031. |
| **Fixed** | 2026-08-16, branch `agent/bug-closure-stabilization` |
| **Active** | yes |

### REG-030 — Tenant provisioning is safe to submit twice

| | |
|---|---|
| **Bug class** | `check-then-act` |
| **Module** | `services/api/src/modules/super-admin` |
| **Bug record** | BUG-0022 |
| **Root cause** | Two guards existed — the `onboarding.tenantId` pre-check and `Tenant.slug @unique` — but two requests that both read before either wrote both passed the pre-check, and the loser surfaced a raw P2002 on the most expensive create in the product, indistinguishable from provisioning being broken. |
| **Regression test** | `services/api/src/modules/super-admin/tenant-provisioning-idempotency.spec.ts` (4 assertions) |
| **Scenario** | A P2002 on tenant create where the onboarding has since gained a tenant → the winner's tenant is returned as `alreadyExists`. Where it has not → the error is rethrown, because the slug belongs to an unrelated tenant. |
| **Proven to fail without the fix** | Removing the `if (!winner?.tenantId) throw error` guard — assuming every P2002 is a duplicate submit — fails the unrelated-slug case. |
| **Fixed** | 2026-08-16, branch `agent/bug-closure-stabilization` |
| **Active** | yes |

### REG-031 — A replayed heartbeat is not counted twice

| | |
|---|---|
| **Bug class** | `non-idempotent-retry` |
| **Module** | `services/api/src/modules/agent` |
| **Bug record** | BUG-0036 |
| **Root cause** | The agent re-sends a whole batch when a send fails. The server created every `ActivityEvent` unconditionally and then *incremented* session and daily totals, so a replayed batch permanently inflated `totalActiveSeconds` and `DailyProductivitySummary` — what `utilizationPercent` is computed from. |
| **Regression test** | `services/api/src/modules/agent/heartbeat-idempotency.spec.ts` (4 assertions) |
| **Scenario** | Re-send an already-recorded sample → the unique `dedupeKey` index refuses it, the handler returns before the counters run, and the batch is still reported accepted. A non-duplicate database failure is rethrown rather than treated as already-done. |
| **Proven to fail without the fix** | Swallowing every error rather than only P2002 fails the rethrow case — which matters, because that would drop telemetry while reporting it accepted. |
| **Fixed** | 2026-08-16, branch `agent/bug-closure-stabilization` |
| **Active** | yes |

### REG-032 — Admin sign-out always revokes, and never 500s while clearing cookies

| | |
|---|---|
| **Bug class** | `incomplete-signout` |
| **Module** | `apps/admin` |
| **Bug record** | BUG-0009 · BUG-0010 |
| **Root cause** | Revocation was called only when the refresh cookie was still present, so signing out after it expired cleared the browser and left the platform session live server-side. Separately, `getClearAuthCookieOptions()` throws on a rejected cookie configuration — an `ADMIN_COOKIE_DOMAIN` not matching a `.vercel.app` host — and was called unguarded, turning every operator's sign-out into a 500. |
| **Regression test** | `apps/admin/app/api/auth/logout/logout-route.spec.ts` (10 assertions) |
| **Scenario** | `revokeApiSession` is called from both handlers and neither the call site nor the function body skips it when the refresh cookie is absent; cookies are cleared only through the try/catch wrapper, whose fallback still expires the cookie. |
| **Proven to fail without the fix** | Both defects restored independently — a guard at the call site, a guard as an early return inside the function, and unwrapping the throwing variant — each fails its assertion. The first draft caught only the call-site shape and was strengthened. |
| **Fixed** | 2026-08-16, branch `agent/bug-closure-stabilization` |
| **Active** | yes |

### REG-033 — A caller and its route agree on HTTP method

| | |
|---|---|
| **Bug class** | `route-method-mismatch` |
| **Module** | `apps/admin`, `apps/web`, `apps/landing` |
| **Bug record** | BUG-0008 · BUG-0038 |
| **Root cause** | Each side individually correct, the pair wrong, and nothing comparing pairs. A link is always a GET; a fetch with no method is a GET. A route exporting only POST answers 405, and the calling UI reports it as a generic failure. |
| **Regression test** | `scripts/check-route-method-callers.mjs` (CI: `npm run check:route-method-callers`) |
| **Scenario** | Point an `<a href>` or a `fetch()` at a same-app `/api/...` route using a method that route does not export → the check names the file, line, method sent and methods exported, and exits 1. |
| **Proven to fail without the fix** | Reported BUG-0038 on its first run, before it was known to exist. |
| **Fixed** | 2026-08-17, branch `agent/bug-closure-stabilization` |
| **Active** | yes |
