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
| **Regression test** | `apps/admin/app/api/auth/logout/logout-route.spec.ts` (10 static/source-shape assertions; partial coverage) |
| **Scenario** | `revokeApiSession` appears in both handlers and neither the call site nor the function body has the known missing-cookie guard; cookies are cleared only through the try/catch wrapper, whose fallback still expires the cookie. This does not execute the handlers or prove database revocation; `QA-AUTH-002` and ITEM-0002 record that boundary. |
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
