---
ID: BUG-1952
aliases: [BUG-1952]
Title: Plan entitlements gate nothing, so a Starter tenant can use every module it has not bought
Status: OPEN
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/tenant-settings, apps/web]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt:
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

Open. No fix has been written.

## QA Retest

Awaiting a fix — nothing to retest yet.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition PLAN_REQUIRED — needs a designed enforcement layer plus a migration decision for tenants already using non-entitled modules; not a patch.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0110]]
- Modules — [[settings]], [[tenant-application]]

<!-- GRAPH:END -->
