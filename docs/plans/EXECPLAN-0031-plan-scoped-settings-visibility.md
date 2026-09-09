---
ID: PLAN-035
aliases: [PLAN-035, EXECPLAN-0031]
Title: Plan-scoped settings visibility — entitlements gate settings categories, groups and items
Status: IMPLEMENTED
Session: SESSION-0094
Type: ARCHITECTURE
Size: LARGE
CreatedAt: 2026-09-09
UpdatedAt: 2026-09-09
---

# EXECPLAN-0031 — Plan-scoped settings visibility

## Correction — this plan was first written against a stale checkout

**Read this before the sections below.** The first draft measured "Existing
behavior" in the user's primary checkout, which was on `develop` at `c22889ab`.
The task branch was cut from `origin/develop` at `4d0635a0`, sixteen commits
ahead, and in between another session had landed the API half of
[`BUG-1952`](../bugs/BUG-1952-plan-entitlements-gate-nothing-so-a-starter-tenant-can-use-e.md).
That record is now `Status: FIXED`, `ArchitectDisposition: DONE`.

What already existed at the real baseline, and was **not** built by this plan:

| Already shipped at `4d0635a0` | Path |
|---|---|
| The entitlement guard, with OFF / REPORT_ONLY / ENFORCE modes | `services/api/src/common/guards/entitlement.guard.ts` |
| `@RequireEntitlement`, on 28 controllers across 13 modules | `services/api/src/common/decorators/require-entitlement.decorator.ts` |
| The resolver, its cache and its stale-snapshot handling | `services/api/src/common/security/tenant-entitlement.service.ts` |
| The typed key mirror and the gated/ungated registers | `services/api/src/common/constants/tenant-features.ts` |
| The wiring invariant that fails on an undecorated controller | `entitlement-wiring.invariants.spec.ts` |
| The sidebar fix: the feature check now precedes the admin bypass | `apps/web/app/(authenticated)/_components/navigation.ts:302-313` |

So work packages **WP2, WP3 and WP6 below were already done by someone else**,
and the plan's original claim that `assertFeatureEnabled` had zero call sites was
true at `c22889ab` and irrelevant at `4d0635a0` — the enforcement was rebuilt
around a different primitive rather than by calling that one.

What was genuinely missing is exactly what the user reported: **the settings
information architecture**. It is a second structure with its own resolver and
its own registry, and the module-directory gate structurally cannot reach it.
The existing register says so itself — `branding` is exempted there on the
grounds that it is "enforced where settings resolve, not by a route gate" — and
nothing was enforcing where settings resolve. That gap is
[`BUG-2958`](../bugs/BUG-2958-settings-shows-every-category-group-and-page-regardless-of-t.md),
and it is what this plan actually delivered.

The sections below are left as written, with this correction governing. The
lesson is recorded as REG-396 and belongs to the `doc-code-drift` family: a
baseline measured in the wrong worktree produces a plan that is internally
coherent and externally wrong.

```
CONTEXT_FILES_REQUIRED:
  - .agent/context/task-completion-contract.md
  - .agent/context/agent-handoffs.md
  - .agent/context/question-protocol.md
  - .agent/context/failure-adaptation.md

SPECIALIST_AGENTS_REQUIRED:
  - Backend/API                        — the entitlement guard, the resolver cache, and
                                         the decorator on every feature-owned controller
  - Security                           — a new guard in the guard chain, an admin-role
                                         bypass to remove, and a fail-closed decision
  - Frontend                           — the settings landing, the category page, the
                                         settings nav, and the sidebar bypass
  - QA                                 — BUG-1952's five acceptance criteria are
                                         untested; a downgrade path has never been run
  - Product & Backlog Steward          — BUG-1952 triage disposition, ITEM-0110, and the
                                         attribution decisions in "Open product questions"
DELIBERATELY_NOT_USED:
  - Database                           — no schema change; Plan, PlanFeature, TenantFeature
                                         and Subscription already carry everything needed
  - Integration                        — no gateway, Stripe, agent or email contract changes
  - Release/DevOps                     — ordinary develop integration, no env var, no
                                         deployment ordering beyond api-before-web

SINGLE_WRITER_FILES:
  - services/api/src/common/guards/**            (new feature-entitlement guard)
  - services/api/src/app.module.ts               (only if the guard is registered globally —
                                                  the plan proposes it is not)
  - apps/web/lib/security-keys.ts                (FEATURE_KEYS already exists; extended only
                                                  if a new capability key is agreed)

QA_REQUIRED: yes

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - docs/qa/known-bug-patterns/doc-code-drift.md

REGRESSION_ENTRIES_IN_SCOPE:
  - none yet — BUG-1952 records "Regression Coverage: None yet"; this plan creates the
    first entry
```

```
TARGET_BRANCH:            develop
TARGET_ENVIRONMENT:       LOCAL
DEPLOYMENT_REQUIRED:      no    (a later RELEASE task promotes it)
DEPLOYMENT_COMPONENTS:    api, web
DEPLOYMENT_ORDER:         api -> web
ROLLBACK_CLASS:           CODE_ONLY
INTEGRATOR_REQUIRED:      yes
RELEASE_DEVOPS_REQUIRED:  no
POST_DEPLOY_QA_REQUIRED:  yes
MERGE_STRATEGY:           merge --no-ff
KNOWN_CONCURRENT_WORK:    SESSION-0076 (agent/open-bug-burndown) may edit
                          docs/bugs/BUG-1952-*.md. SESSION-0071
                          (agent/web-shell-accessibility) touches apps/web shell files.
                          `session.mjs check` reported SAFE_PARALLEL at plan time; re-run
                          it before each work package.
ENVIRONMENT_DEPENDENCIES: none
```

---

## Objective

A tenant sees, in Settings, only the configuration its subscription plan
entitles it to — at every level of the information architecture: the category
tile on the Configuration workspace, the group card inside a category, and the
individual setting page inside a group. The decision is made by the API from the
tenant's resolved entitlements and mirrored in the UI, so hiding a page and
refusing its data are the same decision rather than two that can drift. Any plan
an operator invents in Platform Admin — today's four or a custom one created
tomorrow — is honoured with no code change, because nothing anywhere branches on
a plan key.

