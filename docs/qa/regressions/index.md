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
| **Regression test** | `services/api/src/common/guards/public-write-rate-limit.invariant.spec.ts` — "public-billing.controller.ts rate limits every public write" |
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
| **Scenario** | The bootstrap script reads the cookie the console writes and resolves `prefers-color-scheme` before paint; switching Dark → System *removes* the pinned attribute rather than leaving it; the script survives a browser refusing cookies or `matchMedia`; the root layout stamps the preference from `cookies()`, runs the script in `<head>`, suppresses the hydration warning it deliberately creates, and paints `<body>` from tokens rather than a light class. |
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
