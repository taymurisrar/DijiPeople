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
| **Bug record** | BUG-0001 |
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
| **Bug record** | BUG-0002 |
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
| **Bug record** | BUG-0003 |
| **Root cause** | `attendance.correction.readTeam` and `approvals.readTeam` were both bundled into a branch returning `{}` — an unrestricted `where` — making each a synonym for its `manage` permission. Two independent occurrences of the same misreading. |
| **Regression test** | `services/api/src/modules/attendance/attendance.correction-authorization.spec.ts`, `services/api/src/modules/approvals/approvals.scope.spec.ts` |
| **Scenario** | A user holding only `*.readTeam` lists records → the query carries a scope predicate limited to own + direct reports, never `{}`. `manage` still yields tenant-wide. |
| **Fixed** | 2026-08-14 on `agent/authz-batch0-attendance` and `agent/authz-batch0-readteam`; landed on `develop` 2026-08-17 |
| **Active** | yes |

### REG-004 — Search filter overwrote the access scope

| | |
|---|---|
| **Bug class** | `search-filter-scope-overwrite` |
| **Module** | `services/api/src/modules/approvals` |
| **Bug record** | BUG-0004 |
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
| **Bug record** | BUG-0005 |
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
| **Bug record** | BUG-0006 |
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
| **Bug record** | BUG-0007 |
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
| **Bug record** | BUG-0008 |
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
| **Bug record** | BUG-0011 |
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
| **Bug record** | BUG-0012 |
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
| **Bug record** | BUG-0013 |
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
| **Bug record** | BUG-0014 |
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
| **Bug record** | BUG-0015 |
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
| **Bug record** | BUG-0016 |
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
| **Bug record** | BUG-0025 |
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
| **Bug record** | BUG-0026 |
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
| **Bug record** | BUG-0027 |
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
| **Bug record** | BUG-0028 |
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
| **Bug record** | BUG-0029 |
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
| **Bug record** | BUG-0030 |
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
| **Bug record** | BUG-0021 |
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
| **Bug record** | ITEM-0030 |
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
| **Bug record** | BUG-0019 · BUG-0024 |
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
| **Regression test** | `apps/admin/app/api/auth/logout/logout-route.behaviour.spec.ts` (7 tests that invoke the handlers) and `logout-route.spec.ts` (10 source-shape assertions) |
| **Scenario** | Sign out with the refresh cookie **absent** but access and session cookies present: the API revocation call must still be made, and the surviving cookies must reach it in the forwarded `Cookie` header. Sign out under a **rejected cookie configuration**: POST must return 200 and GET must redirect, both still expiring the cookies, rather than throwing a 500 that traps the operator in the session-expired loop. Paired negatives in both directions — no auth cookies at all makes no call, and an accepted configuration uses the real options rather than the fallback. |
| **Proven to fail without the fix** | Behaviourally, on 2026-08-20: restoring `if (!refreshToken) return;` fails 2 tests; letting the rejected-config throw escape fails 3. Earlier source-shape mutations still apply to the static file. |
| **Note** | Upgraded from source-shape to behavioural on 2026-08-20. The static file asserted that the *text* of the route had the right shape, which is `assertion-without-a-check`: rewrite the behaviour differently and it still passes, delete the behaviour but keep the shape and it still passes. Both bug records said as much in their own Regression Coverage sections — *"does not invoke logout"*, *"does not execute the route"* — and both were left `VERIFIED` on that basis for three days. |
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

### REG-034 — A route proxy forwards a refusal and never answers around one

| | |
|---|---|
| **Bug class** | `proxy-authorization-decision` |
| **Module** | `apps/web` |
| **Bug record** | BUG-0039 |
| **Root cause** | Three proxies re-requested `/me/*` when the API answered 403 and returned it as 200, so a refusal became a success carrying different data under a URL naming the record that was asked for. Nothing logged the substitution and the caller could not tell. |
| **Regression test** | `scripts/check-proxies-forward-refusals.mjs` (CI: `npm run check:proxies-forward-refusals`) |
| **Scenario** | Branch on a 401/403 in a route handler and issue another upstream request → the check names the file and branch and exits 1. Refreshing a token and retrying the same request is allowlisted with its reason. |
| **Proven to fail without the fix** | Found a third instance the bug record did not name, on its first run; restoring the `/me/payslips` fallback fails it. |
| **Fixed** | 2026-08-17, branch `agent/final-parent-implementation` |
| **Active** | yes |

### REG-035 — The Next apps ship security response headers

| | |
|---|---|
| **Bug class** | `missing-security-header` |
| **Module** | `packages/config`, all three Next apps |
| **Bug record** | BUG-0040 |
| **Root cause** | No CSP, no frame protection, no HSTS, no nosniff, no referrer policy in any of the three apps. The tenant product renders payroll and bank details and could be framed by any site. |
| **Regression test** | `packages/config/security-headers.test.js` (CI: `npm run test:security-headers`) |
| **Scenario** | Every path gets the five baseline headers; the CSP is emitted as Content-Security-Policy-Report-Only and never as an enforced Content-Security-Policy; X-Frame-Options is DENY. |
| **Proven to fail without the fix** | The report-only and frame-protection assertions fail if either decision is reversed — which is the accident they exist to catch, since promoting the CSP looks like an improvement. |
| **Fixed** | 2026-08-17, branch `agent/final-parent-implementation` |
| **Active** | yes |

### REG-036 — Context absence claims contradicted the repository tree

| | |
|---|---|
| **Bug class** | `doc-code-drift` |
| **Module** | `.agent/context` |
| **Bug record** | BUG-0023 · BUG-0037 |
| **Root cause** | Context documents asserted that e2e suites, attendance integrations, the gateway and device tooling did not exist. Absence claims produced no failing signal when the repository changed. |
| **Regression test** | `docs/qa/scenarios/QA-DEPLOY-007-context-absence-claims-are-rederived-from-the-tree.md` (manual reusable scenario) |
| **Scenario** | List the current test and integration surfaces from the tree, then compare every context-layer presence or absence claim against those sources. |
| **Proven to fail without the fix** | The original check found both named e2e suites and all four integration subsystems while the context denied them. |
| **Fixed** | 2026-08-16, documentation correction tasks |
| **Active** | yes |

### REG-037 — The documented module workflow named inert registries

| | |
|---|---|
| **Bug class** | `doc-code-drift` · `declared-but-unwired-step` |
| **Module** | `apps/web` |
| **Bug record** | BUG-0044 |
| **Root cause** | The scope-authoritative instructions described registration functions with no production call sites instead of the live `StandardModuleRuntimeSpec` route workflow. |
| **Regression test** | `docs/qa/scenarios/QA-RUNTIME-006-module-workflow-documentation-names-the-live-runtime-path.md` (manual reusable scenario) |
| **Scenario** | Follow the documented module workflow and trace each named function to a live call site; the instructions must describe the spec-object path and label inert scaffolding. |
| **Proven to fail without the fix** | The original call-site count found only definitions and a commented example for the documented registry functions. |
| **Fixed** | 2026-08-17, TASK-0003 |
| **Active** | yes |

### REG-038 — Terminal Bug records cannot rely on unmerged regressions

| | |
|---|---|
| **Bug class** | `premature-completion` · `doc-code-drift` |
| **Module** | `scripts`, `docs/bugs`, `docs/qa/regressions` |
| **Bug record** | BUG-0047 |
| **Root cause** | Bugs were marked VERIFIED and regressions Active from branch-level evidence even though the fixes and tests were absent from the integration branch. |
| **Regression test** | `scripts/validate-framework.mjs` |
| **Scenario** | Every terminal Bug resolves its `RegressionId` to an active register entry whose named test exists in the current checkout. |
| **Proven to fail without the fix** | The validator reported the five active regression specs absent from the integration branch and the investigation exposed seven falsely terminal Bugs. |
| **Fixed** | 2026-08-17, branch `agent/framework-remediation` |
| **Active** | yes |

### REG-039 — An empty optional website does not reject a partner inquiry

| | |
|---|---|
| **Bug class** | `frontend-api-contract-mismatch` |
| **Module** | `apps/landing`, `services/api/src/modules/partner-experience` |
| **Bug record** | BUG-0048 |
| **Root cause** | An untouched HTML input submitted `""`, while `@IsOptional()` skipped validation only for null or undefined, so `@IsUrl()` rejected the optional field. |
| **Regression test** | `e2e/tests/flow-b-partner-journey.spec.ts` (B1) |
| **Scenario** | Submit a partner inquiry with Company website blank; the browser receives a reference and exactly one inquiry row is created, while malformed non-empty URLs remain invalid. |
| **Proven to fail without the fix** | The unfixed browser run showed `website must be a URL address` and zero created inquiries. |
| **Fixed** | 2026-08-17, branch `agent/framework-remediation` |
| **Active** | yes |

### REG-040 — Every tenant PermissionsGuard route declares both authorization families

| | |
|---|---|
| **Bug class** | `missing-authorization-metadata` |
| **Module** | `services/api/src` |
| **Bug record** | BUG-0049 · ITEM-0043 |
| **Root cause** | Legacy and matrix authorization evolved independently, leaving 796 guarded handlers with incomplete metadata and no required invariant. |
| **Regression test** | `services/api/src/common/constants/wiring-invariants.spec.ts` |
| **Scenario** | Discover every controller route; every non-public handler behind `PermissionsGuard` must expose non-empty legacy and matrix metadata, while every alternate guard/service-authorized surface must be explicitly reviewed. |
| **Proven to fail without the fix** | The baseline test reported 796 violations: 3 legacy-only gaps, 715 matrix-only gaps and 78 dual-missing routes. |
| **Fixed** | 2026-08-17, branch `agent/remediation-authorization` |
| **Active** | yes |

### REG-041 — Document authorization follows the owning employee

| | |
|---|---|
| **Bug class** | `object-authorization-bypass` |
| **Module** | `services/api/src/modules/documents` |
| **Bug record** | BUG-0053 |
| **Root cause** | General list/id/file and mutation paths filtered only by tenant even when the caller's document and employee matrix scope was SELF or a business-unit subtree. |
| **Regression test** | `services/api/src/modules/documents/documents-object-authorization.spec.ts` |
| **Scenario** | A SELF-scoped caller cannot list, open, update, archive or upload against another employee's document or employee id; a tenant-scoped reader retains tenant access. |
| **Proven to fail without the fix** | The original service never called an owning-employee scope assertion on general reads, update, archive or upload. |
| **Fixed** | 2026-08-17, branch `agent/remediation-authorization` |
| **Active** | yes |

### REG-042 — Partner operations use platform capabilities, not tenant role aliases

| | |
|---|---|
| **Bug class** | `authorization-domain-confusion` |
| **Module** | `services/api/src/modules/partners` |
| **Bug record** | BUG-0055 |
| **Root cause** | Platform routes used tenant `RolesGuard` aliases, allowing a platform MEMBER to inherit `system-customizer` while denying legitimate partner platform roles. |
| **Regression test** | `services/api/src/modules/partners/partners-platform-authorization.spec.ts` |
| **Scenario** | MEMBER and tenant JWT callers are denied; PARTNER_MANAGER can read/manage; PRESALES is read-only. |
| **Proven to fail without the fix** | The former controller accepted role aliases and most service methods received no actor with which to assert a platform capability. |
| **Fixed** | 2026-08-17, branch `agent/remediation-authorization` |
| **Active** | yes |

### REG-043 — Billing reads and writes require distinct capabilities

| | |
|---|---|
| **Bug class** | `role-capability-mismatch` |
| **Module** | `services/api/src/modules/billing` |
| **Bug record** | BUG-0056 |
| **Root cause** | Billing routes used coarse role aliases, so a system customizer could mutate billing without a billing capability while a CEO holding `billing.view` was refused. |
| **Regression test** | `services/api/src/modules/billing/billing-authorization.spec.ts` |
| **Scenario** | Billing readers can use read routes, unprivileged users are denied, and writes require `billing.manage` plus tenant-administration MANAGE. |
| **Proven to fail without the fix** | The former controller used only `RolesGuard` and declared no billing permission metadata. |
| **Fixed** | 2026-08-17, branch `agent/remediation-authorization` |
| **Active** | yes |

### REG-044 — Resolved settings cannot preview arbitrary organization context

| | |
|---|---|
| **Bug class** | `client-selected-authorization-scope` |
| **Module** | `services/api/src/modules/tenant-settings` |
| **Bug record** | BUG-0057 |
| **Root cause** | `dashboard.view` was treated as authority to resolve client-selected organization, business-unit, employee and project ids; explicit organization preview checked tenant membership only. |
| **Regression test** | `services/api/src/modules/tenant-settings/settings-context-authorization.spec.ts` |
| **Scenario** | SELF callers ignore arbitrary context ids; organization readers may preview only validated ids within their matrix scope; cross-tenant ids are hidden. |
| **Proven to fail without the fix** | Both controllers forwarded arbitrary query ids directly into the resolver without an access-level check. |
| **Fixed** | 2026-08-17, branch `agent/remediation-authorization` |
| **Active** | yes |

### REG-045 — Hierarchy reads and mutations stay inside matrix scope

| | |
|---|---|
| **Bug class** | `object-authorization-bypass` |
| **Module** | `services/api/src/modules/organization` |
| **Bug record** | BUG-0058 |
| **Root cause** | Organization, business-unit and department services accepted only `tenantId`, so scoped matrix privileges were never applied to sibling objects or root creation. |
| **Regression test** | `services/api/src/modules/organization/organization-read-scope.spec.ts` · `services/api/src/modules/organization/organization-structure-authorization.spec.ts` |
| **Scenario** | Organization/BU/department lists, detail, traversal and mutations hide sibling scope; only TENANT management scope can create or move a root organization. |
| **Proven to fail without the fix** | The previous controller/service contracts forwarded tenant id only and the focused test's sibling records remained visible. |
| **Fixed** | 2026-08-17, branch `agent/remediation-authorization` |
| **Active** | yes |

### REG-046 — Legacy custom-role and direct-user grants survive matrix enforcement

| | |
|---|---|
| **Bug class** | `authorization-migration-lockout` |
| **Module** | `services/api/src/modules/permissions`, `services/api/src/modules/auth` |
| **Bug record** | BUG-0049 · ITEM-0043 |
| **Root cause** | Adding matrix metadata would deny legacy-only custom roles and direct `UserPermission` grants because only system roles had `RolePrivilege` rows and no user-privilege model exists. |
| **Regression test** | `services/api/src/modules/permissions/permission-bootstrap-custom-role.spec.ts` · `services/api/src/modules/auth/direct-permission-privileges.spec.ts` |
| **Scenario** | Bootstrap adds only missing custom-role matrix rows at the role scope; direct grants synthesize only corresponding privileges at the user's highest assigned role scope, defaulting to SELF. |
| **Proven to fail without the fix** | Before the compatibility bridge, neither path contributed a matching entry to `AuthenticatedUser.rolePrivileges`. |
| **Fixed** | 2026-08-17, branch `agent/remediation-authorization` |
| **Active** | yes |

### REG-047 — A report-only CI job publishes an explicit PASS/FAIL verdict

| | |
|---|---|
| **Bug class** | `false-success-state` |
| **Module** | `.github/workflows` |
| **Bug record** | BUG-0049 |
| **Root cause** | A report-only job concludes `success` whatever its tests did, so a summary that prints only counts gets read as a pass. The security invariant job compounded it by reading jest's status from `$?` after a `\| tee` pipeline — tee's status, always 0. |
| **Regression test** | `scripts/validate-framework.mjs` (CI: `npm run validate:framework`) |
| **Scenario** | Every job whose name contains "report only" must publish an explicit `RESULT:` verdict carrying PASS or FAIL, not counts alone. |
| **Proven to fail without the fix** | Removing the `RESULT:` line from `database-e2e-report` fails the check "report-only job \"database-e2e-report\" publishes an explicit PASS/FAIL verdict"; restoring it passes. |
| **Fixed** | 2026-08-17, branch `agent/remediation-authorization` |
| **Active** | yes |

### REG-048 — A stale generated Prisma client is named, not left to look like 60 code errors

| | |
|---|---|
| **Bug class** | `stale-generated-artifact` |
| **Module** | `services/api`, `scripts` |
| **Bug record** | BUG-0060 |
| **Root cause** | `build` and CI regenerate the Prisma client, but `start:dev` and `check-types` did not, so the two commands a developer runs all day could read a client older than `schema.prisma`. The failure surfaced as 60 TypeScript errors accusing correct application code, plus a runtime crash on an undefined enum. |
| **Regression test** | `scripts/check-prisma-client-fresh.mjs` (CI: `npm run check:prisma-client`) |
| **Scenario** | Every enum `schema.prisma` declares must be exported by the generated client, and every model must have a delegate. A mismatch fails with the missing symbol named and `npm run prisma:generate` as the fix. |
| **Proven to fail without the fix** | Deleting the `LeadInquiryIntent` export from `node_modules/.prisma/client/index.js` makes the check exit 1 reporting `Missing enums (1): LeadInquiryIntent`; restoring it passes. |
| **Fixed** | 2026-08-17, branch `agent/prisma-client-freshness` |
| **Active** | yes |

### REG-056 — The agent update feed serves only releases the updater can verify

| | |
|---|---|
| **Bug class** | `unservable-endpoint` |
| **Module** | `services/api/src/modules/app-releases`, `apps/agent-desktop` |
| **Bug record** | BUG-0034 |
| **Root cause** | `electron-updater`'s generic provider requests `<url>/latest.yml` and nothing served it, so every agent 404'd on every check for months. The updater swallows that failure, and the agent logged no reason, so a permanently dead feed was indistinguishable from a network blip. Building the feed then needed a digest the schema did not hold: electron-updater verifies against sha512 and `ApplicationRelease` stored only sha256. |
| **Regression test** | `services/api/src/modules/app-releases/update-feed.service.spec.ts` · `services/api/src/modules/app-releases/release-publisher.service.spec.ts` |
| **Scenario** | The feed renders the fields electron-updater reads, quotes the version so YAML cannot reinterpret `1.10` as `1.1`, and selects only an active STABLE release that has `checksumSha512`, `fileName`, `fileSizeBytes` and `publishedAt`. The publisher computes sha512 as base64 from the received bytes, carries it through `promote()`, and verifies it case-sensitively on read-back. |
| **Proven to fail without the fix** | Removing `checksumSha512` from the read-back fixture fails `verifyRegistration` with `sha512 checksum differs` — which is how the five publisher tests failed the moment the check was added. Dropping the quoting fails `quotes the version so YAML cannot reinterpret it`. |
| **Fixed** | 2026-08-18, branch `agent/dependency-and-desktop` — repository-controlled parts; end-to-end staging run is ITEM-0052 |
| **Active** | yes |

### REG-054 — Theme precedence is user choice, then tenant default, then device

| | |
|---|---|
| **Bug class** | `competing-writers` |
| **Module** | `apps/web/lib/theme.ts` |
| **Bug record** | BUG-0046 |
| **Root cause** | Three writers competed for `data-theme` — the branding client, the resolved-settings provider and the theme applier — and the applier installed a MutationObserver that reverted anything it had not written back to `readStoredThemeChoice() ?? "system"`. On a browser with no stored choice a tenant default of DARK was written, observed and immediately overwritten with the device preference, so the setting saved and did nothing. The branding client could also write a literal `data-theme="system"`, which matches no rule in `globals.css`. |
| **Regression test** | `apps/web/lib/theme-precedence.spec.ts` |
| **Scenario** | `effectiveThemeChoice()` resolves user choice, then tenant default, then device; the tenant default is published to `data-tenant-theme` and only `applyTheme` writes `data-theme`, always as a concrete `light`/`dark`. |
| **Proven to fail without the fix** | Reverting `effectiveThemeChoice()` to `readStoredThemeChoice() ?? "system"` — the original expression — fails `uses the tenant default when the user has chosen nothing`; restoring it passes. |
| **Fixed** | 2026-08-18, branch `agent/web-ux-authz-fixes` |
| **Active** | yes |

### REG-055 — A web route handler decides nothing

| | |
|---|---|
| **Bug class** | `proxy-makes-decisions` |
| **Module** | `apps/web/app/api` |
| **Bug record** | BUG-0041 · BUG-0039 |
| **Root cause** | `apps/web/AGENTS.md` says a route handler forwards the request, forwards the response and decides nothing. Three handlers did otherwise: `teams` read `permissionKeys` and returned a fabricated `200 { items: [] }` without calling the API; `lookups/dashboard-views` substituted an invented "Administration" option on any non-401 failure, converting a refusal into a success; `attendance/reverse-geocode` called `nominatim.openstreetmap.org` directly and spread `forwardedClientHeaders` into that request, sending the visitor's IP to a third party alongside their punch coordinates. |
| **Regression test** | `scripts/check-proxies-forward-refusals.mjs` (CI: `npm run check:proxies-forward-refusals`) · `scripts/check-proxy-forwards-client-ip.mjs` (CI: `npm run check:proxy-forwards-client-ip`) |
| **Scenario** | No handler reads permissions to decide access, substitutes data the API did not return, or forwards client headers anywhere but to the API. |
| **Proven to fail without the fix** | The three handlers are the proof: each decision was unconditional in source and each is now removed. `teams` no longer imports `getSessionUser`; `dashboard-views` forwards `error.status`; `reverse-geocode` calls the shared server-side `reverseGeocode` helper, which sends no client headers. |
| **Fixed** | 2026-08-18, branch `agent/web-ux-authz-fixes` — partial; see ITEM-0050 |
| **Active** | yes |

### REG-053 — The email providers offered are the email providers implemented

| | |
|---|---|
| **Bug class** | `offer-exceeds-implementation` |
| **Module** | `services/api/src/modules/notifications/email`, `apps/web`, `packages/config` |
| **Bug record** | BUG-0050 |
| **Root cause** | Two catalogs with nothing comparing them. The settings UI enumerated what the Prisma `EmailProviderType` enum allowed; the factory decided what was actually built and mapped everything else to a placeholder that throws on send and on connection test. A tenant could configure SES, mark it default, and silently receive no mail. |
| **Regression test** | `services/api/src/modules/notifications/email/email-provider-support.spec.ts` |
| **Scenario** | `@repo/config` publishes one catalog. Its supported and unimplemented lists together equal the Prisma enum exactly and do not overlap; every supported type resolves to a real provider; every unimplemented type still resolves to the placeholder so nothing pretends it can send. |
| **Proven to fail without the fix** | Moving a provider between the two lists without changing the factory fails `returns a real implementation for <type>` or `still resolves <type> to the placeholder`. Before the fix the UI offered five types the factory could not deliver through. |
| **Fixed** | 2026-08-17, branch `agent/web-config-correctness` |
| **Active** | yes |

### REG-051 — Every environment variable a Next app reads is registered for cache invalidation

| | |
|---|---|
| **Bug class** | `unregistered-build-input` |
| **Module** | `apps/web`, `apps/admin`, `apps/landing`, `turbo.json` |
| **Bug record** | BUG-0042 |
| **Root cause** | Turborepo invalidates the build cache only for variables listed in `globalEnv`. A `NEXT_PUBLIC_*` value is inlined into the client bundle at build time, so an unregistered one can be changed, rebuilt from cache, and still ship the old value compiled in. The rule was documented in `docs/deployment/environments.md` and enforced nowhere; 37 reads across the three apps had drifted out of the list. |
| **Regression test** | `scripts/check-env-registered.mjs` (CI: `npm run check:env-registered`) |
| **Scenario** | Every `process.env.*` read under `apps/web`, `apps/admin` and `apps/landing` appears in `turbo.json` `globalEnv`, and no secret is exposed through a `NEXT_PUBLIC_*` name. |
| **Proven to fail without the fix** | Removing `NEXT_PUBLIC_APP_BASE_URL` from `globalEnv` fails the check naming that variable and its read sites; restoring it passes. |
| **Fixed** | 2026-08-17, branch `agent/web-config-correctness` |
| **Active** | yes |

### REG-052 — A workspace declares every package it imports

| | |
|---|---|
| **Bug class** | `undeclared-hoisted-dependency` |
| **Module** | `apps/web`, `apps/admin`, `apps/landing`, `apps/docs` |
| **Bug record** | ITEM-0037 · ITEM-0024 |
| **Root cause** | npm workspaces hoist to the root `node_modules`, so a package declared by one workspace resolves from all of them. An undeclared import therefore works on a full-repo install and fails on a per-project one — which is how `apps/web` deploys. It recurred: ITEM-0024 for landing at 2 files, then ITEM-0037 for web at 59, both `lucide-react`, both resolving only because `apps/admin` declared it. |
| **Regression test** | `scripts/check-declared-dependencies.mjs` (CI: `npm run check:declared-dependencies`) |
| **Scenario** | Every bare package import in a Next workspace is declared by that workspace's own manifest. Relative paths, aliases and Node builtins are excluded; `react`, `react-dom` and `next` are framework-ambient. |
| **Proven to fail without the fix** | The check found three undeclared imports the record never listed — `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, declared only at the repository root. Removing `lucide-react` from `apps/web` fails the check naming 59 files; restoring it passes. |
| **Fixed** | 2026-08-17, branch `agent/web-config-correctness` |
| **Active** | yes |

### REG-050 — Record status, disposition and evidence cannot contradict each other

| | |
|---|---|
| **Bug class** | `contradictory-record-state` |
| **Module** | `scripts/lib`, `docs/bugs`, `docs/backlog` |
| **Root cause** | The structural checks validated vocabularies but not semantics, so a record could be terminal while carrying a nonterminal disposition, `READY` while dispositioned `DEFER`, or `VERIFIED` with no regression naming the fix. Generated indexes then published those states as active work. |
| **Bug record** | BUG-0051 |
| **Regression test** | `scripts/lib/backlog-records.mjs` · `scripts/lib/qa-records.mjs` (CI: `npm run backlog:check`, `npm run qa:check`, `npm run validate:framework`) |
| **Scenario** | A terminal status requires `ArchitectDisposition: DONE`; a `FIXED`/`VERIFIED`/`CLOSED` bug must name a regression that exists in the register; bug bodies must carry every mandatory section in canonical order; an active regression must have a reusable QA scenario covering every root it names. |
| **Proven to fail without the fix** | All four fired during TASK-0005 remediation on real edits: `terminal Status VERIFIED requires ArchitectDisposition DONE, got FIX_NOW`; `Status VERIFIED requires RegressionId so the fix has durable regression coverage`; `missing required section "## Proposed Resolution"` and `required section "## Resolution" is out of order`; `REG-049: active regression has no reusable QA scenario`. Each blocked the index rebuild until the record was corrected. |
| **Fixed** | 2026-08-17, branch `agent/prisma-client-freshness` |
| **Active** | yes |

### REG-049 — Every record id resolves as a bare wikilink in the vault

| | |
|---|---|
| **Bug class** | `unresolvable-generated-link` |
| **Module** | `scripts`, `docs/tasks`, `docs/knowledge` |
| **Bug record** | BUG-0059 |
| **Root cause** | Obsidian resolves a bare-id wikilink only through the `aliases:` frontmatter line. ITEM-0029 established that rule but scoped its validation to `docs/bugs` and `docs/backlog/items`, so `docs/tasks` emitted a record type no short-form link could reach. Separately, records linked module knowledge notes that had never been written, and one link named a document that is not a synced note at all. |
| **Regression test** | `scripts/validate-framework.mjs` (CI: `npm run validate:framework`) · `scripts/sync-obsidian.mjs` (CI: `npm run knowledge:verify`) |
| **Scenario** | Every bug, backlog and task record carries `aliases:` listing its own id, and every wikilink emitted into the vault resolves to a note in it. |
| **Proven to fail without the fix** | Removing the `aliases:` line from `TASK-0003` fails the check "Every bug, backlog and task record is reachable by its bare id in Obsidian" by name; restoring it passes. Before the fix `knowledge:verify` reported 12 unresolved wikilinks and exited 1. |
| **Fixed** | 2026-08-17, branch `agent/prisma-client-freshness` |
| **Active** | yes |

### REG-057 — A public page degrades when the plans API cannot be reached

| | |
|---|---|
| **Bug class** | `unguarded-server-fetch` |
| **Module** | `apps/landing` |
| **Bug record** | BUG-0061 |
| **Root cause** | `getPublicPlans()` handled a non-2xx response but let a transport failure throw. A connection refusal, timeout or restarting API therefore escaped the server component and Next rendered a 500 for the whole page — on `/` and `/subscribe`, the site's front door and its purchase page. The sibling loader `getCommercialConfig()` already caught the same failure, so the graceful path existed and was simply not applied here. |
| **Regression test** | `e2e/tests/flow-c-landing-public-surface.spec.ts` — "plans renders without console errors from the config contract"; degraded-state behaviour asserted alongside it |
| **Scenario** | With the plans API unreachable, `/`, `/subscribe` and `/plans` return 200 and render the shell with a stated degraded state, and no fabricated pricing appears. |
| **Proven to fail without the fix** | With the API stopped, the pre-fix build returned 500 on `/` and `/subscribe` (captured in the prior QA run as `PAGEERROR TypeError: fetch failed`); the fixed build returns 200 on all five public routes with the message "We could not reach our pricing service just now." |
| **Fixed** | 2026-08-18, branch `agent/landing-uiux-remediation` |
| **Active** | yes |

### REG-058 — A layout-level disclosure closes when the route changes

| | |
|---|---|
| **Bug class** | `layout-persistent-ui-state` |
| **Module** | `apps/landing` |
| **Bug record** | BUG-0062 |
| **Root cause** | The mobile navigation was a bare `<details>` in the root layout. App Router re-renders the page slot but keeps the layout mounted, so the element's `open` property survived navigation and the panel covered the heading of the page the visitor had just chosen. Escape did nothing either, because a native `<details>` has no dismissal contract. |
| **Regression test** | `e2e/tests/flow-c-landing-public-surface.spec.ts` — "menu closes after navigating" and "menu closes on Escape and restores focus", each at 390x844 and 768x1024 |
| **Scenario** | Opening the mobile menu and selecting a destination closes it; Escape closes it and returns focus to the trigger; an outside click closes it. |
| **Proven to fail without the fix** | Pre-fix probes recorded `stillOpenAfterNav=true` and `openAfterEscape=true`, with a screenshot of the panel covering the `/plans` heading. Post-fix the same probes record 0 panels after navigation and focus returned to the trigger. |
| **Fixed** | 2026-08-18, branch `agent/landing-uiux-remediation` |
| **Active** | yes |

### REG-059 — A public form reports what is wrong instead of disabling submit

| | |
|---|---|
| **Bug class** | `unreachable-validation` |
| **Module** | `apps/landing` |
| **Bug record** | BUG-0063 |
| **Root cause** | The shared lead form disabled its submit button until every required field was filled, which made `validate()` and its messages unreachable for the empty-field case they were written for. Inputs carried no `name`, `id`, `required`, `autocomplete`, `aria-invalid` or `aria-describedby`, and errors rendered inside the `<label>` — so a message became part of the field's accessible *name* rather than its description. `/contact` already implemented the correct pattern. |
| **Regression test** | `e2e/tests/flow-c-landing-public-surface.spec.ts` — "submit is operable and errors are associated and focused", "page carries exactly one h1", "a valid submission is accepted and announced" |
| **Scenario** | Submitting the demo form empty renders a message per invalid field, links each to its input, moves focus to the first, and announces it; a valid submission returns 201 and announces success. |
| **Proven to fail without the fix** | Pre-fix: `disabledOnLoad=true`, `visibleErrorsAfterClickingDisabledSubmit=0`, and every input reported `name:null, required:false, ariaInvalid:null`. Post-fix: 7 invalid fields each with `aria-describedby`, focus on `firstName`, and a 201 with a persisted lead. |
| **Fixed** | 2026-08-18, branch `agent/landing-uiux-remediation` |
| **Active** | yes |

### REG-060 — Public pages keep a bypass mechanism and readable muted text

| | |
|---|---|
| **Bug class** | `shared-token-accessibility-regression` |
| **Module** | `apps/landing` |
| **Bug record** | BUG-0064 |
| **Root cause** | Two failures in shared code rather than on one screen. There was no skip link, so a keyboard user traversed nine header stops before content on every route (WCAG 2.4.1, Level A). And `--muted-soft` was `#7b8791` — 3.67:1 on white, 3.34:1 on `--surface-muted` — below the 4.5:1 needed for normal text (WCAG 1.4.3, AA), while carrying the "(optional)" markers and consent copy, so the least readable text was the text carrying form semantics. |
| **Regression test** | `e2e/tests/flow-c-landing-public-surface.spec.ts` — "skip link is the first tab stop and moves focus into main"; contrast asserted by the axe sweep in the QA run |
| **Scenario** | The first Tab from page load focuses a visible skip link that moves focus into `main`; all normal-size text meets 4.5:1 against its actual background. |
| **Proven to fail without the fix** | Pre-fix: `tabsBeforeMain=10` with no skip element, and axe reported 21 `color-contrast` nodes across `/contact` and `/partners`. Post-fix: skip link present on 42/42 route-viewport combinations and zero serious or critical axe violations. |
| **Fixed** | 2026-08-18, branch `agent/landing-uiux-remediation` |
| **Active** | yes |

### REG-061 — Every branch of a public endpoint returns the same response shape

| | |
|---|---|
| **Bug class** | `doc-code-drift` |
| **Module** | `services/api/src/modules/billing`, `apps/landing` |
| **Bug record** | BUG-0065 |
| **Root cause** | `getPublicCommercialConfig()` has two return paths. The resolved-market path returned `featureCatalog`; the no-market fallback omitted the key entirely. Both were structurally valid objects, so nothing caught the divergence — it surfaced only as a `console.error` on six public routes, on exactly the path a freshly deployed environment takes before markets are published. |
| **Regression test** | `e2e/tests/flow-c-landing-public-surface.spec.ts` — "plans renders without console errors from the config contract". The handler also carries an explicit PublicCommercialConfig return type, so npm run check-types is a second guard. |
| **Scenario** | With no market published, `GET /api/public/commercial-config` returns `featureCatalog` as an array, and no landing route logs a `[commercial-config]` error. |
| **Proven to fail without the fix** | Pre-fix the response carried four keys and the landing logged "Expected featureCatalog to be an array" on six routes. Post-fix it carries five keys with a 12-entry catalogue, and deleting the key from either branch is now a compile error rather than a runtime log. |
| **Fixed** | 2026-08-18, branch `agent/landing-uiux-remediation` |
| **Active** | yes |

### REG-062 — An unavailable purchase path does not present an editable form

| | |
|---|---|
| **Bug class** | `dead-end-form` |
| **Module** | `apps/landing` |
| **Bug record** | BUG-0066 |
| **Root cause** | When checkout was unavailable `/subscribe` swapped its submit button for a "Contact sales" link but left six company-detail fields enabled, under a heading promising "continue to secure checkout". The unavailability *was* disclosed — on the other card, while the part inviting action said nothing — so anything typed was silently discarded on following the link. |
| **Regression test** | `e2e/tests/flow-c-landing-public-surface.spec.ts` — "subscribe never offers an editable form it cannot submit" |
| **Scenario** | With checkout unavailable, the company-details fieldset is disabled, the reason is stated beside it, and no field inside it is interactive; with checkout available, a submit control is present and enabled. |
| **Proven to fail without the fix** | Pre-fix the probe recorded `controls:8, submitInside:0, buttonsInside:0` with every field enabled. Post-fix the fieldset reports `disabled=true` with 6 of 6 controls matching `:disabled` and the notice visible. The test branches on availability, so it stays meaningful once a Stripe-verified price exists. |
| **Fixed** | 2026-08-18, branch `agent/landing-uiux-remediation` |
| **Active** | yes |

### REG-063 — The Prisma freshness check sees field drift, not only enums

| | |
|---|---|
| **Bug class** | `stale-generated-artifact` |
| **Module** | `scripts`, `services/api` |
| **Bug record** | BUG-0068 |
| **Root cause** | The guard compared declared enums against client exports and declared models against delegates. Neither carries field information, and `prisma.applicationRelease` resolves whether or not the model gained a column — so adding a scalar field, the most common schema change there is, was invisible to it. The model half also only ran when `DATABASE_URL` was set, because it constructed a client, so on a dev boot without a datasource only enums were checked. |
| **Regression test** | `scripts/check-prisma-client-fresh.mjs` — invoked by the prestart:dev, prestart:debug and precheck-types lifecycle hooks in services/api |
| **Scenario** | A field declared in schema.prisma but absent from the generated client fails the check and is named. A current client passes and reports how many enums, models and fields it compared. |
| **Proven to fail without the fix** | Before: an `ApplicationRelease.checksumSha512` missing from the client printed "OK — 267 enums reachable" and exited 0, while tsc reported 8 errors on that property. After: adding a schema-only field produces "Missing fields (1): ApplicationRelease.checksumSha999Probe" and exit 1; restoring the schema returns exit 0. |
| **Fixed** | 2026-08-18, branch `agent/prisma-freshness-fields` |
| **Active** | yes |

### REG-064 — Outbox deduplication does not abort the caller transaction

| | |
|---|---|
| **Bug class** | `mocked-proof-of-a-database-guarantee` |
| **Module** | `services/api` — `outbox` |
| **Bug record** | BUG-0070 |
| **Root cause** | Deduplication caught the unique-constraint violation and read the existing row back inside the same transaction. PostgreSQL aborts the whole transaction on any statement error and offers no statement-level rollback without an explicit SAVEPOINT, so the read could never run — and because `emit` is required to run inside the *caller's* transaction, the abort also rolled back the business change the event was announcing. The unit spec proved the behaviour against a Prisma double, which raised P2002 and then happily answered the follow-up read; no double can model a poisoned transaction. |
| **Regression test** | `services/api/test/outbox-delivery.e2e-spec.ts` — "collapses a repeated emission to one row, by unique index rather than by a pre-check" |
| **Scenario** | Emit the same `idempotencyKey` twice in two committed transactions against real PostgreSQL. The second returns `{ deduplicated: true }` with the first event's id, exactly one row exists, and the caller's transaction commits normally. |
| **Proven to fail without the fix** | Before: `DriverAdapterError: current transaction is aborted, commands ignored until end of transaction block` — 1 failed, 4 passed. After: 5 passed. |
| **Fixed** | 2026-08-18, branch `agent/commercial-platform-completion` |
| **Active** | yes |

### REG-065 — Repository health inspects the primary worktree, not only the one it runs in

| | |
|---|---|
| **Bug class** | `computed-then-discarded` |
| **Module** | `scripts` — `repo-health.mjs`, `session.mjs` |
| **Bug record** | BUG-0076 |
| **Root cause** | `repo-health.mjs` computed `worktree.dirty` for every worktree, used it only to protect a worktree from deletion, and dropped it from the report before anything could read it. The single dirty check that *was* reported ran with `cwd: ROOT` — the script's own checkout, which for an agent is its pristine task worktree — and was further gated on `currentBranch === TARGET`, where `TARGET` is `main`. The primary checkout sits on `develop`, so a dirty primary produced no output at all. Dirtiness was a warning in the one case it appeared, never a blocker. Separately, `session.mjs` resolves `ROOT` from its own location, so registering a session from the primary checkout wrote the record there and the task then worked elsewhere, stranding an untracked stub. |
| **Regression test** | `scripts/validate-framework.mjs` — behavioural simulations 37A–37G, 38 and 39, run against throwaway repositories with real worktrees attached |
| **Scenario** | An unexplained dirty file in the primary checkout yields `PRIMARY_WORKTREE_STATUS = DIRTY_UNEXPLAINED` and a blocker, while the task worktree is `CLEAN`. A path proven pre-existing by `--primary-baseline` yields `DIRTY_USER_OWNED` and does not block. An ACTIVE session's record is attributed to that session, never orphaned. A dirty sibling worktree is listed and left untouched. `repo-health.mjs` leaves branch, HEAD and working tree byte-identical either side of a run, including on a dirty tree. Registering a session for a branch this checkout does not have reports `PRIMARY_WORKTREE_ARTIFACT`. |
| **Proven to fail without the fix** | Mutation-tested seven ways: the `DIRTY_UNEXPLAINED` blocker deleted; `primaryWorktreeStatus()` pinned to `CLEAN`; the per-worktree porcelain lines collapsed back to a boolean; `UNKNOWN` ownership silently reclassed as `USER`; an ACTIVE session record misread as an orphan; sibling worktrees filtered out of the report; and `session.mjs`'s `strandedInPrimary` pinned to `false`. All seven are killed by at least one simulation. The seventh initially **survived**, because the check covering it grepped the source for an identifier rather than executing the behaviour — the same defect class as the bug — which is why simulation 39 drives `session.mjs` against a sandbox. |
| **Fixed** | 2026-08-19, branch `agent/repo-health-primary-worktree` |
| **Active** | yes |

### REG-066 — A tenant subject cannot satisfy a platform permission

| | |
|---|---|
| **Bug class** | `authorization-guard-fails-open` |
| **Module** | `services/api` — `platform-auth`, `super-admin`, `platform-communications` |
| **Bug record** | BUG-0071 |
| **Root cause** | `PlatformPermissionsGuard` opened with `if (!role) return true`, reading "no platform role" as "not a platform request". Every controller using it is a platform surface end to end, so that early exit meant unguarded, not harmless. `userHasPlatformPermission` then fell back to `user.permissionKeys`, which for a tenant subject are tenant keys — and six tenant key names collide exactly with platform permission names. A tenant user holding the ordinary `system-admin` tenant role reached every super-admin endpoint. The same line was inverted for unmapped routes: a genuine platform operator fell through to the throw and got 403 from `/operators`, `/feature-catalog` and `/lifecycle-options`. |
| **Regression test** | `services/api/src/modules/platform-auth/platform-permissions.spec.ts` — "refuses a tenant subject on a platform route", "refuses a tenant subject holding the colliding key %s", "admits a platform subject on the routes that used to 403 them" |
| **Scenario** | A subject with no `platform.id` is refused by the guard and by `userHasPlatformPermission`, whatever its `permissionKeys` contain — including the `platform.*` wildcard. A platform subject holding the route's permission still passes, and the four previously-unmapped routes now resolve a permission and admit a platform user. |
| **Proven to fail without the fix** | Before, live against a seeded local stack: a tenant `system-admin` received 200 from all 16 super-admin GET routes and 400 (not 403) from `PATCH /platform-settings` and `PATCH /platform-email`, while a platform SUPER_ADMIN received 403 from `/operators`, `/feature-catalog` and `/lifecycle-options`. After: the tenant subject receives 403 from every one, and the platform subject receives 200 from every one including the three that were broken. |
| **Fixed** | 2026-08-18, branch `agent/provisioning-ops-and-qa` |
| **Active** | yes |

### REG-067 — A mutating platform route is never satisfied by a read permission

| | |
|---|---|
| **Bug class** | `method-blind-permission-mapping` |
| **Module** | `services/api` — `platform-auth`, `super-admin` |
| **Bug record** | BUG-0072 |
| **Root cause** | `resolvePlatformPermission` matches path substrings, and it was extended domain by domain. The branches added through `actionFor` consider the HTTP method; the branches added as a bare `return '<domain>.read'` do not. Every method on `/super-admin/plans*` therefore resolved `plans.read`, which `READ_ONLY_AUDITOR` holds, so a role named for not writing could create, update and delete plans and plan prices. The `PlatformPermission` union also had no `plans.manage`, `invoices.manage`, `subscriptions.manage` or `payments.manage`, so there was no mutating permission to return. `actionFor` returned null for DELETE, leaving customer and onboarding deletes unmapped. |
| **Regression test** | `services/api/src/modules/platform-auth/platform-permissions.spec.ts` — "maps every route to a platform permission", "never satisfies a mutating route with a read permission", "refuses the read-only auditor on the plan catalog it could once rewrite" |
| **Scenario** | Each route is enumerated from the controller's own `PATH_METADATA` and `METHOD_METADATA` and resolved with its real verb. No route resolves null, and no route whose verb is not GET resolves a permission ending in `.read`. `READ_ONLY_AUDITOR` is refused `plans.manage` while `PLATFORM_ADMIN` still holds it. |
| **Proven to fail without the fix** | Before: the enumeration named four unmapped routes (`operators`, `lifecycle-options`, `feature-catalog`, `tenant-slug/availability`) and eight mutating routes resolving a `.read` permission, including `POST /plans`, `PATCH /plans/:planId`, `DELETE /plans/:planId/prices/:priceId` and `POST /billing/stripe-webhook-events/:id/retry`. After: both lists are empty; 30 passed. |
| **Fixed** | 2026-08-18, branch `agent/provisioning-ops-and-qa` |
| **Active** | yes |

### REG-068 — The admin surfaces carry no critical or serious accessibility violation

| | |
|---|---|
| **Bug class** | `unverified-convention` |
| **Module** | `apps/admin` |
| **Bug record** | BUG-0073, BUG-0074 |
| **Root cause** | AGENTS.md required labelled controls, keyboard-navigable tables and meaning that never rests on colour alone, and nothing checked any of it - the repository had no accessibility tooling, so every QA run recorded ACCESSIBILITY as unverified. Two defects followed. Small uppercase labels used `text-slate-400` on white (~2.8:1 against a 4.5:1 requirement) in the shared sidebar, the runtime view selector and the new provisioning queue. And the queue's `overflow-x-auto` container had no `tabIndex`, so its off-screen columns were reachable by pointer only - on the screen whose own hand-written keyboard test had passed on header scope and a caption. |
| **Regression test** | `e2e/tests/flow-e-accessibility-and-layout.spec.ts` - E3 audits the provisioning queue and the admin dashboard with axe and fails on any critical or serious violation; E4 independently asserts the page body does not scroll sideways, so the keyboard fix cannot be traded against the layout one. |
| **Scenario** | Sign in to Platform Admin, open each audited screen, run axe with the wcag2a/wcag2aa/wcag21a/wcag21aa rule sets, and filter to critical and serious impact. The list must be empty. Moderate and minor are reported rather than gated, deliberately - failing a first audit on its whole long tail produces a suite nobody can act on. |
| **Proven to fail without the fix** | Before: `SERIOUS color-contrast` on the sidebar labels and the queue's muted cells, `SERIOUS scrollable-region-focusable` on the queue container, and a further `SERIOUS color-contrast` on the dashboard's view selector - 2 of 5 signed-in scenarios failing. After: 5 passed, and the full browser suite 30 passed. |
| **Fixed** | 2026-08-19, branch `agent/provisioning-ops-and-qa` |
| **Active** | yes |

### REG-069 — Playwright installed system dependencies the runner already had

| | |
|---|---|
| **Bug class** | `unnecessary-external-dependency` |
| **Module** | `.github/workflows` — `browser-e2e`; `e2e`; `scripts/install-browser.mjs` |
| **Bug record** | BUG-0079 |
| **Root cause** | `playwright install --with-deps chromium` ran `apt-get update` and `apt-get install` on every run. On `ubuntu-latest` every library Chromium links against is already present — all 24 logged "already the newest version", `0 upgraded, 0 to remove` — and the only packages it newly installed were nine CJK/Cyrillic/Thai font packages that no assertion in `e2e/tests/` depends on, since the suite makes no screenshot comparison. So 97–99% of the step was apt work with no effect, its cost set entirely by Azure's Ubuntu mirror: 74s for 11.4 MB of package lists at 162 kB/s, then 229s for 21.1 MB at 93.8 kB/s, against 9.6s for the 301 MB browser download from `cdn.playwright.dev`. The tail reached 1555s and consumed the job's 30-minute cap. |
| **Regression test** | `scripts/install-browser.mjs` — the launch probe, which runs on every CI run rather than in a separate suite; `scripts/ci-metrics.mjs` carries the STEP_DURATION_REGRESSION trigger for the step growing again without anything failing. |
| **Scenario** | The install step downloads the browser, then launches it for real and closes it. A runner that already satisfies the browser does no apt work and reports `APT_DEPENDENCY_DURATION = 0s`. A runner missing a library fails the probe, runs `playwright install-deps` with a warning, and re-probes — so the outcome is a working browser either way and only the cost differs. `PLAYWRIGHT_COMMAND`, `APT_DEPENDENCY_DURATION`, `CHROMIUM_DOWNLOAD_DURATION`, `LAUNCH_PROBE_DURATION`, `TOTAL_BROWSER_INSTALL_DURATION`, `RUNNER_IMAGE` and `PLAYWRIGHT_VERSION` appear in the job summary. |
| **Proven to fail without the fix** | The probe is the only thing standing between a missing library and a browser journey failing for a reason that reads as a product defect — remove it and dropping `--with-deps` becomes an unverified assumption about the runner image. Removing the metrics restores the single opaque timer that made this defect take three attempts to diagnose: a job median cannot distinguish a slow download from a slow apt mirror, and 27s → 25m55s fired no job-level trigger at all. |
| **Fixed** | 2026-08-20, branch `agent/ci-e2e-remediation` |
| **Active** | yes |

### REG-070 — Database e2e suites asserted against tenants they did not create

| | |
|---|---|
| **Bug class** | `borrowed-fixture-dependency` |
| **Module** | `services/api/test` — `attendance-engine`, `attendance-integrations-http`, `gateway-runtime`, `legal-seed`, `platform-workflows`, `helpers/db-fixtures.ts` |
| **Bug record** | ITEM-0047 |
| **Root cause** | Three suites opened with `tenant.findMany({ where: { businessUnits: { some: {} } }, take: 2 })` and threw when it returned fewer than two. `seed:demo` creates exactly one tenant, so `beforeAll` threw on every CI run and **81 tests errored before a single assertion executed** — counted for weeks as 81 product failures. Two more suites had the same shape against different absent data: `legal-seed` asserted the output of `seed:legal`, and `platform-workflows` drove the invitation token `seed-horizon-onboarding` from `seed-platform-workflows.ts`; the database e2e job runs neither seed, so the legal table was empty and both public onboarding requests returned 404. Teardown compounded it — ids a failed `beforeAll` never assigned reached Prisma as `in: [undefined, undefined]`, which Prisma refuses, producing a second and louder failure on top of the first. |
| **Regression test** | `services/api/test/db-fixtures-contract.e2e-spec.ts`, against real PostgreSQL |
| **Scenario** | `createTenantPair()` returns two tenants with distinct ids and distinct customer accounts, each carrying an organization and a business unit whose `tenantId` matches. `cleanup()` removes tenants, customer accounts, organizations and business units — the cascade asserted, not assumed, because `BusinessUnit → Organization` is `Restrict`. `cleanup()` after partial construction resolves rather than throwing, and is safe to call twice. Two `DbFixtures` instances with the same label generate different names. |
| **Proven to fail without the fix** | Restore any suite's `take: 2` lookup and it fails in `beforeAll` against a freshly seeded database — the exact CI condition, reproduced locally at 7 suites / 148 failed. Remove the cascade assertions and a fixture that silently leaked organizations would pass. Remove the partial-construction case and the `undefined`-id teardown returns, since that is the state a failed setup leaves. |
| **Fixed** | 2026-08-20, branch `agent/ci-e2e-remediation` |
| **Active** | yes |

### REG-071 — The public-write rate-limit invariant cannot be satisfied by an import

| | |
|---|---|
| **Bug class** | `assertion-matches-mention` |
| **Module** | `services/api` — `common/guards`, `billing` |
| **Bug record** | BUG-0075 |
| **Root cause** | `hasControllerLevelGuard` tested `source.slice(0, controllerIndex).includes('PublicRateLimitGuard')` — every character before the class decorator, which spans the import block. A controller cannot apply a decorator it has not imported, so the import line alone satisfied the predicate, and every controller worth checking was classified as class-guarded. `PublicBillingController` imported the guard, applied it to one GET handler, and left `@Post('subscribe')` bare; the suite stayed green. This is the third recurrence of the BUG-0013 / BUG-0031 / BUG-0033 family and the second on this exact handler — the check ITEM-0013 built to stop it was structurally unable to see it. |
| **Regression test** | `services/api/src/common/guards/public-write-rate-limit.invariant.spec.ts` — "public-billing.controller.ts rate limits every public write" — and `services/api/test/public-rate-limit.e2e-spec.ts`, added 2026-08-22, which exercises the guard over real HTTP because the invariant reads sources and a declared-but-broken guard passes it completely |
| **Scenario** | Remove `@UseGuards(PublicRateLimitGuard)` from above `@Controller('public')` in `public-billing.controller.ts`, leaving the import in place. The invariant must fail and name the unguarded handler. |
| **Proven to fail without the fix** | Old predicate, unguarded controller: 13 passed — the defect was live and invisible. Corrected predicate, guard removed: 1 failed, 12 passed, diff naming `"createSubscriptionCheckout("`. Corrected predicate, guard restored: 13 passed. The corrected predicate swept all 106 controllers and found exactly one offender. |
| **Fixed** | 2026-08-19, branch `agent/self-service-onboarding-provisioning` |
| **Active** | yes |

### REG-072 — An unpaid public subscribe creates no tenant

| | |
|---|---|
| **Bug class** | `additive-migration-never-finished` |
| **Module** | `services/api` — `billing` |
| **Bug record** | BUG-0077 |
| **Root cause** | WP-05 introduced `openOrder` to replace a block that created a Lead, a CustomerAccount, a Tenant and an INCOMPLETE Subscription on every submission, and deferred deleting that block to WP-07. WP-07 shipped the post-payment automation and left the deletion; both paths then ran on every request, producing two CustomerAccounts per buyer, a Tenant that consumed a workspace slug before anyone paid, and `industry: 'Unknown'` written 200 lines from a function that explicitly refuses to fabricate it. No test asserted the absence of a tenant after an unpaid submission, so the package closed green. |
| **Regression test** | `services/api/test/payment-authorised-provisioning.e2e-spec.ts` — four cases: no tenant/subscription/lead, exactly one customer with no fabricated columns, order awaiting payment with no tenant attached, Stripe keyed to the order's own customer |
| **Scenario** | Call `createPublicSubscriptionCheckout` against real PostgreSQL with a Stripe double and never pay. Count `Tenant`, `Lead` and `Subscription` globally — not scoped to the buyer, because the defect created them under a *second* customer account and a scoped count would miss exactly the rows that matter. |
| **Proven to fail without the fix** | `git stash` of the source change, same database: 4 failed. `Expected: 0  Received: 1` tenants; two CustomerAccounts, one carrying `{"companySize": "Unknown", "industry": "Unknown"}`; `order.tenantId` non-null before payment; the order's customer holding `stripeCustomerId: null` because Stripe was keyed to the other account. Restored: 4 passed. |
| **Fixed** | 2026-08-19, branch `agent/self-service-onboarding-provisioning` |
| **Active** | yes |

### REG-073 — Every emitted domain event has a consumer

| | |
|---|---|
| **Bug class** | `declared-but-unwired-step` |
| **Module** | `services/api` — `outbox`, `super-admin` |
| **Bug record** | BUG-0078 |
| **Root cause** | `PROVISIONING_REQUESTED` was emitted by `openOnboarding` from the day WP-07 landed and nothing subscribed to it, so automatic provisioning never ran once. Nothing failed: the dispatcher treats an event with no registered consumer as a *settled delivery*, which is correct for a generic dispatcher and exactly why the gap is invisible from inside it. The outbox reported every event PROCESSED while the platform's headline feature was inert, and BUG-0077's pre-payment tenant meant a workspace existed anyway. |
| **Regression test** | `services/api/src/modules/outbox/emitted-events-have-consumers.invariant.spec.ts` — "leaves no emitted event unhandled" |
| **Scenario** | Empty the `handles` array on `ProvisioningRequestedHandler`. The invariant must fail and name the now-unhandled event. Subscriptions declared through a notification catalog rather than a literal array must still count as handled, or the check reports events as unhandled *because* they are handled. |
| **Proven to fail without the fix** | With `handles = []`: 1 failed, 5 passed, diff naming `"PROVISIONING_REQUESTED"`. Restored: 6 passed. The check's first run also found 18 unhandled events; 12 were consumed via `platform-lifecycle-notifications.catalog.ts` through a `.map()` the scan could not see, which is why catalog files are read as subscription registries. Of the remaining six, four are allowlisted with reasons and two became ITEM-0061. |
| **Fixed** | 2026-08-19, branch `agent/self-service-onboarding-provisioning` |
| **Active** | yes |

### REG-074 — Checkout cannot open until the owner email is verified

| | |
|---|---|
| **Bug class** | `gate-with-a-way-around-it` |
| **Module** | `services/api` — `billing` |
| **Bug record** | ITEM-0063 |
| **Root cause** | Not a defect being fixed; a rule being enforced. `paidAt` must imply `ownerEmailVerifiedAt`, because a card proves somebody can pay and proves nothing about whether they typed their own address — and the owner email is the one credential that cannot be corrected from inside a workspace nobody can sign into. The failure mode this guards is the obvious implementation: adding a verified route beside the existing one, leaving the unverified route as the one everybody keeps using. |
| **Regression test** | `services/api/test/payment-authorised-provisioning.e2e-spec.ts` — "refuses to open checkout until the owner email is verified", plus 7 more in the same block |
| **Scenario** | Submit a subscribe request and assert **no Stripe checkout session is created** — not merely that a warning is returned. Then read the six-digit code out of the mail double, verify it, resubmit, and assert the session now exists and the code hash is cleared. Separately: a wrong code spends one attempt of five, five wrong guesses burn the code so the *correct* one is refused, a resend inside 60s is throttled, and re-verifying an already-verified order succeeds rather than failing. |
| **Proven to fix** | Neutering the gate to `if (false && !verifiedOrder?.ownerEmailVerifiedAt)` fails 7 of the 12 cases in the suite. The load-bearing assertion is `stripe.created.sessions` being unchanged: a gate that returns a warning while still handing back a checkout URL is not a gate, and only counting provider calls catches that. |
| **Fixed** | 2026-08-19, branch `agent/self-service-onboarding-provisioning` |
| **Active** | yes |

### REG-075 — A flat price is never described as per-employee

| | |
|---|---|
| **Bug class** | `copy-contradicts-configuration` |
| **Module** | `apps/landing`, `services/api` — `legal` |
| **Bug record** | BUG-0080 |
| **Root cause** | Every seeded price is `BillingModel.FLAT`, while the Terms draft, the Subscription and Billing Terms draft, the features page, the plans page metadata, the plans hero and the cost estimator all told the customer that "pricing is per active employee". The arithmetic was never wrong — `estimateCost` and `calculateSeatPricing` both refuse to multiply a flat price, with comments saying so — but every word around the number claimed a model the configuration did not use. `billingUnitLabel` compounded it by returning null for a flat price, so the figure rendered with no unit at all beside copy insisting it was per person. |
| **Regression test** | `apps/landing/lib/plan-presentation.spec.ts` — "names only the period when the price is flat" and "names active employees when the price is per seat" |
| **Scenario** | Render a FLAT offer and assert the unit label is `per month` / `per year`, never mentioning employees. Render a PER_SEAT offer and assert it does. The two must not be able to collapse into one answer, because the product sells both: public plans are flat, and negotiated per-seat prices remain available per `PlanPrice.billingModel`. |
| **Proven to fix** | Before: `billingUnitLabel(FLAT)` returned `null`, and the pricing page rendered "$199" with no unit under a heading reading "You pay per active employee". After: `per month`, and every page says flat. The direction of the old error is worth recording — it overstated the price to a reader doing the multiplication themselves, so a 500-person company read $99,500/month and left. |
| **Fixed** | 2026-08-20, branch `agent/self-service-onboarding-provisioning` |
| **Active** | yes |

### REG-076 — A named invariant test that did not exist

| | |
|---|---|
| **Bug class** | `assertion-without-a-check` |
| **Module** | `apps/landing`, `apps/web`, `apps/admin` |
| **Bug record** | BUG-0081 |
| **Root cause** | `lib/forwarded-headers.ts` in all three apps carried the sentence "`forwarded-headers.invariant.test.ts` fails the build if a handler forgets — the guarantee is mechanical rather than a convention". No such file existed in the repository. The rule it described — every route handler that fetches the API directly must spread `forwardedClientHeaders(request)`, or the API attributes every visitor to the app's egress IP and `PublicRateLimitGuard` becomes global — was held by memory alone, and the comment told each reviewer not to check. |
| **Regression test** | `apps/landing/lib/forwarded-headers.invariant.spec.ts`, and the `apps/web` / `apps/admin` counterparts |
| **Scenario** | Walk each app's `app/api` tree, select every `route.ts` naming `getApiBaseUrl` and calling `fetch(`, assert a minimum count is found, then assert each spreads `forwardedClientHeaders(request)`. Deleting the spread from any one handler must fail that app's run and name the file. |
| **Proven to fix** | Removing `...forwardedClientHeaders(request)` from `apps/landing/app/api/leads/route.ts` takes the landing run from 10 passed to 1 failed / 9 passed. The handler was restored and `git diff` confirmed clean. |
| **Note** | The minimum-count assertion is the point, not padding. The convention was *intact* when this was written — all 24 handlers forwarded correctly — so a check that silently found nothing would have passed identically and stayed inert forever. This register already carries that shape once, in the checks that asserted a file merely *mentioned* a behaviour. |
| **Fixed** | 2026-08-20, branch `agent/self-service-onboarding-provisioning` |
| **Active** | yes |

### REG-077 — The onboarding wizard collected data it could not submit

| | |
|---|---|
| **Bug class** | `editable-form-that-cannot-submit` |
| **Module** | `apps/landing` |
| **Bug record** | BUG-0082 |
| **Root cause** | WP-11 replaced the single-page subscribe form with a five-step wizard. BUG-0066's guard was structural — a disabled `<fieldset>` and an id on the explanatory notice — so it did not survive a rewrite that kept the fields and replaced everything around them. Underneath: "can this be bought" was answered by three separate inline conditions in one component, one per notice and one for submit, and none for `Continue`. The rule nobody wrote down is the one that broke. |
| **Regression test** | `apps/landing/lib/plans.spec.ts` — "names a reason for a price that exists but cannot be charged" and "keeps the two reasons distinguishable"; `e2e/tests/flow-c-landing-public-surface.spec.ts` — "subscribe never offers an editable form it cannot submit" |
| **Scenario** | With a price that resolves but is not checkout-ready, and again with no price at all, assert a reason is produced, that the two reasons stay distinguishable, and that the answer agrees with `isCheckoutReady` in both directions. In the browser, assert `Continue` is disabled — not only submit. |
| **Proven to fix** | Making `checkoutBlockedReason` return null for a null price fails two unit tests. The browser assertion is the one that matters most: the old version keyed off "no submit button on the page", which in a wizard means "the visitor is on step one", so it could not see this defect at all — submit is not rendered until the typing is already done. |
| **Note** | A repeat, which is why it is HIGH rather than MEDIUM. The same defect was found, recorded, fixed and regression-tested as BUG-0066, then reintroduced by the next change to the same screen. The lesson is that a structural guard — a wrapper element, an id — does not survive a rewrite. A named function does. |
| **Fixed** | 2026-08-20, branch `agent/self-service-onboarding-provisioning` |
| **Active** | yes |

### REG-078 — The Database Agent's verdict cannot report PASS over a failing field

| | |
|---|---|
| **Bug class** | `stale-generated-artifact` |
| **Module** | `scripts`, `.agent` |
| **Bug record** | BUG-0083 |
| **Root cause** | `db-preflight.mjs` computed `PASS` as the default for every status not explicitly enumerated as blocking. `PENDING_MIGRATIONS` and `DATABASE_MISMATCH` were not enumerated, and neither was `UNKNOWN` — so "the database is 213 migrations behind" and "nobody could look" both arrived at the passing branch. The checks themselves were correct throughout; only the mapping from status to verdict was wrong, which is why the tool printed the two failing fields and `PASS` in the same output. |
| **Regression test** | `scripts/db-preflight.test.mjs` (`npm run test:db-preflight`) — nine cases over the exported verdict function |
| **Scenario** | Four agreeing links are the only route to `PASS`. `PENDING_MIGRATIONS`, `DATABASE_MISMATCH`, `UNREACHABLE`, `MIGRATION_DRIFT` and `CLIENT_MISMATCH` each produce `BLOCKED`. Any `UNKNOWN` produces `INCOMPLETE`, never `PASS`, and `INCOMPLETE` stays distinct from `BLOCKED` because the next action differs. A known failure outranks an unresolved one, and the unresolved fields are still reported rather than discarded. |
| **Proven to fix** | Removing `PENDING_MIGRATIONS` and `DATABASE_MISMATCH` from the blocking list fails three of the nine tests. End to end against a throwaway database with 213 unapplied migrations: the old script reports `PASS` and exits `0`, the new one reports `BLOCKED` and exits `1`. |
| **Note** | The third arrival of the class behind BUG-0060 and BUG-0068. Both earlier fixes guarded the *developer* — `check-prisma-client-fresh.mjs` on `prestart:dev` — so the human kept discovering what the task should have caught. `DATABASE_COHERENCE_STATUS` and `npm run db:postflight` make it an agent-facing gate: the invariant is now checked after the work that breaks it, against the primary checkout rather than the agent's own worktree. |
| **Fixed** | 2026-08-20, branch `agent/db-coherence-postflight` |
| **Active** | yes |

### REG-079 — A deploy reset the platform super admin's password

| | |
|---|---|
| **Bug class** | `bootstrap-script-wired-into-a-recurring-step` |
| **Module** | `services/api/prisma/seed-admin.ts`, `render.yaml` |
| **Bug record** | BUG-0085 |
| **Root cause** | `seed:admin` was written as a one-time bootstrap and then wired into `npm run release`, which `render.yaml` sets as `preDeployCommand` — so it ran on every deploy. Its upsert wrote `passwordHash` in the `update` branch, so every deploy reset the super admin's credential to the dashboard value. The variable it required was never declared in `render.yaml`, so the only alternative was a first deploy that aborted in `preDeployCommand`, before `seed:legal` and `legal:publish`. Two wrong configurations and no third one. |
| **Regression test** | `services/api/src/common/utils/admin-seed.util.spec.ts` |
| **Scenario** | A redeploy with a different `PLATFORM_SUPER_ADMIN_PASSWORD` must leave the stored hash untouched; a redeploy with no variables at all must succeed when an active super admin exists and fail loudly when none does; only `PLATFORM_SUPER_ADMIN_PASSWORD_RESET=true` may change an existing admin's password, role or status. |
| **Proven to fix** | The reset case is asserted **as a pair** with the non-reset case, so a decision that ignored the flag and reset unconditionally — the original behaviour — fails the test. End to end against a real database: before the fix, two `seed:admin` runs with different passwords produced two different bcrypt hashes; after it, the second run reports `SKIP` and the hash is unchanged, while `_PASSWORD_RESET=true` changes it. |
| **Note** | CI never caught this because `.github/workflows/ci.yml` sets both variables against a fresh database, exercising only the create path. The defect lived entirely in the paths CI could not reach. It was found by running the actual `preDeployCommand` against a database built from all 216 migrations — something no test does. |
| **Fixed** | 2026-08-20, branch `agent/go-live-readiness` |
| **Active** | yes |

### REG-080 — Two billing models on one plan, and the public gets the right one

| | |
|---|---|
| **Bug class** | `select-then-check` |
| **Module** | `services/api/src/modules/billing`, `apps/landing/lib` |
| **Bug record** | BUG-0080 (superseded by EXECPLAN-0002) |
| **Root cause** | A plan now carries a PER_SEAT price for the public and a SALES_ASSISTED FLAT price for operators, active at once. `resolveCommercialOffer` filtered candidates by plan, market, currency and interval — not by sales model — then let `selectEffectivePrice` pick the most recently effective one, and only then refused if that one was sales-assisted. Both rows are seeded in the same run, milliseconds apart, so which model a visitor was offered came down to insertion order; when the flat row won, the plan vanished from public sale with `SALES_ASSISTED_ONLY` and nothing in the data explained why. Separately, `estimateCost` on the landing page ignored `minimumSeats` while the server billed `max(quantity, minimumSeats)`, so a six-person company would have been quoted six seats and charged for ten. |
| **Regression test** | `services/api/src/modules/billing/commercial-offer.resolver.spec.ts` ("two billing models on one plan"), `apps/landing/lib/plan-presentation.spec.ts`, `services/api/src/modules/super-admin/pricing.catalog.spec.ts` |
| **Scenario** | With both models present: a SELF_SERVICE resolution returns the per-seat price whichever row was written first; an OPERATOR can request either model explicitly; a plan with only a flat price reports `SALES_ASSISTED_ONLY` rather than "no published price"; a CUSTOM_ONLY plan refuses self-service even with a permissive price row; and the landing estimate bills the same seat count the server does. |
| **Proven to fail without the fix** | Removing the channel narrowing — restoring select-then-check — fails 4 tests, including both orderings of the determinism case. The ordering case is asserted over BOTH orderings deliberately: a single-ordering test would have passed against the defect half the time, which is worse than not having it. |
| **Note** | The arithmetic guard is separate and deliberately not a restatement of the price list: `pricing.catalog.spec.ts` asserts that annual is monthly x 10 and that a minimum charge is `minimumSeats x unitAmount`, then checks those against the minimum-charge table the owner published independently. A test that retyped the seat rates would prove only that somebody copied them twice. |
| **Fixed** | 2026-08-20, branch `agent/go-live-readiness` |
| **Active** | yes |

### REG-173 — An npm override that npm silently ignores

| | |
|---|---|
| **Bug class** | `declared-but-unwired-step` |
| **Module** | `package.json`, `package-lock.json`, `apps/admin` |
| **Bug record** | BUG-0163 |
| **Root cause** | `apps/admin` pinned the thirteen `@tiptap` packages at exactly `3.29.2`, while tiptap declares its own transitive extensions with carets — `@tiptap/react` needs `extension-floating-menu@^3.29.2`, and `starter-kit` nests caret-ranged copies of a dozen more. On a fresh resolve those float to the newest 3.x and demand a matching `@tiptap/core`, which an exact pin cannot satisfy, so `npm install` from no lockfile failed with `ERESOLVE`. The committed lockfile predated the conflict, so `npm ci` succeeded and nobody noticed. The consequence was that npm reused the existing tree and **ignored every `overrides` entry in silence** — `npm pkg get overrides` returned the key, `npm install` reported "up to date", and the resolved version never moved. |
| **Regression test** | `scripts/check-overrides-applied.mjs` |
| **Scenario** | For every `overrides` entry in the root manifest, every resolved instance of that package in `package-lock.json` must satisfy the demanded range. An override naming a package absent from the graph fails too, since it is either a typo or a stale entry. |
| **Proven to fail without the fix** | Setting `overrides["node-gyp"]` to `^99.0.0` — a version that cannot resolve — makes the check report `IGNORED  node-gyp  resolved 11.5.0, override demands ^99.0.0` and exit 1. Restoring it returns exit 0. Both directions were run. |
| **Note** | The obvious check does **not** work and was tried first: npm 11 writes no `overrides` key at `packages[""]` in the lockfile even when the overrides are applied and effective, so its absence proves nothing. The outcome — resolved versions — is the only observable that distinguishes an applied override from an ignored one. Range matching is limited to the `^`, `~` and exact forms this repository uses; anything else reports `UNCHECKED` rather than being guessed at. |
| **Why it mattered** | The ignored override was the fix for the repository's only **critical** advisory: `tar` reachable through the desktop agent. A security fix that silently does not happen is worse than one that fails loudly. |
| **Fixed** | Not yet — BUG-0163 is open pending an owner decision. The guard was added while investigating it and is active on its own: it fails the moment a declared override stops being applied, whatever the cause. |
| **Active** | yes |

### REG-174 — A form field the schema says is writable and the API refuses

| | |
|---|---|
| **Bug class** | `assertion-without-a-check` |
| **Module** | `apps/admin/lib/runtime`, `services/api/src/modules/platform-runtime`, `services/api/src/modules/super-admin` |
| **Bug record** | BUG-0220 |
| **Root cause** | The platform runtime completes a record form from the generated Prisma manifest, which reports every plain writable column as `editable`. The API validates the resulting PATCH against a DTO with `forbidNonWhitelisted: true`, which rejects on the presence of an unknown key. For `plans` the two disagreed on eight columns — `isPublic`, `publicationStatus`, `salesModel`, `publishedAt`, `publishedById`, `archivedAt`, `legacyPricingMigratedAt`, `tenantId` — so every save from the standard plan screen returned 400. Nothing surfaced it: `POST /platform-runtime/plans/validate` returned `{ success: true }` because no DTO was mapped for plans, so the form's own validation step passed and the request failed at the write. |
| **Regression test** | `apps/admin/lib/runtime/plan-record-form.spec.ts` |
| **Scenario** | Parse `update-plan.dto.ts`, collect its declared properties, and assert that every plan form field left writable is one of them; assert separately that the publication columns are present, read-only, and carry an explanation. |
| **Proven to fail without the fix** | Restoring `isPublic` to a writable field fails 2 of 6 assertions — the contract check and the read-only check. The spec also asserts it actually read the DTO (`export class UpdatePlanDto`, and two known properties), so it cannot pass against an empty parse. |
| **Note** | The assertion is written against the DTO source rather than a list repeated in the spec. A copied list would agree with itself forever; this one fails when either side moves, which is the only useful direction. |
| **Fixed** | 2026-08-21, branch `agent/admin-record-status-header` |
| **Active** | yes |

### REG-175 — A record command bar the API cannot serve, and one it can

| | |
|---|---|
| **Bug class** | `ui-permission-backend-mismatch` |
| **Module** | `apps/admin/lib/runtime`, `services/api/src/modules/platform-runtime` |
| **Bug record** | BUG-0220 (found in the same pass) |
| **Root cause** | Every module's command bar was written by hand, so what a record page offered depended on which defaults that module happened to spell out. Seven modules' record pages carried a single Back button — no Refresh, no way to reach a sibling record — while `contract-templates` offered a Save the runtime API has no `update` branch for. No module offered Refresh at record scope at all, because `STANDARD_RECORD_ACTIONS` never contained one. |
| **Regression test** | `apps/admin/lib/runtime/platform-module-capabilities.spec.ts` |
| **Scenario** | Re-derive the `create`, `update` and `remove` module sets from the `switch (key)` statements in `platform-runtime.service.ts` and require the registry's `capabilities` map to equal them; require Back and Refresh on every module's record scope; require the standard commands to appear in one fixed order everywhere; require that no module without `update` offers Edit and none without `delete` offers Delete. |
| **Proven to fail without the fix** | Deleting the `case 'plans':` branch from `PlatformRuntimeService.update` fails the update-set assertion. The spec asserts first that it found the service source and all three switch statements, so a regex that matched nothing would fail loudly rather than agree with an empty set. |
| **Note** | Deliberately textual. Observing the same mapping through the Nest container needs fifteen injected services mocked, which tests the mocks. The trade is stated in the spec's own comment so the next reader does not "improve" it into something that proves less. |
| **Fixed** | 2026-08-21, branch `agent/admin-record-status-header` |
| **Active** | yes |

### REG-176 — A form field that renders on no tab

| | |
|---|---|
| **Bug class** | `assertion-without-a-check` |
| **Module** | `apps/admin/lib/runtime`, `apps/admin/app/_components/runtime` |
| **Bug record** | BUG-0221, BUG-0222 |
| **Root cause** | `completeFormsFromSchema` pinned its generated section to the tab key `details`, which exists only in the default tab set — so on any module declaring its own tabs the fields were added, satisfied the registry's schema-coverage rule, and rendered nowhere (`tenants.environmentGroupId`, `customer-onboarding.agreedSeats`). The mirror image applied to related records: the plans module declared two relationship panels with no `tab`, and the record page draws a relationship only when its tab is active, so the Subscriptions and Customers panels never appeared. The coverage rule asked whether a field was *present* on a form, never whether the form could show it. |
| **Regression test** | `apps/admin/lib/runtime/plan-record-form.spec.ts`, backed by the unreachableFormPlacements load-time invariant in `apps/admin/lib/runtime/platform-module-registry.ts` — it throws at import, so every admin spec and the app boot fail together |
| **Scenario** | For every record form that declares tabs: no section may name a tab the form does not declare, no field may sit in a section that is itself unreachable, and every related-record panel must name a declared tab. |
| **Proven to fail without the fix** | Removing the `entitlements` tab from `planForms()` while leaving its panel in place makes the registry throw at import, naming the section. Reverting `additional-details` to the hardcoded `details` tab reproduces the two original orphans and fails the same way. |
| **Note** | This is the second time in this repository a validation has passed by asserting presence rather than reachability. The fix is not the placement change — that is a one-liner — it is that the load-time check now refuses the shape, so the schema-coverage rule can no longer be satisfied vacuously. |
| **Fixed** | 2026-08-21, branch `agent/admin-record-status-header` |
| **Active** | yes |

### REG-177 — A customer record that does not say what the customer bought

| | |
|---|---|
| **Bug class** | `divergent-duplicate-guard` |
| **Module** | `services/api/src/modules/billing`, `services/api/src/modules/super-admin`, `apps/admin` |
| **Bug record** | BUG-0280 |
| **Root cause** | Two paths create a `CustomerAccount`. `PlatformLifecycleService.convertLeadToCustomer` writes twenty-two columns; `SubscriptionOrderService.resolveCustomer` wrote eleven, and the eleven excluded every commercial column the Customers module reports on — `selectedPlanId`, `preferredBillingCycle`, `originChannel`. `resolveCustomer` had been written to answer identity, and the commercial selection was never passed into it even though `openOrder` held `planPrice` two lines away. Grepping for `selectedPlanId` in `modules/billing` looks like coverage and is not: the single hit is on `CustomerOnboarding`, a different row, written after payment. |
| **Regression test** | `services/api/src/modules/billing/services/checkout-customer-record.spec.ts` |
| **Scenario** | A new self-service customer carries plan, billing cycle and origin channel alongside the identity and organization the wizard collected; a returning customer's empty commercial columns are filled; a returning customer's **populated** ones are never overwritten by a later, possibly abandoned, order. |
| **Proven to fail without the fix** | Removing `selectedPlanId` from the create payload fails 1 of 4. The no-overwrite case is asserted separately from the gap-fill case deliberately — a single test that only checked "the columns end up set" would pass against an implementation that rewrites a paying customer's plan from an abandoned checkout. |
| **Note** | The private `resolveCustomer` is reached through a cast rather than made public. Widening a method's visibility to test it changes the class to suit the test; driving the whole of `openOrder` instead would need tax, promotion and slug collaborators to assert one `create` payload. |
| **Fixed** | 2026-08-21, branch `agent/checkout-account-and-payment-confirmation` |
| **Active** | yes |

### REG-178 — A generated manifest that agreed with everything except the schema

| | |
|---|---|
| **Bug class** | `stale-generated-artifact` |
| **Module** | `packages/config`, `apps/admin/lib/runtime`, `scripts` |
| **Bug record** | BUG-0282 |
| **Root cause** | `platform-runtime-schema.generated.json` is derived from `schema.prisma` and decides which columns Platform Admin can render. It had fallen behind, and the check that looks like it would catch that — `test:runtime-schema` — validates the **registry against the manifest**, so a stale manifest and a registry built from it agree and the job passes. The registry's own `schemaCoverageModules` rule iterates the manifest too, so a column missing from the manifest is missing from the coverage check as well. Five real scalar columns (`CustomerAccount.originChannel`, `Partner.partnershipModel`, `Tenant.readinessStatus`, `Tenant.dataRegion`, `Subscription.scheduledSeats`) existed in the database and could not be displayed, filtered or edited anywhere. |
| **Regression test** | `scripts/generate-platform-runtime-schema.mjs` (`npm run check:runtime-schema`), wired into `.github/workflows/ci.yml` ahead of the contract test |
| **Scenario** | Regenerate the manifest from `schema.prisma` in memory and compare it to the committed file, module by module and field by field; fail naming what changed. |
| **Proven to fail without the fix** | Restoring the previous manifest reports `customers: missing field originChannel`, `partners: missing field partnershipModel` and ten more, and exits 1. Restoring the regenerated one exits 0. Both directions were run. |
| **Note** | `--check` lives inside the generator rather than in a second script, so there is exactly one implementation of the derivation. A separate comparator would be a second copy able to drift on its own — which is the defect this guards against, reintroduced as the guard. Comparison is over parsed JSON, so key order and a trailing newline are never reported as drift. |
| **Why it mattered** | This is the second entry in this register whose root cause is an assertion that proves presence rather than reachability — see REG-176. Both passed for the same reason: the thing defining "everything" was the thing that was wrong. |
| **Fixed** | 2026-08-21, branch `agent/checkout-account-and-payment-confirmation` |
| **Active** | yes |

### REG-179 — A workspace link that resolves, from one rule instead of two

| | |
|---|---|
| **Bug class** | `divergent-duplicate-guard` |
| **Module** | `packages/config`, `apps/admin/lib`, `services/api/src/modules/tenant-domains` |
| **Bug record** | BUG-0312, BUG-0313 |
| **Root cause** | `packages/config/platform-domains.js` says in its own comment that `buildWorkspaceUrl` is the only place the workspace-URL rule may live, and `apps/admin/lib/tenant-url.ts` was a second copy of it. They had diverged on the variable they key on — `TENANT_BASE_DOMAIN` versus `NEXT_PUBLIC_TENANT_ROOT_DOMAIN`, the same concept under a name the other side does not read — so with this repository's own configuration admin produced `localhost:3001/login?tenant=<slug>` while the API produced a subdomain link for the same workspace. Separately the shared rule emitted no port: `<slug>.localhost` resolves, so configuring a local tenant base domain takes the hostname branch and produced port 80, where nothing listens. Every generated workspace link was dead in development and it presented as DNS. Underneath both, no `TENANT_BASE_DOMAIN` was configured at all, so `createSystemDomain` threw and provisioning completed without issuing a hostname, silently. |
| **Regression test** | `packages/config/platform-domains.test.js`, `apps/admin/lib/tenant-url.spec.ts` |
| **Scenario** | A development workspace URL carries the port the web app listens on; a production **and** a staging URL never have a port grafted on; a web origin with no explicit port yields none; admin and the API produce the same URL for the same workspace; an unconfigured tenant base domain still yields a reachable slug-parameter link rather than an error. |
| **Proven to fail without the fix** | Reverting the port branch fails exactly one test, and the admin spec fails two. The no-port rule is asserted over both non-development stages deliberately — a rule that only holds for one of the two values it excludes is one that will be got wrong later. |
| **Note** | The boot-time warning added for BUG-0312 is a log line, not a test. That is stated on the record rather than counted as coverage: nothing asserts it, and pretending otherwise is how a check that does not exist gets believed in. |
| **Fixed** | 2026-08-21, branch `agent/admin-landing-ux-program` |
| **Active** | yes |

### REG-180 — An indicator that could not be wrong, and a preference that did nothing

| | |
|---|---|
| **Bug class** | `assertion-without-a-check` |
| **Module** | `apps/admin`, `services/api/src/modules/platform-events`, `services/api/src/modules/platform-users` |
| **Bug record** | BUG-0314, BUG-0315 |
| **Root cause** | The notifications page was a placeholder showing the operator their own email address, under a topbar bell carrying a hardcoded red dot — markup with no state behind it, permanently lit. An indicator that is always on carries no information and actively teaches the person looking at it that indicators in this console can be ignored, so the day a provisioning failure needs attention the channel for saying so has already been discredited. Alongside it, workspace preferences were written to `localStorage` and read by nothing: choosing Compact changed a JSON blob and no pixel. |
| **Regression test** | `services/api/src/modules/platform-events/platform-notifications.spec.ts` |
| **Scenario** | A failed provisioning run, billing operation or webhook becomes a critical notification carrying what to do; routine audit traffic — sign-ins, saved views, exports — becomes nothing; a successful webhook is silent; unread is derived from the reader's last-read timestamp, with "never opened" meaning everything is unread; a subscription order links to the customer that owns it rather than to a record page that does not exist. |
| **Proven to fail without the fix** | The exclusion assertions fail against any rule set that notifies on success or on unmatched codes, which is what a naive "show recent events" feed would do. |
| **Note** | Most of this spec asserts what is **absent**. That is deliberate and is the harder half: a feed that shows everything passes any test written about what it includes, and fails the only thing the feature is for. |
| **Fixed** | 2026-08-21, branch `agent/admin-landing-ux-program` |
| **Active** | yes |

### REG-181 — One string type, fifteen kinds of field

| | |
|---|---|
| **Bug class** | `stale-generated-artifact` |
| **Module** | `scripts`, `packages/config`, `apps/admin/lib/runtime`, `apps/landing` |
| **Bug record** | BUG-0316, BUG-0317 |
| **Root cause** | The runtime manifest derived a field's control from its Prisma type alone. Prisma has one string type, so every email, phone number and URL in the schema became a plain text box — no mobile keyboard, no browser validation, a Stripe invoice URL rendered as an uneditable-looking string. Country was worse: free text on the subscribe wizard and `text` on four admin modules, while the API held a 250-row ISO `Country` table **and** `apps/admin` and `apps/landing` each carried a separate hardcoded list. Four answers to "which countries exist", and the one users typed into was none of them. |
| **Regression test** | `scripts/generate-platform-runtime-schema.mjs` (`npm run check:runtime-schema`), wired into the CI gate |
| **Scenario** | Regenerating the manifest from `schema.prisma` reproduces the committed file exactly, including the inferred control for every email, phone, URL and money column. A column whose control changes without the manifest being regenerated fails CI naming the module and the field. |
| **Proven to fail without the fix** | Reverting the inference reports 39 changed fields across six modules and exits 1. |
| **Note** | The inference is deliberately narrow — anchored suffixes over the whole column name, not substrings. `emailStatus` is a status and `taxRatePercent` is a rate, and a looser rule catches both. The country lookup is served from one public, rate-limited projection precisely so a fifth copy of the list has nowhere to appear. |
| **Fixed** | 2026-08-21, branch `agent/admin-landing-ux-program` |
| **Active** | yes |

### REG-182 — A control that stays a control, and a label that fits

| | |
|---|---|
| **Bug class** | `silent-degradation` |
| **Module** | `apps/landing` |
| **Bug record** | BUG-0350, BUG-0351 |
| **Root cause** | Two regressions in the fix for the previous two defects on the same form. The country lookup fell back to a **free-text input** whenever `/public/geography/countries` could not be read — an API process that had not restarted since the endpoint shipped answers 404 — so a lookup outage and an unshipped change looked identical, and the field was reported as "still not a lookup" after it had been changed into one. Separately, the new progress rail put five label-beside-marker units in one row and reused `STEP_TITLES` for the labels, so four of the five ellipsized: "Your org…", "Your wo…", "Worksp…", "Agreem…". `truncate` is what made both quiet — overflowing text gets noticed in review, ellipsized text looks deliberate. |
| **Regression test** | `apps/landing/lib/use-country-options.spec.ts`, `apps/landing/lib/onboarding-wizard.spec.ts` |
| **Scenario** | The country list offered to a buyer is non-empty with no network call completed, carries an ISO code and a name for every entry, excludes `OTHER` — which is a valid answer to "where did you hear about us" and a corrupt value for a country column — and is uniquely keyed. Every wizard step has a rail label, no label exceeds what one segment of a five-across rail holds, and no two labels are the same word. |
| **Proven to fail without the fix** | Seeding `useCountryOptions` from `[]` fails the non-empty assertion; pointing `STEP_LABELS` back at `STEP_TITLES` fails the length assertion on three of the five steps. |
| **Note** | The length assertion is a proxy and is stated as one: nothing here renders the rail. It pins the property that actually broke — a label too long for its segment — rather than pretending to have measured pixels. Visual verification was not performed. |
| **Fixed** | 2026-08-21, branch `agent/ux-round-two` |
| **Active** | yes |

### REG-183 — A page number that outlived its list

| | |
|---|---|
| **Bug class** | `unbounded-render` |
| **Module** | `apps/admin` |
| **Bug record** | BUG-0352 |
| **Root cause** | The tenant Timeline panel rendered every entry the endpoint returned — 154 on a tenant a few weeks old, and growing — with no total and no pager, so the panels below it sat under an arbitrarily long list. The paging added for it then had a second failure available to it: filtering to a category with two entries while sitting on page four renders an empty panel above rows that plainly exist, and correcting the page from an effect still shows that state for one render. |
| **Regression test** | `apps/admin/lib/list-paging.spec.ts` |
| **Scenario** | A 154-entry list at 25 a page reports seven pages, stops the last page at the end of the list, and covers every row exactly once across all its pages. A page number beyond the end clamps into range rather than rendering nothing; an empty list stays on a valid page; a nonsense page request (`0`, negative, `NaN`) resolves to the first page; a page size of zero does not produce an infinite page count. |
| **Proven to fail without the fix** | Replacing the clamp with the raw requested page fails the out-of-range case with `start` past the end of the list. |
| **Note** | The window is computed rather than stored, so it cannot be stale by construction. That is the whole reason the arithmetic is worth a file of its own — the bug is not in the slice, it is in the state that outlives what it indexes. |
| **Fixed** | 2026-08-21, branch `agent/ux-round-two` |
| **Active** | yes |

### REG-184 — The third copy of one hostname rule

| | |
|---|---|
| **Bug class** | `divergent-duplicate-guard` |
| **Module** | `services/api/src/modules/tenants`, `packages/config` |
| **Bug record** | BUG-0353 |
| **Root cause** | `PublicTenantsService.getTenantSlugFromHost` parsed the host itself against `WEB_APP_PROD_ROOT_DOMAIN` — a third name for the concept `packages/config` calls `TENANT_BASE_DOMAIN` and `apps/admin` briefly called `NEXT_PUBLIC_TENANT_ROOT_DOMAIN` — and re-implemented suffix matching, nested-label rejection and a common-login-host exception that the shared rule already performs. With `TENANT_BASE_DOMAIN` configured and `WEB_APP_PROD_ROOT_DOMAIN` unset, the web app routed `xoul-ltd.localhost` to a workspace and the API resolved no slug from the same hostname, so login answered `TENANT_NOT_FOUND` for a tenant that exists and is ACTIVE. |
| **Regression test** | `services/api/src/modules/tenants/public-tenant-host.spec.ts` |
| **Scenario** | A workspace subdomain resolves under a locally configured base domain, with and without a port, and against a deployed base domain. `admin.`, `api.`, `app.` and the bare domain resolve to nothing. A nested label resolves to neither its leftmost nor its rightmost part. A hostname that merely ends with the base domain as a substring resolves to nothing. With no base domain configured, nothing resolves. |
| **Proven to fail without the fix** | Restoring the `WEB_APP_PROD_ROOT_DOMAIN` lookup fails six of the seven assertions, since no test configures that variable — which is the defect stated as a test result. |
| **Note** | REG-179 removed the duplicate that *built* dead workspace links, verified the link, and did not ask what else parsed the same hostname. This defect survived a fix aimed directly at it. The lesson is on the record rather than in this row: when a duplicated rule is consolidated, search for every reader of the concept, not only the writer that was reported. |
| **Fixed** | 2026-08-21, branch `agent/ux-round-two` |
| **Active** | yes |

### REG-185 — A formatting rule that nothing applied

| | |
|---|---|
| **Bug class** | `assertion-without-a-check` |
| **Module** | `services/api/src/modules/contracts` |
| **Bug record** | BUG-0418 |
| **Root cause** | `formattingRule` was declared on nineteen contract placeholders — `'currency'`, `'locale-date'`, `'0.##%'` — and read by nothing. `renderContractPlaceholders` escaped every scalar verbatim, so an **executed** agreement printed "Uptime target 99.5." where it meant 99.5%, printed an ISO timestamp where it meant a date, and printed a bare number for a price. The registry declared the intent per placeholder, so a reviewer reading it saw a formatting system; nothing consumed it and nothing failed when it did not. Folded in: the seeded service order wrote `{{customer.address}}, {{customer.country}}` while `customer.address` already ends in the country, printing "Dammam, Saudi Arabia, Saudi Arabia" on every real document. |
| **Regression test** | `services/api/src/modules/contracts/placeholder-formatting.spec.ts` |
| **Scenario** | A percentage carries its sign and drops trailing zeros; a date renders as "1 October 2026" and never numerically; money carries the agreement's currency code, and still renders without one; a boolean is Yes/No; a count is thousand-separated; a collection renders as a list or a table rather than as JSON; a value that cannot be interpreted is returned unchanged. |
| **Proven to fail without the fix** | Removing the `formatPlaceholderValue` call fails eight of the thirteen assertions, including the two — percentage and locale date — whose rules the registry had declared all along. |
| **Note** | Every formatter is best-effort on purpose. A contract that prints the raw string is recoverable; one that prints "Invalid Date" or "NaN%" has replaced the customer's data with a symptom of our bug, and nobody can tell what it was meant to say. That is asserted, not just intended. |
| **Fixed** | 2026-08-22, branch `agent/document-render-and-theme` |
| **Active** | yes |

### REG-186 — A preview that edited what it was previewing

| | |
|---|---|
| **Bug class** | `destructive-preview` |
| **Module** | `apps/admin` |
| **Bug record** | BUG-0419 |
| **Root cause** | "Preview sample data" was implemented as a mode of the editing document rather than as a separate rendering of it: it substituted example values into the HTML, pushed the result into the editor as its content, and kept the real template in a second state variable to restore on exit. Saving mid-preview therefore wrote resolved sample values into the stored template. The same design produced the reported "instability" — the preview rendered from `editor.getHTML()` read *during render*, while the effect that swapped the content ran after it, so the first paint of every toggle showed the previous document. |
| **Regression test** | `apps/admin/lib/documents/template-preview.spec.ts` |
| **Scenario** | The substituted HTML is never passed as the editor's `value`; the preview travels as its own prop; no copy of the template is kept to restore; the read-only article renders from the prop rather than from the editor; substitution uses the API's `exampleHtml` — produced by the document renderer — rather than the raw example string. |
| **Proven to fail without the fix** | Restoring `value={previewHtml}` fails the first assertion, and reinstating `editingHtmlBeforePreview` fails the third. |
| **Note** | These are structural assertions over source, because `apps/admin` jest has no jsdom and nothing in that app has ever been rendered in a test ([[ITEM-0001]]). Weaker than driving the toggle, and stated as such: they pin the two specific shapes that caused the faults, each one edit from returning. |
| **Fixed** | 2026-08-22, branch `agent/document-render-and-theme` |
| **Active** | yes |

### REG-187 — A theme that was a setting

| | |
|---|---|
| **Bug class** | `assertion-without-a-check` |
| **Module** | `apps/admin` |
| **Bug record** | BUG-0420 |
| **Root cause** | The dark theme was two rules setting `color-scheme: dark`. That repaints what the browser draws — scrollbars, date pickers, a select's dropdown — and nothing the console draws, because every surface is a hardcoded light utility (348 `bg-white`, 450 `border-slate-200`, 338 `text-slate-500`). Choosing Dark gave dark widgets on a white application, with inputs rendering light text on their own light backgrounds. `SYSTEM` also resolved once at load, so a machine that switched to dark at sunset left the console light until reload. |
| **Regression test** | `apps/admin/lib/console-theme.spec.ts` |
| **Scenario** | The three-value preference resolves to a two-value scheme, with LIGHT and DARK pinning regardless of the machine and SYSTEM following it. The stylesheet keys on the resolved attribute, and repaints surfaces, borders and text — not only `color-scheme`. The text scale is *inverted* rather than shifted, so `text-slate-950` becomes the brightest text rather than another dark one. The contract document sheet stays white. |
| **Proven to fail without the fix** | Reverting `globals.css` fails four of the six: no rule keys on `data-admin-scheme`, none of the five sampled utilities is remapped, the heading colour is absent, and the sheet exception does not exist. |
| **Note** | Remapping the palette at its source is a deliberate trade over tokenising ~1,900 call sites, and its limits are on the record: arbitrary colour values and tinted status pills are not covered. The pills stay legible because each pairs a light tint with dark text of the same hue and both halves are held. The document sheet staying white is not an oversight — a contract is paper, and what an author sees must be what the counterparty receives. |
| **Fixed** | 2026-08-22, branch `agent/document-render-and-theme` |
| **Active** | yes |

### REG-188 — One word that disabled every sticky element

| | |
|---|---|
| **Bug class** | `divergent-duplicate-guard` |
| **Module** | `apps/admin` |
| **Bug record** | BUG-0421 |
| **Root cause** | `admin-shell.tsx` wrapped every page in `overflow-x-hidden`. Per CSS Overflow 3, a non-`visible`/`clip` value on one axis computes the other from `visible` to `auto` — so that wrapper became a scroll container, and a sticky element sticks to its nearest scroll container, which here has auto height and never scrolls. Every `position: sticky` in Platform Admin was inert, including data-table headers and pagination bars written to stick. The fields rail was delivered as sticky, reviewed as sticky, and reported twice as not sticky. |
| **Regression test** | `apps/admin/lib/sticky-containment.spec.ts` |
| **Scenario** | No `.tsx` under `app/` uses `overflow-x-hidden` on a wrapper that is not itself a scrollport — paired with an explicit `overflow-y-auto`/`scroll` it is deliberate and allowed. The shell wrapper is asserted to be on `clip` by name, and something in the tree is asserted to still depend on stickiness. |
| **Proven to fail without the fix** | Restoring `overflow-x-hidden` in the shell fails two assertions, one of them naming the file. |
| **Note** | The last assertion exists because a guard for a property nothing uses is a guard nobody keeps. It fails if the fields rail stops being sticky, which is the thing this was written to protect. |
| **Fixed** | 2026-08-22, branch `agent/document-render-and-theme` |
| **Active** | yes |

### REG-189 — A run whose process died, and a button that would never enable

| | |
|---|---|
| **Bug class** | `divergent-duplicate-guard` |
| **Module** | `services/api/src/modules/tenant-control-plane`, `apps/admin` |
| **Bug record** | BUG-0422 |
| **Root cause** | A provisioning run is created `RUNNING` and moved on by the same process that executes it, so a restart, deploy or crash mid-run leaves the row `RUNNING` for ever and nothing sweeps it. `retryBlockedReason` refused on that raw status with "A provisioning run is already in progress" — false, and the only thing the console said. Meanwhile the provisioning **queue** already derived `AT_RISK`, `BREACHED` and `MANUAL_ACTION_REQUIRED` from the same rows: two answers to one question, and the tenant page had the worse one. Underneath both, a status vocabulary built for the recorder — `RUNNING` spans "started ten seconds ago" and "process died an hour ago", which need opposite responses. |
| **Regression test** | `services/api/src/modules/tenant-control-plane/provisioning-operations.service.spec.ts`, `apps/admin/lib/provisioning-queue-states.spec.ts` |
| **Scenario** | A run silent for the threshold reports STALLED; one recording steps two minutes ago reports IN_PROGRESS however long it has run; STALLED outranks a breached target, because "late" and "nothing is coming" ask for different things; a SUCCEEDED or FAILED run is never STALLED however old; a run whose steps predate the timestamp columns still classifies rather than throwing. |
| **Proven to fail without the fix** | Removing the staleness branch fails three of the five, and the retry gate then refuses every one of those runs. |
| **Caught in CI, before integration** | Two things the unit tests could not see. (1) `deriveProvisioningState` took the activity timestamps as **optional** and fell back to `startedAt` when they were absent — so the provisioning queue, whose Prisma `select` did not ask for them, classified every long-running run as STALLED. Absence of activity data was being read as evidence of no activity, which is the fail-dangerous direction; the fields are now required, turning a silent misclassification into a compile error at every call site. (2) The admin queue declares its **own copy** of the state union and did not gain STALLED, so `STATE_LABEL[state]` returned `undefined` and rendered an empty cell — in a table whose only job is telling the states apart. That was caught by a signed-in accessibility journey asserting that state is never carried by colour alone, three layers and several minutes away; `provisioning-queue-states.spec.ts` now compares the two unions in under a second and names the missing state, and the cell falls back to the raw value so the failure can only ever be ugly rather than invisible. |
| **Note** | Allowing retry from STALLED and MANUAL_ACTION_REQUIRED is safe *because* replay is idempotent by design — only retryable steps re-run, and owner, subscription and invoice creation never do. It is not safe in general and the gate still refuses while a run is recording steps. Separately: [[BUG-0015]] is untouched by this. A tenant that failed at or before the business-unit step is now recoverable-looking and still cannot be activated, and retry reports SUCCEEDED. This makes a stuck tenant retryable; that record is why a retried tenant may still be unusable. |
| **Fixed** | 2026-08-22, branch `agent/document-render-and-theme` |
| **Active** | yes |

### REG-190 — A form that was disabled without looking it

| | |
|---|---|
| **Bug class** | `assertion-without-a-check` |
| **Module** | `apps/landing`, `apps/admin` |
| **Bug record** | BUG-0439 |
| **Root cause** | The subscribe wizard disables its fields when the selected price cannot be bought — correct, and the reason BUG-0066 and BUG-0082 exist. But `<fieldset disabled>` is a semantic assertion that changes nothing visually unless the author says so, and nothing did: every control rendered as an enabled one and silently ignored the pointer. The explanation sat in the left-hand plan card while the inert fields were in the right-hand column, so `aria-describedby` told a screen reader what a sighted visitor was not — the reverse of the usual failure, and it hides better because automated accessibility checks pass. The operator half compounded it: `deriveCheckoutReadiness` computes up to ten specific causes, the API returns all of them, and the console rendered them in a `title` tooltip — invisible on touch, unreachable by keyboard. |
| **Regression test** | `apps/landing/lib/subscribe-lock.spec.ts` |
| **Scenario** | The blocked reason is still produced for both ways checkout can be impossible; exactly one element carries `subscribe-unavailable-notice`; the notice appears after the price card and **before** the fieldset it explains; the fieldset carries an opacity and `cursor-not-allowed` alongside `disabled`; the plan and billing selectors stay outside the disabled region; the notice links to contact. |
| **Proven to fail without the fix** | Moving the notice back into the plan card fails the ordering assertion, and dropping the conditional class fails the inert-styling one. |
| **Note** | The id is asserted to appear exactly **once** rather than merely to exist. The BUG-0066 browser journey locates it and asserts visibility, so a second copy is a strict-mode violation rather than twice the clarity — which is the trap in "put the message in both places". |
| **Fixed** | 2026-08-22, branch `agent/document-render-and-theme` |
| **Active** | yes |

### REG-191 — A badge that counted over the page it was fetching

| | |
|---|---|
| **Bug class** | `assertion-without-a-check` |
| **Module** | `services/api/src/modules/platform-events`, `apps/admin` |
| **Bug record** | BUG-0460 |
| **Root cause** | `notifications()` scanned `take: limit * 20`, so the unread count was a function of the caller's page size. The badge polls with `limit=1` and therefore counted unread notifications among **twenty** events; opening the popover asks for six and scans a hundred and twenty. Most platform events are not notifiable, so the narrow scan usually found none — no badge at sign-in, a count the moment the bell was clicked. The comment directly above the return claimed the count was computed "over everything in the window, not over the page": it excluded the page *slice*, while the window itself was the page size times twenty. The code read as correct to anyone who read the comment first. |
| **Regression test** | `services/api/src/modules/platform-events/notification-count.spec.ts` |
| **Scenario** | The scan takes a fixed `NOTIFICATION_SCAN_LIMIT` and never a multiple of `limit`; the page is still sliced from it, so `limit` keeps bounding the payload; the limit is wide enough for the notifiable subset to be found; a truncated scan is reported so the badge renders `99+` rather than an exact number nothing stands behind; the time window is still bounded, so this stays one indexed range scan. |
| **Proven to fail without the fix** | Restoring `take: limit * 20` fails the first assertion by name. |
| **Note** | Comments are stripped before scanning. The comment explaining what the query *used to be* contains the very string asserted absent, so a raw scan reports the fix as the bug — `z-layers.spec.ts` met this first, and it is worth stating twice because every structural assertion over source will meet it. |
| **Fixed** | 2026-08-22, branch `agent/tenant-repair-and-console-ux` |
| **Active** | yes |

### REG-192 — An estimator listing plans its input could not move

| | |
|---|---|
| **Bug class** | `assertion-without-a-check` |
| **Module** | `apps/landing` |
| **Bug record** | BUG-0461 |
| **Root cause** | "Estimate your cost" mapped every plan, so flat-priced plans appeared under an "Active employees" control that could not change them, and a plan with no regional offer rendered as "On request" beside three prices — reading as a fourth quote rather than as an absence. The section had been correct once, when its copy claimed a per-seat relationship `estimateCost` refused to compute; that contradiction was closed by rewriting the **copy** to describe flat pricing, which left an estimator whose control does nothing under a heading promising an estimate. Fixing the sentence rather than the scope moved the inconsistency instead of removing it. |
| **Regression test** | `apps/landing/lib/plan-estimator.spec.ts` |
| **Scenario** | A per-seat price multiplies by headcount; a minimum commitment is billed and flagged rather than silently applied; a team above the self-service ceiling is flagged; an unavailable offer estimates nothing. The section filters to available per-seat offers, renders no headcount control when nothing responds to one, and explains an empty section rather than showing one. |
| **Proven to fail without the fix** | Restoring `plans.map` fails the filter assertions, and removing the empty-state branch fails the copy assertion. |
| **Note** | The arithmetic assertions are kept alongside the scope ones deliberately. The minimum-seat case is [[BUG-0080]]'s shape — a page quoting six seats while Stripe charges ten — and it lives in this file because that is where somebody changing the estimator will look. |
| **Fixed** | 2026-08-22, branch `agent/tenant-repair-and-console-ux` |
| **Active** | yes |

### REG-193 — Five numbers nobody could act on, behind a skipped Overview

| | |
|---|---|
| **Bug class** | `assertion-without-a-check` |
| **Module** | `apps/admin` |
| **Bug record** | BUG-0462 |
| **Root cause** | Three faults reading as one bad page. The sidebar used the module's `routeBase` — where its *records* live, correct for the runtime record routes built from it — as the area's landing page, so every operator was dropped into a queue of 12,005 incidents past the Overview. "Error severity: 488" used a column name as a metric label. "Open investigations: 12,005" equalled the total, because every sanitized incident starts NEW, so one figure appeared twice under two names and neither said which was the queue. And no tile was clickable or scoped, so learning that 488 were critical left an operator to rebuild that filter by hand, over a window nothing stated. |
| **Regression test** | `apps/admin/lib/monitoring-metrics.spec.ts` |
| **Scenario** | The sidebar lands on `/settings/monitoring` through an `href` override, while modules without one keep `routeBase`. Every tile names what it counts, carries the active window, toggles its filter on a second press, and marks the filter in force with `aria-pressed` and the word "Filtering" — not colour alone. `scope` is required on `SummaryCard`, so a tile cannot be added without one. |
| **Proven to fail without the fix** | Reverting the sidebar fails two assertions by name; restoring either old label fails the negative assertions; dropping an `onClick` fails the count. |
| **Note** | The default time window is deliberately **unchanged**. Narrowing it would make the page open on less than everything, which is a product decision about what the queue is for — not a UX repair — and doing it quietly is how a monitoring screen starts hiding incidents. |
| **Fixed** | 2026-08-22, branch `agent/tenant-repair-and-console-ux` |
| **Active** | yes |

### REG-194 — Health read off the record of the attempt

| | |
|---|---|
| **Bug class** | `divergent-duplicate-guard` |
| **Module** | `services/api/src/modules/tenant-control-plane`, `apps/admin` |
| **Bug record** | BUG-0463 |
| **Root cause** | Every panel on the tenant record described *provisioning runs*. A run is evidence that a build was attempted; a workspace can be entirely usable with no run rows — they predate run recording, or were never written — and can be missing a hostname behind a perfectly successful run. So an ACTIVE, reachable, signed-into tenant reported "Workspace: Not provisioned", "Primary tenant owner: Unassigned", a status reason of "Provisioning" beside an "Active" badge, and no recorded run: four true statements answering nothing. The retry gate then made it unrecoverable rather than merely unclear, because the one control that could issue a hostname is bound to a lifecycle state a working tenant has already left. Underneath, `subStatus` is a sentence nothing clears when the lifecycle moves on. |
| **Regression test** | `services/api/src/modules/tenant-control-plane/workspace-health.spec.ts` |
| **Scenario** | A complete workspace reports nothing wrong. A missing hostname is blocking, and repairable only when a slug exists to derive one from. An ACTIVE tenant still described as provisioning is flagged, while an ordinary sub-status and a genuinely provisioning tenant are left alone. A missing business unit is blocking and explicitly not repairable. A missing owner distinguishes "nobody assigned" from "nobody to assign". Every deficiency is reported at once, and `repairable` is true exactly when one of them is. |
| **Proven to fail without the fix** | There is nothing to revert to — the derivation did not exist. Removing the slug guard makes the not-repairable case claim repairability, which is the assertion that matters: it would produce a button that can only fail. |
| **Note** | The repair is narrow on purpose. It issues a missing hostname and clears a contradictory sub-status; it does **not** create business units, owners, subscriptions or invoices. Those belong to provisioning, and quietly duplicating them in a repair is how a repair becomes an incident. [[BUG-0015]] is named on the business-unit finding rather than worked around: the step that creates one is not replayed, so claiming it repairable would produce a button that reports success and changes nothing — which is BUG-0015's own shape. |
| **Fixed** | 2026-08-22, branch `agent/tenant-repair-and-console-ux` |
| **Active** | yes |

### REG-195 — The fourth and fifth copies of one workspace rule

| | |
|---|---|
| **Bug class** | `divergent-duplicate-guard` |
| **Module** | `services/api/src/modules/tenant-control-plane`, `packages/config` |
| **Bug record** | BUG-0492 |
| **Root cause** | The tenant control plane built workspace URLs with `` `https://${domain}` `` — a template literal, which cannot express either decision the rule exists to make: the protocol comes from the platform environment, and a development URL inherits the web app's port. It produced `https://xoul-ltd.localhost/`, addressing port 443 on a host answering on 3001. REG-179 removed the copy that built admin's links and REG-184 the copy that read hostnames; both searched for callers of the old helpers, and these sites called no helper at all. |
| **Regression test** | `services/api/src/modules/tenant-control-plane/workspace-url.spec.ts` |
| **Scenario** | A development workspace URL carries the web app's port and uses `http`; a production one is exactly `https://<host>/` with no port; the control plane contains no `` `https://${` `` literal; and a workspace with no hostname yields null rather than a slug-parameter link, because under a label reading "Workspace URL" that would claim the workspace is addressable by name when it is not. |
| **Proven to fail without the fix** | Restoring any one of the three literals fails the absence assertion by pattern. |
| **Note** | The absence assertion found the **third** site after the first two had been fixed by hand — which is the argument for asserting that a shape is gone rather than that a fix is present. Counting call sites would have passed at two. |
| **Fixed** | 2026-08-22, branch `agent/tenant-commands-monitoring-bulk-delete` |
| **Active** | yes |

### REG-196 — A button that reported opening something it had not

| | |
|---|---|
| **Bug class** | `assertion-without-a-check` |
| **Module** | `apps/admin` |
| **Bug record** | BUG-0493 |
| **Root cause** | "Open Tenant" called `window.open(url, "_blank", "noopener,noreferrer")` and returned `success: true` unconditionally. Passing **any** features string makes Chrome treat the call as a request for a popup *window* rather than a tab, and popups are blocked far more readily — so the common outcome was nothing visible happening under a message saying it had. The features string was not even buying `noopener`: severing the returned handle does that, and leaves a value to check. |
| **Regression test** | `apps/admin/lib/open-external.spec.ts` |
| **Scenario** | The opener is called with exactly two arguments and no features string; the returned handle has its `opener` severed; success is reported only when a handle came back; a blocked open reports the block **and the URL**, so the operator can still reach it; an empty URL is refused without calling the opener; the message names what was being opened. |
| **Proven to fail without the fix** | Restoring the features string fails the argument-count assertion, and reinstating the unconditional success fails the blocked-open case. |
| **Note** | The decision is split from the browser call so it can be tested at all — `apps/admin` jest has no jsdom, so `window` does not exist. What is worth asserting was never the call; it is what gets concluded from its result. |
| **Fixed** | 2026-08-22, branch `agent/tenant-commands-monitoring-bulk-delete` |
| **Active** | yes |

### REG-197 — A status that could never change

| | |
|---|---|
| **Bug class** | `stale-generated-artifact` |
| **Module** | `services/api/src/modules/tenant-domains`, `services/api/src/modules/super-admin`, `apps/admin` |
| **Bug record** | BUG-0494 |
| **Root cause** | `createSystemDomain` reads the `wildcardDnsReady` platform setting once, at the moment it issues a hostname, and writes PENDING/PENDING when it is false. Nothing re-reads it and nothing probes DNS per tenant — so a hostname issued before the setting was confirmed stayed Pending permanently, on workspaces that were by then resolving perfectly. The panel showed the platform flag as a fact with a hint saying what it was *not*, and nothing saying whether Pending meant "a check is running" or "a person has not confirmed the wildcard record". |
| **Regression test** | `services/api/src/modules/tenant-domains/tenant-domain.service.spec.ts` |
| **Scenario** | Confirming wildcard DNS promotes pending system subdomains to VERIFIED/ACTIVE; an unconfirmed setting promotes nothing; only `SYSTEM_SUBDOMAIN` rows are touched, never a customer's own domain; and only rows that are actually pending, so an unrelated settings save cannot rewrite a verified domain's `verifiedAt`. |
| **Proven to fail without the fix** | Removing the readiness guard fails the unconfirmed case, and widening the `where` fails the custom-domain and already-verified assertions. |
| **Note** | The custom-domain exclusion is the load-bearing one. A customer's own domain is verified against records they control; the platform wildcard says nothing about it, and sweeping those to VERIFIED would assert something nobody checked — which is the same defect this fixes, pointed the other way. |
| **Fixed** | 2026-08-22, branch `agent/tenant-commands-monitoring-bulk-delete` |
| **Active** | yes |

### REG-198 — A light first paint on every load

| | |
|---|---|
| **Bug class** | `assertion-without-a-check` |
| **Module** | `apps/admin` |
| **Bug record** | BUG-0495 |
| **Root cause** | `ConsolePreferencesApplier` writes the theme attributes from a `useEffect`, which runs after the first paint, and its own doc comment claimed they were written "before the first paint an operator notices" — true of a client navigation, false of every full load. The server emitted no theme attribute, every dark rule keys on one, and `<body>` carried a hardcoded `bg-slate-100 text-slate-950` on the one element outside every route group and therefore outside anything that knows the preference. |
| **Regression test** | `apps/admin/lib/console-theme-bootstrap.spec.ts` |
| **Scenario** | The bootstrap script reads the cookie the console writes and resolves `prefers-color-scheme` before paint; switching Dark → System *removes* the pinned attribute rather than leaving it; the script survives a browser refusing cookies or `matchMedia`; the root layout stamps the preference from `cookies()`, runs the script as the first child of `<body>` rather than in `<head>` (moved by REG-251, and asserted here since), suppresses the hydration warning it deliberately creates, and paints `<body>` from tokens rather than a light class. |
| **Proven to fail without the fix** | Reverting `layout.tsx` fails four of the five layout assertions by name. |
| **Note** | The cookie is a rendering hint and nothing else — no decision is made from it, so a forged value costs the forger a wrongly-coloured page. That is worth stating because a cookie carrying a preference across a trust boundary usually is not that, and the next reader will check. |
| **Fixed** | 2026-08-22, branch `agent/tenant-commands-monitoring-bulk-delete` |
| **Active** | yes |

### REG-199 — Real data nobody could act on

| | |
|---|---|
| **Bug class** | `assertion-without-a-check` |
| **Module** | `apps/admin` |
| **Bug record** | BUG-0496 |
| **Root cause** | The monitoring landing page called one endpoint — the platform event stream — and rendered four counters, a list of event codes by source, and ten recent events. Every figure real, none of it actionable: "Events (24h): 4,182" is not a question a support agent has. `/platform/logs/events` already returned incidents with metrics, fifteen filters and sorting, attributed to customers, and this page never called it. Built from the data nearest to hand rather than from the question its reader has. |
| **Regression test** | `apps/admin/lib/monitoring-overview.spec.ts` |
| **Scenario** | The page reads the incident queue as well as the event stream, in parallel; all four headline figures are links carrying their own filter; every tile states what its figure *means*, not only what it counts; severity, source, status, search and sort controls exist; the filters carry into the full queue rather than being rebuilt there; the page says it shows a slice; the reference is copyable in one click; no counter nobody acts on; and both empty states say which empty it is. |
| **Proven to fail without the fix** | Reverting the page fails the incident-queue assertion, and every tile assertion with it. |
| **Note** | Comments are stripped before scanning. The component's own doc comment promises "no placeholder cards", which the placeholder assertion read as one — the fourth spec to meet this, and the reason `source-scan.ts` now exists instead of a fifth copy of `stripComments`. `placeholder` was also removed from the smell list: it is a real HTML attribute, and a smell test that flags correct markup is one somebody deletes. |
| **Fixed** | 2026-08-22, branch `agent/tenant-commands-monitoring-bulk-delete` |
| **Active** | yes |

### REG-200 — Delete missing on fifteen modules, and unexplained on all of them

| | |
|---|---|
| **Bug class** | `silent-degradation` |
| **Module** | `apps/admin`, `services/api/src/modules/partners`, `services/api/src/modules/platform-runtime` |
| **Bug record** | BUG-0497 |
| **Root cause** | `defaultActionsFor` emitted Delete only when `capabilities.delete` was true — three modules of eighteen — and nothing otherwise. For most of the fifteen that was correct and unstated: invoices, payments and commissions are records the business must be able to produce, an executed agreement is hashed into its own signature chain, and a tenant sits in front of a cascade that would take a customer's whole workspace. For three — partners, partner inquiries, partner onboarding — deletion is the right operator action and was simply never built. Rendering nothing for both cases is what made them indistinguishable. |
| **Regression test** | `services/api/src/modules/partners/partner-deletion.service.spec.ts`, `apps/admin/lib/runtime/platform-module-capabilities.spec.ts` |
| **Scenario** | A partner nothing depends on is deleted and audited; one with commissions, leads, agreements, portal users or referral links is refused **by name** with the dependency counted; a mixed selection deletes the safe rows and keeps the rest; a fully-blocked selection deletes nothing and audits nothing; an id that no longer exists is reported rather than counted as deleted; an empty selection is refused outright; duplicate ids are collapsed. On the registry side: every module without the capability declares Delete disabled with a reason, and no module is in neither state. |
| **Proven to fail without the fix** | Removing a blocker predicate fails the corresponding refusal case; deleting a `DELETE_REFUSALS` entry fails the "no module silently missing Delete" assertion by module key. |
| **Note** | The capability spec's rule changed rather than being relaxed. It was "no capability, no command", which is the safe default and the worse one — an operator cannot tell a missing feature from a deliberate refusal. It is now "no capability, no *enabled* command, and a reason longer than a shrug". Partial success is deliberate throughout: refusing a batch of twenty because one row has a commission makes the operator bisect it by hand, which is the same information and all of the work. |
| **Fixed** | 2026-08-22, branch `agent/tenant-commands-monitoring-bulk-delete` |
| **Active** | yes |

### REG-201 — A catalogue the database could never reach

| | |
|---|---|
| **Bug class** | `silent-degradation` |
| **Module** | `services/api/src/modules/super-admin` |
| **Bug record** | BUG-0533, BUG-0531 |
| **Root cause** | `bootstrapCommercialDefaults` was create-only. Every branch stopped at "does a row exist?": an existing plan kept whatever name and features it was first seeded with, an occupied price slot was counted as served whatever amount stood in it, and a plan the catalogue had dropped stayed on sale. When the owner supplied a real price schedule on 2026-08-20, no database seeded before that date could ever reach it — and the seed reported success every time. The observed state at `99dc70a` was eight active prices, all FLAT, all `SELF_SERVICE`, all in USD at invented amounts, four of them scoped to no market at all, and none for `starter`. |
| **Regression test** | `services/api/src/modules/super-admin/commercial-bootstrap.reconcile.spec.ts` |
| **Scenario** | A database already matching the catalogue produces **zero** writes. A drifted plan name, legacy amount or feature set is corrected. A price on terms the catalogue no longer states is superseded — old row deactivated and dated, successor carrying `supersedesPriceId`, `version + 1` and **no** Stripe identifiers. Drift that is not the amount — `salesModel` above all — is detected. A price the catalogue does not list at all, including one scoped to no market, is deactivated while catalogued rows beside it are untouched. A plan the catalogue dropped is retired with its prices; one carrying subscriptions is withdrawn from sale and left active. |
| **Proven to fail without the fix** | Forcing `describePriceDrift` to return no differences fails exactly the two supersession tests and nothing else. |
| **Note** | The load-bearing test is the one that asserts **nothing happens**. A reconciler that rewrites correct rows is worse than one that never runs: it re-stamps `publishedAt` on every deploy and detaches every price from Stripe in the process, so idempotence is what makes this safe to call from `release:api`. Two deliberate asymmetries: `ensureMarkets` stays create-only, because after the first run a market's launch and self-service flags are operator decisions rather than seed defaults; and nothing anywhere is deleted, because a superseded price is what an existing subscription's terms are readable from. The rule the file now states: converge the catalogue, preserve what was sold. |
| **Fixed** | 2026-08-22, branch `agent/plans-reset` |
| **Active** | yes |

### REG-202 — Deleting a form field does not remove it

| | |
|---|---|
| **Bug class** | `doc-code-drift` |
| **Module** | `apps/admin` |
| **Bug record** | BUG-0534 |
| **Root cause** | `completeFormsFromSchema` adds every readable, non-sensitive, non-list, non-relation column a form does not mention. That is the right default — an undeclared field is more likely forgotten than deliberately hidden — but it means removing a field declaration does not remove the field. Deleting the four legacy pricing declarations moved them into "Additional details" stripped of the labels and descriptions that explained them, and made `legacyPricingMigratedAt` writable, which `UpdatePlanDto` does not accept. The form was briefly worse than before the fix. |
| **Regression test** | `apps/admin/lib/runtime/plan-record-form.spec.ts` |
| **Scenario** | None of `currency`, `monthlyBasePrice`, `annualBasePrice` or `legacyPricingMigratedAt` appears in the plan's list columns or in `detail.fields`, asserted against the **completed** form rather than the declared one; and no field is writable that `UpdatePlanDto` does not accept. |
| **Proven to fail without the fix** | Removing a key from `FORM_EXCLUDED_FIELDS` fails the absence assertion for that key by name. The earlier version of this test asserted the fields were *present and labelled "Legacy"*, so it passed throughout the defect. |
| **Note** | Two lessons, both structural. The assertion has to run against the completed form: a spec reading `definition.forms` sees what was declared, which is exactly the half that was correct. And `FORM_EXCLUDED_FIELDS` is declared above `definitions` rather than beside the function that reads it — that array is evaluated at module scope, so a constant below it sits in its temporal dead zone and every import of the registry throws at boot. This registry has now been broken that way three times, which is why the constant carries the reason. |
| **Fixed** | 2026-08-22, branch `agent/plans-reset` |
| **Active** | yes |

### REG-203 — Migrations ran through a connection pooler and could never acquire their lock

| | |
|---|---|
| **Bug class** | `silent-config-fallback` |
| **Module** | `services/api/prisma`, `pkg:config` |
| **Bug record** | BUG-0086 |
| **Root cause** | `prisma.config.ts` supplied one datasource url for every Prisma CLI operation, so migrations inherited whatever `DATABASE_URL` the runtime used. In production that is Neon's pooled endpoint — PgBouncer in transaction pooling mode — and `migrate deploy` serialises migrators with a *session-scoped* advisory lock, which cannot be held when consecutive statements may reach different backends. The lock was not slow to take; it was unobtainable, so every deploy failed with `P1002` after the ten-second timeout and `preDeployCommand` aborted before seeding and legal publication ever ran. |
| **Regression test** | `packages/config/database-urls.test.js` |
| **Scenario** | A url whose host carries the `-pooler` infix, or which sets `pgbouncer=true`, is recognised as pooled; `DIRECT_DATABASE_URL` is preferred for migrations and falls back to `DATABASE_URL` when unset; a pooled migration url is refused with a message naming the variable to set; and a pooled *runtime* url is accepted once migrations have a direct one. |
| **Proven to fail without the fix** | Deleting the pooled-endpoint check makes every "refuses" case fail. Verified end to end against the real CLI: with a pooled `DATABASE_URL` and no override, `prisma validate` fails naming the fix; adding `DIRECT_DATABASE_URL` makes it pass. |
| **Note** | The distinction is invisible at runtime, which is why it survived: a Nest request needs no state between statements and is perfectly happy on the pooled endpoint. Only the migration path cares, and only in production. |
| **Fixed** | 2026-08-22, branch `agent/backlog-burndown` |
| **Active** | yes |

### REG-204 — A database behind the migrations was only discovered when a screen 500ed

| | |
|---|---|
| **Bug class** | `assertion-without-a-check` |
| **Module** | `services/api` |
| **Bug record** | BUG-0283 |
| **Root cause** | Two independently-cached derivations of one schema, with nothing comparing them. A development database can sit several migrations behind indefinitely because the generated Prisma client is usually just as far behind — it does not select columns that do not exist, so the two stale artifacts agree. The moment anyone runs `prisma generate` for an unrelated reason the client catches up, the database does not, and every query touching a new column returns `P2022` on whichever screen reaches it first. `db:preflight` detected exactly this and nothing ran it. |
| **Regression test** | `services/api/src/common/prisma/migration-drift.spec.ts` |
| **Scenario** | Pending migrations are computed by directory name against `_prisma_migrations`; the warning **names them**; a migration applied but absent from disk does not warn (an ordinary branch switch); and neither a missing `_prisma_migrations` table nor a filesystem failure can break startup. |
| **Proven to fail without the fix** | Removing the naming from `describeMigrationDrift` fails the assertions that each pending migration appears in the message. |
| **Note** | It warns and continues deliberately. A developer working against an older database on purpose should not be locked out of the whole API, and refusing to boot over a condition that is often intentional is how a warning gets ignored. |
| **Fixed** | 2026-08-22, branch `agent/backlog-burndown` |
| **Active** | yes |

### REG-205 — A payroll figure was derived in a route proxy

| | |
|---|---|
| **Bug class** | `service-authorization-hidden` |
| **Module** | `apps/web` |
| **Bug record** | BUG-0041 |
| **Root cause** | `app/api/payroll/compensations/route.ts` made a second API call to `/pay-components`, folded the form's flat `component_<id>` values into a `components` array, and — when the caller omitted it — derived `basicSalary` as *the first component with a non-empty amount*, falling back to `"0"`. A payroll rule, in a layer with no tests, no audit trail and no server-side validation, over the number that decides what an employee is paid. No domain service ever agreed to it. |
| **Regression test** | `apps/web/app/(authenticated)/payroll/employee-compensation/compensation-runtime.spec.ts` |
| **Scenario** | The flat-to-structured translation routes a fixed component to `amount` and a percentage component to `percentage`; `basicSalary` is passed through exactly as entered and **never derived** — neither from a component nor as a substituted zero; an update sends only the components the form submitted, so an absent one is not cleared; and the API's derived totals are never sent back. |
| **Proven to fail without the fix** | Restoring the `?? components.find(...)?.amount ?? '0'` fallback fails the two assertions that `basicSalary` is absent when the caller omitted it. |
| **Note** | The form already marked `basicSalary` required and `CreateEmployeeCompensationDto` already declared it required — so the API's stated rule was "reject an omission", and the proxy was inventing a value to satisfy a requirement that already existed. Deleting the guess made the two agree. |
| **Fixed** | 2026-08-22, branch `agent/backlog-burndown` |
| **Active** | yes |

### REG-206 — A failed branding upload left an orphaned document behind

| | |
|---|---|
| **Bug class** | `declared-but-unwired-step` |
| **Module** | `api:tenant-settings`, `apps/web` |
| **Bug record** | BUG-0041 |
| **Root cause** | `app/api/tenant-settings/branding-assets/route.ts` owned a MIME allowlist and a 3 MB limit the API had never heard of — so a caller reaching the API directly was governed by nothing — and orchestrated the upload in two steps that were not atomic. When the settings write failed, the document created by the first step stayed behind for ever: referenced by nothing, and unfindable for a tenant that does not know its id. |
| **Regression test** | `services/api/src/modules/tenant-settings/branding-assets.service.spec.ts` |
| **Scenario** | The policy is enforced on the API — an unknown setting key, a disallowed MIME type and a file over the limit are all refused before any upload; an `.ico` is accepted for a favicon and refused for a logo; the document is filed against `user.tenantId` rather than anything client-supplied; and **a failed settings write archives the document that was just created**, while still surfacing the original failure rather than the archive's. |
| **Proven to fail without the fix** | Removing the compensating `archive` call fails "archives the document it created". Removing the size or MIME check fails the corresponding refusal. |
| **Note** | Compensating rather than transactional, because the two writes cross a storage boundary a database transaction cannot span. A best-effort archive that itself fails is logged and does not mask the error the caller can act on. |
| **Fixed** | 2026-08-22, branch `agent/backlog-burndown` |
| **Active** | yes |

### REG-207 — A referred buyer who paid without becoming a lead earned their partner nothing

| | |
|---|---|
| **Bug class** | `divergent-duplicate-guard` |
| **Module** | `api:billing`, `api:partner-experience`, `apps/landing` |
| **Bug record** | BUG-0281 |
| **Root cause** | `CustomerAccount` carries three attribution columns and only the lead paths wrote them, because the referral flow was built around the lead funnel before self-service checkout existed. The resolution logic was *private to `LeadsService`*, which is precisely why the newer path — writing the same columns — attributed nothing. On the landing side the capture ran in a `useEffect` inside the lead form, so a visitor who went straight to Plans → Subscribe never captured a code at all. |
| **Regression test** | `services/api/src/modules/partner-experience/partner-referral-resolver.service.spec.ts`, `services/api/src/modules/billing/services/checkout-customer-record.spec.ts` |
| **Scenario** | A code resolves to a partner **against the database, never from the caller**; an unrecognised, expired, disabled or suspended-partner code attributes nobody while still recording the code; a referred checkout writes partner, link and snapshot together with `originChannel = PARTNER_REFERRAL`; an unreferred one records `WEBSITE` and three nulls, not a blank; and a returning customer who already has a partner is never reassigned. |
| **Proven to fail without the fix** | Removing the three columns from `resolveCustomer`'s create fails "records partner, link and code snapshot". Making the gate per-column rather than on `originatingPartnerId` fails "writes the three columns together or not at all". |
| **Note** | The code is deliberately **not** part of `submissionHash`. Making it part of the order's identity would let a buyer who reloaded with `?ref=` stripped from the URL create a second customer and a second tenant. |
| **Fixed** | 2026-08-22, branch `agent/backlog-burndown` |
| **Active** | yes |

### REG-208 — The canonical settings document named routes that 404

| | |
|---|---|
| **Bug class** | `doc-code-drift` |
| **Module** | `apps/web`, `docs/architecture` |
| **Bug record** | BUG-0045 |
| **Root cause** | `docs/architecture/settings-and-branding.md` is designated canonical — it "overrides other documents where they differ" — and its Settings Route Audit was an enumeration of roughly fifty flat `/settings/<name>` URLs, which is the *pre-runtime* route map. `[category]/page.tsx` `notFound()`s on anything outside the eleven categories, so about twenty of those rows described 404s. One of them, `/settings/tenant`, had been quoted out of the document into `require-settings-permission.ts` as a live `fallbackHref`, so a permission failure redirected the user to a 404. |
| **Regression test** | `apps/web/app/(authenticated)/settings/_lib/settings-doc-routes.spec.ts` |
| **Scenario** | Every `/settings/...` route the document names in backticks outside a blockquote resolves — through a real page, a dynamic prefix, or one of the eleven category keys; the stated category count matches `settingsRuntimeCategories`; every category the runtime defines is described; and every `app/components/ui/*.tsx` the document names exists. |
| **Proven to fail without the fix** | Before the rewrite the route assertion listed eighteen dead URLs by name, and the category-count assertion failed on "ten". |
| **Note** | The blockquote exclusion is the mechanism that lets the document describe its own history — `/settings/tenant` is quoted precisely because it 404s — without that becoming a claim the check has to honour. |
| **Fixed** | 2026-08-22, branch `agent/backlog-burndown` |
| **Active** | yes |

### REG-209 — A control-plane method that authorized only by delegation

| | |
|---|---|
| **Bug class** | `service-authorization-hidden` |
| **Module** | `api:tenant-control-plane` |
| **Bug record** | ITEM-0015 |
| **Root cause** | `readiness()` carried no inline authorization assertion. It was nonetheless authorized, because it delegated to `overview()`, which asserts — a QA audit recorded it as "correct-but-indirect" and it became the module's one open soft spot. This module is a cross-tenant surface that authorizes inside services rather than through decorators, so "every reachable method asserts" is the entire security model, and a method that asserts as a side effect of what it happens to call is one refactor away from asserting nothing. |
| **Regression test** | `services/api/src/modules/tenant-control-plane/every-method-asserts.spec.ts` |
| **Scenario** | Every public `async` method across the module's service files that takes an `AuthenticatedUser` names an authorization helper, and names it **before** its first Prisma call; the set of methods examined is non-trivial, so the check cannot pass by finding nothing; and an exemption that no longer matches a real method fails the test. |
| **Proven to fail without the fix** | Removing the assertion from `readiness()` makes the test name `TenantControlPlaneService.readiness`. |
| **Note** | This reads source text, so it asserts a method *names* a helper rather than that the helper is reached on every path — stated in the file rather than papered over. The property being defended is auditability: that a reader sees the authorization without tracing a call chain. |
| **Fixed** | 2026-08-22, branch `agent/backlog-burndown` |
| **Active** | yes |

### REG-210 — Two committed environment examples disagreed about the workspace domain

| | |
|---|---|
| **Bug class** | `silent-config-fallback` |
| **Module** | `apps/web`, `pkg:config` |
| **Bug record** | ITEM-0045 |
| **Root cause** | `apps/web` ships `.env.example` and `.env.local.example`, and they named different hosts for `NEXT_PUBLIC_WEB_ROOT_DOMAIN` — `localhost:3000`, the *landing* port, against `localhost:3001`. Two examples for one app is the hazard: whichever is read second wins and nobody diffs them. It broke nothing, because `normalizeHostname` strips the port before classification and both reduce to `localhost` — which is exactly why a wrong value survived in a committed example. |
| **Regression test** | `packages/config/env-examples.test.js` |
| **Scenario** | The two examples agree on every routing and addressing variable and neither omits one the other declares; the web and admin root domains name the ports those apps actually answer on; and `getPlatformDomainConfig` resolves both to the same tenant base domain. |
| **Proven to fail without the fix** | Restoring `localhost:3000` to `.env.example` fails both the agreement assertion and the port assertion, naming the variable. |
| **Note** | Recorded honestly as documentation drift rather than a runtime defect. The value still has to be right: anything building a URL reads it unnormalised, and a developer following the example is told which app they are configuring. |
| **Fixed** | 2026-08-22, branch `agent/backlog-burndown` |
| **Active** | yes |

### REG-211 — Every upstream refusal reached the browser as a 500

| | |
|---|---|
| **Bug class** | `declared-but-unwired-step` |
| **Module** | `apps/web` |
| **Bug record** | ITEM-0035 |
| **Root cause** | 134 `catch` blocks across 123 route handlers hardcoded `{ status: 500 }`, carrying the message string and nothing else. `apps/web/AGENTS.md` required handlers to forward the API's error contract; `ApiRequestError`, `isApiRequestError` and `proxyApiJsonResponse` all already existed and `app/api/_lib/bulk-delete.ts` already did it correctly. It was adoption, and prose does not achieve adoption across 123 files. |
| **Regression test** | `apps/web/app/api/_lib/proxy-error.spec.ts` |
| **Scenario** | A 400, 403, 404, 409, 422, 429 or 503 from the API arrives with that status; `traceId`, `errorCode`, `description` and `fieldErrors` are forwarded when the API sent them and **omitted rather than sent as undefined** when it did not; the API's message wins over the fallback unless it is blank; and a genuine crash in the handler is still a 500. |
| **Proven to fail without the fix** | Returning a fixed 500 from `proxyErrorResponse` fails the status assertion for all seven codes. `check-proxies-forward-status.mjs` refuses a probe handler that hardcodes 500 while using the throwing client. |
| **Note** | The check is narrowed to handlers using `apiRequest`/`apiRequestJson`. `apps/landing` uses raw `fetch` and forwards `response.status` already, so its `catch` fires only when the fetch itself fails — genuinely its own failure, not a refusal being swallowed. A check that flags those would be noise, and a check that cries wolf gets switched off. |
| **Fixed** | 2026-08-22, branch `agent/backlog-burndown` |
| **Active** | yes |

### REG-212 — The desktop agent's offline queue had no statement of what it re-sends

| | |
|---|---|
| **Bug class** | `assertion-without-a-check` |
| **Module** | `apps/agent-desktop` |
| **Bug record** | ITEM-0033 |
| **Root cause** | BUG-0036 was the agent re-sending whole batches on retry, so a heartbeat was counted twice and an employee's presence overstated. The fix landed on the server as idempotency — correctly, because that is where correctness has to hold — and the queue that decided what got re-sent kept no test at all. The workspace had no test runner. |
| **Regression test** | `apps/agent-desktop/src/main/offline-queue.spec.ts` |
| **Scenario** | A drained batch is removed, so a successful send cannot re-send it; a returned batch is re-sent exactly once and lands **in front of** anything queued since; the bound drops the oldest rather than the newest; a malformed event — no session, unknown state, unparseable timestamp, negative idle — never reaches the wire; and overlapping writes lose no event. |
| **Proven to fail without the fix** | Making `drain` non-destructive fails "removes what it drained". Changing `prepend` to append fails the ordering assertion by name. |
| **Note** | The queue journal is written through the real filesystem into a temp directory rather than a mocked `fs`, so the atomic write-then-rename path is exercised. Mocking `fs` here would test the mock. |
| **Fixed** | 2026-08-22, branch `agent/backlog-burndown` |
| **Active** | yes |

### REG-213 — A partial agent config could silently disable what it captures

| | |
|---|---|
| **Bug class** | `silent-config-fallback` |
| **Module** | `apps/agent-desktop` |
| **Bug record** | ITEM-0033 |
| **Root cause** | The agent takes its configuration from the server and had no test over the merge. `undefined` is falsy, so an unsent boolean reads as "capability off" and an unsent interval as `NaN` — and the invasive capabilities (screenshots, clipboard, keylogging) had no test saying they are not the server's to enable. |
| **Regression test** | `apps/agent-desktop/src/main/config-manager.spec.ts` |
| **Scenario** | Every field the server omits falls back to a default and **nothing is left `undefined`**; screenshots, clipboard tracking and keylogging stay off whatever the server asks; absurd intervals and batch sizes are clamped and a non-numeric one falls back rather than becoming `NaN`; the away threshold can never fall below the idle threshold; a failed refresh keeps the last good config and leaves `lastConfigSync` unset if none succeeded. |
| **Proven to fail without the fix** | Letting `allowScreenshots` follow the server fails the refusal assertion. Removing a default fails "leaves nothing undefined", naming the path. |
| **Note** | The decision about what may be captured belongs on the machine, not to whoever can answer the config endpoint. |
| **Fixed** | 2026-08-22, branch `agent/backlog-burndown` |
| **Active** | yes |

### REG-214 — Nothing tested what leaves the employee's machine

| | |
|---|---|
| **Bug class** | `assertion-without-a-check` |
| **Module** | `apps/agent-desktop` |
| **Bug record** | ITEM-0033 |
| **Root cause** | `activity-tracker` reads the title of whatever window is in front — on a browser the page being read, elsewhere often a filename or a customer name — and had no test. Neither did the ACTIVE/IDLE/AWAY thresholds attendance is computed from. |
| **Regression test** | `apps/agent-desktop/src/main/activity-tracker.spec.ts` |
| **Scenario** | A capability that is off does not read and discard — `active-win` is **never called**, so the title never exists in the process; either the platform feature flag or the tenant tracking flag being off is enough; titles are trimmed and bounded at 300 characters; browser suffixes are stripped only when the title was captured; the state follows the thresholds at their exact boundaries; tracking off reports AWAY rather than a false ACTIVE; and an inverted threshold pair is refused rather than guessed at. |
| **Proven to fail without the fix** | Reading the window before checking the capability flags fails "does not read the window at all when both capabilities are off". |
| **Note** | The inverted-threshold case turned out stronger than expected: the tracker throws rather than clamping, and `ConfigManager` clamps upstream — so reaching the tracker inverted means the config did not come from the server. Attendance is computed from that number; a silent guess would be worse than a missing heartbeat. |
| **Fixed** | 2026-08-22, branch `agent/backlog-burndown` |
| **Active** | yes |

### REG-215 — `[object Object]` in an error path is a lost incident

| | |
|---|---|
| **Bug class** | `assertion-without-a-check` |
| **Module** | `services/api` |
| **Bug record** | ITEM-0042 |
| **Root cause** | 47 sites called `String(value)` on a value whose type does not promise a useful `toString`, producing `[object Object]`. Several were error paths carrying `error instanceof Error ? error.message : String(error ?? '')` — and the second half of that ternary is exactly the case a database driver throws and exactly the case `String` gives up on. The log line left after a production failure is the only artifact there is. |
| **Regression test** | `services/api/src/common/utils/display-string.spec.ts` |
| **Scenario** | No input produces `[object Object]` — objects, arrays, Maps, Sets, null-prototype objects, functions, symbols and invalid Dates included; a `Prisma.Decimal` renders exactly rather than as a lossy float; a messageless `Error` renders its name rather than an empty string; a circular object is described rather than throwing; and a class with its own `toString` is respected while one inheriting Object's is not. |
| **Proven to fail without the fix** | Replacing `toDisplayString` with `String` fails the first assertion on nine of its ten inputs. |
| **Note** | `Decimal` earns an explicit branch because money is where the difference costs most: `Number(decimal)` loses precision silently and `[object Object]` loses the value entirely. |
| **Fixed** | 2026-08-22, branch `agent/backlog-burndown` |
| **Active** | yes |

### REG-216 — Every modal in the tenant product leaked keyboard focus

| | |
|---|---|
| **Bug class** | `assertion-without-a-check` |
| **Module** | `apps/web` |
| **Bug record** | BUG-0043 |
| **Root cause** | `apps/web/AGENTS.md` required focus-trapped, Escape-dismissible, announced dialogs and called a hand-rolled dialog a review failure — but the shared kit contained no dialog, so the rule was unfulfillable. All 21 modal surfaces were bespoke `fixed inset-0` divs, no `<dialog>` element existed anywhere, `focus-trap` was not a dependency, Tab walked out of every one of them, and three could not be closed with Escape. `jsx-a11y` was configured nowhere in the repository. |
| **Regression test** | `scripts/check-dialogs-are-contained.mjs`, `apps/web/eslint.config.mjs` |
| **Scenario** | Every modal overlay under `apps/web/app` — a `fixed inset-0` container that is not `pointer-events-none` — either renders `<Dialog>` or spreads `useDialogBehavior()` onto its own panel; and `jsx-a11y`'s labelling, role and keyboard-interaction rules run as errors in the `lint` gate. |
| **Proven to fail without the fix** | A probe component rendering a bare `fixed inset-0` modal is named and the check exits 1. Before the fix, `jsx-a11y` reported 14 errors across 10 files, including the clickable-`<tr>` shape. |
| **Note** | The primitive is built rather than installed: `apps/web` declares four dependencies, and a headless library would be an ADR rather than a side effect of fixing an accessibility bug. `useDialogBehavior` exists so the elaborate modals — an image cropper, a mapping workspace, a monthly timesheet editor — keep their own layouts, because a redesign is not what was wrong with them. |
| **Fixed** | 2026-08-22, branch `agent/backlog-burndown` |
| **Active** | yes |

### REG-217 — A critical advisory survived three wrong reachability claims

| | |
|---|---|
| **Bug class** | `assertion-without-a-check` |
| **Module** | `package-lock.json`, `apps/agent-desktop` |
| **Bug record** | BUG-0052 |
| **Root cause** | The production graph carried a critical `tar` advisory beneath `@mapbox/node-pre-gyp@1`, and every disposition that failed had rested on a reachability claim made by inspection: `xlsx` was "export only" (the file contained a reachable `XLSX.read`), and `active-win`'s chain "does not ship in the packaged app" (the archive was extracted; all of it shipped). The upgrade was blocked by BUG-0163 — npm ignores `overrides` here because the lockfile cannot be re-resolved — and the proven fix needed a 338-package refresh that failed five of thirteen CI jobs. |
| **Regression test** | `scripts/check-production-advisories.mjs` |
| **Scenario** | `npm audit --omit=dev` reports **zero critical**; every surviving advisory has a written disposition naming the record that argues it; and a disposition matching no advisory fails, because a risk acceptance for a package that is no longer vulnerable reads as a live one. |
| **Proven to fail without the fix** | Restoring the pre-fix lockfile entries makes the check report the critical `tar` plus three undocumented highs and exit 1. |
| **Note** | The check deliberately does not evaluate reachability — it cannot, and the attempts to do so by inspection are what produced two wrong dispositions. It asserts what a machine can decide. The fix itself grafted two scratch-resolved subtrees into the lockfile instead of re-resolving: 12 versions changed against 338, verified by a real `npm ci` and an audit of the installed tree. |
| **Fixed** | 2026-08-22, branch `agent/backlog-burndown` |
| **Active** | yes |

### REG-218 — A route proxy decided a permission the API could not see

| | |
|---|---|
| **Bug class** | `divergent-duplicate-guard` |
| **Module** | `apps/web` |
| **Bug record** | BUG-0041 |
| **Root cause** | `app/api/teams/route.ts` read `permissionKeys` off the session, decided the caller could not read teams, and returned a fabricated `200 { items: [] }` **without calling the API at all**. Fail-closed, so nothing leaked — but a second source of truth on `teams.read` that the authority could never correct, audit, or even see. The rule existed only in prose and none of the 416 handlers had a test. |
| **Regression test** | `scripts/check-proxies-decide-nothing.mjs` |
| **Scenario** | No handler under `app/api/**` in web, admin or landing reads `permissionKeys`, `roleKeys`, `rolePrivileges`, an elevation check or the permission modules, and none assigns `basicSalary`, `grossEarnings`, `netPay` or `totalDeductions`. |
| **Proven to fail without the fix** | A probe handler carrying both shapes is named with both reasons and the check exits 1. 502 handlers scanned. |
| **Note** | Reading the session to *forward* it is fine and is what these handlers are for; reading it to *branch* is not. The rule is "no permission, role or elevation value is read here", not "never import auth". |
| **Fixed** | 2026-08-22, branch `agent/backlog-burndown` |
| **Active** | yes |

### REG-219 — Governed values were collected with `window.prompt`

| | |
|---|---|
| **Bug class** | `declared-but-unwired-step` |
| **Module** | `apps/web`, `apps/admin` |
| **Bug record** | ITEM-0031 |
| **Root cause** | BUG-0020 established the rule and fixed two instances; six remained, four of them collecting values that land in an audited business record. A payroll reversal *date* was free text with a pre-filled default — a control that cannot reject "next Tuesday", deciding which period an entry posts to. The admin bulk status change took free text, uppercased it, and applied it to every selected record, so a typo set a status the module does not have on as many rows as were ticked. |
| **Regression test** | `scripts/check-no-native-prompt.mjs` |
| **Scenario** | No file in web, admin or landing calls `prompt(` or `window.prompt(`; the allowlist is empty, and a stale allowlist entry fails the check. |
| **Proven to fail without the fix** | A probe component calling `window.prompt` is named and the check exits 1. 1519 files scanned. |
| **Note** | The date validator round-trips through `Date`, so `2026-02-31` is refused rather than rolling silently into March. The status control is a select over the module's own statuses, showing labels and sending values — the only honest control for a value the system already enumerates. |
| **Fixed** | 2026-08-22, branch `agent/backlog-burndown` |
| **Active** | yes |

### REG-220 — Tenant erasure had no cross-tenant survival assertion

| | |
|---|---|
| **Bug class** | `assertion-that-cannot-fail` |
| **Module** | `services/api/src/modules/tenant-control-plane` |
| **Bug record** | ITEM-0003 |
| **Root cause** | The two DB-backed erasure suites each operated on a **single** fixture tenant, so the only question they could answer was "is the tenant gone?" — which is the easy half and not the risk. Erasure walks a 242-model delete order, and every step is a `deleteMany` whose correctness rests entirely on one `tenantId` predicate. A missing predicate deletes a neighbour tenant’s rows, the transaction commits, and no existing assertion notices, because no neighbour existed to notice with. |
| **Regression test** | `services/api/test/tenant-erasure-survival.e2e-spec.ts` |
| **Scenario** | Two tenants are seeded with the same shape of data — the payroll chain whose `Payslip -> PayrollRunEmployee -> PayrollRun -> PayrollPeriod` cascade once made a tenant permanently un-erasable (fixed in `3c759ce`; see ITEM-0003), plus the full commercial chain erasure deliberately keeps (subscription, invoice, contract, support case, onboarding, order, refund, and the support-case/error-log link). One is erased through the production sequence. The neighbour is then probed across **all three collections**: every model in the delete order must hold the same number of rows, every detached model must still be present **with each cleared field still populated**, and every link-cleanup row must survive. Its tenant row must still be present and still hold employees. |
| **Proven to fail without the fix** | Two probes, each naming the exact loss. Dropping the `tenantId` predicate for one model in the delete loop reports `delete:employee: 1 → 0`. Dropping the tenant scope from the relation-scoped detach and the link cleanup reports all five of `detached:contract.subscriptionId`, `detached:supportCase.subscriptionId`, `detached:supportCase.invoiceId`, `detached:subscriptionOrder.subscriptionId` and `link:supportCaseIncident`, each `1 → 0`. |
| **Note** | Driven from the three constants rather than a hand-written list of models, because the defect it guards against is precisely "a model added to erasure later whose predicate is wrong" — a hand-listed set is a snapshot of what somebody thought about on the day and silently stops covering new models. Detachment is not deletion, so the detached models are probed per **cleared field** rather than per row count: the relation-scoped clear (`{ subscription: { tenantId } }`) can reach a neighbour's row while leaving the row itself present, and these are contracts, orders and refunds belonging to a different paying customer. Two tests guard the guard — the seed asserts every probe group is actually populated, and a final test asserts the probe count equals the plan size, so neither an empty collection nor an empty seed can make the survival assertion vacuously true. |
| **Fixed** | 2026-08-22, branch `agent/qa-verify-and-burndown` |
| **Active** | yes |

### REG-221 — Sign-out left the session live when the refresh cookie had expired

| | |
|---|---|
| **Bug class** | `assertion-without-a-check` |
| **Module** | `services/api/src/modules/auth`, `apps/admin` |
| **Bug record** | BUG-0627 |
| **Root cause** | `AuthService.logout` keyed revocation on the refresh token alone, and read it only from the cookie. The refresh cookie is the shortest-lived of the three, so the sign-out that follows a session-expired modal arrives without it — and the handler then cleared the response cookies and returned success without touching a row. The operator sees the login screen; the `PlatformRefreshToken` stays `revokedAt: null` for up to seven days. This is the second half of BUG-0009, which fixed the client so the API is called, and was closed on a test that mocked `fetch` — proving the request is *sent*, never that anything is *revoked*. |
| **Regression test** | `services/api/test/admin-logout-revocation.e2e-spec.ts` |
| **Scenario** | Six DB-backed tests over real HTTP. A sign-out carrying the session cookie but no refresh cookie revokes the persisted token; one carrying the refresh cookie still does; a session id belonging to nobody revokes nothing; a session id belonging to a different client revokes nothing. Asserted for the platform client and the tenant client, not assumed from one to the other. |
| **Proven to fail without the fix** | Two probes. Removing the revocation call fails both primary tests, admin and tenant. Removing `appClientId` from the filter fails the scope test. |
| **Note** | The scope test needed that second probe. Its first version signed out as `web` using an **admin** session id and asserted the platform token survived — which passes whatever the filter says, since admin tokens live in `PlatformRefreshToken` and a `web` logout could never reach one. It stayed green with `appClientId` deleted from the production code: an assertion that cannot fail, inside the suite written to remove exactly that. It now uses `web` and `agent-desktop` rows in the *same* table, which is the claim `appClientId` actually makes. |
| **Fixed** | 2026-08-22, branch `agent/qa-verify-and-burndown` |
| **Active** | yes |

### REG-222 — The successful tenant activation path had never been observed

| | |
|---|---|
| **Bug class** | `unobserved-happy-path` |
| **Module** | `services/api/src/modules/tenant-control-plane`, `services/api/src/modules/auth` |
| **Bug record** | ITEM-0004 |
| **Root cause** | The commercial onboarding E2E of 2026-08-15 proved five activation **gates** and never reached a successful activation, because BUG-0015 stranded the test tenant with no owner. Its verdict recorded `TENANT_PROVISIONING = FAIL`. A gate fails loudly and is the easy half to test; the path through it, post-activation owner sign-in and the eight-tab verification were all unobserved. The end of the primary commercial journey had never been seen working. |
| **Regression test** | `services/api/test/tenant-activation.e2e-spec.ts` |
| **Scenario** | Seventeen tests over real HTTP against a real database, driven as a platform operator who signed in through `POST /api/admin/auth/login`. A tenant starting at `PENDING_SETUP` is refused activation while it has no address; its owner is refused a sign-in; the address is issued and activation succeeds; the tenant row reads `ACTIVE` with the operator’s reason; the same owner now signs in; the change is in the audit trail; all eight tenant tabs serve data; and no reachability blocker is left standing. |
| **Proven to fail without the fix** | Disabling the routing gate in `changeStatus` fails three tests — the refusal, the owner sign-in refusal, and the activation itself, which then reports a tenant activated without an address. |
| **Note** | The owner sign-in is asserted as a **pair**: refused before activation, accepted after, against the same account. Asserting only the second would pass on a build where a suspended workspace never locked anybody out, which is the half with the security consequence. The activation is read back from the row rather than from the response, because a handler that echoed the requested status would satisfy the response check. The suite also pins ITEM-0079 — a tenant reaches ACTIVE with the `modules` readiness blocker still standing, so the owner signs in to a workspace with nothing to open. |
| **Fixed** | 2026-08-22, branch `agent/qa-verify-and-burndown` |
| **Active** | yes |

### REG-223 — Exchange rate resolution ignored the effective date it was given

| | |
|---|---|
| **Bug class** | `parameter-accepted-and-ignored` |
| **Module** | `services/api/src/modules/tenant-settings` |
| **Bug record** | BUG-0668 |
| **Root cause** | `resolveExchangeRate` took an `effectiveDate` and never read it: all three lookups ordered by `updatedAt` and returned the newest row, so asking for the rate *as of* a date returned today’s. `ExchangeRateSnapshot` is effective-dated by design — `effectiveDate` required, `effectiveEndDate` nullable — and none of it was queried. `convertMoney` forwards its caller’s date, so a caller who supplied the correct date still got the wrong number. ESLint had reported the unused parameter for as long as the warning baseline existed, and nobody read the output; that is what ITEM-0042 was raised about. |
| **Regression test** | `services/api/src/modules/tenant-settings/exchange-rate-effective-date.spec.ts` |
| **Scenario** | Three consecutive rate windows — 3.60 for Jan–Mar, 3.70 for Apr–Jun, 3.80 from July open-ended. A lookup on a date in each window returns that window’s rate; the default still means "now"; a date no window covers is refused with the date in the message; and `convertMoney` carries its caller’s date through. |
| **Proven to fail without the fix** | Replacing the effective-date filter with `{}` fails five of the seven tests, including all three window lookups — before the fix every one of them returned 3.80. |
| **Note** | The suite asserts on the `where` clause as well as on the returned rate. A test that stubbed one row and checked the result would pass with the filter deleted, because the stub returns that row whatever is asked for — the same "assertion that cannot fail" shape REG-220 and REG-221 were written against. Not currently reachable in production: `convertMoney` has no callers. It was a trap set for the first one, and multi-currency payroll is the caller it was waiting for. |
| **Fixed** | 2026-08-22, branch `agent/qa-verify-and-burndown` |
| **Active** | yes |

### REG-224 — PATCH my-preferences never used its DTO

| | |
|---|---|
| **Bug class** | `declared-but-unwired-step` |
| **Module** | `services/api/src/modules/tenant-settings` |
| **Bug record** | BUG-0669 |
| **Root cause** | `UpdateMyPreferencesDto` was written with `@IsString`, `@MaxLength` and `@Matches` on all four fields and never referenced; the handler took `@Body() dto: Record<string, unknown>`, which gives the global ValidationPipe no metadata to validate against. Anybody auditing the controller would see a DTO with correct rules and move on. `normalizePreferences` is an allow-list of four keys so this was never mass assignment — the exposure was the values: unbounded strings persisted as sent, and an invalid timezone reaching `new Intl.DateTimeFormat` and surfacing as a 500 where 400 is the answer. |
| **Regression test** | `services/api/src/modules/tenant-settings/my-preferences-validation.spec.ts` |
| **Scenario** | The handler’s `@Body()` parameter type is `UpdateMyPreferencesDto`, read from `design:paramtypes`. A well-formed body and an empty body are accepted; an over-long timezone, a time format that is neither 12h nor 24h, a non-string where a string is required, and a field the DTO does not declare are each refused. |
| **Proven to fail without the fix** | The parameter-type assertion fails against the previous signature — which is the defect exactly, since every rule test would pass while the endpoint stayed open. |
| **Note** | Moving the class above the controller is not cosmetic: `design:paramtypes` metadata is evaluated when the controller class is defined, so a DTO declared after it sits in a temporal dead zone. `wiring-invariants.spec.ts` caught that within seconds — "Cannot access ‘UpdateMyPreferencesDto’ before initialization" — the second time this session that the runtime invariant was right where reading was not. |
| **Fixed** | 2026-08-22, branch `agent/qa-verify-and-burndown` |
| **Active** | yes |

### REG-225 — Two independent gates decided whether a plan could be bought

| | |
|---|---|
| **Bug class** | `two-sources-of-truth` |
| **Module** | `services/api/src/modules/billing`, `services/api/src/modules/super-admin` |
| **Bug record** | BUG-0223 |
| **Root cause** | `Plan` carried two independent answers to "may a customer buy this?". `isPublic` — a boolean defaulting to **true**, with no audit columns and no operator write path at all, changeable only by a seed or by hand in the database — and `publicationStatus` (DRAFT/PUBLISHED/ARCHIVED, with `publishedAt`/`archivedAt`, applied uniformly to plan, market and price). `commercial-offer.resolver.ts` already treated publication as the authority while `billing.service.ts` and the public plan reads still read the boolean. Two gates that can disagree is worse than either alone: a plan could be PUBLISHED and `isPublic: false` — visible in the offer, refused at checkout — or DRAFT and purchasable. Nothing detected either, because each gate was correct on its own terms. |
| **Regression test** | `services/api/src/modules/billing/one-self-service-gate.spec.ts` |
| **Scenario** | No gating read of `Plan.isPublic` exists in the three files that held one; the response still exposes an `isPublic` field **derived** from publication, because the landing site consumes it; and every remaining gate compares against `PUBLISHED`. |
| **Proven to fail without the fix** | Reintroducing `if (!planPrice.plan.isPublic)` at the checkout gate fails two of the five tests and names the file and line. |
| **Note** | Reads source rather than calling the service, deliberately: the defect is *the existence of a second gate*, not the behaviour of any one call, and a behavioural test would have to guess which of the eleven read sites somebody might reintroduce. Scoped to three files and to `Plan.isPublic` alone — the unrelated `IS_PUBLIC_KEY` route decorator and `isPublicSafeReason` share a prefix and are out of scope. Safe to land in one step because production was read first: all three plans are `isPublic: true` **and** `PUBLISHED`, so no plan changed purchasability. The column is still in the schema; dropping it is a contract-phase migration. |
| **Fixed** | 2026-08-22, branch `agent/qa-verify-and-burndown` |
| **Active** | yes |

### REG-226 — The lockfile could not be regenerated, so overrides were ignored

| | |
|---|---|
| **Bug class** | `lockfile-cannot-be-regenerated` |
| **Module** | `apps/admin`, `package-lock.json` |
| **Bug record** | BUG-0163 |
| **Root cause** | `@tiptap/react@3.29.2` declares two **optional peers** with caret ranges — `@tiptap/extension-floating-menu@"^3.29.2"` and `@tiptap/extension-bubble-menu@"^3.29.2"`. A caret resolves to the newest 3.x, which is `3.30.2`, and `3.30.2` of either declares a **hard** peer on `@tiptap/pm@"3.30.2"` while the project pins `@tiptap/pm@3.29.2`. So a from-scratch resolve failed with ERESOLVE, the committed lockfile papered over it, and `overrides` in the root manifest were read and then silently discarded — npm cannot apply an override while it cannot produce a tree. |
| **Regression test** | `.github/workflows/ci.yml` — `Lockfile regenerates` step |
| **Scenario** | `npm install --package-lock-only` from the manifests alone, with no lockfile and no `node_modules`, resolves without ERESOLVE. |
| **Proven to fail without the fix** | Removing either pin reproduces `Conflicting peer dependency: @tiptap/pm@3.30.2` in an isolated probe; removing both reproduces the original ERESOLVE. |
| **Note** | Pinning the two optional peers at the family version is the minimal fix — the alternative, moving all thirteen `@tiptap` packages to 3.30.x, changes an editor the admin app depends on for no benefit. The regenerated lockfile removed **76 packages, added 0, and changed 0 versions**: every removal is an orphan of the `node-gyp@9` chain that [[BUG-0052]] upgraded away from and could not prune, because pruning needs the regeneration this record was blocking. Verified by a real `npm ci` in an isolated copy of the manifests — 1622 packages installed, all six `@tiptap` packages at 3.29.2 — rather than by reading the diff. |
| **Fixed** | 2026-08-22, branch `agent/qa-verify-and-burndown` |
| **Active** | yes |

### REG-227 — The payment re-check path had no test at all

| | |
|---|---|
| **Bug class** | `untested-privileged-path` |
| **Module** | `services/api/src/modules/billing` |
| **Bug record** | ITEM-0076 |
| **Root cause** | The operator recovery path for an order whose Stripe webhook never arrived was written, wired to a controller, given an admin panel and mounted on the runtime record page — and had **no test of any kind**. No spec referenced `PaymentRecheckService` or `recheckCustomerPayment`. It is a path that can move an order to `PAID` and set a tenant being provisioned in motion, on an operator button press. |
| **Regression test** | `services/api/src/modules/billing/services/payment-recheck.service.spec.ts` |
| **Scenario** | Seven tests over the refusals rather than the happy path: an order Stripe says is unpaid is not advanced; an unreachable Stripe does not advance anything; a paid order advances **through `confirmPayment`**, the same call the webhook makes; every outcome is audited including "we looked and they had not paid"; a customer with no recheckable order is refused; the **newest** order is selected; and `ABANDONED` and `ACTIVATED` orders are not offered. |
| **Proven to fail without the fix** | Replacing `if (diagnosis.advanced)` with `if (true)` fails both refusal tests — the unpaid case and the unreachable-provider case. |
| **Note** | The first version of this spec stubbed `stripe.retrieveCheckoutSession`, a method the service does not call — the real path is `stripe.client.checkout.sessions.retrieve(id, { expand })`. Six of the seven tests passed over a service they never reached. It was caught because the seventh, the one asserting an advance actually happens, could not pass on a stub that returned nothing. A spec whose every test passes is not evidence that it ran the code. |
| **Fixed** | 2026-08-22, branch `agent/qa-verify-and-burndown` |
| **Active** | yes |

### REG-228 — Customer emails linked to the deployment host

| | |
|---|---|
| **Bug class** | `config-encoded-as-expected` |
| **Module** | `services/api`, Render service configuration |
| **Bug record** | BUG-0714 |
| **Root cause** | Four production environment variables. `WEB_APP_URL` was the `vercel.app` deployment host, so every activation, invitation, password-reset and sign-in link the API mails a customer pointed there; `API_BASE_URL` was plain HTTP beside a correct HTTPS `API_ORIGIN`; and the per-tenant subdomain rewrite never fired because it reads `WEB_APP_PROD_ROOT_DOMAIN` while `TENANT_BASE_DOMAIN` is what was set — two variables for one concept, where setting half is not an error today. |
| **Regression test** | `services/api/src/common/config/production-tenant-url.spec.ts` |
| **Scenario** | With the four values as production now holds them, a login and an activation URL both resolve to `{slug}.ws.dijipeople.com`, neither contains `vercel.app` or `onrender.com`, both are HTTPS, and the half-configured state — root domain absent — falls back to `app.dijipeople.com` rather than a deployment host. |
| **Proven to fail without the fix** | Every assertion fails against the previous configuration; the `never emits a deployment host` cases fail on `WEB_APP_URL` alone. |
| **Note** | The reason nothing caught this is in `tenant-url.config.spec.ts`: a passing test named *"keeps production single-host login URLs on the configured app host"* asserts exactly `https://diji-people-web.vercel.app/login`. It is a true statement about the function and it encoded the misconfiguration as the expected result, so the suite agreed with production and both were wrong together. This spec is separate on purpose — those tests describe the function across configurations, these describe the one configuration DijiPeople deploys. |
| **Fixed** | 2026-08-22, Render service `srv-d7js7fqqqhas739v4i7g` |
| **Active** | yes |

### REG-229 — A document that calls itself a draft was published anyway

| | |
|---|---|
| **Bug class** | `gate-answers-the-wrong-question` |
| **Module** | `services/api/src/modules/legal` |
| **Bug record** | BUG-0767 |
| **Root cause** | All ten legal documents were published to production on 2026-08-22 carrying a banner in their own body: *"Draft — not published, and not legal advice … It has not been reviewed by a lawyer … liability, indemnity, warranties and the dispute clauses are absent."* The privacy policy of a live product told its readers not to rely on it. Nothing refused, because `findUnfilledPlaceholders` was the only content gate and it asks whether the template was **filled in** — a different question from whether the result is **fit to publish**. The documents answered the first perfectly: complete prose, no `{{PLACEHOLDER}}` anywhere. A gate that asks the wrong question passes confidently. |
| **Regression test** | `services/api/src/modules/legal/draft-self-declaration.spec.ts` |
| **Scenario** | `findDraftSelfDeclarations` flags the literal banner the seeded documents carry, on three independent signals; the old placeholder gate returns empty for the same text, which is the diagnosis; a genuinely ready document passes both; a terms of service that merely *discusses* draft contracts is not refused; and `TODO`/`TBD`/`FIXME` are caught. |
| **Proven to fail without the fix** | Run against the **live published production text** rather than a fixture: `findUnfilledPlaceholders` returns `[]` while `findDraftSelfDeclarations` returns three signals. The guard also caught its own first version — the banner is markdown hard-wrapped inside a blockquote, so "not been reviewed by a
> lawyer" never matched the raw string; content is now flattened before matching. |
| **Note** | Phrases rather than a marker, deliberately. A `<!-- DRAFT -->` convention would be cleaner and would not have worked: the banner is prose a human wrote for other humans, and the next one will be too. The bare word "draft" is excluded — a published terms of service may legitimately discuss draft contracts, and refusing over that would be the false positive that gets the check deleted. |
| **Fixed** | 2026-08-23, branch `agent/qa-verify-and-burndown` |
| **Active** | yes |

### REG-230 — A launched market keeps the country code the catalog assigns it

| | |
|---|---|
| **Bug class** | `silent-catch-of-a-real-failure` |
| **Module** | `services/api/src/modules/super-admin` |
| **Bug record** | BUG-0792 |
| **Root cause** | `MarketCountry.countryCode` is unique globally, not per market. `GCC` claimed `QA` first, so creating the Qatar market with its countries nested inside `market.create` failed on that constraint — and the `catch` treated any unique violation as benign, so the market was created with no country row and no error. `ensureMarkets` then skipped it forever after, because it existed. The repair migration is guarded on the Qatar market existing and runs during `migrate deploy`, before the seed that creates it, so on exactly the databases needing repair it matched nothing. Production served a LAUNCHED, published, QAR-priced Qatar market that resolved for nobody. |
| **Regression test** | `services/api/src/modules/super-admin/commercial-bootstrap.reconcile.spec.ts` |
| **Scenario** | Seed a database where `GCC` holds `QA` and run the bootstrap → the country row moves to the `QA` market, and the move is reported in `warnings`. Seed one with no Qatar market at all → the market is created *before* its countries, so the clash cannot lose the market. Seed one already correct → no writes, no warnings. |
| **Proven to fail without the fix** | Restoring the `if (existing) continue;` early return fails two of the four cases. |
| **Note** | The silence is the lesson, not the constraint. A unique violation means "somebody else holds this", which is only benign when the holder is who you wanted — and here it never was. `ensureMarketCountries` now reports every move rather than repairing quietly, because a silent repair of a silent breakage is how this stayed invisible for weeks. The live repair runs through `npm run repair:market-countries` rather than `seed:commercial`: the latter also reconciles prices against `pricing.catalog.ts`, which disagrees with what production is selling (Qatar QAR 8/14/22 vs QAR 15/25/36), so fixing a join table would have halved live prices as a side effect. |
| **Fixed** | 2026-08-22, `agent/site-ux-and-admin-fixes` |
| **Active** | yes |

### REG-231 — Checkout quotes the market's currency, not the first one the API listed

| | |
|---|---|
| **Bug class** | `implicit-ordering-treated-as-a-decision` |
| **Module** | `apps/landing` |
| **Bug record** | BUG-0793 |
| **Root cause** | `/public/plans` is not market-scoped: it returns every active price in every currency any market publishes, ordered by `currency` ascending. `resolveSubscribeSelection` read `plan.prices[0]` in three branches, so "the price" meant "whichever currency sorts first" — QAR ahead of USD. `subscribe-form` then preferred that over the market currency resolved server-side, so `/` and `/plans` quoted one currency and `/subscribe` another. |
| **Regression test** | `apps/landing/lib/subscribe-selection.spec.ts` |
| **Scenario** | A plan carrying both QAR and USD prices, resolved for a USD market → currency is USD and the selected price is the USD one. A `planPriceId` naming the QAR price, opened from a USD market → the plan survives and the price is re-resolved in USD rather than the link being honoured or dropped. |
| **Proven to fail without the fix** | Every case in `describe("resolveSubscribeSelection — market currency")` returns QAR without the currency filter, because QAR sorts before USD. |
| **Note** | A single-currency fixture cannot fail this way, which is why the existing nine cases all passed throughout. The fixture has to carry two currencies *in the order the API returns them* for the defect to be reachable at all. |
| **Fixed** | 2026-08-22, `agent/site-ux-and-admin-fixes` |
| **Active** | yes |

### REG-232 — A record panel is mounted only on a tab that can be reached

| | |
|---|---|
| **Bug class** | `unreachable-ui-behind-a-passing-build` |
| **Module** | `apps/admin` |
| **Bug record** | BUG-0794 |
| **Root cause** | `RuntimeRecordPage` keeps a tab only if it has form fields, a related-records panel, a timeline, or an explicit `hasRuntimePanel` allowance. `planForms()` declares a `pricing` tab and assigns no fields to it, and there is no `pricing` relationship — so the tab was filtered out of the bar, while `PlanPriceManager` stayed mounted behind `activeTab === "pricing"`, a value nothing could select. `entitlements` had been added to the allowance when the identical thing happened to it; `pricing` was not. |
| **Regression test** | `apps/admin/lib/runtime/runtime-record-panels.spec.ts` |
| **Scenario** | Parse every `moduleKey === "x" && ... activeTab === "y"` panel guard out of `runtime-record-page.tsx`, and assert each lands on a tab that survives the filter — via fields, a relationship, or by being named in the `hasRuntimePanel` expression. |
| **Proven to fail without the fix** | Restoring `(moduleKey === "plans" && tab.key === "entitlements")` fails two cases. |
| **Note** | Derived from the file rather than restating its list, so a panel added tomorrow without an allowance fails here rather than in somebody's browser. The symptom reached us as "where did the price configuration go from the Plan module" — the mildest way this class of defect gets found, and only because a person went looking for something they knew existed. |
| **Fixed** | 2026-08-22, `agent/site-ux-and-admin-fixes` |
| **Active** | yes |

### REG-233 — A column added to a module becomes visible to operators who saved table state

| | |
|---|---|
| **Bug class** | `stale-preference-shadows-the-current-definition` |
| **Module** | `apps/admin` |
| **Bug record** | BUG-0795 |
| **Root cause** | Saved table state was reapplied verbatim: `visibleColumns` from the preference became the visible set outright, so a column added to a module afterwards was absent from it and therefore hidden — permanently, silently, and only for the operators who use the screen enough to have saved anything. `normalizeColumnOrder` then appended unknown columns to the far right, so a column the definition puts first arrived last. |
| **Regression test** | `apps/admin/lib/runtime/column-preferences.spec.ts` |
| **Scenario** | A saved state that predates a column → that column is visible, at its definition position. A column present in the saved order but absent from the saved visible set → stays hidden, because that is a decision. A saved state with no `columnOrder` at all → definition visibility, since the two cases cannot be told apart. |
| **Proven to fail without the fix** | The old three-line `normalizeColumnOrder` returns `["status","createdAt","name"]` where the definition order is `["name","status","createdAt"]`; the old verbatim `visibleColumns` drops every new column. |
| **Note** | `columnOrder` is what makes this recoverable — it lists every column the saved state knew about, hidden ones included, so "never offered" and "deliberately turned off" are distinguishable. Without it the fix would have to choose between ignoring preferences and ignoring the module. |
| **Fixed** | 2026-08-22, `agent/site-ux-and-admin-fixes` |
| **Active** | yes |

### REG-234 — A list view filters on a field the list payload actually returns

| | |
|---|---|
| **Bug class** | `view-filters-on-an-absent-field` |
| **Module** | `services/api/src/modules/super-admin` |
| **Bug record** | BUG-0796 |
| **Root cause** | `PLATFORM_MODULE_VIEW_RULES` filters the "Created by me" view on `createdById`, and neither `mapTenantSummary` nor `mapPlan` returned it — only the *detail* mappers did. `readPath` returned `undefined`, which never equals the operator's id, so the tab was empty for everyone, always, on both Tenants and Plans. |
| **Regression test** | `apps/admin/lib/runtime/platform-module-capabilities.spec.ts` and the tenant list columns exercised by `apps/admin/lib/runtime/tenant-runtime-definition.spec.ts` |
| **Scenario** | For every module offering a personal view, the field that view filters on is present in the list payload the module's `apiBase` returns. |
| **Proven to fail without the fix** | Removing `createdById` from `mapTenantSummary` leaves the view rule pointing at a field no list row carries. |
| **Note** | The same shape as the "Active" view that matched a status a module never used — a control that looks functional and selects nothing. The registry comment warning about exactly this predates both, which is the useful part: knowing the class of defect did not stop the next instance. |
| **Fixed** | 2026-08-22, `agent/site-ux-and-admin-fixes` |
| **Active** | yes |

### REG-235 — A browser payload carries only properties its DTO declares

| | |
|---|---|
| **Bug class** | `client-payload-drifts-from-its-dto` |
| **Module** | `apps/admin`, `services/api/src/modules/super-admin` |
| **Bug record** | BUG-0877 |
| **Root cause** | `PlanPriceManager` built one payload for both price endpoints and included `syncToStripe`, which `CreatePlanPriceDto` declares and `UpdatePlanPriceDto` does not. The global `ValidationPipe` runs with `forbidNonWhitelisted: true`, so creating a price worked and editing one returned 400 `property syncToStripe should not exist` — every time, for every field. |
| **Regression test** | `services/api/src/modules/super-admin/plan-price-dto-contract.spec.ts` and `apps/admin/lib/runtime/plan-price-payload.spec.ts` |
| **Scenario** | Run the real validator over the exact create and update payload shapes with `forbidNonWhitelisted: true`; both pass. Add `syncToStripe` to the update body and exactly that property is rejected. Separately, parse the component's payload builders and assert every key is declared by the DTO that receives it. |
| **Proven to fail without the fix** | Restoring `syncToStripe` to the shared payload builder fails two cases in the admin spec. |
| **Note** | The lesson is not the property, it is the reachability. This defect had existed as long as the panel had, and nobody could hit it because the Pricing tab was filtered out of the record page (REG-232 / BUG-0794). Restoring the tab made the screen reachable and this the first thing an operator met. A test that a tab *renders* says nothing about whether the thing behind it *works* — the two specs here are the pair that was missing, one per side of a contract that spans two workspaces and is held together by nothing the compiler can see. |
| **Fixed** | 2026-08-23 |
| **Active** | yes |

### REG-236 — A flat price bills one subscription, not one seat above capacity

| | |
|---|---|
| **Bug class** | `divergent-duplicate-guard` |
| **Module** | `services/api/src/modules/billing` |
| **Bug record** | BUG-0901 |
| **Root cause** | The rule "how many units of `unitAmount` does this seat count bill" was written twice. `billing-seat-pricing.ts` branched on `billingModel` and was right; `SubscriptionOrderService` open-coded `seats - includedSeats` for every model. The catalogue's Starter FLAT price includes 25 seats and the wizard opens on a team size of 25, so the order priced at `12000 × (25 - 25) = 0` while Stripe — quoted the flat price with quantity 1 — charged 12,000 PKR. A PAID order recorded no revenue. |
| **Regression test** | `services/api/src/modules/billing/billing-seat-pricing.spec.ts` |
| **Scenario** | A FLAT price bills exactly one unit at, below and above its included capacity, and the figure agrees with `calculateSeatPricing().estimatedMonthlyCharge`; a PER_SEAT price still bills per seat. |
| **Proven to fail without the fix** | Replacing `resolveBillableSeats` with the old per-seat expression fails two of the three tests. |
| **Note** | Three call sites needed this rule and two had it right. The wrong one was the only one that wrote to the database, which is why the disagreement was invisible until a real order was read back and compared to the Stripe session. |
| **Fixed** | 2026-08-23, `agent/landing-e2e-go-live` |
| **Active** | yes |

### REG-237 — Tenant RBAC bootstrap writes a set as a set

| | |
|---|---|
| **Bug class** | `unbounded-render` |
| **Module** | `services/api/src/modules/permissions` |
| **Bug record** | BUG-0900 |
| **Root cause** | `bootstrapTenantRbac` wrote a tenant's **6,345** role-privilege rows with one `upsert` each, sequentially, inside the caller's interactive transaction. Prisma's default interactive transaction timeout is 5,000 ms, so self-service provisioning failed with `A query cannot be executed on an expired transaction … 5001 ms passed` *after* the card was charged; the outbox retried eight times and marked `PROVISIONING_REQUESTED` FAILED. The sibling `rolePermission` block in the same method already used a single `createMany`. |
| **Regression test** | `e2e/tests/landing-checkout-provisioning.spec.ts` |
| **Scenario** | Provisioning a tenant from a paid order completes within the transaction budget and the outbox event reaches `PROCESSED`. |
| **Proven to fail without the fix** | Observed directly: the same journey failed on the timeout before the change and succeeded after it, on the same machine. |
| **Note** | Timing-dependent, so it passed whenever the machine was fast enough. The row count scales with `SYSTEM_ROLE_PRIVILEGES` × system roles, so it was getting worse with every entity added to the matrix. |
| **Fixed** | 2026-08-23, `agent/landing-e2e-go-live` |
| **Active** | yes |

### REG-238 — A provisioned workspace is marked ready, and its URL is handed back

| | |
|---|---|
| **Bug class** | `declared-but-unwired-step` |
| **Module** | `services/api/src/modules/super-admin` |
| **Bug record** | BUG-0902 |
| **Root cause** | `OrderActivationService.markTenantReady` was defined once and called from nowhere in the repository, and `OrderActivationService` was not exported from `BillingModule`. `getOnboardingStatus` derives both the final "Finishing setup" step and the workspace link from `Tenant.readinessStatus`, so every tenant ever provisioned stayed `NOT_READY`: the buyer's progress page could never finish and never showed the address they had paid for. |
| **Regression test** | `e2e/tests/landing-checkout-provisioning.spec.ts` |
| **Scenario** | After a completed purchase, `GET /public/onboarding/:id/status` returns `state: READY`, all four steps `DONE`, and a `workspace` object carrying `hostname` and `url`. |
| **Proven to fail without the fix** | Two tenants provisioned `ACTIVE` in this run sat at `readinessStatus = NOT_READY` with `workspace: null` until the call site was added. |
| **Note** | The handler's own comment said "the customer is about to be told it is ready". Nothing told them. Same shape as the missing `PROVISIONING_REQUESTED` consumer documented at the top of that same file — the work was done and the last statement of it was not. |
| **Fixed** | 2026-08-23, `agent/landing-e2e-go-live` |
| **Active** | yes |

### REG-239 — An unknown dynamic slug returns a real 404, not a streamed 200

| | |
|---|---|
| **Bug class** | `silent-degradation` |
| **Module** | `apps/landing` |
| **Bug record** | BUG-0907 |
| **Root cause** | `apps/landing/app/loading.tsx` puts a Suspense boundary above every route, so Next flushes the shell — and commits HTTP 200 — before the dynamic segment runs. The `notFound()` already written in `legal/[slug]/page.tsx` could therefore change neither the status nor, in practice, the rendered output: `/legal/anything` answered `200 OK` and sat on the loading fallback forever. A soft 404 a crawler indexes as a real page and a visitor reads as a hang. |
| **Regression test** | `e2e/tests/landing-public-surface.spec.ts` |
| **Scenario** | `/legal/<unknown>` returns 404 and renders the not-found page; the ten real slugs still return 200 with their own titles. |
| **Proven to fail without the fix** | Run against production, which still carries the defect: the test fails there and passes against the fixed build. Root cause additionally established by experiment — removing `app/loading.tsx` alone turns the same URL into a 404. |
| **Note** | The page said the right thing and could not deliver it. Worth remembering as a property of streaming rather than of this route: any `notFound()` beneath a route-level `loading.tsx` has the same problem, so a static param list plus `dynamicParams = false` is the reliable way to refuse an unknown segment. |
| **Fixed** | 2026-08-23, `agent/landing-e2e-go-live` |
| **Active** | yes |

### REG-240 — A refused CORS origin is a decision, not a server error

| | |
|---|---|
| **Bug class** | `silent-degradation` |
| **Module** | `services/api/src/config` |
| **Bug record** | BUG-0976 |
| **Root cause** | `buildCorsOptions` refused an unlisted origin with `callback(new Error(...), false)`. The `cors` middleware treats the first argument as an error channel, not a reason, so it rethrew and `HttpExceptionFilter` rendered `500 SYSTEM_UNEXPECTED_ERROR` — then persisted a row through `ErrorLogsService`. Any unauthenticated caller could grow the production error-log table indefinitely by varying one header, and real 500s were buried under the access control working correctly. |
| **Regression test** | `services/api/src/config/cors-options.spec.ts` |
| **Scenario** | An allowed origin is permitted and a missing Origin is permitted; `http://localhost:3001`, `https://evil.example` and `not-a-url` are each refused with `allow=false` and **no Error** handed to the callback. |
| **Proven to fail without the fix** | Restoring `callback(new Error(...), false)` fails 3 of the 5 cases. Independently observed on production: the same endpoint returned 200 with no Origin and 500 with `Origin: http://localhost:3001`. |
| **Note** | Found by accident. The ITEM-0086 smoke checks send `Origin` on every request, so they reported 500 where a plain fetch reported 200 — and the discrepancy was the product, not the script. A test that happens to exercise a path nothing else does is worth more than its stated purpose. |
| **Fixed** | 2026-08-23, `agent/release-landing-e2e` |
| **Active** | yes |

### REG-241 — One runtime module, one shape for `features`

| | |
|---|---|
| **Bug class** | `contract-drift` |
| **Module** | `services/api/src/modules/platform-runtime`, `apps/admin` |
| **Bug record** | BUG-0994 |
| **Root cause** | `GET /platform-runtime/plans/:id` returned raw `PlanFeature` rows while `PATCH` on the same module returned `mapPlan`'s filtered key array. The record page holds `form.values` from whichever response arrived last and read only the row shape, so `item.featureKey` was `undefined` over strings and the whole entitlement set silently became `[]` after any save. `updatePlan` applies `featureKeys` as `deleteMany` + `create`, so the next save from that blanked state deleted every entitlement on a plan live tenants were subscribed to. |
| **Regression test** | `services/api/src/modules/platform-runtime/plan-record-shape.spec.ts`, `apps/admin/lib/runtime/plan-entitlement-keys.spec.ts` |
| **Scenario** | The runtime GET returns `features` as filtered keys, identical to the PATCH shape, and omits a disabled row. The client helper reads both shapes, drops a disabled row, keeps a bare key, and returns `[]` only for input it genuinely cannot read. |
| **Proven to fail without the fix** | Restoring `features: item.features` in `findGeneric` fails both API cases. The client case asserts a non-empty result over a `string[]`, which the previous derivation could not produce. |
| **Note** | The silence is the lesson. A shape mismatch that threw would have been found in a day; this one mapped a missing property to `""`, filtered it out, and produced a well-formed empty array that the API then honoured as an instruction. Any derivation that can turn "I did not understand this" into "the answer is none" should be written so it cannot. |
| **Fixed** | 2026-08-23, `agent/plan-pricing-admin-ux` |
| **Active** | yes |

### REG-242 — A stale Stripe product id must not brick a plan's pricing

| | |
|---|---|
| **Bug class** | `partial-error-handling` |
| **Module** | `services/api/src/modules/billing`, `services/api/src/modules/super-admin` |
| **Bug record** | BUG-0995 |
| **Root cause** | `resolveOrCreateProduct` handled a *deleted* Stripe product, which resolves to a stub carrying `deleted: true`, but not a *missing* one, for which `products.retrieve` throws `resource_missing`. The throw escaped, so the "orCreate" half never ran. Compounding it, the caller persisted a new product id only when the stored one was empty, so even after a replacement was created the plan kept pointing at the dead id — leaking a Stripe product per attempt and failing again next time. No screen could clear the id, so the plan could not be priced from Admin at all. |
| **Regression test** | `services/api/src/modules/billing/stripe-product-resolution.spec.ts` |
| **Scenario** | A missing product and a deleted product each produce a replacement; an existing product is reused with no create call; a `StripeAuthenticationError` still raises and creates nothing. |
| **Proven to fail without the fix** | Replacing the guard with `if (true) throw error` fails the missing-product case. Independently reported from production with the full 500 and stack. |
| **Note** | Two failure modes of the same external call looked alike and were not. The fourth case in the spec is the important one: swallowing every error here would mint duplicate Stripe products during an outage or on a bad key, which is worse than the failure and silent. |
| **Fixed** | 2026-08-23, `agent/plan-pricing-admin-ux` |
| **Active** | yes |

### REG-243 — A forged X-Forwarded-Host must not select a tenant workspace

| | |
|---|---|
| **Bug class** | `unsafe-client-trust` |
| **Module** | `apps/web`, `packages/config` |
| **Bug record** | ITEM-0044 |
| **Root cause** | `apps/web/proxy.ts` resolved the request hostname as `x-forwarded-host ?? host`, preferring the forwarded header unconditionally in every environment. The hostname is the entire workspace routing decision — it selects the tenant, its branding, and the origin the browser scopes session cookies to — so any caller able to reach the Next.js server without a sanitising edge could name a workspace it had not arrived on. The API had applied a trusted-proxy rule since `request-hostname.ts` was written; the tenant web app never did, and `docs/architecture/workspace-routing-and-domains.md` described the rule as a property of the system while citing only the API's spec. |
| **Regression test** | `apps/web/lib/forwarded-host.spec.ts`, `packages/config/forwarded-host.test.js` |
| **Scenario** | A request carrying `Host: app.internal` and `X-Forwarded-Host: maseer.dijipeople.com`, with neither `TRUST_PROXY_HEADERS` nor a recognised platform variable set, classifies as `CANDIDATE` with no slug — while the same hostname in `Host` classifies as `WORKSPACE_HOST`. Behind a declared proxy (`VERCEL=1`, or `TRUST_PROXY_HEADERS=true`) the forwarded host still wins, and `TRUST_PROXY_HEADERS=false` overrides the platform inference. |
| **Proven to fail without the fix** | Restoring `request.headers.get("x-forwarded-host") ?? request.headers.get("host")` in `proxy.ts` fails the two call-site cases; 9 of 11 still pass, which is the point of having them. |
| **Note** | Two lessons. First, the resolver tests alone would not have caught a reverted call site — `proxy.ts` is not importable under the app's jest config — so the suite asserts the call site from source, the same shape as `forwarded-headers.invariant.spec.ts` and for the same reason. Second, the trust rule now has one implementation in `packages/config/forwarded-host.js` rather than three; the API's own `proxy-trust.ts` already carried the argument for why ("it is one question, so it has one answer") and a third copy in `apps/web` would have been the drift it warned about. |
| **Fixed** | 2026-08-24, `agent/session-registry-closeout` |
| **Active** | yes |

### REG-244 — Seeded legal copy must be publishable, or the deploy dies

| | |
|---|---|
| **Bug class** | `doc-code-drift` |
| **Module** | `services/api/prisma/seed-legal.ts`, `services/api/src/modules/legal` |
| **Bug record** | BUG-0899, BUG-0906 |
| **Root cause** | `seed-legal.ts` wrote a `REVIEW_BANNER` reading "Draft — not published, and not legal advice … It has not been reviewed by a lawyer" into all ten documents on every run. `legal:publish --confirm` refuses to publish a document whose own text declares it a draft, and exits `2` when any document is skipped. Both scripts sit in Render's `preDeployCommand` chain, so the seed guaranteed the publish step would fail and the deploy would abort. The two were individually correct and jointly impossible — neither file was wrong on its own terms, which is why it survived review. |
| **Regression test** | `services/api/src/modules/legal/seed-legal-publishable.spec.ts`, with `draft-self-declaration.spec.ts` and `services/api/test/legal-seed.e2e-spec.ts` |
| **Scenario** | Every document `seed-legal.ts` emits is fed to the same draft self-declaration predicate `legal:publish` uses. All ten must be publishable. Restoring the review banner to any one of them fails the suite — which is the deploy failing in a test instead of in production. |
| **Proven to fail without the fix** | The suite was written against the pre-fix seed and failed on all ten documents; `draft-self-declaration.spec.ts` additionally had an assertion pinning the seed as *still* declaring drafts, which had to be flipped in `944a2d00`. |
| **Note** | The lesson is not "check the copy". It is that a **release chain of independently-correct steps can still be jointly impossible**, and nothing tested the chain as a chain. The deploy gate was the first thing to run both scripts together, and it did so in production. This is also why the record sat at `PRODUCT_DECISION` for a day: the fix genuinely needed the owner to supply real legal text, and no agent could have written it. |
| **Fixed** | 2026-08-23, `2852855e`, released in PR #42 |
| **Active** | yes |

### REG-245 — A Stripe webhook secret that is missing or the wrong kind of key

| | |
|---|---|
| **Bug class** | `silent-config-fallback` |
| **Module** | `scripts/smoke-deployment.mjs`, `services/api/src/modules/billing` |
| **Bug record** | BUG-0989 |
| **Root cause** | `STRIPE_WEBHOOK_SECRET` on the production service was not the signing secret of the endpoint delivering to it, so `constructEvent` threw on every delivery and the handler returned `400 VALIDATION_FAILED`. A Stripe webhook is the only thing that tells the platform a payment succeeded, so a customer could pay and no workspace would ever be built. Nothing in the deployment asserted the variable was set, and nothing alerted on the failure ratio — the platform recorded a 400 nobody read, Stripe recorded a failure on its own side, and the order sat awaiting payment. Three facts, no connection between them. |
| **Regression test** | `scripts/smoke-deployment.mjs` — the "Stripe webhook secret is configured" check |
| **Scenario** | With `SMOKE_REQUIRE_STRIPE_WEBHOOK_SECRET=1` and no `STRIPE_WEBHOOK_SECRET`, the suite fails and names the Stripe **Resend** step. With an API key in the variable instead of a signing secret it also fails, on the `whsec_` prefix. With a well-formed secret it passes. Without the require flag and with no secret in the process it *skips*, so a developer running the suite from a laptop is not told their machine is a broken deployment. |
| **Proven to fail without the fix** | Executed 2026-08-24, all four branches: unset-and-required → `not ok`; `sk_test_…` → `not ok` on the prefix; `whsec_…` → `ok`; absent-and-not-required → skipped with the reason printed. |
| **Note** | **This check deliberately cannot prove the secret is correct**, and that limitation is the interesting part. A request carrying a deliberately-invalid signature is rejected whether the configured secret matches the endpoint or not — which is precisely why the probe used to diagnose BUG-0989 could exonerate the code and could not confirm the fix. Only Stripe, replaying a genuinely signed delivery, answers that. So the check proves the cheaper half (a secret exists, and is the right kind of thing) and its failure message names the one action that settles the rest. A check that reports a problem it cannot finish diagnosing should say who can. The expensive half is [[ITEM-0078]]; the operator-facing gap that let this reach production is [[ITEM-0094]]. |
| **Fixed** | 2026-08-24, `agent/record-state-reconciliation` |
| **Active** | yes |

### REG-246 — An invoice whose subscription moved to `parent.subscription_details`

| | |
|---|---|
| **Bug class** | `doc-code-drift` |
| **Module** | `services/api/src/modules/billing` |
| **Bug record** | BUG-1128 |
| **Root cause** | `resolveInvoiceContext` read `invoice.subscription` and `invoice.metadata`. From Stripe API version `2026-07-29.dahlia` both moved to `invoice.parent.subscription_details`, and the invoice's own `metadata` arrives `{}`. All four resolution routes therefore missed and the handler threw `400` at a real paid invoice. The deeper cause is a **version skew nothing asserted**: `STRIPE_API_VERSION` pins outbound calls only, while Stripe renders events at the version configured on the endpoint — so the handler was written against one shape and exercised against another, and a dashboard dropdown nobody deployed could move the field. |
| **Regression test** | `services/api/src/modules/billing/invoice-subscription-resolution.spec.ts` |
| **Scenario** | The exact `dahlia` payload that failed in production (`evt_1U7WppHSlnE5ArNF2BykDaya`, PKR 12,000, `status: paid`) resolves to `sub_1U7WpoHSlnE5ArNFxsF2O6mA` and to metadata carrying `subscriptionOrderId` and `customerAccountId`. The legacy `clover` shape still resolves. Where both are present the parent wins; where neither is, the answer is `null` rather than a throw, because a one-off invoice legitimately has no subscription. |
| **Proven to fail without the fix** | Executed 2026-08-24: reverting both helpers to the flat-field-only behaviour fails **6 of 10** cases. The four that still pass are the legacy-shape and null cases — which is the point of keeping them. |
| **Note** | **Both shapes are asserted deliberately, and that is the lesson.** The instinct on finding a renamed field is to follow the rename; doing only that would have let the legacy path rot silently and produced the identical defect on the next version bump, in the other direction. The metadata helper merges rather than replaces for the same reason — an invoice may carry its own metadata *and* belong to a subscription carrying more, so they are not alternatives in principle. What remains uncovered is the skew itself: nothing yet asserts that the pinned version and the endpoint's version agree, and until something does, this class recurs on any field Stripe relocates. `payment_intent` on the same type is the next candidate. |
| **Fixed** | 2026-08-24, `agent/record-state-reconciliation` |
| **Active** | yes |

### REG-247 — Superseding a plan price must use the key the database uses

| | |
|---|---|
| **Bug class** | `divergent-duplicate-guard` |
| **Module** | `services/api/src/modules/super-admin` |
| **Bug record** | BUG-1133 |
| **Root cause** | `createPlanPrice` and `updatePlanPrice` deactivated siblings on `{planId, billingCycle, currency}` while the partial unique index is `(planId, marketId, billingCycle, currency, billingModel) NULLS NOT DISTINCT WHERE isActive`. Deactivating on a **narrower** key than the one defining a slot does not resolve a conflict — it destroys rows that were never in conflict. Saving a PER_SEAT price retired the FLAT price beside it, and with no `marketId` filter it reached across every market. Nine of Starter's twelve production prices were lost this way, silently: `updateMany` returns a count nobody reads. |
| **Regression test** | `services/api/src/modules/super-admin/plan-price-supersede-scope.spec.ts` |
| **Scenario** | The column list is read **out of the migration** and every `planPrice.updateMany` that sets `isActive: false` must constrain all of them. Object shorthand (`planId,`) counts the same as an explicit value (`marketId: null`) — the question is whether the column narrows the query at all. A fourth case pins that each supersede stays confined to `isActive: true`, because widening the key is only safe while the query remains as partial as the index. |
| **Proven to fail without the fix** | Executed 2026-08-24: restoring either `where` to its three-column form fails the suite. |
| **Note** | **This was predicted and not tested for.** [[TASK-0018]] assumption A-06 is recorded at LOW confidence saying a fake Prisma client "cannot enforce the partial unique index … Disagreeing with that index is exactly the root cause of BUG-0030". The risk was written down, accepted, and left uncovered — so the lesson is not "add a test", it is that **an assumption recorded as LOW confidence with high impact is a test that has not been written yet**. The test asserts source against migration rather than behaviour through Prisma, deliberately: the defect is a disagreement between two declarations, and comparing the declarations is the most direct proof available. It also cannot drift — change the index and the expectation changes with it. |
| **Fixed** | 2026-08-24, `agent/record-state-reconciliation` |
| **Active** | yes |

### REG-248 — A Stripe price id that no longer resolves

| | |
|---|---|
| **Bug class** | `silent-config-fallback` |
| **Module** | `services/api/src/modules/billing` |
| **Bug record** | BUG-1134 |
| **Root cause** | `verifyRecurringPrice` called `prices.retrieve` bare, so a `stripePriceId` naming a price absent from the connected Stripe account threw out of the request as a 500. The operator had no way to clear the dead id, so the price became uneditable. The id's prefix showed it came from a different account or sandbox entirely. |
| **Regression test** | `services/api/src/modules/billing/stripe-price-resolution.spec.ts` |
| **Scenario** | A `resource_missing` from `prices.retrieve` returns `valid: false` with a reason naming the price and telling the operator to re-sync, and reports the runtime mode rather than inventing a `livemode` for a price that is gone. A `StripeAuthenticationError` still propagates. A price that exists verifies unchanged. |
| **Proven to fail without the fix** | Executed 2026-08-24 against the production stack trace, reproduced with the real `StripeInvalidRequestError` shape and code. |
| **Note** | **The counterpart of `stripe-product-resolution.spec.ts`, and they should be read together.** BUG-0995 fixed the product path and left the price call eighty lines away bare — fixing one half of a symmetry is how the second half survives to be found in production. The asymmetry that remains is deliberate: the product path auto-creates a replacement, this one does not, because a price determines what customers are charged and minting one behind an operator's back is a pricing change, not a recovery. Note also that this bug was *limiting* [[BUG-1133]]'s blast radius — fixing it alone would have made that data loss easier to trigger, which is why the two landed together. |
| **Fixed** | 2026-08-24, `agent/record-state-reconciliation` |
| **Active** | yes |

### REG-249 — MAIN_CHANGE_STATUS must not blame this task for another session's merge

| | |
|---|---|
| **Bug class** | `comment-without-a-constraint` |
| **Module** | `scripts` |
| **Bug record** | BUG-1203 |
| **Root cause** | `MAIN_CHANGE_STATUS` is decided by containment — does `origin/main` contain this task's commits — so it rests entirely on which commits are called "this task's". `TASK_SHA` fell back to HEAD when no explicit task ref was given. HEAD is the task branch in a task worktree and is fine there; in the primary checkout HEAD is `develop`, which any release merges into `main`, so HEAD becomes an ancestor of `origin/main` and every task audited from that checkout is blamed for somebody else's merge. It fires hardest at the end of a task, once the task branch is deleted and the flag can no longer be passed. |
| **Regression test** | `scripts/task-sha-ref.test.mjs` |
| **Scenario** | Seven cases over the extracted decision in `scripts/lib/task-sha-ref.mjs`. Standing on the integration branch and standing on the production branch must both attribute nothing; a task worktree and a detached checkout must still attribute HEAD; an explicit task ref must win even on a shared branch, because a RELEASE task is the one kind that legitimately reports CHANGED_BY_THIS_TASK; an unreadable branch name must attribute nothing rather than guess. The last case uses non-default branch names, because the guard has to follow the resolved target — which is read from origin/HEAD, not hardcoded — and comparing against a literal main would silently unprotect a repository that renamed it. |
| **Proven to fail without the fix** | Executed 2026-08-25. Removing the integration-branch guard fails 2 cases; removing the explicit-ref short-circuit fails 1. End to end, the same checkout and baseline reported CHANGED_BY_THIS_TASK before and UNTOUCHED after, while an explicit ref pointing at a commit genuinely on origin/main still produced the blocker. |
| **Note** | **The logic was already right, and its comment already described this exact false positive** — that the first implementation "fired on its own first real run, for a task that had not touched main at all", and that "a production-safety field that cries wolf when a colleague merges is a field people learn to ignore". A fallback added later walked back into it. The lesson is not about branch names: a long correct comment guarding an untested decision is a defect waiting for its second author, and the fix that matters here is that the decision is now a testable unit rather than an inline expression. |
| **Fixed** | 2026-08-25, `agent/repo-health-task-sha` |
| **Active** | yes |

### REG-250 — A drift check must not fire when nothing drifted

| | |
|---|---|
| **Bug class** | `check-that-cries-wolf` |
| **Module** | `scripts` |
| **Bug record** | BUG-1208 |
| **Root cause** | `generate-component-index.mjs --check` compared bytes. The generator writes `\n`; Git checks the file out as `\r\n` on Windows. So it reported every line of an untouched index as drifted in every Windows worktree, while passing in CI, which runs on Linux. The provenance stamp was already excluded from the comparison for the same underlying reason — it changes on every commit — so the defect was an incomplete idea rather than a missing one. |
| **Regression test** | `scripts/index-drift.test.mjs` |
| **Scenario** | Seven cases over `scripts/lib/index-drift.mjs`. The same content in two line endings must compare equal, and symmetrically; a changed provenance stamp must not count as drift; the realistic combination — a CRLF checkout from an older commit — must not either. Balanced against three cases in the opposite direction, because normalising too much produces a check that always passes, which is indistinguishable from having no check while looking like one: a changed summary is a drift, a changed row is a drift even across line endings, and a missing committed file is a drift rather than a match. A last case asserts the body survives normalisation untouched, to stop a future tidying pass quietly widening what counts as equal. |
| **Proven to fail without the fix** | Executed 2026-08-25. Deleting the line-ending normalisation fails 2 cases; making the comparison always-equal fails 4. The first attempt at this mutation silently failed to apply and the suite stayed green — the mutation was re-run and confirmed applied before the result was believed. |
| **Note** | Found on the first fresh worktree created after the generator shipped, which is the only reason it was caught quickly: CI could never have found it, because the failure requires a checkout the runner does not produce. **A check whose result depends on the platform is not one check but two, and only one of them was ever run.** |
| **Fixed** | 2026-08-25, `agent/repo-health-task-sha` |
| **Active** | yes |

### REG-251 — An inline bootstrap script in `<head>`, hydrated against an extension's

| | |
|---|---|
| **Bug class** | `divergent-duplicate-guard` |
| **Module** | `apps/admin` |
| **Bug record** | BUG-1261 |
| **Root cause** | The theme bootstrap REG-198 added has to be inline and blocking, which is right and unchanged. It was put inside an explicit `<head>` element, which is the intuitive placement and the wrong one: React reconciles `<head>` positionally, and browser extensions insert their own `<script>` at the top of it before React loads — so React hydrated our inline script against `src="chrome-extension://…"` and reported a mismatch on every full console load. `apps/web` had already met this and moved its identical bootstrap to the first child of `<body>`, with the reason in a comment. The comment constrained the file it was in and nothing else. |
| **Regression test** | `apps/admin/lib/console-theme-bootstrap.spec.ts` |
| **Scenario** | The root layout renders no `<head>` element at all, the bootstrap `<script>` is the first thing inside `<body>`, and it precedes `{children}`. `<body>` carries `suppressHydrationWarning`, because extensions stamp attributes there too and that is not a mismatch this app can prevent. The five REG-198 assertions are unchanged around them — the placement must not be fixed by giving up the pre-paint theme. |
| **Proven to fail without the fix** | Executed 2026-08-25. Putting the script back inside `<head>` fails 2 of the 10 cases. Confirmed end to end in a real Chromium against `next dev` on the same server, with an extension-equivalent node inserted at `document_start`: the `<head>` placement logged the hydration error from the report, the `<body>` placement logged none, and with `dp-admin-theme=dark` the fixed layout still resolved `data-admin-scheme="dark"` and painted `rgb(11, 18, 32)`. |
| **Note** | **A rule that exists only as a comment in the app that learned it will be re-broken by the next app.** Both frontends render the same kind of pre-paint bootstrap, and the second one was written after the first had already paid for this. The spec is where the rule belongs, because a spec is the only form of a lesson that fails when someone disagrees with it. Note also what the fix costs: an inline `<script>` inside a React component draws a dev-only advisory that scripts rendered on the client are never executed. That is correct and harmless here — the script runs during document parse, and client navigations are `ConsolePreferencesApplier`'s job — and it is an info-level message, not the error it replaced. |
| **Fixed** | 2026-08-25, `agent/admin-theme-bootstrap-hydration` |
| **Active** | yes |

### REG-252 — An annual price quoted as a monthly charge

| | |
|---|---|
| **Bug class** | `doc-code-drift` |
| **Module** | `apps/landing` |
| **Bug record** | BUG-1302 |
| **Root cause** | The seat-total estimate on `/subscribe` was built inline in JSX and ended in the literal string `per month.` for every per-seat price. `selectedPrice` carries both `billingCycle` and `billingInterval`; neither was consulted. The string was written when only monthly per-seat prices existed and was not revisited when annual ones became sellable, so one branch came to serve two cycles. `formatBillingUnit`, ten lines away in the same module, had always branched on `billingCycle` correctly — the codebase already knew the rule and this line did not use it. |
| **Regression test** | `apps/landing/lib/plans.spec.ts` (the formatSeatTotalEstimate suite) |
| **Scenario** | Six cases over the extracted helper. An `ANNUAL` per-seat price must name a yearly period and must not contain "per month"; a `MONTHLY` one must be unchanged; the total must equal `unitAmount × seats`; a `FLAT` price returns `null` so the caller renders "Billed as one subscription."; and the period must agree with `formatBillingUnit` for both cycles — the unit caption and the total can never disagree about the period again. |
| **Proven to fail without the fix** | Executed 2026-08-25. Reintroducing the hardcoded `per month` literal fails 2 of the 13 cases in the file (`names a yearly period for an annual price`, `agrees with formatBillingUnit about the period`), then passes on restore. |
| **Note** | The number was right and the noun was wrong, which is the hardest kind of pricing defect to see: nothing looks broken, the arithmetic checks out, and the page reads fluently. It was caught by driving the purchase to Stripe and comparing — the page said `$75.00 per month`, Stripe charged `QAR 284.40 per year`. **A price is only verified when the payment processor has been asked what it will actually charge**; every check short of that agreed with itself. Note the direction: this overstated cost by 12×, so it lost sales rather than overcharging, and would never have arrived as a customer complaint. |
| **Fixed** | 2026-08-25, `agent/landing-qa-fixes` |
| **Active** | yes |

### REG-253 — A diagnostic code occupying the partner attribution slot

| | |
|---|---|
| **Bug class** | `two-writers-one-field` |
| **Module** | `apps/landing` |
| **Bug record** | BUG-1303 |
| **Root cause** | `?ref=` is the partner referral channel, captured to a 30-day first-party cookie under a deliberate first-touch-wins rule. The checkout-unavailable panel needed to pass a support diagnostic to `/contact` and reused `ref` for it, so clicking "Ask us to arrange this plan" stored `DP-CHK-01` as the visitor's referral code. The capture layer could not tell the two apart, because a diagnostic code and a partner code are syntactically identical — both satisfy `/^[A-Za-z0-9_-]{1,64}$/`. First-touch then made it permanent for thirty days: a genuine partner code arriving later was discarded. |
| **Regression test** | `apps/landing/lib/referral.spec.ts`, with `apps/landing/lib/subscribe-lock.spec.ts` |
| **Scenario** | Nine cases over `referral.ts`, plus one over the emitting link. The decisive pair: a diagnostic code must not be stored, and a genuine partner code arriving *after* one must be. A stored diagnostic must read as absent, because visitors are already carrying the poisoned cookie. Four near-miss codes (`DPCHK01`, `DP-CHK-01-X`, `DP-1`, `DPARTNER-2`) must still be accepted — a guard that ate real partner codes would be the same defect from the other side. `subscribe-lock.spec.ts` asserts the link emits `?checkout=` and no longer `?ref=`, scanning the source with comments stripped so the comment explaining the rule cannot fail the rule. |
| **Proven to fail without the fix** | Executed 2026-08-25. Disabling both guards fails 5 of the 9 cases, then passes on restore. Verified live against production before the fix: after clicking through DP-CHK-01, navigating to `/?ref=REALPARTNER99` left `dijipeople_referral=DP-CHK-01` in place. |
| **Note** | Two lessons. First, **fixing the read path mattered as much as the write path** — guarding capture alone would have stopped new poisoning and left the existing cohort attributing to an error code and still blocking partners, because capture bails whenever a code is already stored. A fix that only helps future visitors is half a fix when the cookie lasts a month. Second, this is BUG-0281 arriving from the opposite direction: that record widened referral capture to survive any entry page, correctly, and **widening a channel also widens whatever else can get into it**. The failure is silent and costs commission, so nobody reports it. |
| **Fixed** | 2026-08-25, `agent/landing-qa-fixes` |
| **Active** | yes |

### REG-254 — A degraded lookup preferred over the list compiled into the page

| | |
|---|---|
| **Bug class** | `silent-config-fallback` |
| **Module** | `apps/landing`, `services/api/src/modules/lookups` |
| **Bug record** | BUG-1304 |
| **Root cause** | `useCountryOptions` preferred the remote lookup whenever it returned anything at all (`length > 0`), on the reasoning that an empty `200` is an outage wearing a success code. True, and insufficient: production answers with **eight** countries — the `ensureDefaultCountries` defaults — because the ISO widening fetch never succeeds there and is swallowed by a deliberate `try`. Eight is greater than zero, so the lookup won and the 31 bundled countries were discarded, leaving a buyer outside those eight markets with nothing to select on a required field and no error anywhere. |
| **Regression test** | `apps/landing/lib/use-country-options.spec.ts` (the isUsableLookupList suite) |
| **Scenario** | Eight cases over the extracted predicate. An answer narrower than `BUNDLED_COUNTRIES` is rejected — including the exact production shape of 8 — while the empty and malformed answers it always rejected still are. The full ISO set of 250 is accepted, and so is an answer exactly as wide as the bundle, because widening is the reason the lookup exists and a fix that blocked it would be worse than the defect. |
| **Proven to fail without the fix** | Executed 2026-08-25. The two narrowing cases (`remote(8)` and `remote(BUNDLED_COUNTRIES.length - 1)`) fail against the old `length > 0` rule. |
| **Note** | **A fallback that only triggers on total failure does not cover partial failure, and partial failure is the common case.** The guard was written against the outage it had seen. The silent half was fixed too: the sync now logs at `error` with the surviving row count and a hint that a count near `DEFAULT_COUNTRIES.length` means the ISO set never loaded — the failure is still swallowed, because a reference lookup must not block a purchase, but it is no longer invisible. Note what this does *not* fix: production still returns eight. Pulling a 250-row reference list from a third-party host on demand from a public endpoint is the underlying problem, and seeding it is the durable answer. |
| **Fixed** | 2026-08-25, `agent/landing-qa-fixes` |
| **Active** | yes |

### REG-255 — A priority rank and an alphabetical index sharing one column

| | |
|---|---|
| **Bug class** | `two-writers-one-field` |
| **Module** | `services/api/src/modules/lookups` |
| **Bug record** | BUG-1305 |
| **Root cause** | `Country.sortOrder` had two writers filling the same numeric space and neither knew about the other. The ISO import numbered all 250 countries `0…249` by alphabetical position; `DEFAULT_COUNTRIES` separately assigned the eight priority markets `10, 20, … 80` as ranks. Under `[sortOrder asc, name asc]` the ranks landed *inside* the alphabetical range: `sortOrder: 10` was held by both Argentina and the United States, so "United States" rendered between Argentina and Armenia. Exactly eight values collided, and they were the eight markets DijiPeople sells to. The `orderBy` clause was correct throughout; the defect was entirely in the data. |
| **Regression test** | `services/api/src/modules/lookups/geographic-lookup.service.spec.ts` (the country sort bands suite) |
| **Scenario** | Four invariant cases plus a sort simulation. Every priority market must carry a negative `sortOrder`, the values must be distinct, and none may equal the unpinned default of `0` — that band separation is what makes the collision unrepresentable rather than merely absent. The simulation sorts the priority set together with two unpinned countries using the same comparison Prisma is given, and asserts the eight lead and that Argentina and Armenia are adjacent at the end. A sibling case pins that the ISO import writes `sortOrder: 0` rather than an index. |
| **Proven to fail without the fix** | Executed 2026-08-25. The pre-fix catalog values (`10 … 80`) fail all four band assertions. Verified against the real database after migration: 250 rows, the eight priority markets first in intended order, then alphabetical, `out-of-order within a band: 0`. |
| **Note** | **Assert the band, not the numbers.** A test pinning `US === -8` would pass while leaving the collision reintroducible by anyone who "tidied" the values into positives; a test asserting *negative and distinct from the unpinned default* fails on exactly that change. Two further details cost real time: `ensureDefaultCountries` used `update: {}`, so correcting the catalog would have fixed only brand-new databases — an already-seeded one keeps whatever it was created with, which is why a data migration was needed as well as a code change. And the defect was **latent in production**, which holds only the eight defaults: the moment the ISO widening is fixed (BUG-1304's durable fix), this becomes live for every buyer. A pattern dormant because the data is incomplete is not a pattern that has been fixed. |
| **Fixed** | 2026-08-25, `agent/landing-qa-fixes` |
| **Active** | yes |

### REG-256 — A reserved fictional phone number published as a `tel:` link

| | |
|---|---|
| **Bug class** | `doc-code-drift` |
| **Module** | `apps/landing` |
| **Bug record** | BUG-1306 |
| **Root cause** | One constant, `contactInfo.phone`, served two purposes: the example number shown inside the lead form's phone input, and the number published in the site footer on every page as a live `tel:` link. The value `+1 (312) 555-0184` was correct for the first — `555-0100`–`555-0199` is the block reserved so fictional numbers cannot ring anyone — and had never been replaced for the second. It was also a US number for a company that bills in QAR and whose partner form suggests `+974`, so it was wrong on region as well as reachability. |
| **Regression test** | `apps/landing/lib/published-contact-details.spec.ts` |
| **Scenario** | The published number, if there is one, must not fall in a reserved fictional range (NANP `555-01XX`, or an all-zero subscriber number). `phone` and `phonePlaceholder` must remain distinct fields — collapsing them is how the defect happened. Published emails must be real `@dijipeople.com` addresses and not `example.com`. The suite asserts the *rule*, and skips the range check when nothing is published, so supplying a real number later is not a test change. |
| **Proven to fail without the fix** | Executed 2026-08-25. Restoring `phone: "+1 (312) 555-0184"` fails the reserved-range case. |
| **Note** | The fix deliberately publishes **nothing** rather than a replacement, because engineering cannot invent a reachable number and a second placeholder would repeat the defect exactly. `phone: null` and every consumer omits its row; setting a real value restores both rows with no other change. **A placeholder is safe only where it is understood to be one** — the same string is correct in an input's `placeholder` attribute and a lie in a footer, and nothing in the type system distinguishes those two uses of a `string`. Splitting the field is what makes the difference checkable. |
| **Fixed** | 2026-08-25, `agent/landing-qa-fixes` |
| **Active** | yes |

### REG-257 — A raw enum value published as marketing copy

| | |
|---|---|
| **Bug class** | `doc-code-drift` |
| **Module** | `services/api/src/modules/tenant-settings` |
| **Bug record** | BUG-1307 |
| **Root cause** | The Timesheets entry in `TENANT_FEATURE_DEFINITIONS` read `MONTHLY timesheets, submission, and approval workflows.` — a `SCREAMING_SNAKE` enum value pasted into prose and never recased. That catalog feeds the tenant settings screens *and* the module list on the public `/features` and `/plans` pages, so the string was published to prospects. Every sibling entry in the same array is correctly sentence-cased, which is what made it read as a mistake rather than a house style. Nothing validated catalog copy. |
| **Regression test** | `services/api/src/modules/tenant-settings/catalog-copy.spec.ts` |
| **Scenario** | Six cases. No feature description, feature label or category label may contain a `SCREAMING_SNAKE` token, with an allow-list for acronyms that are legitimately upper-case in English (`HR`, `API`, `SLA`, `PDF`, …) — a rule that banned every capitalised run would fail on real copy and be deleted, which is worse than not having it. A guard case asserts the catalog is non-empty so the suite cannot pass vacuously, a named case pins the Timesheets string specifically, and every feature must carry a description of more than ten characters. |
| **Proven to fail without the fix** | Executed 2026-08-25. Restoring `MONTHLY` fails 2 of the 6 cases (the description sweep and the named Timesheets case). |
| **Note** | The product question the bug record raised — whether timesheet periods are configurable — was answered by the schema rather than deferred: `Timesheet` is keyed `@@unique([tenantId, employeeId, year, month])`, one per employee per calendar month, so "Monthly" is a fact and not a hedge. **Reviewers read the shape of a catalog entry and skim its strings**, which is how a defect this visible reached two marketing pages. The test sweeps the whole catalog rather than pinning the one string, because the next paste will be a different entry. |
| **Fixed** | 2026-08-25, `agent/landing-qa-fixes` |
| **Active** | yes |

### REG-258 — A structural assertion written as a substring scan, failed by the clock

| | |
|---|---|
| **Bug class** | `assertion-without-a-check` |
| **Module** | `services/api/test` |
| **Bug record** | BUG-1364 |
| **Root cause** | `attendance-operational.e2e-spec.ts` guards a real privacy invariant — GPS coordinates must not leak through the generic serialisation of an attendance day — with `JSON.stringify(detail)` followed by `not.toContain('25.3')` and `not.toContain('51.6')`. The payload also carries `lastReconciledAt`, generated at run time, so a reconciliation at `…:51.6`41Z puts the literal `51.6` in the string and the test fails reporting a leak that never happened. `25.3` collides identically with a `:25.3xx` timestamp. `JSON.stringify` flattened a typed object into text, and a bare decimal is not a distinctive enough string to search a whole payload for. |
| **Regression test** | `services/api/test/attendance-operational.e2e-spec.ts` |
| **Scenario** | The assertion walks the parsed `detail` object instead of serialising it, collecting every key and every numeric value at any depth. No key may match `/latitude\|longitude\|accuracy\|coordinate/i`, and no number may equal `25.3` or `51.6`. Verified against four payloads before the change was trusted: clean-with-the-colliding-timestamp (passes), a top-level leak (caught), coordinates nested in `sessions[].evidence.position` (caught), and `{lat, lng}` under renamed keys (caught). |
| **Proven to fail without the fix** | The defect proved itself: CI run `32895970738` failed on a branch that changed nothing in attendance, with `Expected substring: not "51.6"` against a payload whose only occurrence was `lastReconciledAt: "2026-08-25T20:36:51.641Z"`. Rate is about one run in three hundred — two values, each matching one second in sixty and one tenth within it. |
| **Note** | Two lessons. **A structural claim asserted as a substring is not the same claim.** The intent — no coordinate in this object — is about types and keys; `toContain` on serialised JSON is about text, and the text carries timestamps, uuids and generated names the assertion was never about. The fix is not "make the string match narrower" but "stop turning the object into a string". Second, the replacement is **stronger than what it replaced**, which is the tell that the original was under-specified rather than merely fragile: it now catches a coordinate nested at any depth and one stored under a key that does not advertise itself (`{lat, lng}`), neither of which the old scan could see. A test that is both flaky and weak usually has one cause. Worth noting how close this came to being waved through: a red build naming a privacy leak, on a branch touching only the landing site, is the failure most likely to be re-run and forgotten — and a flake that has been dismissed once has stopped being evidence about the thing it guards. |
| **Fixed** | 2026-08-25, `agent/landing-qa-fixes` |
| **Active** | yes |

### REG-259 — A public endpoint publishing rows the channel rule already excluded

| | |
|---|---|
| **Bug class** | `divergent-duplicate-guard` |
| **Module** | `services/api/src/modules/billing` |
| **Bug record** | BUG-1378 |
| **Root cause** | The commercial rule — flat pricing is internal, the public buys per seat — was implemented in `resolveCommercialOffer`, which narrows candidates by channel *before* selecting one. `/public/plans` is a second reader of the same `PlanPrice` rows and had no such filter: `where: { isActive: true }` and nothing else. So it published `SALES_ASSISTED` flat rates to anonymous callers and computed `checkoutReady` for them. One rule, two readers, and only one enforced it. The two agree in any environment where a plan has only per-seat prices, which is most of them, so nothing surfaced it until a market held both models. |
| **Regression test** | `services/api/src/modules/billing/flat-pricing-is-internal.spec.ts`, with `services/api/src/modules/billing/public-write-paths-check-the-channel.spec.ts` |
| **Scenario** | Seven cases over the shared `narrowestSalesModel` predicate, split across two files. Four sit in the same file that already guards the resolver, so both *readers* of the rule are asserted together: a `SALES_ASSISTED` price under a `SELF_SERVICE` plan is excluded, the per-seat price the visitor is meant to see is included, and every price of a `CUSTOM_ONLY` or `SALES_ASSISTED` plan is excluded even where the row says `SELF_SERVICE` — the last two pinning the narrowing direction. Three more assert the **write** path: that both public methods call the guard, and that each calls it *before* anything is created — before `openOrder` on one, before `verifyAndPersistPlanPrice` on the other. Refusing after an order exists would leave a row behind for a purchase that was declined. |
| **Proven to fail without the fix** | The defect proved itself in production. Before the change, `/api/public/plans` returned four active QAR prices for Starter — `MONTHLY FLAT 249`, `MONTHLY PER_SEAT 8`, `ANNUAL FLAT 2490`, `ANNUAL PER_SEAT 80` — while `/api/public/commercial-config`, over the same rows, returned only the two per-seat offers. The write-path half was mutation-tested on 2026-08-25: deleting both guard calls fails 4 of the 5 wiring cases. **The first version of those tests failed only 2**, because the two ordering assertions compared `indexOf` results and `-1` is less than every real index — so they passed with the guard deleted, which is the one failure they existed to catch. Both positions are now asserted present before they are compared. |
| **Note** | **Writing a rule down is not the same as applying it, and filtering a listing is not the same as refusing a request.** `flat-pricing-is-internal.spec.ts` states the policy in prose, cites the owner, and explains why the mechanism is `salesModel` rather than a `billingModel` filter — and it guarded exactly one of the two *readers* that needed it, while neither *writer* checked at all. The read fix alone would have looked complete and changed nothing an attacker cares about: `planPriceId` comes from the client, and those ids were public until the same commit that hid them. A read filter with no matching write check is a listing preference. Note also what the fix deliberately did *not* do: test `billingModel` in `getPublicPlans`. Faster to write, correct today, and a second rule for one decision — which is the defect, not the repair. The guard is also not applied to the authenticated `createCheckoutSession`: a tenant admin acting on their own subscription is a different channel, and a tenant already on a hand-negotiated plan may need to act on it. Two harms, and the milder came first — internal rates were readable without authentication for as long as the endpoint existed, and became purchasable the moment prices were synced to Stripe. |
| **Fixed** | 2026-08-25, `agent/landing-qa-fixes` |
| **Active** | yes |

### REG-260 — Checkout resolving a price on two of its three dimensions

| | |
|---|---|
| **Bug class** | `two-writers-one-field` |
| **Module** | `apps/landing` |
| **Bug record** | BUG-1369 |
| **Root cause** | A price is identified by currency, billing cycle and billing **model**. `findPlanPrice` matched the first two and returned whichever candidate `/public/plans` happened to list first — not a contract. It agreed with `/plans` only while one model per currency and cycle was sellable. When the QAR prices were synced to Stripe the flat rows became sellable too, and `/subscribe` quoted "QAR 249, billed as one subscription" against an advertised "QAR 8 per active employee": the same selection, two prices, about 25% apart at 25 seats. `resolveSubscribeSelection` had the same gap, where it decides `minimumSeats` — 1 flat against 10 per seat — so the wizard could also open on a seat count the real price would reject. |
| **Regression test** | `apps/landing/lib/plans.spec.ts` and `apps/landing/lib/subscribe-selection.spec.ts` |
| **Scenario** | Nine cases across the two. The fixture lists the FLAT price **first**, because that is the order production returned and a fixture with per-seat first would pass against the broken resolver. The published model resolves the per-seat price; a published `FLAT` model resolves the flat one just as faithfully — the fix is "honour the publisher", not "prefer per-seat"; omitting the model keeps the older positional behaviour; a model the market does not publish returns `null` rather than a substitute; and the currency dimension still refuses. On the selection side, the published model drives `minimumSeats`, and a published model with no matching price still opens the wizard rather than emptying it. |
| **Proven to fail without the fix** | Executed 2026-08-25. Removing the `billingModel` predicate from `findPlanPrice` fails 2 of the 18 cases in `plans.spec.ts`, then passes on restore. |
| **Note** | This is the *symptom*; REG-259 is the cause. Worth keeping both, because the two fixes protect different things: the backend one stops internal prices reaching the client at all, and this one stops the client picking wrongly among whatever it is given. Either alone leaves a gap — a future endpoint could leak again, or a future catalogue could legitimately hold two published models. The design choice worth remembering is where the decision lives: the frontend asks `/public/commercial-config`, the same publisher `/plans` reads, rather than deciding for itself that per-seat wins. Encoding "prefer per-seat" in `plans.ts` would have been one line and would have put a commercial policy in the one place that cannot see the configuration — which is precisely what BUG-0027 and BUG-0028 were. |
| **Fixed** | 2026-08-25, `agent/landing-qa-fixes` |
| **Active** | yes |

### REG-261 — Runtime validation answering with the exception's class name

| | |
|---|---|
| **Bug class** | `error-detail-discarded-at-the-boundary` |
| **Module** | `services/api/src/modules/platform-runtime` |
| **Bug record** | BUG-1422 |
| **Root cause** | `dto()` threw `BadRequestException(constraintStrings)`. A Nest exception constructed from a payload puts that payload on the response and sets its own `.message` to the constant string `Bad Request Exception`. The `catch` in `validate()` read `error.message`, so it returned the class's name and dropped every reason. It also never returned `errors` at all — while `runtime-record-page.tsx` reads exactly `validation.errors` as `{ field, message }[]`, so `errors ?? []` was always empty and `setErrors({})` wiped each field's error before it could render. Two independent losses on the same path: the property was flattened away in `dto()` before the throw, and the payload was ignored after it. The operator saw one toast reading "Bad Request Exception" and no indication of which field was wrong, on every metadata-driven create and edit form in the console. |
| **Regression test** | `services/api/src/modules/platform-runtime/platform-runtime.validate-contract.spec.ts` |
| **Scenario** | Four cases over the exported `readValidationFailure`, driven with the real exception `dto()` throws for a `CreateAdminLeadDto` that is missing a company name and carries a malformed work email. It must name `workEmail` among its `errors`; every entry must carry a non-empty `field` and `message`; the returned `message` must not contain `Bad Request Exception` and must mention the email — the test asserts `thrown.message` *is* that constant first, so the trap itself is pinned rather than assumed. Two further cases hold the non-validation paths: a `NotFoundException` returns its own message with empty `errors`, and a thrown string degrades to `Validation failed.` rather than throwing again inside the handler. |
| **Proven to fail without the fix** | Mutation-tested 2026-08-26. Restoring both halves of the original behaviour — `errors` hard-coded to `[]` and `message` read from `error.message` — fails 2 of the 4 cases; restoring passes all 4. An earlier draft of this spec asserted the *source text* of the service instead, and killed the mutant only through the string match, not through behaviour; it was replaced by extracting `readValidationFailure` so the contract could be executed rather than grepped. |
| **Note** | The client was already right. This is the failure mode where one half of a contract is written correctly, the other half never fills it in, and nothing fails — the form degrades to a toast instead of erroring, so it looks like a working form with an unhelpful message rather than a broken channel. Worth noting what the fix deliberately kept: `message` on the thrown payload stays the flat array of constraint strings, because existing callers and tests read it; `fieldErrors` is *added* beside it. That shape is not new — `HttpExceptionFilter.readFieldErrors` already looks for it — so every other `dto()` caller that lets the exception reach the filter now answers with the documented contract as a side effect, rather than needing its own repair. |
| **Fixed** | 2026-08-26, `agent/admin-prod-e2e-qa` |
| **Active** | yes |

### REG-262 — A worktree delete reaching through a junction into the primary checkout

| | |
|---|---|
| **Bug class** | `safe-steps-composing-into-an-unsafe-one` |
| **Module** | `scripts` |
| **Bug record** | BUG-1494 |
| **Root cause** | `git worktree remove` deletes recursively, and a Windows junction is a directory to that recursion — it walks through and destroys the target. Task worktrees here junction `node_modules` to the primary's, because a real `npm ci` per worktree costs minutes, and npm workspaces puts *its own* links inside `node_modules` (`node_modules/admin -> apps/admin`, `node_modules/api -> services/api`, `node_modules/@repo/* -> packages/*`). The delete therefore chained two levels of link into the real source tree and removed 3,072 tracked files from the user's primary checkout, plus every dependency and the generated Prisma client. Both steps were established practice on their own; nothing connected them, and the only error Git printed named the *worktree* as non-empty — never the primary. |
| **Regression test** | `scripts/validate-framework.mjs` — nine checks guarding `scripts/remove-worktree.mjs` |
| **Scenario** | The guard must refuse the primary worktree by name; refuse a path that is not a registered worktree; find reparse points without descending into one; unlink them with `rmdirSync`/`unlinkSync` rather than any recursive delete; verify the primary's sentinel paths after removing and print the `git restore .` recovery if they are gone; be reachable as `npm run worktree:remove`; and be named in both documents that teach the worktree lifecycle. |
| **Proven to fail without the fix** | Mutation-tested 2026-08-26. Deleting the primary-worktree refusal fails 1 check; replacing `rmdirSync(link)` with `rmSync(link, { recursive: true })` fails 2. Also proven positively against a live fixture: a worktree whose `node_modules` junction pointed at a directory of five files. Removed through the guard, all five survived and the worktree was gone. |
| **Note** | Two details worth keeping. First, the "never deletes recursively" check **strips comments before scanning**, because the guard names `rm -rf` in its own header in order to forbid it — without that, the sentence that prevents the mistake fails the check that enforces it, exactly as a record breaks the link check by quoting a wikilink. Second, the recovery is only safe because it was verified first: every one of the 3,072 entries was a deletion, with nothing modified, untracked or stashed, which is what made `git restore .` purely additive. Had real edits been mixed in, the same command would have destroyed them. The guard prints that recovery, but the instruction to check `git status` before running it is the part that matters. |
| **Fixed** | 2026-08-26, `agent/worktree-removal-guard` |
| **Active** | yes |

### REG-263 — A configured email provider that the delivery path cannot see

| | |
|---|---|
| **Bug class** | `two-stores-for-one-capability` |
| **Module** | `notifications` |
| **Bug record** | BUG-1595, BUG-1515 |
| **Root cause** | Platform email and tenant email were two independent configurations, and only the working one was visible. The admin Settings → Email screen writes a `PlatformSetting` row and `PlatformEmailSettingsService` reads it; the delivery path reads `EmailProviderSetting` scoped by `tenantId`, then falls back to `EMAIL_*` environment variables. Nothing in provisioning creates a tenant provider, `EMAIL_PROVIDER` was declared in `render.yaml` and never in effect on the service, and the console fallback is guarded by `NODE_ENV !== 'production'` — so production had no option left and resolution returned null. A grep for `platformSetting` under the notifications module returned nothing: the delivery path could not see the working provider even in principle. Every paid signup therefore provisioned a tenant whose owner could never sign in, while the platform delivery log looked healthy because it was exercising the half that worked. `ResolvedEmailProvider.source` had declared `'platform'` as a valid value the whole time and nothing ever produced it. |
| **Regression test** | `services/api/src/modules/notifications/email/platform-email-provider.resolver.spec.ts` — eleven checks over the resolver and the origin routing |
| **Scenario** | The stored platform row must resolve into a provider carrying source platform, with the SMTP password decrypted; a missing row and a disabled provider must each return null rather than throw, so the caller's chain continues; the resolver must never re-enter the tenant factory, because the settings service used to fall back to resolveProvider with the literal string platform as a tenant id and the two would otherwise loop. On routing: platform-originated mail must use the platform provider even when the tenant has an enabled provider of its own; tenant-originated mail must prefer the tenant's, then the platform's, then the environment; and an empty chain must resolve to null rather than throw. |
| **Proven to fail without the fix** | Mutation-tested 2026-08-27. Reverting `resolveProviderForOrigin` to the previous single call fails 4 of the 11. Proven positively against production the same day: after deploying `5762b2b2`, a resend on tenant `f959c5ff-c8f2-419b-ae79-e99989557771` returned `delivered: true` and `deliveryStatus: SENT`, and the access endpoint reported `activationEmailStatus: SENT` where it had reported `FAILED — No enabled email provider is configured.` |
| **Note** | The reporting defect and the delivery defect were separate, and fixing the first is what made the second findable. Until BUG-1515 landed, the resend endpoint returned `success: true` regardless of what delivery did and the admin panel forced a green toast, so a send that delivered nothing was indistinguishable from one that worked. The lasting guard is not only this spec but the response shape: `success`, `delivered` and `deliveryStatus` are now separate fields, so a caller cannot read the first and infer the others. |
| **Fixed** | 2026-08-27, `agent/invitation-delivery-visibility` |
| **Active** | yes |

### REG-264 — A proxy that lies about how its body is encoded

| | |
|---|---|
| **Bug class** | `helper-exists-but-is-bypassed` |
| **Module** | `apps/web` |
| **Bug record** | BUG-1649 |
| **Root cause** | Nine Next.js route handlers returned the upstream response's headers verbatim onto a body `fetch` had already decompressed, so the response advertised `Content-Encoding: br` while carrying plain JSON and the browser failed with ERR_CONTENT_DECODING_FAILED. On the tenant workspace that surfaced as a modal reading "Server unavailable" which also intercepted pointer events, leaving the first screen of a new workspace inert until dismissed, on every navigation. The correct helpers already existed — `proxyApiJsonResponse` rebuilds the response, and `proxyApiFileResponse` copies an allowlist and documents why `Content-Length` must not be among it. The same reasoning was written down for the file path and never applied to the JSON one. |
| **Regression test** | `apps/web/app/api/proxy-response-headers.spec.ts` — a structural check over every route handler |
| **Scenario** | Every `route.ts` under the app's API directory must be free of `headers: response.headers`. The test walks the tree and asserts per file, and separately asserts the walker found something, so a broken walker cannot pass for the wrong reason. |
| **Proven to fail without the fix** | Mutation-tested 2026-08-27. Reintroducing the pattern in `settings/resolved-context/route.ts` fails 1 of 418 checks. |
| **Note** | Deliberately structural rather than behavioural. The defect was not that any one route was wrong; it was the same wrong line existing nine times, so fixing nine without stopping the tenth would leave the fault in place. Two of the nine were the binary branches of catch-all proxies, including the one that streams the desktop agent installer — a corrupted download there is a plausible second cause of the auto-update failures in BUG-1551. |
| **Fixed** | 2026-08-27, `agent/invitation-delivery-visibility` |
| **Active** | yes |

### REG-265 — One empty state for two opposite conditions

| | |
|---|---|
| **Bug class** | `one-message-two-meanings` |
| **Module** | `apps/web` |
| **Bug record** | BUG-1654 |
| **Root cause** | The shared data table rendered "No records match the selected search or filters." whenever it had no rows, whether or not anything was filtered. A freshly provisioned workspace has neither records nor filters, so every list told its first customer that a search they had never run was hiding data that did not exist — next to a "Server unavailable" dialog that was also false. A healthy workspace looked broken. The same ambiguity was already documented in the opposite direction by `standard-module-views.spec.ts`, which exists because a view naming a field its module lacks filters everything out and the sentence then reads as "there is no data" rather than "this view is broken". |
| **Regression test** | `apps/web/app/components/data-table/empty-state-message.spec.ts` |
| **Scenario** | The message must differ between the filtered and unfiltered states, must not mention search or filters when nothing is applied, and must explain the filter when one is. |
| **Proven to fail without the fix** | Mutation-tested 2026-08-27. Collapsing the branch back to the single shared string fails 2 of 3. |
| **Note** | The decision is taken from the table's own `hasActiveSearchOrFilters` rather than recomputed, because a second definition of "is filtering" would disagree with the first the moment either changed — and the first already accounts for operators that filter without a value. It cannot be taken from row counts: in server mode the rows are already the filtered page. |
| **Fixed** | 2026-08-27, `agent/invitation-delivery-visibility` |
| **Active** | yes |

### REG-266 — A draft record that cannot be found again

| | |
|---|---|
| **Bug class** | `placeholder-in-an-identity-field` |
| **Module** | `billing` |
| **Bug record** | BUG-1516 |
| **Root cause** | The public wizard opens a draft order on the workspace step, because the address check is deliberately session-bound: answering "is maseer taken" should cost a rate-limited, durably recorded row. The buyer has not been asked for their e-mail at that point, so the draft's customer was written with `pending@onboarding.invalid`. That placeholder defeated both routes back to the record — `CustomerIdentityService.findExisting` matches on the contact e-mail, and `submissionHash` is built from it — so the real submission matched nothing and one signup produced two orders and two customers. Stripe could then not tell which customer had paid. |
| **Regression test** | `services/api/src/modules/billing/services/checkout-customer-record.spec.ts` |
| **Scenario** | A submission naming its draft order continues that draft's customer rather than creating a second; the placeholder identity is replaced with the real one; a genuinely returning buyer's identity is not rewritten; and an unknown or consumed draft id falls through to the identity rules unchanged. |
| **Proven to fail without the fix** | Mutation-tested 2026-08-27. Ignoring the draft id fails 2 of 16. |
| **Note** | The draft could not simply be deferred until the e-mail is known, which was the first proposal. It is load-bearing for anti-enumeration, and removing it would trade a duplicate record for an oracle over the customer base. The fix tells the server which draft this is instead of making it infer. The id is a hint and not an authorisation: it only ever selects a customer this same flow created, and an unknown id changes nothing. |
| **Fixed** | 2026-08-27, `agent/invitation-delivery-visibility` |
| **Active** | yes |

### REG-267 — A lookup id written into a column that holds a display name

| | |
|---|---|
| **Bug class** | `two-writers-one-column-two-formats` |
| **Module** | `apps/admin` |
| **Bug record** | BUG-1578 |
| **Root cause** | `CustomerAccount.country` is a plain string column holding a country name — public signup writes "Qatar", and every reader assumes a name. The admin form declared the field a lookup, and a lookup control submits the selected record's id, so a customer created there held `ec7dbbe3-1179-4465-990f-06427a4ab59f`. It surfaced on a legal document: `customerSource()` joins the address columns with `.filter(Boolean)`, and with the rest empty the counterparty's registered address *was* that value, so a generated agreement named a UUID as where the counterparty is registered. One of thirteen production customers was affected — the only one created through the admin form — and that 1-of-13 split is what localised it to the write path rather than the column or its readers. |
| **Regression test** | `apps/admin/lib/runtime/country-field-submits-name.spec.ts` |
| **Scenario** | Every country lookup declared anywhere in the platform module registry must set `submitsLabel`, so the control's option value is the country name rather than its id. The walk asserts it found fields and found country lookups before asserting anything about them. |
| **Proven to fail without the fix** | Mutation-tested 2026-08-27. Removing `submitsLabel` from `countryField` fails 9 of 11. |
| **Note** | Guarded at the registry rather than on the single field that was wrong, because the recurrence is the next country field added to the next module, and it is invisible until something renders it. A populated wrong value is worse than an empty one: nothing looks broken, and no validator objects to a well-formed string. The affected production row was corrected to "Pakistan", the country that id names. |
| **Fixed** | 2026-08-27, `agent/invitation-delivery-visibility` |
| **Active** | yes |

### REG-268 — A template paired with a source that cannot fill it

| | |
|---|---|
| **Bug class** | `unfillable-pairing-accepted` |
| **Module** | `contracts` |
| **Bug record** | BUG-1541 |
| **Root cause** | A "Tenant Provisioning & Service Order" was created from a **customer**. `customerSource()` emits the `customer.*` namespace and nothing else, setting `tenantId: undefined` explicitly, so of the template's 39 placeholders 8 resolved and 31 did not — every `tenant.*`, every `implementation.*`, every `hosting.*`, both `commercial.*`. The generated agreement rendered raw handlebars where a counterparty would read their own workspace address. `GET /api/contracts/{id}/document-fields` returned `source: null` for every unresolved one: nothing on that path had ever been going to fill them. The renderer was not at fault — it keeps an unresolved token so the signature gate can refuse the document. What was missing was anyone refusing the *pairing*, which is knowable before a byte is generated. |
| **Regression test** | `services/api/src/modules/contracts/source-fills-template.spec.ts` |
| **Scenario** | A provisioning template created from a customer is refused, and the refusal names the namespaces that cannot be filled so the operator knows which source would work. The same template from a tenant is allowed, a customer-shaped template from a customer is allowed, and a contract drafted without a template is unaffected. A separate check asserts the rule is reached from `createFromSource`. |
| **Proven to fail without the fix** | Mutation-tested 2026-08-27, twice. Removing the rule fails 3 of 7; removing only its call site — which the first version of the spec did not catch — fails 1 of 7. |
| **Note** | Two things this deliberately does not do. It considers only `required` placeholders, because optional terms are meant to be completed later and failing on those would break the progressive filling the document-fields editor exists for. And it ignores the namespaces the create step fills — `contract`, `platform`, `counterparty`, `sla`, `signature` — which the first implementation did not, and which made it refuse every creation until the spec caught it. |
| **Fixed** | 2026-08-27, `agent/invitation-delivery-visibility` |
| **Active** | yes |

### REG-269 — A link to a route that was never built

| | |
|---|---|
| **Bug class** | `link-without-a-destination` |
| **Module** | `apps/admin` |
| **Bug record** | BUG-1419 |
| **Root cause** | `monitoring-overview.tsx` linked each incident title to `${QUEUE}/${incident.id}`, composing a record route under a constant that names the *queue*. No dynamic segment has ever existed under `settings/monitoring`, so every incident title on the overview was a link to a 404. With 1,495 incidents recorded, one critical and none ever resolved, the queue could be counted and sorted and never worked — and the "0 resolved" figure read as a backlog rather than as the absence of a working tool. |
| **Regression test** | `apps/admin/app/_components/monitoring/monitoring-incident-link.spec.ts` |
| **Scenario** | The incident link must resolve to a route that exists. The guard reads the component and asserts it does not compose a record path under the queue constant, and that it carries the incident's reference number as a query instead. |
| **Proven to fail without the fix** | Mutation-tested 2026-08-27. Restoring the record-path href fails the check. |
| **Note** | The incident now opens the queue filtered to its reference number rather than a detail page, because the queue already carries the filters, the assignment and the support-case link — everything working an incident needs. A dedicated record page may still be worth building; it belongs in a plan rather than in an href. |
| **Fixed** | 2026-08-27, `agent/invitation-delivery-visibility` |
| **Active** | yes |

### REG-270 — A filter that could not see the rows it filtered

| | |
|---|---|
| **Bug class** | `convention-only-in-the-reader` |
| **Module** | `platform-monitoring` |
| **Bug record** | BUG-1420 |
| **Root cause** | `ErrorLog.severity` is a free-text column and production holds both spellings — a census found 1,466 rows lowercase against 5 uppercase. Every consumer compared against uppercase literals with strict equality, so the Critical view could see 1 of the 15 errors that existed. It did not fail and did not look empty; it answered a different question than the one asked. The readers were correct about the convention. The convention was never enforced by the schema, the DTO or the type system, and the minority spelling won by volume. |
| **Regression test** | `services/api/src/modules/platform-monitoring/incident-severity-case.spec.ts` |
| **Scenario** | The critical view must match `ERROR`, `FATAL`, `error` and `fatal`, and every level it lists must appear in both spellings — so adding a level in one case only fails. The status-driven views are asserted unchanged, since `supportStatus` is an enum and needs no case handling. |
| **Proven to fail without the fix** | Mutation-tested 2026-08-27. Reverting to uppercase-only fails 3 of 6. |
| **Note** | The duplication in the `in` list looks redundant and is load-bearing: Prisma's `in` has no insensitive mode, unlike `equals`, so the levels are listed rather than folded. The test exists partly so a tidying pass cannot quietly remove it. Normalising the column itself is the deeper fix and needs a migration — recorded on the bug, not attempted here. |
| **Fixed** | 2026-08-27, `agent/invitation-delivery-visibility` |
| **Active** | yes |

### REG-271 — A workspace root domain the app only half believed in

| | |
|---|---|
| **Bug class** | `config-value-inlined-at-build` |
| **Module** | `web` |
| **Bug record** | BUG-1644 |
| **Root cause** | Workspaces are served from `ws.dijipeople.com`, a two-label root beneath the apex, while the deployed bundle had been built with `NEXT_PUBLIC_WEB_ROOT_DOMAIN=dijipeople.com` — the value the documentation prescribed at the time. One wrong value broke the login in two directions at once. Outbound, `buildTenantPortalUrl` composed `<slug>.dijipeople.com`, which does not resolve, so the company-code step navigated to a dead host. Inbound, host resolution strips the root and requires the remainder to contain no dot, so `<slug>.ws.dijipeople.com` left `<slug>.ws` and a request arriving at the correct workspace was read as belonging to no tenant. |
| **Regression test** | `apps/web/lib/tenant-root-domain.spec.ts` |
| **Scenario** | A slug composed into a login URL must round-trip back out of the resulting hostname when the root domain matches how workspaces are actually served. Both directions are asserted, plus the apex-root pairing that shipped, plus the unconfigured case falling back to the app's own login rather than inventing a subdomain. |
| **Proven to fail without the fix** | Mutation-tested 2026-08-28. Collapsing a multi-label root to its apex fails 2 of 6. |
| **Note** | The value itself is deployment configuration and cannot be asserted from the repository; what this holds is the code's behaviour *given* the value, so multi-label roots keep working. The inbound half is the dangerous one — it degrades to "which company are you?" rather than to an error, which is why a paying customer hit it before anyone else did. The fix was a rebuild, not an edit: `NEXT_PUBLIC_*` is inlined at build time, so a correct setting and a stale bundle are indistinguishable from the browser. |
| **Fixed** | 2026-08-28, deployed as `e0aeabcd` |
| **Active** | yes |

### REG-272 — Runtime forms offered fields the API would reject

| | |
|---|---|
| **Bug class** | `generated-artifact-answers-the-wrong-question` |
| **Module** | `apps/admin`, `platform-runtime` |
| **Bug record** | BUG-1743, BUG-1742 |
| **Root cause** | `creatable`/`editable` in the runtime manifest were derived from `schema.prisma` — "is this a writable column?" — while `PlatformRuntimeService` validates the same payload against a per-module DTO with `forbidNonWhitelisted: true`. Two statements about different things, with nothing reconciling them: any writable column the DTO did not declare became an editable form field whose presence then rejected the entire request. Customers failed on `originChannel`, partners on `partnershipModel`, neither of which the operator had touched. Separately, an untouched optional lookup serialized as `""`, and `@IsOptional()` skips `null` and `undefined` and nothing else, so `@IsUUID()` ran on the empty string and blocked every lead creation. |
| **Regression test** | `apps/admin/lib/runtime/runtime-write-contract.spec.ts` |
| **Scenario** | For every module in the manifest, the payload built from an all-blank form must contain no key the module's create or update DTO would reject, and a module with no arm in the service switch must advertise nothing as writable. Plus: an untouched optional lookup is omitted on create and sent as `null` on edit. |
| **Proven to fail without the fix** | Mutation-tested 2026-08-28, both halves. Restoring `customers.originChannel.editable = true` fails 2 of 39; disabling the empty-string normalization fails 2 of 39. |
| **Note** | BUG-0220 fixed this for plans in 2026-08 and left `plan-record-form.spec.ts` behind — a test that is plans-shaped by construction and so could never fail for customers or partners. That test still passes and was deliberately left in place; the gap was not that it was wrong but that it could not fail for anyone else. This entry exists because the *shape* of the earlier fix was the problem. Deriving per-module writability also broke an aliasing nobody had written down: `modules.<key>.fields` and `models.<Model>.fields` were the same object, and the `contracts.contentHtml` projection depended on it — now written to both explicitly. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-273 — "5" was a currency

| | |
|---|---|
| **Bug class** | `validation-measures-the-wrong-property` |
| **Module** | `partners`, `packages/config`, `apps/admin` |
| **Bug record** | BUG-1425, BUG-1747 |
| **Root cause** | `currencyCode` was validated as `@IsString() @MaxLength(3)`, which measures length and calls the result a currency: `"5"`, `"X"` and `"ZZZ"` were stored, and `"NOT_A_CURRENCY"` was rejected only for being fourteen characters. The admin form made it reachable rather than theoretical — Currency was rendered as `<input type="number">` because the registry's `"currency"` control means a money *amount*, so a number was the only value an operator could enter. The reason it had never been fixed is that there was nothing to validate against: `apps/admin` listed thirty-five currencies, `services/api/src/common/reference-data` listed eight, and nothing read the API one. |
| **Regression test** | `packages/config/platform-currencies.test.js`, `services/api/src/modules/partners/dto/partner-currency.spec.ts` |
| **Scenario** | `"5"`, `"X"`, `"ZZZ"`, `""`, `"qar"` and `"NOT_A_CURRENCY"` are rejected on partner create, partner update and commission create; the currencies the platform sells in are accepted; the field stays optional. Separately, the declared `PlatformCurrencyCode` union and the runtime array must describe the same set. |
| **Proven to fail without the fix** | The API spec asserts on decorators that did not exist before this change — `@IsIn` replaced `@MaxLength(3)`, and every rejection case in it passed validation beforehand. |
| **Note** | Deliberately scoped to partners and commissions. `currencyCode` appears in roughly twenty other DTOs across tenant-facing modules, and whether a tenant may transact in a currency outside the platform's own sales catalog is a product question nobody has answered — narrowing those would reject input that is valid today. Minor units are carried per currency because they are not all 2: the Gulf dinars are 3 and JPY and KRW are 0, and the API list omitted the field entirely. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-274 — A form that refused to save and marked nothing

| | |
|---|---|
| **Bug class** | `state-computed-globally-rendered-locally` |
| **Module** | `apps/admin` runtime forms |
| **Bug record** | BUG-1746, BUG-1546 |
| **Root cause** | Validation state is computed for the whole form but rendered per field, and per-field rendering only reaches the mounted tab. Nothing lifted "this tab contains a failure" to the tab strip, so a multi-tab create form refused to save with a generic message while the visible tab looked complete and no element anywhere in the DOM carried an error marker. On the Partner form the failing field was worded differently and lived two tabs away, which made it a total dead end. |
| **Regression test** | `apps/admin/lib/runtime/blocked-save-feedback.spec.ts` |
| **Scenario** | Given failures on an unmounted tab: the tab strip reports a count for that tab, the first failing tab is identified for the switch, and the summary message names the fields rather than only asserting that some exist. Asserted against the real partner form definition, not a fixture — every required field it declares must be reachable by both the badge and the switch. |
| **Proven to fail without the fix** | The behaviour did not exist before this change; the helper and its assertions were written together. The real-form assertion is the load-bearing one — it fails for any module that declares a required field with no tab, which is the exact state that produced the dead end. |
| **Note** | The server's field errors take the same path as the client's. That half is what made BUG-1742 read as "nothing on either tab is marked as the offending field" — the API named `partnerId`, and the operator was looking at a different tab. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-275 — A direct database URL that did nothing

| | |
|---|---|
| **Bug class** | `config-key-spelled-two-ways` |
| **Module** | `packages/config`, `services/api/prisma` |
| **Bug record** | BUG-0905 |
| **Root cause** | `resolveMigrationDatabaseUrl` read `DIRECT_DATABASE_URL`; production defined `DIRECT_URL`, which is the name Prisma's own documentation and Neon's setup guide use and therefore what anyone configuring the service by hand reaches for. The override was inert, `prisma migrate deploy` ran over the pooled endpoint, and that is exactly the configuration BUG-0086 exists to prevent — a session-scoped advisory lock cannot be held through a transaction pooler, so the deploy dies on `P1002` after its lock timeout. A variable that looks set and does nothing is worse than one that is absent. |
| **Regression test** | `packages/config/database-urls.test.js` |
| **Scenario** | `DIRECT_URL` alone resolves the migration connection; `DIRECT_DATABASE_URL` wins when both are set, so an existing deployment does not silently change connection; a blank value falls through rather than blanking the connection; and a pooled url is reported under whichever name actually supplied it. |
| **Proven to fail without the fix** | The `DIRECT_URL` cases assert a code path that did not exist — the resolver read one variable name. |
| **Note** | The production half was fixed separately by the repository owner adding `DIRECT_DATABASE_URL` to the live service. Accepting both names is the durable half: it stops the next person rediscovering this through a failed deploy. Nothing here can be confirmed from the repository, because the variable's value lives on the service. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-276 — Stripe moved the billing period and nobody followed

| | |
|---|---|
| **Bug class** | `provider-api-version-skew` |
| **Module** | `billing` |
| **Bug record** | BUG-1744 |
| **Root cause** | Stripe removed `current_period_start` / `current_period_end` from the Subscription object in `2025-03-31.basil` and moved them onto each SubscriptionItem, because a subscription may hold items on different cadences. `webhook.service.ts` read only the top-level fields, so on an endpoint rendering at that version or later they are `undefined`, `fromUnix` returns null, and the platform's copy of the billing period is written as nothing — leaving renewal, dunning, the Renewal column and every MRR figure with nothing to read. Separately, `createOrUpdateSubscription` never wrote the period at all, so a subscription created through provisioning had none until an event arrived. |
| **Regression test** | `services/api/src/modules/billing/subscription-billing-period.spec.ts` |
| **Scenario** | The period resolves from the legacy top-level fields and from the item-level ones; the top level wins when a version renders both; several items resolve to the widest span rather than the first; and an absent period resolves to null rather than to a wrong instant. |
| **Proven to fail without the fix** | The item-level cases assert a read that did not exist — the type did not even declare the fields on `items.data[]`. |
| **Note** | Precisely BUG-1128 one field pair over, in the same file, which already documents why both shapes must be read: `STRIPE_API_VERSION` pins outbound calls only, and the version a webhook arrives at is set by a dashboard dropdown nobody deployed. That note was written for `invoice.parent` and the period read never got the same treatment — worth remembering that this file has now been wrong twice for one reason. The widest-span rule is deliberately more than today's single-item subscriptions need; taking `items.data[0]` would be correct now and quietly wrong later. **The two wrong production rows were not backfilled** — that needs live Stripe access, which was out of scope on 2026-08-28. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-277 — The subscription record could not name its own tenant

| | |
|---|---|
| **Bug class** | `two-endpoints-one-question` |
| **Module** | `super-admin`, `platform-runtime` |
| **Bug record** | BUG-1748 |
| **Root cause** | The runtime record path fell through to a bare `prisma.subscription.findUnique({ where: { id } })` with no `include`, while the list called `listSubscriptions()`, which loads `tenant` and `plan` and projects them. So a subscription showed Tenant, Plan and Price as "Not set" one screen after the list had rendered all three correctly. The ids were in the payload; nothing resolved them. The price had a second cause: the runtime resolves a lookup's label from `label` / `name` / `displayName` on the relation beside it, and a `PlanPrice` row carries none of those. |
| **Regression test** | `services/api/src/modules/super-admin/subscription-record-shape.spec.ts` |
| **Scenario** | The include is declared once and used by both the list and the single-record read; both project through one function; the runtime record path resolves subscriptions through it rather than bare-fetching; and the composed price label names its unit and cadence. |
| **Proven to fail without the fix** | Every assertion names a symbol that did not exist before — `SUBSCRIPTION_INCLUDE`, `projectSubscription`, `getSubscription`, `describePlanPrice`. |
| **Note** | Asserted against the source rather than executed, because the defect is *two code paths diverging* and neither path was wrong on its own terms — a behavioural test would pass against whichever one it happened to call. The price label carries the unit for a reason worth keeping: a per-seat amount rendered bare reads as the whole bill, and 300 against 25 seats is not 300. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-278 — Plans that could not be sold and could not be removed

| | |
|---|---|
| **Bug class** | `schema-default-decides-policy` |
| **Module** | `super-admin` |
| **Bug record** | BUG-1749, BUG-1755 |
| **Root cause** | `Plan.isPublic` defaults to `true`, so a plan created through the console reached the catalogue while carrying no `PlanPrice` rows — and checkout sells from `PlanPrice`. The plan advertised itself and could not be bought. With no delete route for a plan it could not be withdrawn either; two are in production in that state. Alongside it, `mapPlan()` never serialized `publicationStatus` or `salesModel`, so the Plans list — which declares Publication as its leading column — rendered an em dash for every row and could not answer the question it exists to answer. |
| **Regression test** | `services/api/src/modules/super-admin/plan-lifecycle.spec.ts` |
| **Scenario** | A plan is created `DRAFT` and writes no `isPublic` literal; a plan with no prices and no subscriptions can be deleted; one with either is refused with a message naming the reasons and pointing at deactivation; the deletion is audited; and `mapPlan` serializes the publication fields while deriving `isPublic` from publication rather than reading the column. |
| **Proven to fail without the fix** | The delete cases exercise a method that did not exist. The serialization cases assert fields the mapper did not send. |
| **Note** | The instructive part is what the *first* attempt got wrong. Writing `isPublic: false` at creation is the obvious fix and `one-self-service-gate.spec.ts` rejected it — BUG-0223 retired that boolean precisely because two gates can disagree, and `publicationStatus` is the only authority. The existing invariant caught a regression being introduced by the fix for a different bug, which is the whole argument for source-level invariants. **Not done:** the bespoke `/plans/new` page still collects legacy base prices and creates no `PlanPrice`. Retiring it needs a runtime create arm that does not exist yet. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-279 — A DELETE that did not delete

| | |
|---|---|
| **Bug class** | `verb-and-handler-disagree` |
| **Module** | `super-admin` |
| **Bug record** | BUG-1757 |
| **Root cause** | `DELETE /super-admin/promotions/:id` was wired to `deactivatePromotion()`. It answered 200 with the record body while the row stayed exactly where it was, merely inactive, and since the UI offered only Deactivate there was no way to remove a promotion at all — a mistyped one was permanent. |
| **Regression test** | `services/api/src/modules/super-admin/promotion-deletion.spec.ts` |
| **Scenario** | A promotion with no redemptions is deleted and audited; one with redemptions is refused without touching the row; the refusal names the promotion, the redemption count and deactivation as the alternative; a missing promotion 404s. |
| **Proven to fail without the fix** | `deletePromotion` did not exist; `DELETE` reached the deactivation handler. |
| **Note** | Not hard-deleting commercial records is a defensible policy and the reason this was written the way it was. It protects *history* — so the line is drawn at redemption rather than at existence: a promotion that never applied to anything discounted nothing, is referenced by no invoice, and was seen by no customer. The UI change matters as much as the route: the API's refusal message is surfaced verbatim, because a generic failure sends the operator back to the button that never worked. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-280 — A worker that was not running, and could not be seen not running

| | |
|---|---|
| **Bug class** | `deployment-config-drift` |
| **Module** | `outbox`, deployment |
| **Bug record** | BUG-0904, BUG-0767 |
| **Root cause** | `render.yaml` declares `OUTBOX_WORKER_ENABLED: "true"` and always did, but the live service was configured by hand in the dashboard and the file has never been applied. With the flag absent `OutboxDispatcherService` never polled, and `ProvisioningRequestedHandler` is an outbox consumer — by its own header the only thing that creates a self-service tenant. So on production a customer could pay and no workspace was ever built; `PROVISIONING_REQUESTED` rows simply accumulated undelivered. |
| **Regression test** | `services/api/src/app.service.spec.ts` |
| **Scenario** | `/api/health` reports `outboxWorker.enabled`, distinguishing "off" from "not reported at all". The deployment-side half is the `outbox worker is draining events` check in `scripts/smoke-deployment.mjs`, which fails when the service it points at is not draining the outbox and fails differently when the service is too old to answer. |
| **Proven to fail without the fix** | The health payload had no such field, so the smoke check fails against any deployment predating this change — including production as of 2026-08-28. |
| **Note** | The repository half was never wrong: `render.yaml` and `docs/environment-variables.md` both declared this correctly the whole time. So no unit test could have caught it, and this entry exists to record that the *only* durable guard for a config-drift class is making the drift observable from outside. The startup log already said the worker was disabled — once, at boot, into a stream nobody reads — while `/api/health` answered `status: ok` regardless. A log is not a check. **The production fix itself was made by the repository owner adding the variable, not by this branch**, and the value on the service still cannot be asserted from here; what changed is that a smoke run can now ask. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-281 — A tile that counted 11 and linked to 0

| | |
|---|---|
| **Bug class** | `one-rule-spelled-three-times` |
| **Module** | `platform-monitoring`, `apps/admin` |
| **Bug record** | BUG-1750, BUG-1420 |
| **Root cause** | "Critical" was defined in three places and they disagreed. The overview metric counted `severity: 'ERROR'` exactly; the incidents view had been taught to fold case by BUG-1420; and the tile's link filtered on `severity=CRITICAL`, a value nothing in the system stores. `severity` is free text and production holds 1,466 lowercase rows against 5 uppercase, so the metric read 11 and the screen it opened returned 0 of 0. A fourth copy sat in the admin page, translating `viewId=critical` into `severity=ERROR`. |
| **Regression test** | `services/api/src/modules/platform-monitoring/incident-severity-case.spec.ts` |
| **Scenario** | The metric and the view produce the same where clause; the severity list appears exactly once in the service source; and the metric counts through the shared definition rather than a literal. Separately, `apps/admin/lib/monitoring-overview.spec.ts` asserts the tile links to the view and *not* to a severity value. |
| **Proven to fail without the fix** | The single-definition assertion counts occurrences in the source, so restoring either duplicate fails it. The link assertion is written negatively for the same reason. |
| **Note** | BUG-1420 fixed the view and left the metric carrying the original defect — which is the shape worth remembering: a case-folding fix applied to the reader somebody noticed, and not to the reader they did not. Promoting `severity` to an enum with a normalising migration is still the deeper fix and still needs an ExecPlan; the duplicated spellings in the `in` list stay load-bearing until then. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-282 — A triage queue full of things nobody should triage

| | |
|---|---|
| **Bug class** | `expected-outcome-recorded-as-failure` |
| **Module** | `error-logs`, `platform-monitoring` |
| **Bug record** | BUG-1754 |
| **Root cause** | The ingest path recorded every non-2xx response with `supportStatus` defaulting to `NEW`, which means "a human needs to look at this". Ordinary session expiry (`401`) and requests for routes that do not exist (`404`) never did. 1,588 rows accumulated and the newest pages were almost entirely these, burying eleven critical items nobody had touched. |
| **Regression test** | `services/api/src/modules/error-logs/expected-protocol-outcome.spec.ts` |
| **Scenario** | Session `401`s and unmatched-route `404`s are classified as routine and recorded as `NOT_AN_INCIDENT`; everything else keeps its place in the queue, including `400` validation rejections, `404`s naming a record, `401`s that are not about the session, and anything unrecognised. |
| **Proven to fail without the fix** | The classifier did not exist; every row was born `NEW`. |
| **Note** | The load-bearing assertions here are the negative ones. The record proposing this fix also suggested sweeping `400` client validation rejections, and that would have been a serious mistake: BUG-1742 — no lead could be created from Platform Admin, for anyone, in production — presented as exactly that, a 400 saying `partnerId must be a UUID`. The distinction is not "did the client send something invalid" but "could the client have sent something valid". A classifier that guesses wrong in this direction hides defects; guessing wrong the other way costs one row somebody dismisses. **The existing 1,588 rows were not repaired** — `npm run repair:routine-incidents` exists, has a `--dry-run`, touches only rows still `NEW`, and has not been run against production. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-283 — Empty lists that blamed filters nobody set

| | |
|---|---|
| **Bug class** | `one-message-for-two-states` |
| **Module** | `packages/config`, `apps/admin` |
| **Bug record** | BUG-1752, BUG-1559, BUG-1558, BUG-1654 |
| **Root cause** | The admin registry composed one static string for every empty list: "Create a &lt;thing&gt; or adjust the current view and filters." It blamed filters whether or not any were set, so a new workspace told its first operator that a search they had never run was hiding data that did not exist; and it instructed the operator to create a record on invoices, payments and commissions, which offer no create control and whose records arrive from elsewhere. The same sentence also produced "Create a invoice", and the row count read "1 records". |
| **Regression test** | `packages/config/empty-list-message.test.js` |
| **Scenario** | The unfiltered message mentions neither "filter" nor "search"; the filtered message says the filters are why and offers to clear them; a create suggestion appears only where a create control exists and never on a filtered list; screens that cannot create records say where they come from; and the indefinite article is chosen by sound, so "an invoice" and "a user" and "an hour". |
| **Proven to fail without the fix** | The unfiltered assertion is written as a negative on the exact words the old string contained. |
| **Note** | BUG-1654 fixed the first half in `apps/web` and `apps/admin` kept the defect for months, which is the entire reason this lives in `packages/config` rather than in either app. Whether a list is filtered is decided by the list and passed in, never recomputed here — the table already tracks it, including operators that filter without a value. The view key is deliberately not counted as a filter: a view is where the operator navigated to, and "Resolved" being empty is good news rather than something to clear. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-284 — Destructive dialogs that did not say what they destroyed

| | |
|---|---|
| **Bug class** | `confirmation-without-information` |
| **Module** | `apps/admin` runtime |
| **Bug record** | BUG-1560, BUG-1756 |
| **Root cause** | The single-record dialog rendered the action's static `confirmTitle`, which cannot name a record. The bulk dialog said "Delete selected records?" with no count and no names, and the list showed no selection count either — so nothing anywhere on screen told the operator whether they were about to delete one row or every row on the page. |
| **Regression test** | `apps/admin/lib/runtime/destructive-confirm.spec.ts` |
| **Scenario** | A single delete names the record in its title; a bulk delete states the count, agrees in number, names up to five and counts the rest; a selection whose names are unknown is still counted; the action's own wording remains the fallback when there is nothing to name; and the list shows "n selected of m" before any dialog opens. |
| **Proven to fail without the fix** | Every assertion exercises copy that did not previously exist. The spec additionally asserts the action bar no longer renders `confirmAction.confirmTitle ?? "Confirm action"`, so reintroducing the static path fails. |
| **Note** | Five is the naming cutoff because forty names turn a dialog into a wall nobody reads, which fails the same way naming none does. The toolbar count matters more than the dialog: a dialog is a last chance, not the first place an operator should learn what they selected. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-285 — A humaniser that mangled what it touched

| | |
|---|---|
| **Bug class** | `normalisation-destroys-meaning` |
| **Module** | `apps/admin` runtime |
| **Bug record** | BUG-1753 |
| **Root cause** | The label humaniser lowercased the whole value, replaced every hyphen and underscore with a space, then capitalised each word. That turned `IT / Software` into `It / Software`, `NDA` into `Nda`, `LINKEDIN` into `Linkedin`, and a company size of `11-50` into `11 50` — in every dropdown in the console. Display only; the stored values were always correct. |
| **Regression test** | `apps/admin/lib/runtime/humanize-label.spec.ts` |
| **Scenario** | A hyphen between digits joins them and a hyphen elsewhere still separates words; words with a canonical spelling keep it; ordinary values still title-case as before; and a word that merely *contains* an acronym is not corrupted. |
| **Proven to fail without the fix** | Every range and acronym case asserts output the old implementation could not produce. |
| **Note** | Canonical spellings are a table, not a rule, because no heuristic distinguishes `linkedin` → `LinkedIn` from `facebook` → `Facebook`. The bug record preferred explicit labels over a cleverer humaniser and was right. Two things to know: `title` stays a hoisted function declaration rather than `const title = humanizeLabel`, because `definitions` is evaluated at module scope and calls it from above — a const puts it in its own temporal dead zone and every import throws, which is how this was first written and immediately caught. And six other copies of the old implementation remain elsewhere in the admin app; they render things other than lookup values and were left alone, so they are the likeliest place for this to recur. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-286 — Error modals that showed implementation detail

| | |
|---|---|
| **Bug class** | `internal-vocabulary-reaches-the-user` |
| **Module** | `apps/admin` runtime |
| **Bug record** | BUG-1549 |
| **Root cause** | class-validator composes messages as `<property> <constraint>`, and the property is the DTO's name for the field rather than the form's — so the modal read "primaryContactFirstName must be shorter than or equal to 100 characters", naming something invisible on screen. Separately, "Database constraint failed" is a Postgres failure class rendered as though it were a sentence about the form. |
| **Regression test** | `apps/admin/lib/runtime/humanize-field-error.spec.ts` |
| **Scenario** | The leading DTO property is replaced by the form's label and the constraint half is left exactly as it arrived; nothing changes without a label, or when the message does not begin with the property, or when a shorter property merely prefixes a longer one; and an internal failure class is replaced with a sentence that says where to look without naming a field it cannot identify. |
| **Proven to fail without the fix** | The substitution did not exist; messages were rendered as received. |
| **Note** | Only the name is rewritten, never the constraint — the constraint is the part that says what is actually wrong, and inventing wording for it would mean guessing at rules the frontend cannot see. `partner` must not rewrite the start of `partnerId must be a UUID`, which is why the match is anchored and word-bounded rather than a `startsWith`. The other half of this record — field errors marking the control rather than only appearing in a modal — arrived with REG-274 in the same sweep. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-287 — A form whose labels labelled nothing

| | |
|---|---|
| **Bug class** | `visible-but-not-accessible` |
| **Module** | `apps/admin` runtime forms |
| **Bug record** | BUG-1423 |
| **Root cause** | The shared runtime form drew each field's label as a `<span>` and never connected it to the control: no `<label>`, no `id`, no `name`, no `aria-label`, no `aria-labelledby`. The text was visible, so the form looked correct — axe-core rated it critical and found 28 unlabelled controls across four create screens on production. The bespoke forms on the same site were clean, which is what identified the shared component as the cause. |
| **Regression test** | `apps/admin/lib/runtime/form-accessibility.spec.ts` |
| **Scenario** | The field renders a real `<label htmlFor>` bound to a derived id; the control carries that id and a `name`; the error text is associated with `aria-describedby` and `aria-invalid`; the required marker is not the asterisk alone; composite controls point back at the label with `aria-labelledby`; and the attributes reach every control the component can return. |
| **Proven to fail without the fix** | Every assertion names an attribute the component did not render. |
| **Note** | The last assertion counts `{...a11y}` applications rather than naming control types, deliberately: a new control added without them is a new unlabelled field, which is how twenty-eight accumulated. `name` was added alongside `id` because the two do different jobs — one binds the label, the other is what autofill reads — and neither was present, so the fields were both unlabelled and un-autofillable. The second looked like a product decision and was a missing attribute. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-288 — Two shells, one mistake, on every screen

| | |
|---|---|
| **Bug class** | `shared-shell-defect` |
| **Module** | `apps/admin`, `apps/web` |
| **Bug record** | BUG-1421, BUG-1673, BUG-0073 |
| **Root cause** | Both application shells owned document structure that belongs to the page. In admin: an outer `<main>` (two landmarks on 47 of 48 audited routes), a "Control Hub" `<h1>` ahead of the page's own (two on all 48), a sidebar outside any `<nav>` landmark, no skip link, and one shared `<title>` on 47. In the tenant workspace: two constant "Workspace" `<h1>` elements before the page's own, so heading navigation announced "Workspace, Workspace, Dashboard" on the payroll screen, the settings screen and an employee's record alike. |
| **Regression test** | `apps/admin/lib/shell-landmarks.spec.ts`, `apps/web/app/components/workspace-shell-headings.spec.ts` |
| **Scenario** | Neither shell renders a `<main>` or an `<h1>`; the admin sidebar is a named `<nav>`; a skip link is the first focusable element and targets the content region; every admin route that can export `metadata` does; and the root layout composes with a title template rather than replacing. |
| **Proven to fail without the fix** | Each assertion names an element the shell rendered or an export the routes lacked. The route walk enumerates the tree rather than a fixed list, so a new page without a title fails it. |
| **Note** | PLAN-019 already warned about this shape — *"The shell is shared, so a defect in it is a defect everywhere"* — and BUG-0073 was the same class, one sidebar class name failing contrast on every screen. Screen-by-screen review keeps missing these because every screen looks equally wrong, so they read as the design rather than as a defect; that is the argument for asserting against the shell rather than against pages. Both records asked to be fixed together because it is the only way the convention ends up shared, and the two specs now hold the same invariants in the same shape. **Two known gaps:** three admin routes are client components, which Next forbids from exporting `metadata`, so they keep the default title; and the duplicate `<main>` the tenant audit reported is not reachable from the source — no shell renders one and no shared layout nests one — so it stays open pending the browser pass that found it. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-289 — A password field nothing could name

| | |
|---|---|
| **Bug class** | `layout-decision-removes-a11y` |
| **Module** | `apps/web` |
| **Bug record** | BUG-1655 |
| **Root cause** | The tenant login renders its password control with `label=""` and the shared field shell's label span suppressed via `[&>span]:hidden`, so the visible "Password" text could sit in the heading row beside the "Forgot password?" link. That left the input with no accessible name and no `autocomplete`: a screen reader announced it as unlabelled and password managers were not told what it was. The email field beside it had both. |
| **Regression test** | `apps/web/app/components/ui/login-field-accessibility.spec.ts` |
| **Scenario** | The password control carries an explicit accessible name and `current-password`; the identifier field carries `username` so the two are recognisable as a credential pair; the duplicate visible label stays hidden; and `TextField` declares and actually applies both props. |
| **Proven to fail without the fix** | `TextField` accepted neither prop, so the login could not have passed them. |
| **Note** | The defect is a layout decision with an accessibility consequence, which is why the fix is a name rather than a second visible label — showing the label twice would undo the layout the hiding exists for. The record asked for the admin login to be checked on the theory the two forms shared a starting point; it already binds both labels and declares `current-password`, and that is now asserted rather than merely noted. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-290 — An onboarding that could not start, and a message that lied about why

| | |
|---|---|
| **Bug class** | `one-string-two-purposes`, `wrong-relation-target` |
| **Module** | `super-admin` |
| **Bug record** | BUG-1547, BUG-1545 |
| **Root cause** | Two defects on the same screen. The prerequisite failure message reused the checklist's positively-phrased labels — "Onboarding prerequisites are not complete: Industry is selected, Company size is selected" — so the header contradicted the list and the list stated the inverse of the truth. Separately, `CustomerOnboarding.onboardingOwnerUserId` is declared `User?` while the create expression fell back to `customer.assignedToUserId` (declared `PlatformUser?`) and then `actor.platform?.id`, so every admin-created onboarding was rejected by the foreign key. |
| **Regression test** | `services/api/src/modules/super-admin/onboarding-prerequisites.spec.ts` |
| **Scenario** | Every prerequisite check declares both a positive `label` and a negative `unmet`; the failure message is built from `unmet`; no pair is identical bar capitalisation. And the onboarding create writes neither `actor.platform?.id` nor `customer.assignedToUserId` into the owner column. |
| **Proven to fail without the fix** | The `unmet` phrasings did not exist, and the message was built from `label`. Both fallbacks are asserted by name because each was independently wrong. |
| **Note** | The evaluation was never wrong in either case, which is what made both hard to see: `missingItems` filtered correctly and the owner expression was reaching for a sensible value. **BUG-1545 is only half fixed and deliberately so.** Two reads in the same file filter this column by `actor.platform?.id`, so the *relation* is what is wrong — and this codebase's own convention agrees, since `CustomerAccount` carries platform owners as `PlatformUser` and tenant owners as `User`. Repointing a foreign key is a migration with a data question behind it, and the record asks for that to be settled rather than patched. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-291 — A plan that could not be sold, and a page size that could not be asked for

| | |
|---|---|
| **Bug class** | `picker-offers-what-the-write-path-rejects`, `constraint-protects-nothing` |
| **Module** | `super-admin`, `partners` |
| **Bug record** | BUG-1555, BUG-1554 |
| **Root cause** | The customer form's plan picker listed every plan, including `QA00591` — inactive, zero prices — and selecting it produced a customer whose preferred plan nothing could bill, because checkout and subscription pricing both read `PlanPrice`. Tenant creation checked only that a plan id was non-null. Separately, `PartnerQueryDto.pageSize` carried `@Min(10)` while the admin console asked its own API for `pageSize=5`, so the screen 400'd on every load — a client and a server disagreeing about a constraint entirely internal to the product. |
| **Regression test** | `services/api/src/modules/super-admin/onboarding-prerequisites.spec.ts` |
| **Scenario** | Tenant creation refuses a plan that is inactive or carries no active price, and names which of the two applies. `listPlans` narrows on `?sellable=true` and the two preferred-plan pickers request it. |
| **Proven to fail without the fix** | The plan guard did not exist — a non-null id was the whole check. |
| **Note** | The picker filter and the write-path check are deliberately both present and are not the same thing: a plan id still arrives from a lead's `agreedPlanId`, from a customer chosen before the plan was retired, or straight from the API, and only the second of the two can refuse those. The guard counts *active* prices, because a plan carrying only inactive ones is as unsellable as a plan carrying none. On the page size: a census found `Min(1)` twice and `Min(10)` once, so the floor was an outlier rather than a rule — and a lower bound on a page size protects nothing, while the upper bound stays because an unbounded page is a way to ask for the whole table. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-292 — Dates and owners that were confidently wrong

| | |
|---|---|
| **Bug class** | `sentinel-rendered-as-data` |
| **Module** | `apps/admin` |
| **Bug record** | BUG-1556, BUG-1550 |
| **Root cause** | An absent contract date arrives as an epoch-zero timestamp rather than as null, so it passed every `!value` guard and rendered as `Jan 1, 1970` — two of seven contracts on production showed it. Separately, a lead record displayed `Test User` in its header and `Not set` in its body at the same time, with nothing on screen to say which was right. |
| **Regression test** | `apps/admin/lib/runtime/lookup-disambiguation.spec.ts` and the epoch guards in `apps/admin/lib/formatters.ts` and the runtime date display |
| **Scenario** | A timestamp of exactly zero renders as absent rather than as 1 January 1970, in the shared formatters and in the runtime record page's inline formatter. The lead's owner field names its relation explicitly, the same way the record header does. |
| **Proven to fail without the fix** | The epoch check did not exist; `!value` cannot see a truthy zero-date. |
| **Note** | Exactly zero, not "before a cutoff": midnight UTC on 1 January 1970 to the millisecond is the sentinel, and any other 1970 date is somebody's real data. **BUG-1550's divergence was not reproduced.** Both surfaces read `assignedToUserId`, `readRelationLabel` already composes the name shape the leads repository selects, and from the source they should agree — so the cause is a payload difference the source does not show. What changed is that the body now names the relation explicitly rather than deriving it, removing the one structural difference between the two routes. If a lead still shows two owners, the payloads are where to look. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-293 — Pickers offering entries nobody could choose between

| | |
|---|---|
| **Bug class** | `identical-options` |
| **Module** | `apps/admin` runtime lookups |
| **Bug record** | BUG-1553 |
| **Root cause** | Lookup labels resolve from the first available name field, so two platform users called "Taimur Israr" — genuinely different accounts — rendered identically, as did two contract templates sharing an agreement name. The operator had to guess, and a wrong guess assigns the wrong owner or generates from the wrong template. The email was on the record all along and was never reached. |
| **Regression test** | `apps/admin/lib/runtime/lookup-disambiguation.spec.ts` |
| **Scenario** | Two entries sharing a label gain a disambiguator — email, then code, key, contract number, version, status, and a shortened id last; a unique label is left alone; a disambiguator identical to the label is skipped; and the option count is unchanged. |
| **Proven to fail without the fix** | Labels were emitted verbatim, so duplicates stayed duplicates. |
| **Note** | Applied only where a label actually repeats. Showing everyone's email beside their name would clutter every picker in the console to solve a problem that exists in two of them, and a disambiguator is only informative when there is something to disambiguate from. The shortened id is a poor answer and is last for that reason — but two identical entries with no way to choose between them is a worse one. The template half of the record asked whether the duplication is display-level or two real records; this makes them distinguishable either way, and which *should* be selectable remains the product decision the record identifies. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-294 — Commercial terms published by not touching a field

| | |
|---|---|
| **Bug class** | `dangerous-default`, `filtered-zero-reads-as-nothing` |
| **Module** | `super-admin`, `apps/admin` |
| **Bug record** | BUG-1751, BUG-1745 |
| **Root cause** | The promotions form defaulted Scope to GLOBAL, pre-filled Percent off with 10, and created the promotion Active — so one press of "Add promotion" published a 10% discount against every eligible subscription, with no draft state and no confirmation. Separately, every money aggregate on the Control Hub filters on `currency: reportingCurrency`, and production's stored default said PKR while every payment was QAR: "Collected revenue PKR 0" against two succeeded payments totalling QAR 160, indistinguishable on the screen from having earned nothing. |
| **Regression test** | `services/api/src/modules/super-admin/promotion-safety.spec.ts` |
| **Scenario** | Promotions are created inactive while an explicit `isActive: true` still wins; the form starts with no scope and no amount and refuses to submit without either; an explicit Activate exists and confirms, treating a global scope as the dangerous case. And the dashboard payload reports the currencies its filter excluded, with amounts. |
| **Proven to fail without the fix** | Every assertion names a default that was the opposite, or a field that did not exist. |
| **Note** | Two things deliberately not done, both because they are decisions rather than changes. Whether Stripe or the platform is authoritative for discounts is a product question, so `syncToStripe` stays opt-in — changing the default would be answering it by implementation. And which currency the business reports in is a commercial decision that QA explicitly declined to make; the dashboard now says what it excludes rather than having its filter changed. The honest zero is the fix; the right number is somebody's call. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-295 — A policy that could not permit what the page needed

| | |
|---|---|
| **Bug class** | `config-value-cannot-work` |
| **Module** | `packages/config`, `apps/landing` |
| **Bug record** | BUG-1822, BUG-1424, BUG-0040 |
| **Root cause** | The landing deployment's API base URL is configured with an `http://` scheme, so its generated CSP permits `http://api.dijipeople.com/api` while admin and the tenant app permit `https://`. A browser on an HTTPS page blocks a plain-http request as mixed content before CSP is consulted, so the `connect-src` entry matches nothing — harmless while the policy is report-only, and a live break for checkout, plan browsing and lead capture the moment anyone enforces it. |
| **Regression test** | `packages/config/security-headers.test.js` |
| **Scenario** | `securityHeadersForApp` refuses a non-loopback `http://` API origin, failing the build rather than emitting a policy that cannot work. `http://localhost` and `http://127.0.0.1` stay allowed, because those are the correct local answers. |
| **Proven to fail without the fix** | No such check existed; the origin was passed through verbatim into the header. |
| **Note** | Found while *measuring* BUG-1424's premise rather than trusting it — that record says the admin console serves no CSP at all, and all three apps do. The measurement is what turned up the scheme difference, which is an argument for checking a stale-looking record rather than closing it on the strength of the code. The guard follows the stance `packages/config` already takes on loopback URLs: a development value reaching production is a configuration error raised at build time, not something a customer discovers. It cannot assert the deployed value — that lives on the service (see BUG-0905) — only refuse to build a policy around a bad one. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-296 — Values formatted against whatever was running them

| | |
|---|---|
| **Bug class** | `runtime-locale-crosses-the-hydration-boundary` |
| **Module** | `apps/admin`, `apps/landing` |
| **Bug record** | BUG-1557, BUG-1561 |
| **Root cause** | Next server-renders a client component on a UTC server and hydrates it in the viewer's browser. Two formatters on the admin dashboard were told to use the runtime's own locale — `new Intl.NumberFormat(undefined, ...)` for every money figure, and `toLocaleString()` for the refresh timestamp — so server and client produced different markup and React logged error #418 on every load. Separately, the signup verification step had no way back, so a buyer who mistyped their admin email could not correct it: the code went to the wrong address and the only route forward was to restart all five wizard steps. |
| **Regression test** | `apps/admin/lib/dashboard-hydration.spec.ts` |
| **Scenario** | Money formats against a fixed locale; the refresh timestamp carries `suppressHydrationWarning`; dates go through the shared formatter; and no client component in `apps/admin` formats against an explicit `undefined` locale. |
| **Proven to fail without the fix** | Each assertion names the exact construct that was there. |
| **Note** | The two halves of the dashboard fix are deliberately opposite and the distinction is the interesting part. An *amount* is the same number everywhere, so it is made deterministic. A *"refreshed at" timestamp* is only useful in the viewer's own time, so the difference is real and is declared rather than removed — formatting it deterministically would have silenced the warning by showing every operator the server's clock, which is a worse screen with a cleaner console. The last assertion walks every client component rather than the dashboard, because the dashboard was unlikely to be the only place somebody reached for a runtime-locale formatter. On BUG-1561: the API already invalidated the previous code on reissue, so the only thing missing was the way back — worth checking before adding invalidation nobody needed. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-297 — A workspace address advertised to a buyer that did not resolve

| | |
|---|---|
| **Bug class** | `config-value-inlined-at-build` |
| **Module** | `apps/landing` |
| **Bug record** | BUG-1544, BUG-1644, BUG-0017 |
| **Root cause** | Step 2 of public signup told a prospective customer that `<slug>.dijipeople.com` "is available". Workspaces are served from `<slug>.ws.dijipeople.com`, which the success page and the provisioned tenant both used — so the only wrong statement was the one made while the buyer was deciding to purchase. The value is build-time configuration: `apps/landing/lib/env.ts` reads the canonical resolver, and the deployed bundle had been built with an apex root domain. |
| **Regression test** | `apps/landing/lib/workspace-address.spec.ts` |
| **Scenario** | The landing app resolves the tenant base domain through `getPlatformDomainConfig` and never reads the variable itself; the availability check sends a slug rather than a composed hostname; and the wizard renders the domain it was given rather than composing a second one. |
| **Proven to fail without the fix** | Nothing here fails today — production was measured correct on 2026-08-28 and no code changed. These assertions hold the *property* that kept it correct, and fail for the local env lookup or the hardcoded domain that would break it. |
| **Note** | Closed on measurement rather than on a code read, which is the point worth keeping: `curl -s https://www.dijipeople.com/subscribe` returns `tenantBaseDomain":"ws.dijipeople.com"`. The rebuild that fixed BUG-1644 (REG-271) carried this with it. The record's own caution was worth taking and turned out reassuring — it asks to confirm what the availability check queries before changing any display string, because a check against the wrong hostname would keep answering "available" for the right one. It sends only the slug, so it was never affected. `NEXT_PUBLIC_*` and build-time values are inlined into the bundle, so a corrected variable and a stale bundle look identical from a browser; the evidence above is the *served* value, which is what a customer sees. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-298 — One deletion rule, for one record and for many

| | |
|---|---|
| **Bug class** | `record-outlived-its-fix`, `capability-too-coarse` |
| **Module** | `leads`, `platform-runtime`, `super-admin`, `partner-experience` |
| **Bug record** | BUG-0018, BUG-0015, BUG-0016 |
| **Root cause** | `PlatformRuntimeService.remove` and `PlatformRuntimeService.bulkDelete` were two independent switch statements over the same modules, so a module could be deletable one way and not the other. They drifted exactly that way: `leads` was in one and absent from the other, and an operator who selected leads and pressed Delete got `400 Bulk delete is not available for this module` while deleting the same leads one at a time worked. The console offered an action the API refused. |
| **Regression test** | `services/api/src/modules/platform-runtime/generic-delete.spec.ts` |
| **Scenario** | Both paths are driven for all seventeen runtime modules and must answer identically — the six deletable ones delete through each, and the eleven retention-refused ones refuse through each with one message. Deletion requires module write **and** a platform admin role, on both paths. |
| **Proven to fail without the fix** | Mutation-tested, not assumed. Reintroducing the leads exclusion in the bulk case fails two assertions; dropping the admin half of the authorization union fails a third. The suite is deliberately written so the *easy* fix — adding a missing `leads` arm to a second list — would not satisfy it: what is asserted is that both paths agree for every module, which a second list cannot guarantee. |
| **Note** | This entry was rewritten on 2026-08-28, the same day it was written. Its first version guarded the *opposite* behaviour — bulk lead delete withdrawn, decided by the repository owner that morning — and the owner reversed that decision hours later after the production 400 above, asking for bulk delete to be generic across the console. The behaviour it guards changed; the class of defect it guards against did not, and is now stated more strongly. BUG-0015 and BUG-0016, recorded here originally, were both verified as already fixed with no code written; BUG-0015's convergence under a real replay is **still untested** — a local database was offered and the credential supplied did not authenticate. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-299 — A rejection that would not say what it rejected

| | |
|---|---|
| **Bug class** | `one-error-code-for-several-causes` |
| **Module** | `billing` |
| **Bug record** | BUG-1543 |
| **Root cause** | The Stripe webhook endpoint can refuse a request for three unrelated reasons — no signature header, a body that is not a raw Buffer, or a signature that does not verify — and all three surface as `400 VALIDATION_FAILED`, because that is the error catalog's code for every 400. Two of Stripe's callbacks were rejected during a real payment on production and working out which had fired meant log archaeology. |
| **Regression test** | `services/api/src/modules/billing/webhook-rejection-diagnostics.spec.ts` |
| **Scenario** | Each refusal logs `stripe.webhook.rejected` naming which check refused it; the signature verification failure is caught rather than propagating uncaught; neither the payload nor the signature is logged; and the response to Stripe is unchanged. |
| **Proven to fail without the fix** | There was no logging on this path at all, and the verification failure had no `try` around it. |
| **Note** | This is diagnosability, not a fix — **the cause of BUG-1543 is still unknown** and that record stays deferred. The three checks need opposite responses, which is why flattening them mattered: a missing header is a caller that is not Stripe, a non-Buffer body is raw-body middleware not running for the route, and a failed verification is either the wrong webhook secret or a forgery. What is deliberately absent from the log is the body and the signature — one is a customer's payment detail, the other is a credential, and neither is the thing worth knowing. Also worth keeping: the rejection raised "a customer may have paid without us knowing", which is the right thing to be paged for. A change that silenced the alert rather than explaining the rejection would have been the wrong one. |
| **Fixed** | 2026-08-28 (diagnostics only) |
| **Active** | yes |

### REG-300 — A screen that did not look like the product it was in

| | |
|---|---|
| **Bug class** | `styling-for-a-mode-that-does-not-exist`, `parallel-shell` |
| **Module** | `apps/admin` |
| **Bug record** | BUG-1883 |
| **Root cause** | `/app-releases` and `/agent-rollout` were hand-rolled pages with their own `<main>` and Tailwind `dark:` variants. The admin console has no dark mode to switch those on, so on a light product the empty state rendered as a dark navy panel and the heading floated outside the standard page header. Both were also top-level Operations entries, a click apart, despite being two halves of one decision. |
| **Regression test** | `apps/admin/lib/desktop-agent-settings.spec.ts` |
| **Scenario** | The screen is on `SettingsShell` and declares no `<main>` of its own; neither it nor its manager component contains a `dark:` variant; both tabs exist on one screen; `/app-releases` and `/agent-rollout` still resolve, as redirects; and the sidebar no longer lists either while the settings index does. |
| **Proven to fail without the fix** | Every assertion names something that was there — the `<main>`, the `dark:` classes, the two sidebar hrefs — or something that was not: the settings route and the redirects. |
| **Note** | The `dark:` classes are the part worth remembering. They were not dead code that happened to be unused; they were the *cause*, because Tailwind emits them and something upstream matched. A variant for a mode a product does not have is not harmless, and nothing else in this app carries one. The redirects are deliberate: the URLs are in bookmarks and in the release runbook, and a move should not read as a deletion. |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-301 — An action offered where it could only be refused

| | |
|---|---|
| **Bug class** | `screen-never-asked-what-the-api-knew` |
| **Module** | `apps/admin`, `billing` |
| **Bug record** | BUG-1884 |
| **Root cause** | `PaymentRecheckPanel` rendered on every customer record with "Re-check payment with Stripe" as a primary button. On a customer whose payment had succeeded and whose workspace was provisioned, the most prominent action on the record existed only to answer `NO_RECHECKABLE_ORDER`. The API had always known better — `findRecheckableOrder` restricts to `PENDING_PAYMENT`, `PAID` and `FAILED` — but no read exposed it, so the frontend had nothing to branch on. |
| **Regression test** | `services/api/src/modules/billing/services/payment-state.spec.ts` |
| **Scenario** | Every `SubscriptionOrderStatus` maps to exactly one of `CONFIRMED`, `AWAITING`, `FAILED` or `NONE`; a customer with no order is `NONE`; a confirmed state carries the amount, currency, paid date and order number the panel prints; and no unsettled status can report `CONFIRMED`. |
| **Proven to fail without the fix** | The method did not exist. The last assertion is the load-bearing one for future edits: a settled panel on an unsettled payment tells an operator to stop chasing money that has not arrived. |
| **Note** | `DRAFT`, `ABANDONED` and `CANCELLED` all map to `NONE` deliberately — they are neither settled payments nor payments in flight, and a customer record is not the place to explain the absence of a payment nobody started. One decision is not tested here because it is a judgement rather than a mapping: when the state probe itself fails, the panel falls back to showing the full re-check UI. Withholding an operator's tool because a status request failed is worse than showing a button that might answer "nothing to do". |
| **Fixed** | 2026-08-28 |
| **Active** | yes |

### REG-302 — The tenant product could not be opened by a test at all

| | |
|---|---|
| **Bug class** | `surface-with-no-observer` |
| **Module** | `apps/web`, `e2e`, `ci` |
| **Bug record** | BUG-1950, BUG-1951 |
| **Root cause** | `apps/web` — 254 pages, 207 client components, the application every employee of every tenant uses — was never opened by a test. Its `jest.config.js` is `testEnvironment: node` with no jsdom, so nothing in it could be tested through a DOM by any mechanism, and CI started `dev:landing` and `dev:admin` but never port 3001. `playwright.config.ts` defined a `web` base URL that no test consumed, so the config read as though it were in scope; `fixtures/environment.ts` probed landing, admin and api only, so its absence could not even produce a skip. It was invisible rather than missing. |
| **Regression test** | `e2e/tests/flow-h-tenant-sign-in.spec.ts`, `e2e/tests/flow-i-growth-modules.spec.ts`, `e2e/tests/flow-j-tenant-settings.spec.ts` |
| **Scenario** | Sign-in, the workspace picker, and the authenticated shell; every module the Growth plan entitles; settings and the three entitlements that live inside it. Each screen must reach an **intentional state** — its own content or a refusal that explains itself with an error reference — never a blank page and never an unhandled client exception. A list screen shows only the signed-in tenant's records. CI starts `dev:web` and polls 3001, and `probeTenantProduct` reports its absence. |
| **Proven to fail without the fix** | It could not run without the fix: there was no way to reach the app. Its value was immediate rather than theoretical — three defects on the first real run, and a reproduction for a fourth that had been deferred for want of one. |
| **Note** | It closes the backlog item that asked for it, and a third finding — five buttons with no accessible name — is guarded by its own `fixme` in Flow J rather than by this entry. Two things learned building it are worth more than the tests. **A screen that renders is not a screen that passes:** four of the author's own assertions were wrong and only *running* them showed it — the module headings asserted do not exist, which is how BUG-1950 surfaced. **And a fixture can manufacture its own flakiness:** signing in per test spent ~15 logins in five minutes against a limit of 20 per 10 minutes, so `PublicRateLimitGuard` correctly answered 429 partway through and tests that passed one run failed the next on a stuck `/login` — which reads exactly like a broken product. The lockout counters were checked first (zero on both `User` and `Identity`) before the API log gave the real answer. The throttle is not the defect; a login endpoint that did not throttle would be. Documented in `docs/development/browser-e2e.md` with the queries that tell the two apart. |
| **Fixed** | 2026-08-29 |
| **Active** | yes |

### REG-303 — A permission key that nothing enforced

| | |
|---|---|
| **Bug class** | `declared-but-unwired-permission` |
| **Module** | `leave` |
| **Bug record** | BUG-2015 |
| **Root cause** | `POST /leave-requests/:id/approve` and `/reject` were decorated with `leave-requests.read` in **both** permission systems. The dedicated `leave-requests.approve` and `leave-requests.reject` keys existed, were mapped in the RBAC matrix and were granted to roles — and were consulted only for deciding what the dashboard and inbox *display*. An administrator withholding approve from a role hid the button and did not stop the action; anyone who could read a leave request could approve it, including by calling the endpoint directly. |
| **Regression test** | `services/api/src/modules/leave/leave-approval-permissions.spec.ts` |
| **Scenario** | Both routes declare their own legacy key and their own matrix privilege, and **do not** declare `read`. `cancel` is asserted unchanged, because it was always correct. |
| **Proven to fail without the fix** | Mutation-tested: restoring the original decorators fails three of six assertions. |
| **Note** | The negative assertions are the load-bearing ones and the reason this guard is worth more than "the key is present". `toContain('approve')` passes while `read` is *also* declared — and on the matrix side that is not a widening but a total defeat, because `PermissionsGuard` requires **at least one** matrix privilege rather than all of them. A guard written the obvious way would have gone green over the live defect. Read through the `Reflector`, not by grepping: decorators are inherited and composed, and the source cannot show what Nest assembles. |
| **Fixed** | 2026-08-29 |
| **Active** | yes |

### REG-304 - A refusal that named neither the step nor the remedy

| | |
|---|---|
| **Bug class** | `unactionable-refusal` |
| **Module** | `approvals` |
| **Bug record** | BUG-1968 |
| **Scenario id** | QA-RUNTIME-017 |
| **Root cause** | `ApprovalMatrixResolverService.resolveApprovalRoute` expanded every matched matrix rule into a step and `throw`ed on the **first** step that could not bind to an active approver. The message named the internal requirement ("Approval route requires a reporting manager with a linked active user.") and nothing else - not which step in the chain, not what to configure, and not that other steps were also unresolvable. Because the shipped seed gives every tenant a two-step chain (`LINE_MANAGER`, then `ROLE(hr)`) that a new tenant satisfies neither half of, an administrator fixed one step, resubmitted, and met the next with an equally bare message. |
| **Regression test** | `services/api/src/modules/approvals/approval-matrix-resolver.service.spec.ts` |
| **Scenario** | The three-row table in BUG-1968, as unit tests. Both steps unresolvable: refused, naming both by sequence with a remedy each. Sequence 1 resolvable and sequence 2 not: still refused, naming **only** step 2. A fully resolvable chain: unchanged. |
| **Proven to fail without the fix** | Mutation-tested: restoring the fail-fast `throw` fails three of the four new assertions, and leaves the fourth - the resolvable-chain control - passing, which is what it is there for. |
| **Note** | The policy deliberately did **not** change: a chain with a step nobody can approve still refuses, because submitting into it would strand the request with no route out. Only the refusal changed. Two things are worth carrying forward. The **negative** assertion is again the load-bearing one - `not.toBe('Approval route requires a reporting manager with a linked active user.')` is the whole difference between the fix and the defect, and any test merely looking for "manager" would have passed against the live bug. And the remedy text is derived from the thrown message rather than from a new error type per step, on purpose: the six refusals in `resolveApprovers` are the single list of what can go wrong, and a parallel enum would be a second list to drift from the first. The fallback returns the original message, so a refusal added later degrades to the old behaviour instead of losing its text. **What this does not fix:** the seed still ships a chain no new tenant can satisfy, and the Approval Matrices screen still gives no configuration-time warning. Both are open product decisions on BUG-1968. |
| **Fixed** | 2026-08-29 |
| **Active** | yes |

### REG-305 - A related record created without its parent

| | |
|---|---|
| **Bug class** | `wrong-question-in-a-guard` |
| **Module** | `apps/web` runtime |
| **Bug record** | BUG-2011, BUG-1961 |
| **Scenario id** | QA-RUNTIME-020 |
| **Root cause** | `standard-module-data.adapter.ts` injected the parent foreign key into the create body only when `!input.subgrid.api` - whether the subgrid was *configured* - instead of whether the resolved create path had actually consumed `{parentId}`. Seven declared subgrids configure an `api` block with a **flat** create path, so for those the parent id went in neither the path nor the body. `employee-data.adapter.ts` had no injection at all and was one flat `createPath` from the same failure. |
| **Regression test** | `apps/web/lib/runtime/related-record-parent-key.spec.ts` |
| **Scenario** | Creating from a related list posts the parent foreign key in the body when the create path does not name `{parentId}`, and does not duplicate it into the body when the path does. Every declared subgrid in both registries - standard modules and the settings adapter registry - can supply the parent id one way or the other. |
| **Proven to fail without the fix** | Mutation-tested: restoring the `!input.subgrid.api` guard fails the body assertion. |
| **Note** | **Six of the seven failed loudly and the seventh did not, which is the part worth remembering.** Department > Teams returned **201** and created a team with `departmentId = null` - a team that never appears in any department list, so nothing surfaces it and no error is ever raised. A guard that can be wrong in a way that returns success cannot be trusted to announce itself, which is why the regression asserts the request body rather than the response. There was **no test anywhere in `apps/web`** exercising related-record creation when this was found; the nearest miss, `standard-module-views.spec.ts`, already iterated every module spec and asserted nothing about `relatedTabs` sitting in the same object. The spec walks the settings adapter registry too, where six of the seven live and which is not in `SPECS` at all - a guard over only the standard modules would have reported the class closed with most instances still open. It also asserts that it found tabs to check, because an `it.each` over an empty array is green. |
| **Fixed** | 2026-08-29 |
| **Active** | yes |

### REG-306 - A leave entitlement that never became a balance

| | |
|---|---|
| **Bug class** | `half-built-model` |
| **Module** | `leave` |
| **Bug record** | BUG-1967 |
| **Scenario id** | QA-RUNTIME-021 |
| **Root cause** | The allocation half of the leave balance model was never implemented. `LeavePolicyRule.entitlementDays` was validated, stored and displayed, and nothing read it into a balance. `LeaveBalance` was written in exactly one place - on approval - and that write only ever decremented: `totalAllocated` was created as literal `new Prisma.Decimal(0)` and incremented nowhere. Since `LeaveType.consumesBalance` defaults to true, the balance gate refused every leave request on every tenant unless a row had been seeded by hand. |
| **Regression test** | `services/api/src/modules/leave/leave-entitlement.service.spec.ts` |
| **Scenario** | Allocation follows the policy that **wins** for each employee, not the assignment that triggered it; `totalRemaining` is derived and `totalUsed` never moves; it is idempotent; an employee covered by no policy is left alone rather than zeroed; a negative remaining is not clamped. |
| **Proven to fail without the fix** | Mutation-tested: an implementation that resolves the policy once rather than per employee passes five of the six assertions and fails only the first. |
| **Note** | **Configuration can be validated, stored, displayed and reviewed while the thing it configures does not exist.** Nothing about `entitlementDays` looked wrong in isolation; what was missing was a reader, and a missing reader has no code to inspect. Worth carrying to any other configured-number-with-a-consumer in this codebase. The design decision is the part most likely to be got wrong twice: exactly one policy wins per employee by specificity, so allocation re-resolves **per employee** exactly as the balance gate does. Allocating the triggering assignment's own entitlements would write a number no governing policy justifies - worse than the original bug, because uniformly blocking is at least visible. That is why `resolveApplicableLeavePolicy` was extracted to `LeavePolicyResolverService` and shared rather than reimplemented. **Deliberately not done:** no backfill of existing tenants, whose balances stay at zero until the next assignment write. A backfill rewrites balances on live tenants including one configured around this bug, and belongs in a RELEASE task with its own rollback. |
| **Fixed** | 2026-08-29 |
| **Active** | yes |

### REG-307 - A save that failed with field errors the form could not render

| | |
|---|---|
| **Bug class** | `silent-degradation` |
| **Module** | `apps/web` |
| **Bug record** | BUG-1966 |
| **Root cause** | `ModuleRuntimeCommandHandler` withheld the runtime's technical error dialog whenever a failed command carried field-level errors, assuming each would be rendered inline against its own control. That holds only while the form renders a control for every field the server can name, and it does not. `SubmitLeaveRequestDto` rejects `ownerId` and `status`; both live in the record-status header and appear in no form section, so the inline path had nothing to draw and the dialog had already been suppressed. A 400 produced no toast, no banner, no invalid field and no `[role=alert]` anywhere in `main` — the request was visible only in the network panel. |
| **Regression test** | `apps/web/lib/runtime/command-failure-visibility.spec.ts` |
| **Scenario** | `fieldValidationErrorsAreVisible` answers the only question that licenses silence: is at least one errored field actually on the active form? False for the real leave-request pair against a form of leave type, dates and reason; true when one named field is on the form, and true when only some are. Both error shapes are read — the array form the API contract emits and the map form — at the root and under `details`. False when there are no field errors, and false when there is no active form, so a failure with nowhere to render always reaches the dialog. |
| **Proven to fail without the fix** | The predicate it replaced, `hasFieldValidationErrors(result.data)`, returned true for any field error whatever the form contained. The first spec case is the exact production payload and now returns `false`, the value that lets the dialog through; under the old predicate the same input returned `true`. The function is new, so the proof is that inversion at the call site rather than a revert of the function. |
| **Note** | Suppressing a dialog "because the errors will render inline" is a claim about the form, made in a component that never looked at the form. The fix does not add an error surface; it stops the runtime asserting something it had not checked. Because the check keys off the active form rather than an exempt-field list, any DTO that grows a field the form does not render now fails loudly rather than silently. |
| **Fixed** | 2026-08-29, branch `agent/starter-blocker-fixes` |
| **Active** | yes |

### REG-308 - A settings toggle wired to nothing

| | |
|---|---|
| **Bug class** | `declared-but-unwired-control` |
| **Module** | `timesheets` |
| **Bug record** | BUG-2045 |
| **Scenario id** | QA-SETTINGS-005 |
| **Root cause** | `timesheets.auditBackgroundJobs` existed in the settings catalog, rendered on screen as "Audit background jobs", and was read by nothing. Every `TIMESHEET_BACKGROUND_JOB_COMPLETED` was audited regardless. On one tenant 216 of 305 audit rows were that action - machine events with no actor decision behind them, produced as a side effect of 61 manual attendance entries, crowding out the human actions an auditor opens the log to find. |
| **Regression test** | `services/api/src/modules/timesheets/timesheet-job-audit.spec.ts` |
| **Scenario** | Turning the setting off stops the audit row; turning it on writes it; a tenant that expressed no preference gets the decided default of off; a settings read failure fails closed without losing the job. |
| **Proven to fail without the fix** | The off case is the assertion that did not hold: nothing read the value, so the row was written whatever the setting said. |
| **Note** | Third instance of this class in the register, after REG-303 (a permission key nothing enforced) and REG-224 (a validation DTO nothing referenced). **A control that exists and is not connected is worse than an absent one**, because the administrator who set it believes they have drawn a boundary. The decided default is `off` and deliberately differs from the catalog's declared `true` - the catalog value is what an unconfigured tenant is *shown*, and changing it is a settings-catalog migration. **Three siblings remain unwired:** `auditEntryChanges`, `auditPolicyResolution` and `auditExports`, in the same category, all on screen, all read by nothing. Only `auditBackgroundJobs` was in scope. |
| **Fixed** | 2026-08-29 |
| **Active** | yes |

### REG-309 - A seeded approval chain no new tenant could satisfy

| | |
|---|---|
| **Bug class** | `unsatisfiable-default` |
| **Module** | `approvals` |
| **Bug record** | ITEM-0113 |
| **Scenario id** | QA-RUNTIME-022 |
| **Root cause** | Provisioning seeded leave as two **active** steps - sequence 1 `LINE_MANAGER`, sequence 2 `ROLE(hr)`. Every matched step must bind to an active approver or the whole submission is refused, and a newly provisioned tenant satisfies neither: nobody has a reporting manager, and nobody holds `hr`. Leave was blocked on day one for every customer, by default rather than by misconfiguration. The seed did guard against a role that does not exist - but checked only that the role *existed*, never that anybody *held* it, and `ROLE(hr)` passed that guard on every tenant while being unroutable on all of them. |
| **Regression test** | `services/api/src/modules/approvals/default-approval-matrices.spec.ts` |
| **Scenario** | Every **active** seeded step must be bindable on a freshly provisioned tenant - which today means a `ROLE` step naming a role provisioning guarantees a member for. The richer line-manager chain is kept, seeded inactive, as a template. |
| **Proven to fail without the fix** | Mutation-tested: restoring the shipped chain - both steps active - fails three of the eight assertions. |
| **Note** | The constant was moved from `prisma/seed-config.ts` to `src/modules/approvals/default-approval-matrices.ts` **so that it could be tested at all**: the seed file creates a Prisma client at import time and jest's rootDir is `src`, so no spec could have imported it and none placed beside it would have run. That is worth generalising - a default nothing can import is a default nothing can check, and this one was wrong for every tenant the product ever provisioned. **Satisfiable is not satisfied:** provisioning creates the owner `INVITED` and the resolver requires `ACTIVE`, so the chain routes from the owner's first sign-in rather than from the instant the tenant exists. That is still a real improvement, because signing in is a precondition of using the product and building a hierarchy is not. |
| **Fixed** | 2026-08-29 |
| **Active** | yes |

### REG-310 - A department that had no scope to be outside of

| | |
|---|---|
| **Bug class** | `wrong-question-in-a-guard` |
| **Module** | `organization` |
| **Bug record** | BUG-1957 |
| **Root cause** | `OrganizationService.findDepartmentsForUser` filtered on `department.businessUnitId !== null && visibleBusinessUnitIds.has(department.businessUnitId)`, which answers false for two different situations: a department whose business unit the caller cannot see, and a department that has no business unit at all. Only the first is a scope decision; the second is a row with no scope to be outside of. Because `findDepartmentForUser` reads through that function, and `updateDepartment` and `deleteDepartment` resolve their target through *that*, such a row could not be listed, fetched by id, edited or deleted — while it went on occupying the tenant's unique department name, so no replacement could be created either. Unreachable and immortal at once. |
| **Regression test** | `services/api/src/modules/organization/organization-read-scope.spec.ts` |
| **Scenario** | A department with a null business unit is visible to a tenant-scoped reader and fetchable by id; invisible to a parent-child reader and unfetchable by an organization-scoped one; and reachable by a tenant-scoped **manager**, which is the privilege that makes it repairable rather than merely visible. The pre-existing assertion that departments outside the caller's business units stay hidden is kept untouched as the control. |
| **Proven to fail without the fix** | Mutation-tested: replacing the null-business-unit branch with `false` — exactly the original behaviour — fails two of the nine assertions in the suite, and leaves the narrower-scope control passing, which is what it is there for. |
| **Note** | The fix does **not** widen visibility to every caller, and that restraint is the load-bearing part: a business-unit-scoped caller still cannot see the row, because there is no business unit through which it could be in scope. Only a tenant-scoped caller, who sees the whole tenant by definition, can reach it. A guard written as "show unscoped rows to everyone" would have closed the bug and opened a scope leak. **The writer was found and is not fixed here.** `seedTenantWorkforceReferenceData` in `prisma/seed-config.ts` upserts Human Resources, Operations, Finance and Information Technology with a code, a name and no `businessUnitId` — exactly the four names the QA run found blocked, and `seed:config` runs on every release for every tenant, so these rows exist product-wide and not merely on the demo tenant. Assigning a business unit at provisioning time means choosing one, and a tenant may have none at that point; that is a product decision, filed as ITEM-0115. This regression guards the reachability half only. |
| **Fixed** | 2026-08-29, branch `agent/bugfix-org` |
| **Active** | yes |

### REG-311 - A soft delete under a constraint that did not know about it

| | |
|---|---|
| **Bug class** | `soft-delete-under-a-blind-constraint` |
| **Module** | `organization` |
| **Bug record** | BUG-1958 |
| **Root cause** | Deleting a department is a soft delete — `deleteDepartment` sets `isActive = false` and leaves the row in place — while uniqueness was `@@unique([tenantId, name])` across every row, active or not. The name was therefore never released: a tenant that deleted a department could not recreate one by that name through any route the product offers, and the 409 it got back blamed a record the product had just reported deleted. Root `AGENTS.md` already warns that a soft-delete flag obliges you to update every query that reads it; the uniqueness constraint is one of those readers and was never updated. |
| **Regression test** | `services/api/src/modules/organization/departments-list-contract.spec.ts` |
| **Scenario** | The schema must not declare a full unique on `(tenantId, name)`; a migration must both create the partial `Department_active_tenant_name_key` index carrying the `isActive = true` predicate and drop the old `Department_tenantId_name_key`; `@@unique([tenantId, code])` must survive whole-table; and a P2002 raised on the update path must surface as a 409 rather than a 500. Schema and migrations are read from disk rather than restated, and a control asserts the model body was actually located, because an assertion over an empty array is green. |
| **Proven to fail without the fix** | Mutation-tested twice. Restoring `@@unique([tenantId, name])` to the schema **and** removing the migration directory fails two of the nine assertions, while the code-uniqueness and model-located controls keep passing. Separately, routing the update back through the repository directly so it bypasses the `try`/`catch` fails one. **What this does not prove:** the database constraint itself was never exercised — there is no database in this environment — so the guard establishes that the schema and the migration still agree with each other, not that PostgreSQL accepts the index. |
| **Note** | `@@unique([tenantId, code])` deliberately stays unique across the whole table, and the asymmetry is the design decision most likely to be got wrong on a second pass. `code` is the key provisioning upserts through — `seedTenantWorkforceReferenceData` matches on `tenantId_code` — so scoping *code* to active rows would make that upsert miss an archived row and insert a duplicate department on every release. The name is the human label and is the half this defect is about. **A real standing risk:** Prisma cannot express a partial index, so the constraint lives only in SQL, and a future `prisma migrate dev` will see an index the schema does not declare and offer to drop it. Someone accepting that generated diff silently reverts the fix — which is precisely why the guard reads the migration directory from disk and why it was mutation-tested by removing it. Same arrangement as `PlanPrice`'s active-price uniqueness and `CustomizationColumn`'s primary-name index; this is the third instance in the schema, not a new pattern. Also closed here: `updateDepartment` had never wrapped its repository call the way the create path does, so a rename onto a taken name was already a 500 — pre-existing, but scoping uniqueness to active rows adds a second route to it (reactivating an archived department whose name has since been taken), so it was closed rather than left to be found again. |
| **Fixed** | 2026-08-29, branch `agent/bugfix-org` |
| **Active** | yes |

### REG-312 - Two list endpoints in one product, answering in two shapes

| | |
|---|---|
| **Bug class** | `divergent-list-contract` |
| **Module** | `organization` |
| **Bug record** | BUG-1959 |
| **Root cause** | `GET /api/departments` took `ListMasterDataDto`, which declares no pagination fields, so under the global `ValidationPipe`'s `forbidNonWhitelisted: true` a `pageSize` query parameter was a 400 — "property pageSize should not exist" — while `GET /api/employees` answered with the `{items, meta}` envelope. Every department row was shipped on every load, and any consumer written against the employees envelope broke when pointed at departments. |
| **Regression test** | `services/api/src/modules/organization/departments-list-contract.spec.ts` |
| **Scenario** | With neither `page` nor `pageSize`, the response is the bare array, unchanged. With either, it is the employees envelope with server-computed `total` and `totalPages`. A page beyond the end clamps to the last page rather than returning nothing, and the page size defaults to the employees default when only a page is asked for. |
| **Proven to fail without the fix** | Mutation-tested: making the method ignore both pagination fields and always return the bare array — the pre-fix behaviour — fails three of the nine assertions, and leaves the bare-array control passing. |
| **Note** | **Half of BUG-1959 did not survive being checked, and the record has been annotated rather than quietly narrowed.** Its user-visible symptom — a page-size control that promises to change the page size and does nothing — does not occur. The departments table paginates client-side: `settings-runtime-pages.tsx` passes `paginationMode="client"` and `standard-module-list-page.tsx` slices the set and recomputes the totals from it, so the control works and the footer is correct. The page size never reaches the API, because `settingsListApiPath` builds the request from the adapter's path and does not forward it. That also voids the record's third acceptance criterion: under client paging the array *is* the whole set, so its length is the true total rather than a stand-in for a number the screen failed to fetch. The record's title still describes the disproven half; renaming it implies a file rename, which the generators own. **The shape change is opt-in on purpose.** The bare array is not unique to departments — business units, designations and locations answer the same way, and the settings runtime lookups, `use-employee-lookups.ts` and the holiday calendar manager read it directly. Converting one of the four would have resolved a divergence with `employees` by creating one inside master data, on contracts three frontends, an Electron agent and a .NET gateway consume. So `page` and `pageSize` are optional **with no defaults**: absent, every existing caller gets byte-for-byte what it got before. One honest limitation, stated in the code as well: the slice happens after the visibility filter, not in the query, because department visibility is resolved in memory against the caller's business units — so this bounds the response, not the read. |
| **Fixed** | 2026-08-29, branch `agent/bugfix-org` |
| **Active** | yes |

### REG-313 — An entity-data call site naming an entity the registry never held

| | |
|---|---|
| **Bug class** | `unchecked-cross-workspace-contract` |
| **Module** | `apps/web`, `services/api` data |
| **Bug record** | BUG-2003 |
| **Root cause** | `/users` fetched the generic entity-data endpoint for the logical entity `users`. `ENTITY_REGISTRY` in `services/api/src/modules/data/entity-registry.ts` has only ever held one entity, `employees`, so `GET /data/users` returned 404 before a single row was read. The 404 became an `ApiRequestError` thrown uncaught inside an async Server Component, which puts an error row in the RSC Flight stream and renders the boundary. Not data-dependent: it failed for every tenant, with zero users or ten thousand. It type-checked perfectly, because `entityLogicalName` is a plain `string` on both sides of a contract that spans two workspaces and was enforced in neither. |
| **Regression test** | `apps/web/app/components/entity-data/entity-registry-contract.spec.ts` |
| **Scenario** | Every `buildEntityDataUrl({ entityLogicalName })` call site under `apps/web/app` and `apps/web/lib` names an entity `ENTITY_REGISTRY` declares. Two vacuity guards sit above it: the registry parse must have returned entities and must include `employees`, and the source scan must have found at least one call site. |
| **Proven to fail without the fix** | Mutation-tested: changing `employees/page.tsx:234` to `entityLogicalName: "users"` — which is precisely this defect — fails the suite with `"entity": "users"` in the diff. Restored afterwards. |
| **Note** | **The two vacuity guards are the load-bearing part.** This test is built on a regex over source text, and a regex that matches nothing is green: without them, deleting the registry or breaking the scan would report the class closed. The registry is read out of the API **source** rather than imported, because `apps/web` does not depend on `services/api` and must not start it — the cost is that the parse is textual, which is exactly why it must assert it parsed something. The fix taken was neither of the two the record proposed: rather than registering a `users` entity or deleting the page, the branch that asked for the entity was removed, which does not pre-empt ITEM-0107's decision about whether this screen survives at all. **Three secondary defects on that screen are unfixed and now reachable**, recorded in BUG-2003 rather than refiled: the `userRoles`/`employee` field mismatch, pagination the API never implemented, and `UsersFilterBar` imported and never rendered. |
| **Fixed** | 2026-08-29, branch `agent/bugfix-runtime` |
| **Active** | yes |

### REG-314 — A product link resolving only through a sibling record route

| | |
|---|---|
| **Bug class** | `route-shadowing` |
| **Module** | `apps/web` runtime |
| **Bug record** | BUG-2004, BUG-2014 |
| **Root cause** | Three links pointed at paths with no page, so Next matched each against the sibling dynamic detail route with the literal path segment as the record id. `/approvals/new` was **generated**, not hand-written: `approvalRuntimeSpec` omitted `adapterCapabilities.disableCreate`, so the standard runtime emitted a `system.new` command and promoted it to a primary button; it resolved to `approvals/[approvalId]` with `approvalId === "new"`, fetched an approval that cannot exist, and threw uncaught into the error boundary. `/users/new` and `/users/import` came from the users command bar and the list empty state, resolved to `users/[userId]`, and rendered "ACCESS DENIED — You cannot view this user record" over a 404, telling an administrator they lacked a permission they held for a record that never existed. |
| **Regression test** | `apps/web/lib/routing/route-integrity.spec.ts`, over the route resolver in `apps/web/lib/routing/app-route-table.ts` |
| **Scenario** | Two blocks. For every `StandardModuleRuntimeSpec` in both spec files, either `adapterCapabilities.disableCreate` is declared or `<routeBase>/new` resolves to a real page **without** a dynamic folder consuming its last segment — 21 modules. And every literal internal link in `apps/web/app` — `href`-ish properties, `router.push`/`redirect` calls, and named route constants — resolves to a page under the same condition: 50 links. Both blocks assert they found something to check, because an `it.each` over an empty array is green. |
| **Proven to fail without the fix** | Mutation-tested once per record. Removing `adapterCapabilities.disableCreate` from `approvalRuntimeSpec` fails with `"routeBase": "/approvals"` and `finalSegmentDynamic: true`. Pointing `USER_CREATE_ROUTE` back at `/users/new` fails with `"reason": "matched by (authenticated)/users/[userId]"`. Both restored afterwards. |
| **Note** | **The scan only sees literal strings, and that is deliberate.** A path built from a template literal is not checked, because a path built around a record id is not the mistake this looks for — so this catches this defect and every copy of its shape, not every possible dead link. `/settings/**` is exempted with a comment: the settings runtime serves static-looking paths through `[category]/[settingGroup]/[item]`, where a path naming nothing in the registry is answered by `getSettingsRuntimeItem` returning `notFound()`, which is the opposite of this defect rather than an instance of it. BUG-2014's fix points **New** at `/settings/security-access/identities/users/new`, which resolves through that same dynamic pattern; the Architect confirmed both that `settings/[category]/[settingGroup]/[item]/new/page.tsx` exists and that `next.config.ts` already redirects the users *list* onto the same pattern, where `identities` likewise has no concrete directory — so the product already depends on this resolution and the retarget is not a novel bet. **What is not covered by a test:** the page-level not-found rendering that both fixes added — `approvals/[approvalId]` answering a 404 or 400 with a not-found state, and `users/[userId]` splitting 404 from 403 — is React server-component rendering, and `apps/web` has no jsdom, so nothing asserts it. No create page was built for either module: approvals must not have one, and building two bespoke pages under `/users` would be the wrong thing to leave behind if ITEM-0107 redirects that tree. `Data > Import` was removed outright with its `canImport` gate, there being no users import screen anywhere to point it at. |
| **Fixed** | 2026-08-29, branch `agent/bugfix-runtime` |
| **Active** | yes |

### REG-315 — A server failure classified by a message React had already deleted

| | |
|---|---|
| **Bug class** | `unclassifiable-error-surface` |
| **Module** | `apps/web` |
| **Bug record** | BUG-2013 |
| **Root cause** | `classifyDashboardError` decided what to show by string-matching `error.message` against session-expired, access-denied, not-found and api-error patterns. For anything thrown in a Server Component the message it receives is always React's production placeholder — "Minified React error #441…" — which contains none of those substrings, by design, so server detail does not leak. Every server-side 401, 403, 404 and 500 on every route under `(authenticated)` therefore fell through all four branches and rendered one identical "UNEXPECTED ERROR" screen. Separately, the status tests sat **inside** each branch, below the message heuristics of the branch above, so a 404 whose message happened to contain the word "permission" was answered with ACCESS DENIED. |
| **Regression test** | `apps/web/app/(authenticated)/_lib/classify-dashboard-error.spec.ts` |
| **Scenario** | Both the minified and un-minified #441 placeholders, quoted verbatim, resolve to a deliberate `server-error` variant and explicitly **not** to the `unexpected` fall-through. An explicit HTTP status outranks every message heuristic, including a 404 whose message says "permission". The four message branches stay reachable for client-originated failures, and the fall-through stays reachable. |
| **Proven to fail without the fix** | Mutation-tested: restoring the original classifier verbatim — one branch per variant, each testing status, code and message together in the old order — fails four of thirteen assertions: both placeholder cases, the 404-under-ACCESS-DENIED case, and the greedy `api` substring case. A first, less faithful reconstruction that hoisted all the status tests above all the message tests failed only two, and accidentally fixed the 404 case; the mutation was redone rather than accepted, because an unfaithful mutation understates what the guard is holding. Restored afterwards. |
| **Note** | **This is why the other two records here cost hours to tell apart.** BUG-2003 (an entity-registry mismatch on the API side) and BUG-2004 (a missing frontend route flag) are unrelated in every respect and presented as the same screen with the same error number. The classifier moved out of `error.tsx` into `_lib/` for a mechanical reason worth generalising: it could not be tested where it was, because `apps/web` jest is node-environment with no jsdom, so logic living inside a component is logic nothing can check. The message branches now carry a comment saying they are reachable only for client failures — the failure mode to guard against is someone adding a server-side condition to them, which would be dead code that looks alive. One narrowing beyond the record: `message.includes("api")` was dropped from the api-error branch, where it matched "rapid", "capital" and any message quoting an `/api/` URL, leaving the fall-through nearly unreachable. |
| **Fixed** | 2026-08-29, branch `agent/bugfix-runtime` |
| **Active** | yes |

### REG-316 — A child record pre-filled with its parent's values

| | |
|---|---|
| **Bug class** | `undeclared-inheritance` |
| **Module** | `apps/web` runtime |
| **Bug record** | BUG-2012 |
| **Root cause** | `module-related-subgrid.tsx` handed the quick-create dialog the parent record **whole** as `contextValues`, and `module-quick-create-panel.tsx` spread it into the child form's initial value map. Any field name shared between parent and child therefore opened pre-filled with the parent's value and was posted with it unless the user noticed and overwrote it. Confirmed for Organization > Business Units and Business Unit > Departments (`name`, `description`), Department > Teams (`name`) and State > Cities (`name`, `isActive`, `sortOrder`). Nothing narrowed the set and nothing declared an intent to inherit anything: the inheritance was a consequence of two objects sharing a key. |
| **Regression test** | `apps/web/lib/runtime/related-record-create-values.spec.ts` |
| **Scenario** | The four confirmed collisions encoded as data, each asserting the posted body contains **only** the parent foreign key. A declared inheritance is carried through and nothing else travels with it. A draft value cannot overwrite the parent foreign key. A user's own edit beats an inherited value. Null and empty parent values are skipped rather than seeding a blank. |
| **Proven to fail without the fix** | Mutation-tested: making `resolveInheritedParentValues` return the parent record whole — the previous behaviour exactly — fails five of fifteen assertions, the four collisions plus the narrowing itself. Restored afterwards. |
| **Note** | **REG-305 is in this same code path and must not be undone by this fix.** The parent foreign key still reaches the server by both routes it did before: `buildQuickCreateValues` sets it last, so a draft value cannot displace it, and the data adapters still inject it when the configured create path did not consume it. REG-305's 39 assertions were re-run after this change and pass unchanged, and this suite carries two assertions of its own guarding the key. The mechanism chosen was a declaration — `RelatedSubgridMetadata.inheritParentFields` — rather than deleting the seeding, because some dialog will eventually want to inherit on purpose; the one deliberate inheritance that exists today, a project's `currencyCode` onto a `projectAssignment`, is on the assignment panel's path and was left alone as the precedent. **No subgrid declares the new field**, which is the correct starting state. **Two limits recorded rather than assumed:** the acceptance criterion that a second team can now be created from the same department without a 409 on a derived key is met at the cause — the name is no longer inherited, so nothing derives a colliding key from it — but was **not observed against a running API**; and nothing here identifies or repairs records already created with an inherited value, such as a business unit named after its organization, which is indistinguishable from a deliberate choice without knowing when it was written. |
| **Fixed** | 2026-08-29, branch `agent/bugfix-runtime` |
| **Active** | yes |