## Business requirement

Plans are sold as tiers. Starter buys people operations; Payroll is an
Enterprise capability. The product must enforce what it sells, and the settings
surface must not advertise configuration the customer cannot use.

Reported by the user on 2026-09-09 against `dijipeople-demo.ws.dijipeople.com`,
whose tenant is on Starter: the Configuration workspace renders a **Payroll &
Finance** tile with six groups. The same report asks for two further things —
that future custom plans work without a code change, and that the audit go
inside each group rather than stopping at the tiles.

This is the settings half of **BUG-1952** (HIGH, P1, `ArchitectDisposition:
PLAN_REQUIRED`), which recorded the same defect across the whole product on
2026-08-29 and explicitly named "the entire Payroll & Finance tree (18 leaf
pages)". This plan is the ExecPlan that record asks for.

`TODO: Confirm product/business rule.` — what a tenant that *already holds data*
in a module sees the day its plan stops entitling that module. See "Open product
questions", Q3.

## Existing behavior

**FACT — the settings IA is resolved from permissions and roles only.**
`resolveVisibleSettingsRuntime(permissionKeys, roleKeys)` at
`apps/web/app/(authenticated)/settings/_lib/settings-runtime.ts:720-737` filters
items with `canViewSettingsItem`, drops groups left with no items, then drops
categories left with no groups. Entitlements are not a parameter. The
Configuration workspace calls it with exactly two arguments at
`apps/web/app/(authenticated)/settings/_components/settings-runtime-landing.tsx:47-50`,
and the settings side nav does the same at
`apps/web/app/(authenticated)/settings/_components/settings-runtime-nav.tsx:22`.

That empty-group and empty-category collapse is the mechanism this plan reuses.
It already works: the screenshot shows General Setup with 4 groups and
Customization with 3, while the static IA declares 3 and 5 — the difference is
permission filtering removing items and collapsing the groups around them.

**FACT — the IA itself carries no entitlement data.** `itemPlacement` at
`settings-runtime.ts:107-297` maps 88 setting items to one of 11 categories and
36 groups. Each tuple is `[category, groupKey, groupLabel]`. There is no feature
key in the structure and no field to put one in.

**FACT — the entitlement resolver exists and is correct.**
`FeatureAccessService.getResolvedTenantFeatures()` at
`services/api/src/modules/tenant-settings/feature-access.service.ts:11-71` reads
the tenant's subscription and its plan's `PlanFeature` rows, intersects them with
per-tenant overrides, and returns `enabledKeys`. It treats a subscription that is
not `ACTIVE` or `TRIALING` as entitling nothing, and a tenant override can only
narrow what the plan grants (`isIncludedInPlan && tenantOverride`,
line 33-37). That logic needs no change.

**FACT — the throwing primitive has zero call sites.**
`assertFeatureEnabled()` at `feature-access.service.ts:78-86` is the only
entitlement check in the API that refuses anything. Re-verified at
`origin/develop` 4d0635a: `grep -rn "assertFeatureEnabled" services/api/src`
returns the definition and nothing else. BUG-1952 recorded this at eb457d9d and
it is still true.

**FACT — the one consumer is the sidebar, and it fails open twice.**
`apps/web/app/(authenticated)/layout.tsx:129-131` fetches
`/tenant-settings/features/availability` and catches any failure to `null`.
`apps/web/app/(authenticated)/_components/navigation.ts:292-296` treats that
`null` as "allow everything". Above it, line 273-275 returns the item
unconditionally for `global-admin`, `system-admin` and `system-customizer`
*before* the feature check runs — so a tenant administrator, the role most likely
to be looking, sees every module regardless of plan.

**FACT — the settings data endpoints are not entitlement-gated.**
`SettingsRuntimeService.list()` at
`services/api/src/modules/settings-runtime/settings-runtime.service.ts:24-30`
scopes by `tenantId` and `settingKey` and checks nothing else; its controller
declares only `settings.read` / `settings.update`
(`settings-runtime.controller.ts:29-81`). The same is true of every domain
endpoint the payroll settings pages read from — `/pay-components`, `/tax-rules`,
`/payroll/gl-accounts`, `/payroll/employer-bank-accounts`, `/banks`,
`/benefits/policies`, `/loan-policies`, `/employee-tax-profiles`,
`/salary-package-rules`, `/payroll-regions`, `/claims/types` — all collected from
`apps/web/app/(authenticated)/settings/_lib/settings-adapter-registry.ts`.

**FACT — custom plans are already a solved data problem.** `PlanFeature`
(`services/api/prisma/schema.prisma:3952-3969`) is one row per plan per feature
key with an `isEnabled` boolean. Platform Admin edits them through
`apps/admin/app/_components/plans/plan-entitlements-panel.tsx` against
`apps/admin/app/api/super-admin/feature-catalog/route.ts`. BUG-0994, which made
that panel blank out entitlements on save, is `Status: VERIFIED`,
`ArchitectDisposition: DONE`. Nothing about plan storage needs to change.

**What already works and must keep working**

- Permission and role filtering of settings items, and the group/category
  collapse built on it.
- The Apps & Modules page (`features`), where a tenant admin switches off a
  capability the plan *does* include. It must stay reachable on every plan —
  it is the surface that shows what the plan grants and what an upgrade adds.
- Platform admin surfaces. They are `authSubjectType: 'platform-user'` and must
  never be entitlement-gated.
- `/tenant-settings/features/availability` returning `{ items, enabledKeys }`
  under `tenant-settings.resolved.read`, deliberately not `settings.read`, so
  ordinary employees can render a menu
  (`tenant-settings.controller.ts:153-187`).

## Existing architecture

