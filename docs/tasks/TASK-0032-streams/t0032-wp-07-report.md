# WP-07 — Platform operations dashboard (TASK-0032 / ITEM-0199)

Stream report of [[TASK-0032]].

Worktree `D:/My Work/hrm-dijipeople/dp-pah-wp07`, branch `agent/pah-wp07-dashboard`,
based on WP-01's `10d5d148`. Implementation and tests landed in checkpoint
commit `11c74257` (the orchestrating session was interrupted mid-task; the
working tree was preserved as that commit rather than lost). The regression
entries landed in checkpoint `72dd4d05` (a second interruption). This report
is a follow-up commit on the same branch.

## IMPLEMENTED

**Backend** — `services/api/src/modules/super-admin/operations-dashboard.service.ts`
(new `OperationsDashboardService`, registered in `super-admin.module.ts`,
exposed as `GET /super-admin/dashboard-summary/operations` alongside the
existing `GET /super-admin/dashboard-summary` in `super-admin.controller.ts`,
same controller-level guards — `JwtAuthGuard, RolesGuard,
PlatformPermissionsGuard` + `@RequireRoles(SYSTEM_ADMIN, SYSTEM_CUSTOMIZER)`.
Nested under `dashboard-summary/` rather than `dashboard/` deliberately: the
platform's second permission system (`resolvePlatformPermission` in
`modules/platform-auth/platform-permissions.ts`, a WP-02-owned,
single-writer file per COMMON-RULES) maps every super-admin route to a
platform permission by `path.includes(...)`, refuses to serve a route it
cannot map (BUG-0071), and had no entry for a `dashboard/` prefix. Nesting
under the already-mapped `dashboard-summary` path resolves this route to the
same `dashboard.read` its sibling carries with **zero changes** to that
locked file — confirmed by re-running
`platform-auth/platform-permissions.spec.ts`'s full route-coverage
assertion, which failed with the `dashboard/` path and passes with this one).
Five sections, each computed in parallel and each isolated in its own
try/catch (`section()` helper) so one failing query never blanks the other
four:

| Section | Metrics | Source |
|---|---|---|
| `platform` | tenants total/active/trial/suspended, stuck-provisioning count, new in 30d, 12-week growth trend | `Tenant.groupBy(status)`, `Subscription.count(status=TRIALING)` (no `TenantStatus.TRIAL` value exists — a trial tenant is one whose subscription is `TRIALING`; `Subscription.tenantId` is unique so this counts tenants, not subscriptions), `Tenant.count`/`findMany` bounded to the last 12 weeks |
| `users` | active tenant users, new in 30d, pending invitations, logins/failed logins (24h) + 14-day trend, MFA adoption (tenant + platform) | `User.count`, `UserInvitation.count(status=PENDING)`, `AuditLog.count`/`findMany` on `action IN (AUTH_LOGIN_SUCCEEDED, AUTH_LOGIN_FAILED)`, `User.mfaEnabled`/`PlatformUser.mfaEnabled` |
| `partners` | total/active, by `PartnerType`, by `partnershipModel`, 6-stage onboarding funnel, recently activated | `Partner.groupBy(status/type/partnershipModel)`, `Partner.findMany(status=ACTIVE, orderBy updatedAt)` |
| `agreements` | 6 lifecycle groups (draft / awaiting signature / partially signed / signed-executed / expired / cancelled-voided), pending-signature count, generation failures | `Contract.groupBy(status)`; generation failures explicitly `{ available: false }` — no model or `ErrorLog` field records them by contract |
| `operational` | unresolved errors, errors last 24h + 14-day trend, background job failures, recent incidents | `ErrorLog.count`(supportStatus not in RESOLVED/NOT_AN_INCIDENT), `ErrorLogOccurrence.count`/`findMany` (volume, not deduped incidents), `OutboxEvent.count(status=FAILED)`, `PlatformEvent.count(result=FAILED)` |

Every query is a bounded `count`/`groupBy`, or a `findMany` scoped to a date
range with a narrow `select` (never a whole-table read) — asserted directly
in the spec (see TESTS_ADDED).

