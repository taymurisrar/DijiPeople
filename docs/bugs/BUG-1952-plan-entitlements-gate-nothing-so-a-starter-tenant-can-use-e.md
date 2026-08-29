---
ID: BUG-1952
aliases: [BUG-1952]
Title: Plan entitlements gate nothing, so a Starter tenant can use every module it has not bought
Status: FIXED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/tenant-settings, apps/web]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-353
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1952 — Plan entitlements gate nothing, so a Starter tenant can use every module it has not bought

## Summary

Plan entitlements are a presentation detail. Nothing in the API consults them. A
tenant on the Starter plan — which enables Employees, Organization, Leave,
Attendance, Documents, Notifications and Branding, and disables Timesheets,
Projects, Recruitment, Onboarding and Payroll — is served all five unentitled
modules in its own sidebar, and the API answers their endpoints normally. The
only throwing entitlement primitive in the codebase has zero call sites, and the
one consumer that exists hides sidebar links, fails open, and is skipped entirely
for the tenant's own administrator roles.

## Expected Behavior

A capability the tenant has not bought is refused by the API, not merely hidden
in navigation. A request to a module outside the subscription's entitlements
fails closed with a clear error, whichever client sends it and whatever role the
caller holds. Navigation gating is a usability convenience layered on top of that
refusal, exactly as `AGENTS.md` requires of every permission decision:
"Permissions in the UI are cosmetic … every gated action must also be enforced
server-side."

## Actual Behavior

On the Starter demo tenant, signed in as the tenant administrator:

- The sidebar renders Overview, Employees, Leave, Attendance, **Timesheets**,
  **Projects**, Approvals, Customers, Reports, **Payroll**, **Recruitment**,
  **Onboarding**, Settings. Five of those are not entitled.
- The employee record form offers Timesheets, Compensation, Payslips and Project
  Allocations tabs.
- Settings offers the entire "Payroll & Finance" tree (18 leaf pages),
  People > Attendance > Timesheets, General Setup > Apps & Modules >
  Recruitment & Onboarding, and Desktop Agent.
- The API answers unentitled reads with data, not a refusal.

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, tenant `DijiPeople Demo`
(`91ab031f-8fa2-48b9-b346-7cdf326571ef`), subscription Starter / Active /
MONTHLY. Production API commit `949f461c`.

1. In Platform Admin (`https://admin.dijipeople.com`) open the Starter plan
   (`11111111-1111-4111-8111-111111111111`) then Entitlements, and read the
   checkbox state: Timesheets, Projects, Recruitment, Onboarding and Payroll are
   **off**.
2. Sign in to the tenant workspace as a tenant administrator.
3. Observe the sidebar: all five disabled modules are offered.
4. From the authenticated tenant session, call the API directly:

```
GET /api/payroll/cycles  -> 200 {"items":[],"meta":{…}}
GET /api/payroll/runs    -> 200 []
GET /api/projects        -> 200 {"items":[],…}
```

None of the three is refused. (404s observed on other paths are the Next proxy
having no route for them, not an entitlement denial — do not read those as
enforcement.)

5. **Writes are unenforced too**, not only reads. From the same authenticated
   Starter tenant session:

```
POST /api/projects {"name":"QA Entitlement Probe Project","code":"QAPROBE1"}
  -> 201 CREATED   id a6e5e357-55fe-4330-8e75-4b89fd33a501
```

   Projects is **not** entitled on this plan, and the record was created and
   persisted. The probe project is still on the demo tenant, set to `CANCELLED`,
   because there is no delete route for projects (BUG-2007).

```
POST /api/payroll/cycles {…}
  -> 400 "property startDate should not exist"
```

   That 400 is DTO validation on the field names in the probe body — the request
   reached the DTO, which means it passed no entitlement guard on the way. Payroll
   is not entitled either. **Do not read this 400 as enforcement.**

## Evidence

Code, at `eb457d9d`:

- `services/api/src/modules/tenant-settings/feature-access.service.ts:78-86` —
  `FeatureAccessService.assertFeatureEnabled()` is the only throwing entitlement
  primitive in the API and has **zero call sites**. No guard, decorator,
  interceptor or domain service consults plan entitlement.
- The only consumer is the tenant web shell:
  `apps/web/app/(authenticated)/layout.tsx:97,186` into
  `apps/web/lib/navigation.ts:292-299`, which only filters sidebar links.
- `apps/web/lib/navigation.ts:273-274` returns the item **before** the feature
  check for roles `global-admin`, `system-admin` and `system-customizer` — so a
  tenant administrator sees every module regardless of the plan.