| Layer | Path | Role in this change |
|---|---|---|
| Feature catalog | `services/api/src/modules/tenant-settings/tenant-settings.catalog.ts:701` | The 12 canonical feature keys. Single source of truth. |
| Entitlement resolver | `services/api/src/modules/tenant-settings/feature-access.service.ts` | Plan ∩ tenant override → `enabledKeys`. Reused unchanged. |
| Plan definitions | `services/api/src/modules/super-admin/plans.catalog.ts:22-38` | Seeded defaults only. Not read at request time. |
| Availability endpoint | `services/api/src/modules/tenant-settings/tenant-settings.controller.ts:178-187` | Already serves the web shell. Reused. |
| Guard chain | `services/api/src/common/guards/jwt-auth.guard.ts`, `permissions.guard.ts` | Where the new guard joins. Guards run before pipes in Nest, which is what makes a refusal precede DTO validation. |
| Web feature keys | `apps/web/lib/security-keys.ts:312-321` | Mirrors 8 of the 12 keys today. |
| Settings IA | `apps/web/app/(authenticated)/settings/_lib/settings-runtime.ts` | Gains the item→feature attribution and an entitlement parameter. |
| Sidebar nav | `apps/web/app/(authenticated)/_components/navigation.ts` | Already has `requiredFeatureKey`; the bypass and the fail-open both move. |

Patterns this change must follow: the two-permission-system rule
(`@Permissions` + `@RequirePermission`) is untouched and entitlement is a
**third, orthogonal** check — a capability the tenant did not buy is refused even
to a caller who holds every permission. Configuration over hardcoding: no code
anywhere may branch on a plan key or a plan name.

## The audit — every settings item, attributed

All 88 items in `itemPlacement`, with the feature key proposed for each. `CORE`
means "no plan gates this; it renders on every plan" and is a deliberate
declaration, not an omission — the coverage spec in Requirement 9 rejects an item
that is in neither column.

Rows marked **LEAK** are what a Starter tenant sees today and must not.
Starter entitles `employees`, `organization`, `leave`, `attendance`,
`documents`, `notifications`, `branding`; it does not entitle `timesheets`,
`projects`, `recruitment`, `onboarding`, `payroll`
(`plans.catalog.ts:22-38`).

### General Setup

| Group | Item | Feature | |
|---|---|---|---|
| Tenant & Company | `tenant` | CORE | |
| Organization Structure | `organizations`, `business-units`, `departments`, `organization-teams` | `organization` | |
| Apps & Modules | `features` | CORE | must stay — it is the upgrade surface |
| Apps & Modules | `recruitment` | `recruitment` | **LEAK** — item leaks inside a group that survives |
| Apps & Modules | `desktop-agent` | `attendance` | see Q1 |

### People Configuration

| Group | Item | Feature | |
|---|---|---|---|
| Workforce Structure | `designations`, `employment-types`, `employee-settings`, `employee-levels` | `employees` | |
| Work Management | `locations`, `work-calendars`, `holiday-calendars`, `shifts`, `work-schedules` | CORE | see Q2 |
| Attendance & Time | `attendance` | `attendance` | |
| Attendance & Time | `timesheets` | `timesheets` | **LEAK** — item leaks inside a group that survives |
| Document Rules | `document-categories`, `documents` | `documents` | |
| Leave Configuration | `leave-types`, `leave-policies` | `leave` | |

### Regional Operations

| Group | Item | Feature | |
|---|---|---|---|
| Payroll Geography | `payroll-regions` | `payroll` | **LEAK** — the whole group collapses |
| Countries & States | `countries`, `states`, `cities` | CORE | |
| Localization | `timezones` | CORE | |
| Currency | `currencies` | CORE | |
| Business Calendar | `fiscal-years` | CORE | see Q2 |

### Payroll & Finance — **the entire category is a LEAK on Starter**

| Group | Item | Feature |
|---|---|---|
| Payroll Cycles | `payroll-periods` | `payroll` |
| Payroll Configuration | `pay-components`, `claim-types`, `travel-allowance-policies`, `time-payroll-policies`, `overtime-policies`, `tax-rules`, `employee-tax-profiles`, `gl-accounts`, `posting-rules`, `payroll-settings`, `salary-package-rules` | `payroll` |
| Benefit Plans | `benefit-policies` | `payroll` |
| Loan Plans | `loan-policies` | `payroll` |
| Banking | `banks`, `payroll-banks`, `employer-bank-accounts` | `payroll` |
| Operations and Governance | `document-templates` | `payroll` — see Q4 |

Eighteen items, six groups, one category tile. All eighteen resolve to
`payroll`, so the category collapses whole on any plan without it.

### Security & Access, Approvals & Workflows, Audit & Compliance, Customization — CORE throughout

| Category | Items |
|---|---|
| Security & Access | `users`, `roles`, `permissions`, `access-teams`, `access-center`, `field-security`, `password-login-policies`, `login-history` |
| Approvals & Workflows | `approval-matrices`, `delegation-rules`, `escalation-rules`, `workflow-templates`, `policy-engine` |
| Audit & Compliance | `audit-logs`, `data-access-history`, `retention-rules`, `compliance-exports` |
| Customization | `tables`, `fields`, `forms`, `views`, `action-bars`, `widgets`, `rules`, `packages`, `publish-center` |

Approvals is CORE because Starter buys Leave, and leave approvals are routed
through these pages. Customization is CORE **because no feature key exists for
it** — see Q5, which is the one place this audit recommends adding a key rather
than choosing between the twelve.

### Notifications, Appearance, Integrations

| Category | Group | Item | Feature |
|---|---|---|---|
| Notifications & Communication | all four groups | `notifications`, `notification-email-templates`, `notification-email-providers`, `notification-email-logs` | `notifications` |
| Appearance & Experience | Branding & Theme | `branding` | `branding` |
| Appearance & Experience | Workspace Experience | `system-preferences` | CORE |
| Integrations | Attendance Capture | the six `attendance-*` items | `attendance` |
| Integrations | Gateways & Installers | `attendance-gateways` | `attendance` |
| Integrations | Gateways & Installers | `apps-downloads` | CORE — see Q1 |

### What the audit found beyond the reported tile

**INFERENCE — three of the four leaks are invisible at the tile level.** Only
Payroll & Finance disappears as a whole category. `timesheets` hides inside
People > Attendance & Time next to an entitled `attendance` item, `recruitment`
hides inside General Setup > Apps & Modules next to two items that must stay, and
`payroll-regions` collapses only its own group inside a Regional Operations
category that survives. The user's instinct to look inside the groups was right:
a category-level fix would have left three of four leaks in place.