**Frontend** — `apps/admin/app/_components/dashboard/platform-dashboard.tsx`:
new `operations` view added to `DASHBOARD_VIEWS`
(`apps/admin/lib/runtime/platform-module-registry.ts`), made the default for
`SUPER_ADMIN`/`PLATFORM_ADMIN` via a new generic, additive
`RuntimeViewDefinition.roleDefaultFor` field (also wired into
`RuntimeViewSelector`'s own default-resolution so the selector's "pinned"
indicator agrees with what actually renders) — every other view and every
other module using `RuntimeViewSelector` is unaffected since the field is
optional and unused elsewhere. `DashboardContent`/`buildDashboardWidgets`
(the existing generic per-view widget system every one of the other 8 views
already goes through) gained optional, additive fields —
`extraTrends`/`extraBreakdowns`/`extraQueues`/`unavailable`/
`primaryUnavailable`/`secondaryUnavailable` — so one view can show more than
one trend/breakdown/queue without a second dashboard framework.

### Widgets on the Operations view, their source, and their drill-down

| Widget | Data source (section) | Drill-down |
|---|---|---|
| KPI: Tenants | `platform` | `/tenants` |
| KPI: Stuck provisioning | `platform` | `/operations/provisioning` (the real provisioning-stuck queue — not linked from `MonitoringNav` today, D4 gap #7; this is a second, direct route to it) |
| KPI: Active users | `users` | `/settings/security` — **no true drill-down exists**; see UNRESOLVED |
| KPI: Failed sign-ins (24h) | `users` | `/settings/monitoring` — **no true drill-down exists**; see UNRESOLVED |
| KPI: Errors needing attention | `operational` | `/settings/monitoring/error-logs?viewKey=new` — **partial filter**; see UNRESOLVED |
| KPI: Pending signatures | `agreements` | `/contracts?viewId=awaiting-external-signature` (existing, proven view id) |
| KPI: Applications awaiting review | `partners` | `/partners?viewId=under-review` (existing, proven view id) |
| KPI: Background job failures | `operational` | `/settings/monitoring/events?result=FAILED&source=BACKGROUND` (existing, verified URL-driven filter — see below) |
| Trend: Tenant growth (12 weeks) | `platform` | n/a (chart) |
| Trend: Sign-ins vs failed sign-ins (14 days) | `users` | n/a (chart) |
| Trend: Error volume (14 days) | `operational` | n/a (chart) |
| Breakdown: Agreements by status | `agreements` | n/a (chart; each status already reachable from the Pending signatures KPI and existing `agreement-operations` view) |
| Breakdown: Partners by type | `partners` | n/a (chart) |
| Breakdown: Partners by commercial model | `partners` | n/a (chart) |
| Funnel: Partner onboarding funnel (6 stages, order-preserving) | `partners` | n/a (chart) |
| Queue: Recently activated tenants | main `dashboard-summary` (`recentlyActivatedTenants`, already fetched by every other view) | `/tenants/:id` per row |
| Queue: Recently activated partners | `partners.recentlyActivated` | `/partners/:id` per row (new branch added to `OperationsQueue`'s shape-sniffing href logic) |
| Attention list (up to 5, only when > 0) | stuck provisioning, unresolved errors, applications awaiting review, pending signatures, background job failures | each links to the KPI's own drill-down above |
| Quick actions | static | `/operations/provisioning`, `/settings/monitoring/error-logs`, `/partners?viewId=under-review` |

Commercial metrics were **not** duplicated onto this view — per the brief,
"keep what exists; do not invent new ones" — they remain on `executive` and
`billing-revenue`.

### Drill-down query params verified before use

- `/tenants?status=X`, `/contracts?viewId=X`, `/partners?viewId=X` — already
  proven working, used by the other 8 existing dashboard views before this
  WP.
- `/settings/monitoring/events?result=FAILED&source=BACKGROUND` — read
  `apps/admin/app/(internal)/settings/monitoring/events/page.tsx` directly:
  it reads `result`/`source`/etc. straight from `searchParams` server-side.
  Not edited (WP-06 owns monitoring files); only linked to.
- `/settings/monitoring/error-logs?viewKey=new` — read
  `.../error-logs/page.tsx`'s `buildQueryString`: it supports `viewKey=new`
  (maps to `supportStatus=NEW`) but **not** a combined "unresolved" filter
  (`NEW ∪ INVESTIGATING ∪ WAITING_ON_CUSTOMER ∪ FIX_IN_PROGRESS`) — the
  server-side `incidentViewWhere()` in `platform-monitoring.service.ts` has no
  such view key. Flagged for WP-09 rather than added, because both files are
  WP-06's per the WP-07 brief ("do not edit monitoring files").

## CHANGED_BEHAVIOR

- `RuntimeViewDefinition` gained an optional `roleDefaultFor?: string[]`
  field; `RuntimeViewSelector` and `PlatformDashboard` both consult it ahead
  of `isSystemDefault`. No existing view sets it, so every other view/module
  resolves its default exactly as before.
- `apps/admin/app/(internal)/page.tsx` now fetches
  `/super-admin/dashboard-summary/operations` with its own independent
  `.then()/.catch()`, separate from the existing `Promise.all` over
  `dashboard-summary` + module preferences. A failure fetching the new
  endpoint renders the dashboard with `operations={null}` and an inline
  reason instead of the page's full "Dashboard unavailable" state — see
  REG-587.
- `BreakdownChart` gained an optional `ordered` prop (default `false`,
  existing behaviour unchanged) so a funnel can render in stage order instead
  of sorted by value.
- `TrendChart` gained an optional `cadenceLabel` prop (default `"month"`,
  existing behaviour unchanged) — the caption was hardcoded to
  `"{n}-month operational trend"`, which would have read
  `"14-month operational trend"` for the new daily login/error trends had it
  not been parameterised.
- `OperationsQueue`'s href/detail-derivation gained a branch for a
  `displayName`-only (Partner) shape, and the detail line now falls back to
  `updatedAt` when neither `expiryDate` nor `createdAt` is present. Existing
  contract/lead/tenant shapes are unaffected (none of them carry
  `displayName`).
- `SuperAdminController` gained one new route; nothing existing changed
  shape.

## RISK_AREAS

- **`AuditLog` has no index that supports a cross-tenant `action`+`createdAt`
  query.** Every index on that model is `tenantId`-prefixed
  (`@@index([tenantId, action, createdAt])`, etc.) because every other reader
  is tenant-scoped; this is the first platform-wide reader of it. The
  login-metric queries are logically bounded by a date range but may not be
  efficiently bounded on a large `AuditLog` table until an index like
  `@@index([action, createdAt])` exists. Flagged, not fixed — `schema.prisma`
  is WP-01's single-writer file. See UNRESOLVED.
- **Platform-admin logins are not audited anywhere in this codebase.**
  Confirmed by grep: no call site in `services/api/src/modules/platform-auth`
  passes `AUTH_LOGIN_SUCCEEDED`/`AUTH_LOGIN_FAILED` into `AuditService.log()`
  with `tenantId: 'platform'`. The `users` section's login metrics are
  **tenant-user sign-ins only** — documented in the service's own doc comment
  and in `bucketDailyLoginActivity`'s doc comment — not platform-admin
  activity, despite the KPI living on the platform admin's own dashboard.
- **"Recently activated partners" is an approximation.** `Partner` has no
  `activatedAt` field; the query is `status = ACTIVE`, `orderBy updatedAt
  desc`, so any update to an already-active partner (not just the transition
  into `ACTIVE`) can surface it. Chosen over inventing a field or scanning
  `PartnerTimeline` (free-text `eventType`, no index beyond
  `(partnerId, createdAt)` — a platform-wide scan for an activation event
  would face the same missing-index problem as `AuditLog` above).
- **"Stuck provisioning" reuses `Tenant.status`, not
  `TenantProvisioningRun`.** Deliberate — a tenant's own `status` is the
  current truth, whereas a historical `FAILED` run row stays `FAILED` forever
  even after a successful retry, which would have overcounted. The KPI can,
  in principle, disagree with `/operations/provisioning`'s own finer-grained
  run-level view since the two are not computed from the same query; no such
  case was found.
- **No live browser/responsive verification.** The Playwright MCP server
  disconnected and reconnected during this session; rather than gate this
  report on it, responsive behaviour was verified by reading the Tailwind
  classes against the existing, already-shipped patterns the other 8 views
  use (base = single column, `sm:`/`xl:` add columns, `overflow-x-auto` on
  both chart types exactly as the pre-existing `revenueTrend`/`leadTrend`
  charts already use) rather than by rendering at 1440/1024/768/390. A live
  pass at those widths is recommended before this ships to users, e.g. in
  WP-09.

## KNOWN_MISTAKES_AVOIDED

- BUG-2626 (dashboard numbers in browser locale) — every number here goes
  through `Metric`/`toLocaleString()`/the existing `money` formatter fixed to
  `en-US`, same as every other view; nothing new formats ad hoc.
- BUG-3220-adjacent gap (D4 discovery §"Admin dashboard": "the one page in
  admin with an explicit error state, built ad hoc") — extended, not
  repeated: the *new* Operations fetch has its own independent failure path
  (REG-587) rather than joining the existing ad hoc one.
- D4 discovery gap "no charting library" — no dependency was added
  (`package.json` is also locked per COMMON-RULES); every new chart reuses
  `BreakdownChart`/`TrendChart`, extended with `ordered`/`cadenceLabel`
  rather than replaced.
- AGENTS.md "No fabricated numbers" / D4's own MFA note ("the columns exist
  since WP-01 and will be 0 until WP-03 ships — that is correct data") — MFA
  adoption is computed and shown as a real `0%` today (correct, not a bug);
  contract-generation failures and any KPI whose section fails are shown as
  `"Not available"` with a reason, never a fabricated number.
- Root AGENTS.md UI rule "no explanatory helper text or descriptions added to
  UI controls without asking" — every new/changed piece of copy is a label,
  a value, or an error reason; no new helper/description text was added to
  any control.

## TESTS_ADDED

- `services/api/src/modules/super-admin/operations-dashboard.service.spec.ts`
  (18 tests): pure-helper tests for `groupAgreementStatuses`,
  `contractGenerationFailures`, `buildPartnerFunnel`, `mfaAdoptionPercent`,
  `bucketDailyLoginActivity`, `bucketDailyErrorVolume`,
  `bucketWeeklyTenantGrowth`; and service-level tests against a hand-written
  fake Prisma client (recording every call's exact arguments) proving: the
  login queries are scoped to exactly the two `AUTH_LOGIN_*` actions and
  never a bare scan; `userInvitation.count` filters `status: 'PENDING'`
  exactly; `errorLog.count` filters `supportStatus: { notIn: [...] }`
  exactly; every trend `findMany` carries both a `where` and a `select`
  (never an unbounded whole-table read); a rejected `partner.groupBy` leaves
  `partners.available === false` while the other four sections still resolve
  `available: true`; agreement generation failures are always
  `{ available: false }`, never a number.
- `apps/admin/lib/dashboard/operations-dashboard-metrics.spec.ts` (12 tests):
  `metricValueOrUnavailable` (available/unavailable/missing-section/
  fallback-reason paths — proves "Not available" is returned, never `0`),
  `relabelAgreementGroups` (including the non-zero `other` bucket staying
  visible), `partnerFunnelToRecord` (insertion order preserved),
  `applicationsAwaitingReviewCount`, `totalJobFailures`.

## TEST_HOOKS

- `GET /super-admin/dashboard-summary/operations` — no extra params beyond the
  existing `SYSTEM_ADMIN`/`SYSTEM_CUSTOMIZER` platform roles; returns 200
  with per-section `available`/`reason` even when a section fails, never a
  5xx for a partial failure.
- `/?viewId=operations` on the admin dashboard route opens the view directly
  regardless of role/default (existing `RuntimeViewSelector` URL-param
  behaviour, unchanged).
- To exercise the unavailable-state UI without a live DB failure: any
  section's `available: false` path is reachable by temporarily pointing
  `DATABASE_URL` at an unreachable host — the endpoint still returns 200 with
  that section's `reason` populated (proven in the service spec; not
  re-verified end-to-end for this report).
- Seed data: no new seed requirement. All five sections read existing
  `Tenant`/`Subscription`/`User`/`UserInvitation`/`Partner`/`Contract`/
  `ErrorLog`/`ErrorLogOccurrence`/`OutboxEvent`/`PlatformEvent` rows; a
  freshly-seeded demo tenant will show real (mostly zero) numbers, not an
  error.

## RECORD_CLOSURES

| Record | Commit | Spec | Fails without fix |
|---|---|---|---|
| REG-585 (cascading section failure) | `11c74257` | `operations-dashboard.service.spec.ts` — `'isolates a failing section...'` | Yes |
| REG-586 (fabricated metric zero) | `11c74257` | `operations-dashboard.service.spec.ts` — `'reports agreement generation failures as unavailable...'`; `operations-dashboard-metrics.spec.ts` — `'surfaces the section's own reason, not a zero...'` | Yes |
| REG-587 (whole-page blank on independent fetch failure) | `11c74257` | none automated — `apps/admin` has no rendering test harness; verified by code review | N/A |
| ITEM-0199 (dashboard operational metrics) | `11c74257` | this WP's whole implementation | — |

REG-588 and REG-589 (reserved range REG-585..REG-589) were **not** used —
every other change in this WP (the `roleDefaultFor` selector field, the
`TrendChart`/`BreakdownChart` prop additions, the `OperationsQueue` partner
branch) is new-feature plumbing rather than a fix for a defect with its own
reproducible failure mode, and forcing two more entries onto them would have
weakened the register rather than strengthened it.

## VALIDATION

- `npm --workspace api run test -- operations-dashboard` — 18/18 passed.
- `npm --workspace api run check-types` — passed (exit 0).
- `npm --workspace admin run check-types` — passed (exit 0, `next typegen` +
  `tsc --noEmit`).
- `npm --workspace admin run test` — 48 suites / 432 tests passed (was 47/422
  before this WP; +1 suite/+10 tests are this WP's new pure-helper spec).
- `cd services/api && npx eslint --fix` on every changed API file — clean,
  no remaining findings.
- `cd apps/admin && npx eslint --fix` on every changed/added admin file —
  clean, no remaining findings.
- `npm run test:runtime-schema` — 3/3 passed (unaffected; `DASHBOARD_VIEWS`
  is not consumed by the runtime-schema generator — confirmed by grep).
- `npm --workspace api run test` (full suite) — 349 suites / 6939 tests.
  First run (before the `dashboard-summary/operations` route rename): 347
  suites / 6937 tests passed, 2 failed —
  `modules/platform-auth/platform-permissions.spec.ts` (this WP's new route
  was unmapped in the route-coverage assertion — **mine**, fixed by the
  rename described in CHANGED_BEHAVIOR rather than by editing the
  WP-02-owned permission file) and
  `modules/tenant-control-plane/tenant-erasure.constants.spec.ts` (**not
  mine, pre-existing on `10d5d148`** — WP-01 added the tenant-owned
  `UserMfaRecoveryCode` model but never added it to the tenant-erasure
  coverage list; confirmed by `git log` showing WP-01's commit never touched
  `tenant-erasure.constants.ts`, and no commit since has either). Re-run
  after the rename: `platform-permissions.spec.ts` now passes;
  `tenant-erasure.constants.spec.ts` remains red, as expected for a
  pre-existing gap this WP did not introduce and is not scoped to fix.
- No `next build`/`next dev` run, per COMMON-RULES (`node_modules` are
  junctions; Turbopack refuses them).

## UNRESOLVED

- **SCHEMA_NEEDED (not applied — `schema.prisma` is WP-01's file):** add
  `@@index([action, createdAt])` to `AuditLog` so the platform-wide login
  metrics this WP added have a supporting index; today they rely on the
  `tenantId`-prefixed indexes not helping and Postgres falling back to a
  broader scan bounded only by the `createdAt` predicate.
- **No true drill-down page exists** for "Active users" or "Failed sign-ins" —
  there is no cross-tenant tenant-user list/audit screen anywhere in
  `apps/admin` (`settings/users` is the *platform* staff directory, a
  different model). Linked to the nearest related real page
  (`/settings/security`, `/settings/monitoring`) rather than a fabricated
  filter; a dedicated "platform users directory" screen is out of scope for
  this WP and would need its own permission/runtime-module decision.
- **"Unresolved errors" has only a partial drill-down filter** —
  `/settings/monitoring/error-logs` supports a single `viewKey`/`status`, not
  a combined "everything except RESOLVED/NOT_AN_INCIDENT" filter. Flagged for
  WP-09 rather than added, since both the frontend page and
  `platform-monitoring.service.ts` are WP-06-owned files this WP was told not
  to edit.
- **Platform-admin login/failed-login activity has no source at all** (see
  RISK_AREAS) — not just missing a drill-down, missing the underlying audit
  write. Out of scope to add here (touches `auth`/`platform-auth`, not
  `super-admin`); worth a backlog item if the platform team wants this
  monitored.
- **Pre-existing, not mine:** `modules/tenant-control-plane/tenant-erasure.constants.spec.ts`
  fails on the full suite (`UserMfaRecoveryCode` missing from the tenant
  erasure model coverage list) — introduced by WP-01's `10d5d148`, which
  added the tenant-owned model without updating this list. `schema.prisma`
  and this constants file are outside WP-07's scope; flagging for the
  Architect/WP-01 to close.