- `apps/web/lib/navigation.ts:294` treats a null entitlement fetch as allow-all,
  and `layout.tsx:97` catches the fetch error to null — the gate fails open.
- Plan catalog: `services/api/src/modules/super-admin/plans.catalog.ts:22-38`.

Seats are unenforced on the same footing: a search for `seat` under
`services/api/src/modules/employees/` returns nothing; `minimumSeats` is a
billing floor only (`pricing.catalog.ts:61`) and `SeatUsageService` meters
overage after the fact. Subscription state is consulted only for `ACTIVE` or
`TRIALING`; `trialEnd` is never read.

## Root Cause

Not established beyond the mechanism above: the entitlement primitive was written
and never wired into any request path, and the single UI consumer both
short-circuits for administrator roles and fails open on error. Whether an
enforcement layer was planned and dropped, or never designed, is not something
this QA run can settle.

## Impact

Packaging and revenue. Every tenant on every plan can use every module, so the
plan tiers describe nothing the product enforces. A Starter customer can run
Payroll, Timesheets, Projects, Recruitment and Onboarding in full, and the
upgrade path the plans page sells has no mechanical basis. It is reachable in
production today on the demo tenant, with no special role and no crafted request.

Rated HIGH rather than CRITICAL: there is no cross-tenant exposure and no data
loss — the failure is that a commercial boundary the product advertises does not
exist. It is not MEDIUM, because it is a systemic contract break affecting every
deployed tenant and the whole commercial model, not a single missing check.

## Affected Areas

`services/api/src/modules/tenant-settings` (`feature-access.service.ts`),
`services/api/src/modules/super-admin` (plan catalog and entitlements),
`apps/web` (`lib/navigation.ts`, `app/(authenticated)/layout.tsx`), and every
domain module whose endpoints should be gated: `payroll`, `timesheets`,
`projects`, `recruitment`, `onboarding`.

## Proposed Resolution

Needs an ExecPlan. The decision this record cannot make is *where* the gate
belongs — a guard keyed on the module owning the controller is the obvious
candidate, but it interacts with the two existing permission systems, with the
platform path (which must never be entitlement-gated), and with background jobs
that carry no request context. The plan must also decide what an existing tenant
with data in an unentitled module sees after enforcement lands.

Whatever the shape, three properties must hold: the gate fails **closed**, it is
not skipped for tenant administrator roles, and the UI filter becomes a mirror of
a server decision rather than the decision itself.

## Acceptance Criteria

- `GET /api/payroll/cycles`, `GET /api/payroll/runs` and `GET /api/projects` from
  an authenticated Starter tenant session are refused with a documented error
  code, for every role including tenant administrators.
- `POST /api/projects` and `POST /api/payroll/cycles` from the same session are
  refused **before** DTO validation, so a malformed body and a well-formed one
  both fail on entitlement rather than on field names.
- An entitlement lookup that fails denies rather than allows.
- The five unentitled modules are absent from the Starter tenant sidebar for
  administrator roles too.
- Platform endpoints (`authSubjectType: 'platform-user'`) are unaffected.

## Regression Coverage

None yet. Needs an e2e test that provisions a tenant on a plan with a module
disabled and asserts a refusal on that module's read and write endpoints for both
an ordinary and an administrator role — and a unit test asserting the entitlement
lookup denies on error.

## Dependencies

None identified.

## Related Items

BUG-0029 covered the public features page advertising capabilities the product
does not gate; that record corrected the marketing copy, and this record is the
enforcement side it named in passing. BUG-2007 is why the probe project created
in step 5 cannot be removed from the demo tenant. ITEM-0110 asks whether an
unentitled module should accrue records at all, and should be answered by this
record's enforcement design rather than separately. BUG-2015 is the same shape at
the authorization layer — a control the product offers and enforces only in the
UI.

## Resolution

Fixed on `agent/bugfix-entitle` against the design in
`docs/plans/EXECPLAN-0028-plan-entitlement-enforcement.md`.

**The premise was confirmed, at moved paths.** `assertFeatureEnabled`
(`services/api/src/modules/tenant-settings/feature-access.service.ts:78-86`)
had exactly one occurrence in the repository — its own definition. The UI
consumer the record cites as `apps/web/lib/navigation.ts` does not exist on
`develop`; the file is
`apps/web/app/(authenticated)/_components/navigation.ts`, and all three cited
behaviours were present there: the privileged-role shortcut returned the item
at `:273` before the feature check at `:292-295`, and that check treated a null
list as allow-all, fed by the `.catch(() => null)` at
`apps/web/app/(authenticated)/layout.tsx:96-98`.

**What was built.** A third declarative gate beside the two permission
systems, not a branch inside either:

- `services/api/src/common/decorators/require-entitlement.decorator.ts` —
  `@RequireEntitlement(...)`, typed to the feature-key union.
- `services/api/src/common/guards/entitlement.guard.ts` — inert without the
  metadata, exactly as `PermissionsGuard` is. It does **not** consult
  `hasElevatedTenantRole`, exempts `user.platform` callers, and takes the
  tenant only from `request.user.tenantId`.
- `services/api/src/common/security/tenant-entitlement.service.ts` — the
  resolver, its 60-second cache and the enforcement mode.
- `services/api/src/common/security/tenant-entitlement.rule.ts` — the
  plan-AND-override rule, now shared with `FeatureAccessService` so the screen
  and the gate cannot drift apart.
- `services/api/src/common/errors/error-catalog.ts` —
  `TENANT_FEATURE_NOT_ENTITLED` (403) and `TENANT_ENTITLEMENT_UNAVAILABLE`
  (503, retryable), mirrored into `apps/web/lib/api-error.ts` so a refusal
  reads as a plan limit rather than as a permissions bug.
- `services/api/src/common/constants/entitlement-wiring.invariants.spec.ts` —
  reads real Nest metadata off the loaded controller classes and fails when a
  controller in a gated module loses the guard or the decorator. Mutation-
  tested: removing the decorator from `ProjectsController` fails it by name.

**Gated** — 27 controllers across 13 module directories: `payroll`,
`payslips`, `pay-components`, `compensation`, `tax-rules`, `time-payroll`
(key `payroll`); `timesheets`; `projects`; `recruitment`; `onboarding`;
`leave`; `attendance`, `attendance-engine` (key `attendance`).

**Deliberately not gated**, recorded with a reason each in
`ENTITLEMENT_UNGATED_MODULES`: `employees` and `organization` (on every plan,
and the substrate everything else reads through); `documents` and
`notifications` (cross-cutting); `branding` (a settings surface);
`attendance-integrations` and `agent` (the .NET gateway and desktop-agent
contracts, two of whose controllers carry no authenticated user at all);
`loans`, `claims`, `benefits`, `business-trips` (no feature key sells them —
gating them under `payroll` would have withdrawn four modules from every
Starter and Growth tenant on a key never meant to cover them).

**Fail-closed decision, in three parts.** A live subscription whose plan
excludes the module denies. A lookup fault over a warm cache serves the last
snapshot rather than converting a paying tenant into an unentitled one. A
lookup fault over a cold cache denies, but as a retryable 503 — the honest
statement is that the platform could not check, not that the customer did not
buy it. A missing or lapsed subscription **allows**, logged: refusing there
would lock a tenant out of its own data over an unpaid invoice, which is a
dunning decision with its own notice period rather than an entitlement one.

**Rollout caveat — this ships switched off, and that is deliberate.**
Enforcement is governed by `moduleSettings.entitlementEnforcement` in the
existing `module-settings` platform setting, and defaults to `REPORT_ONLY`
when the row or the field is absent. In that mode every refusal is logged as
`ENTITLEMENT_WOULD_REFUSE` with tenant, feature, route and outcome, and the
request proceeds unchanged. **Nothing about live tenant behaviour changes
when this merges.** Switching to `ENFORCE` will cut off tenants currently
using modules they never bought, and will make data they have already entered
unreachable — the rows survive, the routes do not. The platform owner should
read a period of report-only logs to learn which tenants and which modules are
affected, and decide per tenant, before flipping it through
`PATCH /api/super-admin/platform-settings`. `OFF` is the kill switch. No
migration, no environment variable, no deploy is needed to change it.

Whether an un-entitled module should degrade to read-only instead of refusing
outright is the open product question, and is the same one ITEM-0110 asks.

## QA Retest

Awaiting retest, which must run with `entitlementEnforcement` set to `ENFORCE`
on the test tenant — under the shipped default the acceptance criteria below
will all appear to fail, because report-only mode allows by design.

Unit coverage is in place for each criterion: entitled allowed, unentitled
refused, every elevated tenant role still refused, platform user exempt,
cold-cache resolver failure denying, and report-only logging and allowing.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition PLAN_REQUIRED — needs a designed enforcement layer plus a migration decision for tenants already using non-entitled modules; not a patch.
- 2026-08-29 — fixed for SESSION-0076 on `agent/bugfix-entitle`. Enforcement layer built and gated behind a platform enforcement mode defaulting to REPORT_ONLY, so the cutover for tenants already using unentitled modules stays the platform owner's decision rather than a side effect of the merge.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0110]]
- Modules — [[settings]], [[tenant-application]]

<!-- GRAPH:END -->