**FACT — two disabled Starter features have no settings leak at all.**
`projects` and `onboarding` are disabled on Starter and neither appears anywhere
in `itemPlacement`. Their leak, recorded in BUG-1952, is in the sidebar and the
API, not in Settings.

**INFERENCE — BUG-1952 lists one item that may not be a leak.** That record names
"Desktop Agent" among the settings a Starter tenant should not see. The desktop
agent is an attendance capture client, and Starter buys `attendance`. If Q1 is
answered "attendance", Desktop Agent is correctly visible on Starter and that
line of BUG-1952 is wrong. Resolve Q1 before quoting the record as a target.

## Requirements

1. `resolveVisibleSettingsRuntime` accepts the tenant's resolved
   `enabledFeatureKeys` and removes any item whose attributed feature key is
   absent from it. Groups and categories collapse through the mechanism already
   at `settings-runtime.ts:734-736`.
2. Every one of the 88 entries in `itemPlacement` carries either a feature key
   from `TENANT_FEATURE_DEFINITIONS` or an explicit `CORE` marker. Neither may be
   inferred from absence.
3. A settings item whose feature the tenant does not hold is not reachable by
   URL either. `/settings/payroll`, `/settings/payroll/cycles` and
   `/settings/payroll/cycles/payroll-periods` render an "not available on your
   plan" state, not the page and not a 404.
4. When entitlements cannot be resolved, Settings **fails closed**: it renders an
   explicit error state naming the failure, not a silently trimmed list and not
   the full list. A blip must be visible as a blip.
5. No role bypasses the entitlement check. The `hasPrivilegedSidebar` early
   return at `navigation.ts:273-275` moves below the feature check, and no
   equivalent is introduced in the settings resolver.
6. The API refuses reads and writes to a capability the tenant does not hold,
   for every role including tenant administrators, and refuses **before** DTO
   validation so a malformed and a well-formed body fail identically on
   entitlement.
7. An entitlement lookup that throws denies. It never resolves to allow-all.
8. Platform callers (`authSubjectType: 'platform-user'`) are never
   entitlement-gated, and background jobs, queue processors and seeds — which
   carry no request context — are unaffected.
9. A test fails the build when an item is added to `itemPlacement` without an
   attribution, and when a controller in a feature-owned API module carries no
   entitlement decorator. Both assert behaviour, not the presence of a string.
10. No code branches on a plan key, a plan name or a plan id. A custom plan
    created in Platform Admin with any combination of the twelve checkboxes is
    gated correctly with zero code change, and the procedure for adding a
    thirteenth capability is documented.
11. The Apps & Modules page stays reachable on every plan, and shows which
    capabilities the current plan does not include.

## Dependencies

- **BUG-1952** — the parent record. Its `ArchitectDisposition` is
  `PLAN_REQUIRED`; this plan discharges that. Its five acceptance criteria are
  inherited by Requirements 5, 6, 7 and 8.
- **ITEM-0110** — asks whether an unentitled module should accrue records at
  all. BUG-1952 says this record's enforcement design should answer it rather
  than answering it separately. Q3 below is that answer.
- **BUG-0994** — `VERIFIED` / `DONE`. Custom-plan entitlement editing depends on
  it and it has landed. No blocker.
- **Open product questions Q1-Q5** — Q3 and Q5 block work packages; Q1, Q2 and
  Q4 change individual table rows and can be answered while WP1 is built.

Nothing external. No credentials, no third-party system, no data migration.

## Files / modules affected

**`services/api`**
- `src/common/decorators/requires-feature.decorator.ts` — new
- `src/common/guards/feature-entitlement.guard.ts` — new · **SINGLE_WRITER**
- `src/common/constants/tenant-feature-keys.ts` — new; re-exports the catalog's
  keys as a typed constant so controllers do not import from a module barrel
- `src/modules/tenant-settings/feature-access.service.ts` — a per-request cache;
  no change to the resolution logic
- `src/modules/tenant-settings/tenant-settings.module.ts` — export the resolver
  for the guard
- the controllers of `payroll`, `payslips`, `pay-components`, `compensation`,
  `tax-rules`, `loans`, `claims`, `benefits`, `business-trips`, `time-payroll`,
  `timesheets`, `projects`, `recruitment`, `onboarding` — one decorator each
- `src/modules/settings-runtime/settings-runtime.controller.ts` — per-key
  entitlement, since one controller serves fifteen setting keys of mixed
  attribution

**`apps/web`**
- `app/(authenticated)/settings/_lib/settings-entitlements.ts` — new; the item→feature map
- `app/(authenticated)/settings/_lib/settings-runtime.ts` — the third parameter
- `app/(authenticated)/settings/_components/settings-runtime-landing.tsx`
- `app/(authenticated)/settings/_components/settings-runtime-nav.tsx`
- `app/(authenticated)/settings/[category]/page.tsx`
- `app/(authenticated)/settings/[category]/[settingGroup]/page.tsx`
- `app/(authenticated)/_components/navigation.ts` — the bypass and the fail-open
- `app/(authenticated)/_components/authenticated-shell-provider.tsx` — expose
  `enabledFeatureKeys` to client components that need it
- `app/(authenticated)/layout.tsx:129-131` — distinguish "resolved to nothing"
  from "failed to resolve"
- `lib/security-keys.ts` — the four missing keys · **SINGLE_WRITER**

**`docs`**
- `docs/architecture/settings-and-branding.md` — the canonical settings contract
  gains the entitlement layer
- `docs/bugs/BUG-1952-*.md` — evidence for the three within-group leaks; the
  Desktop Agent correction; the plan reference
- `docs/backlog/ITEM-0110` — answered by Q3
- a new ADR for each answered product question

## Database impact

**None.** `Plan`, `PlanFeature`, `TenantFeature` and `Subscription` already carry
everything the resolver reads, and the resolver is unchanged. No model, no
column, no index, no migration, no backfill.

This is deliberate and is what makes Requirement 10 cheap: custom plans are rows,
not code.

## Backend impact

**A decorator and a guard, not a global interceptor.**

```ts
@RequiresFeature(TENANT_FEATURE_KEYS.PAYROLL)
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureEntitlementGuard)
```

`FeatureEntitlementGuard` reads the decorator's metadata (handler first, then
controller), returns `true` when there is none, returns `true` when
`request.user.authSubjectType === 'platform-user'`, and otherwise resolves
`enabledKeys` for `request.user.tenantId` and throws when the key is absent.

**Why a guard rather than a global interceptor or a service-layer call.** Nest
runs guards before pipes, so a refusal precedes `ValidationPipe` — which is
BUG-1952's second acceptance criterion in as many words. An interceptor runs
after the pipe and would fail that criterion. A service-layer call would have to
be added to hundreds of methods and would be forgotten on the next one; the
coverage spec in Requirement 9 cannot police a call site it cannot see.

**Not registered globally.** A global guard would default every one of the 67
modules to gated, and the first unlabelled controller would 403 in production.
Explicit application plus a coverage spec fails at build time instead.

**Errors.** A new catalog entry in `common/errors/error-catalog.ts` —
`FEATURE_NOT_ENTITLED`, HTTP 403 — carrying the feature key, its label and a
description pointing at the upgrade path. Not a bare `ForbiddenException`: three
frontends and the agent read `errorCode`, and "not on your plan" must be
distinguishable from "you lack the permission", or the web app cannot render the
right state.

**Caching.** `getResolvedTenantFeatures` is two queries. Uncached, a guard on
every request doubles the query count on hot endpoints. Proposal: memoise on the
request object, keyed by tenant id, so N guards in one request cost one
resolution. A cross-request TTL cache is explicitly **not** proposed — a plan
change must take effect on the next request, and a stale allow is the failure
mode this whole plan exists to remove.

**New endpoint: none.** `/tenant-settings/features/availability` already serves
`enabledKeys` under a permission ordinary employees hold. The web app needs
nothing more.

**Reused rather than reimplemented:** `FeatureAccessService` in full. The plan
adds no second entitlement resolution path — the duplicate-source-of-truth rule
is exactly what BUG-1952 is an instance of.

## Frontend impact

**`apps/web`, through the settings runtime.** No bespoke screen. The
Configuration workspace, the category page and the group page are already
rendered by the runtime components, and the change is to what the resolver
returns rather than to what the components draw.

- `resolveVisibleSettingsRuntime(permissionKeys, roleKeys, enabledFeatureKeys)`.
  A `null` third argument means unresolved and throws rather than defaulting —
  the calling component renders the error state. This is the fail-closed
  decision in Requirement 4, expressed as a type rather than a convention.
- The item→feature map lives in its own file, `settings-entitlements.ts`, keyed
  by the same item keys as `itemPlacement`, with `CORE` as a literal value. Kept
  separate so the coverage spec compares two structures rather than trusting one.
- **Direct navigation** (Requirement 3) is handled in
  `[category]/page.tsx` and `[category]/[settingGroup]/page.tsx`, which already
  resolve the category and group and can consult the same map.

**States.** Four, all using existing shared components:

| State | Component | Copy |
|---|---|---|
| Not on your plan | `ModuleEmptyState` | names the capability and links to Apps & Modules |
| Entitlements unresolved | `error.tsx` | names the failure, offers retry; does not guess |
| Loading | existing `loading.tsx` | unchanged |
| Access denied (permission) | `AccessDeniedState` | unchanged — must stay distinct from "not on your plan" |

The distinction in that last row matters: "you do not have permission" is a
question for the tenant's own admin, "your plan does not include this" is a
question for DijiPeople sales. Collapsing them into one message sends customers
to the wrong place.

**Sidebar.** `navigation.ts` keeps `requiredFeatureKey`; the privileged-role
early return moves below the feature check, and `enabledFeatureKeys === null`
stops meaning allow-all.

**Responsive and accessibility.** No new layout. The empty state is text plus a
link, so nothing is encoded in colour alone, and the category grid reflows as it
does today with fewer cards.

## Permission / RBAC impact

- **No new permission keys**, in either system. Entitlement is orthogonal: it
  answers "did this tenant buy the capability", which is not a question either
  permission system models, and folding it into `rbac-matrix.ts` would make a
  commercial fact look like an authorization fact.
- **No changes to `common/constants/permissions.ts` or `rbac-matrix.ts`.**
- **Elevated-role bypass — removed, not added.** `hasElevatedTenantRole` skips
  `PermissionsGuard`; `FeatureEntitlementGuard` must not honour it, and the
  frontend bypass at `navigation.ts:273-275` is deleted. This is the change most
  likely to be reported as a regression by an administrator who has always seen
  every menu. Say so in the release note.
- **Mirrored into `apps/web/lib/security-keys.ts`:** `FEATURE_KEYS` currently
  lists 8 of the 12 catalog keys and is missing `organization`, `documents`,
  `notifications` and `branding`. All four are needed by the attribution map.
- **Row-level scope:** unchanged. `buildScopedAccessWhere()` is not involved —
  entitlement is a tenant-wide fact, not a per-record one.

## Tenant-isolation impact

No new query reads a tenant-owned model outside the existing resolver.
`FeatureAccessService.getResolvedTenantFeatures(tenantId)` takes `tenantId` as an
explicit argument, and the guard passes `request.user.tenantId` — never a body,
query, path param or header. Requirement 8's platform exemption is a check on
`request.user.authSubjectType`, which is set by `JwtAuthGuard` from the verified
token, not from client input.

**How a reviewer confirms it:** the guard's only data access is one call to
`getResolvedTenantFeatures`, and its only argument is `request.user.tenantId`.
Grep the guard for `body`, `query`, `params` and `headers`; there must be no
hits. The per-request cache must be keyed by tenant id and stored on the request
object, never on the service instance — a service-instance cache in a singleton
provider would serve one tenant's entitlements to the next tenant's request, and
that would be a cross-tenant leak introduced by a plan whose purpose is to close
a leak. Call it out in review explicitly.

## Audit / event / logging impact

- **No `AuditService.log()` call from the guard.** A refused request changes no
  state, and logging every denial would write a row per hidden menu item per page
  load.
- **A denial is logged through `ErrorLogsService`** by the existing
  `HttpExceptionFilter`, which is how every other catalog error is recorded. The
  `FEATURE_NOT_ENTITLED` code makes them countable, which is the signal Sales
  wants: repeated denials on one tenant are an upgrade conversation.
- **Never logged:** nothing new is sensitive here. The guard logs the feature key
  and the tenant id, not the resolved entitlement set and not the subscription's
  price fields — `getFeatureAvailability` already drops the subscription block
  for exactly this reason (`tenant-settings.controller.ts:171-176`).
- **No platform event and no tenant notification.** A plan change already emits
  through the existing subscription path; this plan adds no event.

## Integration impact

**None.** The .NET gateway authenticates as a gateway, not a tenant user, and
touches attendance endpoints only. The desktop agent authenticates on the
`agent-desktop` client and is attendance capture — if Q1 attributes it to
`attendance`, its endpoints are entitled wherever the agent is deployed. Stripe,
email and storage are untouched.

**One caution:** if Q1 answers `desktop-agent` as something other than
`attendance`, already-deployed agents on tenants without that capability would
begin receiving 403s from a version of the API they cannot be upgraded past.
That is a backward-compatibility break, and it is the reason Q1 is a question
rather than an assumption.

## Migration / data compatibility

- **Already-stored data is untouched.** A tenant with payroll rows and no payroll
  entitlement keeps its rows; it cannot read or write them through the API until
  the plan entitles them again. Nothing is deleted, archived or migrated. This is
  the answer Q3 must confirm.
- **Already-deployed clients.** The web app ships after the API. Between the two
  deploys, a tenant on a plan missing a capability gets a 403 on a page the
  sidebar still offers — a visible error, not a silent wrong answer. Shipping the
  web app first would be worse: pages hidden while the API still serves them,
  which is today's bug with the sign flipped. **API first is not optional.**
- **Old and new run simultaneously** during the rollout window. The API is the
  authority in both directions, so there is no state that can diverge.
- **The demo tenant.** BUG-1952 records a probe project created on the Starter
  demo tenant that cannot be deleted (BUG-2007). After enforcement, `projects`
  becomes unreadable there and that row becomes invisible rather than removed.
  Note it in the QA run so it is not reported as data loss.

## Parallel-safe tasks

`PARALLEL_SAFE`

- **WP1 — the attribution map.** `settings-entitlements.ts` plus the coverage
  spec (Requirement 2 and the first half of Requirement 9). Depends on no other
  package; the four `CORE` rows under question stay `TODO` until Q1, Q2 and Q4
  land, and the spec accepts a `TODO` marker as a third state that fails the
  build only once the questions are closed.
- **WP2 — the guard and the decorator.** `requires-feature.decorator.ts`,
  `feature-entitlement.guard.ts`, the error-catalog entry, the per-request cache,
  and their unit specs. Touches no controller yet.
- **WP5 — `security-keys.ts`.** The four missing feature keys. One file,
  `SINGLE_WRITER`; land it early and alone.

## Dependency-blocked tasks

`DEPENDENCY_BLOCKED`

- **WP3 — apply the decorator to feature-owned controllers.** Blocked by WP2.
  Fourteen modules; the coverage spec that makes a missing decorator a build
  failure ships in the same package as the decorators, or it will be written
  against whatever was done rather than against what was required.
- **WP4 — the web settings resolver and its four states.** Blocked by WP1 and
  WP5. Includes the `[category]` and `[settingGroup]` route guards and the
  landing, nav and category components.
- **WP6 — the sidebar bypass and fail-open.** Blocked by WP5. Separable from WP4
  and deliberately separate: it changes what an administrator sees on every page
  of the product, and it should be reviewable on its own.
- **WP7 — documentation and records.** Blocked by every code package. Updates
  `docs/architecture/settings-and-branding.md`, adds BUG-1952's within-group
  evidence and the Desktop Agent correction, answers ITEM-0110, and writes one
  ADR per closed question.

## Integration tasks

`INTEGRATION`

- **WP8 — end-to-end verification on a provisioned tenant.** Provision a tenant
  on a plan with capabilities disabled, then assert refusal and invisibility
  together: the API refuses, the settings tile is gone, the group is gone, the
  item inside a surviving group is gone, and the direct URL renders the plan
  state. Runs last because it is the only package that proves the UI filter and
  the API refusal are the same decision.
- **WP9 — the custom-plan proof.** Create a plan in Platform Admin that matches
  none of the four seeded ones — say, `payroll` on and `leave` off — subscribe a
  tenant to it, and confirm Settings follows with no deploy. This is
  Requirement 10's only real test; everything else could pass while a plan key
  was hardcoded somewhere.

## Testing strategy

Commands, all from AGENTS.md:

```bash
npm --workspace web  run test          # the attribution and resolver specs
npm --workspace web  run check-types
npm --workspace api  run test          # the guard specs and the coverage spec
npm --workspace api  run test:e2e      # entitlement refusal end to end
npm --workspace api  run check-types
npm run lint                           # prettier is a required CI gate
npm run typecheck
npm run validate:framework
npm run qa:check
```

`DATABASE_URL` must be set to a dummy value for the api unit tests; several
specs throw at import time without one.

**Existing specs extended**

- `apps/web/app/(authenticated)/settings/_lib/settings-runtime.spec.ts` — already
  iterates `settingsRuntimeCategories` and asserts the category count is 11; it
  gains the entitlement cases.
- `apps/web/app/(authenticated)/settings/_lib/settings-doc-routes.spec.ts` —
  asserts every category is documented; extended so an entitlement-gated category
  is still documented.
- `services/api/src/common/constants/wiring-invariants.spec.ts` — the coverage
  assertion for Requirement 9's second half belongs here, beside the existing
  wiring invariants, and it must reflect the real Nest application rather than a
  regex over source. A static scan of controller files would pass while the guard
  was unregistered.
- `services/api/test/permission-propagation.e2e-spec.ts` — the entitlement e2e
  sits beside it, not inside it; entitlement is not a permission.

**New specs and what they assert**

| File | Asserts |
|---|---|
| `settings-entitlements.spec.ts` | every `itemPlacement` key has an attribution; every attributed key exists in the catalog; no key is attributed twice differently |
| `settings-runtime.entitlements.spec.ts` | a Starter key set produces no Payroll category, no Payroll Geography group, and no `timesheets` or `recruitment` item; an Enterprise set produces all 11 categories; an unresolved set throws |
| `feature-entitlement.guard.spec.ts` | denies on missing key; denies when the resolver **throws**; allows a platform subject; allows when no decorator; does not consult roles |
| `test/feature-entitlement.e2e-spec.ts` | BUG-1952's five criteria, including `POST` refused before DTO validation and refusal for an administrator role |

**The negative tests are the ones that matter.** A spec that only asserts an
Enterprise tenant sees everything passes after the gate is deleted. Each new
spec must be mutation-tested: delete the check it covers and confirm the spec
goes red. Note the CRLF hazard — a source-reading assertion written with a
literal `\n` matches nothing on this checkout and everything on CI.

**Manual verification** (WP8, on a local stack)

1. Provision a tenant on Starter. Sign in as its `global-admin`.
2. Open `/settings`. Expect 10 category tiles, no Payroll & Finance.
3. Open Regional Operations. Expect 4 groups, no Payroll Geography.
4. Open People Configuration > Attendance & Time. Expect Attendance Settings and
   no Timesheet Settings.
5. Open General Setup > Apps & Modules. Expect Features and Desktop Agent, no
   Recruitment.
6. Navigate directly to `/settings/payroll/cycles/payroll-periods`. Expect the
   plan state, not the page and not a 404.
7. `GET /api/payroll/cycles`, `GET /api/projects`, `POST /api/projects` with a
   valid body and `POST /api/payroll/cycles` with a deliberately malformed one.
   Expect `FEATURE_NOT_ENTITLED` on all four — the malformed one proving the
   guard ran before the pipe.
8. In Platform Admin, switch the tenant to Enterprise. Reload. Expect all 11
   tiles with no deploy and no restart.
9. Switch back to Starter. Confirm the payroll rows created under Enterprise
   still exist in the database and are simply unreachable.

## Risks

Ranked; the first three are the ones that can do damage.

1. **A service-instance entitlement cache leaks one tenant's plan to another.**
   *Likelihood* low, *impact* critical — a cross-tenant leak introduced by a
   leak fix. *Mitigation:* cache on the request object only, never on the
   provider; a review checklist item; a spec that resolves two tenants through
   one guard instance and asserts different answers.
2. **Fail-closed turns a transient API blip into a support incident.**
   *Likelihood* medium, *impact* high. Today a failed entitlement fetch shows
   everything; after this change it shows an error. *Mitigation:* Requirement 4's
   explicit error state, so the cause is legible rather than looking like data
   loss; the availability endpoint is already on the authenticated layout's
   critical path, so a failure there is rarely isolated.
3. **A capability is mis-attributed and a paying customer loses a page.**
   *Likelihood* medium, *impact* high — Enterprise is entitled to everything, so
   this bites Growth and any custom plan. *Mitigation:* the audit table above is
   reviewed by the Product Steward before WP4 ships, not after; Q1, Q2 and Q4
   exist because those rows are genuinely undecided; WP9 tests a plan shape
   nobody has sold.
4. **Administrators report the sidebar change as a regression.**
   *Likelihood* high, *impact* low. Removing the `hasPrivilegedSidebar` bypass
   changes what every tenant admin sees. *Mitigation:* name it in the release
   note; it is the intended behaviour and BUG-1952's fourth acceptance criterion.
5. **The guard is added to a controller that also serves an entitled capability.**
   *Likelihood* medium, *impact* medium. `settings-runtime` serves fifteen
   setting keys of mixed attribution from one controller — a controller-level
   decorator there would gate `retention-rules` behind `payroll`. *Mitigation:*
   per-key resolution inside that controller, and a spec covering each of its
   fifteen keys.
6. **Query load doubles on hot endpoints.** *Likelihood* low given the
   per-request cache, *impact* medium. *Mitigation:* the cache; measure before
   and after on the dashboard endpoint, which fans out widest.
7. **BUG-1952 edited concurrently by SESSION-0076.** *Likelihood* medium,
   *impact* low. *Mitigation:* WP7 runs last; re-run `session.mjs check` before
   touching the record; take origin's side on a generated-index conflict and
   re-run the generators rather than hand-merging.

## Rollback considerations

**Fully reversible. `ROLLBACK_CLASS: CODE_ONLY`.** No migration, no data change,
no external contract. Reverting the merge restores today's behaviour exactly.

- **Web without API:** pages hidden while the API still serves their data.
  Cosmetic, and it is today's bug inverted. Recoverable by reverting the web
  deploy alone.
- **API without web:** a tenant sees a menu entry that 403s. Visibly broken but
  not dangerous, and it is the intended intermediate state of the ordered
  rollout.
- **Partial rollback is safe in both directions** because the API is the
  authority in both.
- **Kill switch:** none proposed, and that is deliberate. An environment variable
  that disables entitlement enforcement is a variable that will be found switched
  on in production during an incident, and the whole point of this plan is that
  the commercial boundary is real. If a mis-attribution takes out a paying
  customer, the fix is a one-line map change and a web deploy, which is faster
  than debating a flag.

## Definition of Done

- [ ] All 88 `itemPlacement` entries attributed; the coverage spec fails on a new
      unattributed item, verified by adding one and watching it go red
- [ ] Q1-Q5 answered, each as an ADR; no `TODO` markers left in the map
- [ ] `FeatureEntitlementGuard` denies on a missing key, denies when the resolver
      throws, allows platform subjects, and ignores elevated tenant roles
- [ ] BUG-1952's five acceptance criteria pass as automated tests, not as a
      manual observation
- [ ] Entitlement caching is request-scoped; the two-tenant spec passes
- [ ] `hasPrivilegedSidebar` no longer precedes the feature check
- [ ] Entitlement resolution failure renders an error state, never a trimmed list
- [ ] "Not on your plan" and "you lack permission" are distinguishable in the UI
- [ ] Direct URLs to an unentitled category, group and item all render the plan
      state
- [ ] Apps & Modules reachable on every plan
- [ ] No code references a plan key, name or id; WP9's custom plan passes with no
      deploy
- [ ] Every new spec mutation-tested — delete the check, confirm red
- [ ] `npm --workspace web run test`, `npm --workspace api run test`,
      `npm --workspace api run test:e2e`, `npm run lint`, `npm run typecheck`,
      `npm run validate:framework`, `npm run qa:check` all pass, with results
      reported per command
- [ ] `docs/architecture/settings-and-branding.md` carries the entitlement layer
- [ ] BUG-1952 updated with the three within-group leaks and the Desktop Agent
      correction; a REG entry and a QA scenario filed
- [ ] ITEM-0110 answered
- [ ] No unrelated changes in the diff; no reformatting of untouched files

---

## Open product questions — all five answered

**Answered on 2026-09-09 and recorded as
[ADR-0005](../decisions/ADR-0005-settings-capability-attribution.md).** Q1:
Desktop Agent becomes its own sold capability, gating the settings page only.
Q2: Work Management and Business Calendar stay core. Q3: downgraded data is
retained and unreachable, which also answers ITEM-0110. Q4: Document Templates
is Documents and moves out of the payroll tree. Q5: Customization stays free,
deliberately. The questions are left below as they were asked, because the
reasoning in each is what the ADR's decisions are answers to.

Each routed through the Architect to the user under
[`question-protocol.md`](../../.agent/context/question-protocol.md) and becomes
an ADR, so nobody is asked twice.

**Q1 — Which capability does the Desktop Agent belong to?** It is an attendance
capture client, so `attendance` is the obvious answer and makes it correctly
visible on Starter. But BUG-1952 lists Desktop Agent among what a Starter tenant
should not see, and if that is the product intent it needs its own capability
key, not one of the twelve. `apps-downloads` and `attendance-gateways` follow
whatever this answers. *Blocks two rows of the audit and the integration caution
above.*

**Q2 — Are Work Management and Business Calendar core, or attendance and payroll?**
`locations`, `work-calendars`, `holiday-calendars`, `shifts` and `work-schedules`
are proposed CORE because holiday calendars serve Leave, which Starter buys. But
shifts and work schedules exist mainly for attendance, and `fiscal-years` exists
mainly for payroll. Attributing them narrowly hides configuration a Starter
tenant genuinely uses; attributing them CORE leaves payroll-shaped pages visible
on a plan without payroll. *Six rows.*

**Q3 — What does a tenant with existing data see after a downgrade?** The plan
assumes: data retained, unreachable, and the UI says why. The alternative —
read-only access to existing records with writes refused — is defensible and is
more work. This also answers ITEM-0110's question about whether an unentitled
module should accrue records: under this plan it cannot, because writes are
refused. *Blocks WP3 and WP4.*

**Q4 — Is `document-templates` payroll?** It sits in the payroll category under
"Operations and Governance" but reads generic document templating from
`settings-runtime`. If it is not payroll, it moves out of that category
entirely, which is an IA change beyond this plan's scope and should become its
own backlog item. *One row.*

**Q5 — Should Customization be a sold capability?** Nine items across five
groups — runtime metadata, form and view designers, packages, publishing — with
no feature key. They are the most Enterprise-shaped thing in Settings and are
currently free on Starter. Making them a capability means a thirteenth key in
`TENANT_FEATURE_DEFINITIONS`, a `PlanFeature` row per plan, and a decision about
existing tenants who have already built customizations. Left CORE, the audit is
otherwise complete and this is a commercial decision the engineering plan should
not make quietly. *Nine rows, and the only question that adds a feature key.*

## How a future custom plan works — the extension procedure

Two distinct cases, and only one of them is code.

**A new plan using existing capabilities — no code.** An operator creates the
plan in Platform Admin, ticks any subset of the twelve capabilities, publishes
it, and subscribes a tenant. `PlanFeature` rows are written;
`getResolvedTenantFeatures` reads them; the guard and the settings resolver
follow. Nothing in this plan branches on a plan key, name or id, so there is
nothing to update. WP9 exists to prove this rather than assert it.

**A new capability the twelve do not cover — four edits.**

1. Add the key to `TENANT_FEATURE_DEFINITIONS`
   (`services/api/src/modules/tenant-settings/tenant-settings.catalog.ts:701`).
2. Mirror it into `FEATURE_KEYS` (`apps/web/lib/security-keys.ts:312`).
3. Attribute the settings items it owns in `settings-entitlements.ts`, and
   decorate the controllers it owns.
4. Decide which seeded plans include it, in `plans.catalog.ts`.

**Correction to an earlier draft of this section.** It claimed step 4 leaves
existing plans without the new key until somebody edits each one by hand. That
is wrong, and the mistake was reading `ensurePlans` and stopping before
`reconcilePlan`. `reconcilePlan` calls `reconcilePlanFeatures`
(`commercial-bootstrap.ts:240-244`), which converges an existing plan's feature
rows against the catalog in both directions — creating a row for a newly listed
key and disabling one the catalog has dropped. So on a live platform the next
`seed:config`, which every release runs, gives the four seeded plans their new
rows. No repair script is needed, and one was drafted and discarded on that
basis.

Two caveats survive. Plans an operator created by hand are **not** in the
catalog and are not reconciled — they keep whatever the operator set, which is
correct, since the catalog is not authoritative for them. And carving a key out
of what was previously free is still a silent removal for anyone already using
it: `getResolvedTenantFeatures` treats a missing `PlanFeature` row as `false`
(`feature-access.service.ts:31`), so the capability goes dark for every tenant
whose plan does not list it. For a genuinely new capability that is correct. For
Decision 5's Customization, were it ever sold, it would need a backfill shipped
in the same change — which is why ADR-0005 says so rather than leaving it to be
discovered.
