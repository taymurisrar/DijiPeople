---
ID: BUG-2011
aliases: [BUG-2011]
Title: Seven related-list dialogs never send the parent foreign key and one of them creates an orphan
Status: FIXED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-305
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-2011 — Seven related-list dialogs never send the parent foreign key and one of them creates an orphan

## Summary

The runtime related-list "New" dialog injects the parent record's foreign key
into the request body **only when the subgrid has no `api` block**. Seven
declared subgrids do have one and declare a *flat* create path with no
`{parentId}` in it, so for those the parent id is dropped and the POST is sent
without it. Six fail loudly with a 400 naming a field the dialog has no control
for. The seventh — Department > Teams — **returns 201 and silently creates a team
with `departmentId = null`**, which never appears in the parent's list and is not
reachable from it. Together they block the organization-setup path a new customer
walks through first: business units, departments, teams, cities, leave-policy
assignments and benefit assignments.

BUG-1961 records the leave-policy case, found live. This record is the root cause
and the full blast radius established by reading the code.

## Expected Behavior

Saving a new record from a parent's related list attaches it to that parent. The
foreign key is supplied by the runtime, not typed by the user, because the dialog
is opened from the parent record and offers no field for it — and it is supplied
whether the create endpoint takes the parent id in its path or expects it in the
body.

## Actual Behavior

Six of the seven fail with a 400 naming a field the user cannot supply, for
example:

```
leavePolicyId must be a UUID (POST /api/leave-policies/assignments)
organizationId must be a UUID
businessUnitId must be a UUID
benefitPolicyId must be a UUID
Country is required.
```

The seventh succeeds and is wrong:

```
Department > Teams > New  ->  201 CREATED
team created with departmentId = null
never appears in the parent department's Teams list
```

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, tenant `DijiPeople Demo`,
production API commit `949f461c`. The leave-policy case was reproduced live on
2026-08-29 (see BUG-1961); the remaining six were established by reading the
declarations and the NestJS handlers at `eb457d9d`.

For any of the seven rows in the table below:

1. Open the parent record in the tenant app.
2. Open the named related list tab and press **New**.
3. Complete the dialog's fields and Save.
4. Six return a 400 naming the missing foreign key; the dialog stays open and
   offers no field that would satisfy it. Department > Teams returns 201 and the
   new team does not appear in the list you created it from.

## Evidence

### The root cause, one line

`apps/web/lib/runtime/modules/standard-module-data.adapter.ts:453`:

```ts
async createRelatedRecord(input) {                              // line 440
  const path = relatedRecordPaths(input).create;
  …
  const data = await requestJson(path, {
    method: "POST",
    body: JSON.stringify(
      withRelatedRecordDefaults(input.subgrid.relatedEntityLogicalName, {
        ...sanitizeRelatedMutationValues(input.values, input.subgrid),
        ...(!input.subgrid.api && input.parentLookupField        // line 453
          ? { [input.parentLookupField]: input.parentRecordId }  // line 454
          : {}),                                                 // line 455
      }),
    ),
  });
```

The guard `!input.subgrid.api` encodes the assumption *"a subgrid that declares
its own transport carries the parent id in its URL"*. That is false for seven
subgrids whose `createPath` is flat.

`relatedRecordPaths` (`apps/web/lib/runtime/related-record-api.ts:20`) will
happily return a create path containing no `{parentId}` token — `interpolate` is
a `replaceAll("{parentId}", …)`, so a template without the token substitutes
nothing and warns about nothing. No validation anywhere requires a subgrid's
`createPath` to either contain `{parentId}` or list the parent lookup field in
`quickCreateFields`.

### The key is destroyed three times on the way down

It is not merely absent; it is present and then removed twice.

1. **Injected** into the dialog's value map —
   `apps/web/app/components/runtime/module-quick-create-panel.tsx:57`:
   `[parentBinding.fieldLogicalName]: parentBinding.recordId`.
2. **Filtered out on submit** — `module-quick-create-panel.tsx:119`, `formValues`
   keeps only keys that appear in the form, and no `quickCreateFields` list in
   the repository contains the parent lookup field. `buildGenericQuickCreate`
   (`module-related-subgrid.tsx:1410`) removes it explicitly at `:1432`:
   `field.logicalName !== parentLookupField && field.behavior !== "readonly"`.
3. **Deleted again** by the subgrid's save handler —
   `module-related-subgrid.tsx:795-796`,
   `omitRuntimeField(values, parentBinding.fieldLogicalName)` (helper at
   `:1903`).

So: inject (panel:57) → filter away (panel:119) → delete again (subgrid:796) →
re-add only for api-less subgrids (adapter:453).

### The second adapter has no injection at all

`apps/web/lib/runtime/modules/employee-data.adapter.ts:265` posts
`JSON.stringify(input.values)` with no FK injection under any condition. It is
safe today only because every employee child list is nested
(`/api/employees/{parentId}/…`). Any future flat employee child endpoint fails
identically, with no guard.

### The seven broken related lists

Declared subgrids were enumerated exhaustively: `grep -rn "listPath" apps/web`
returns exactly four declaration sites —
`settings/_lib/settings-adapter-registry.ts` (33 subgrids),
`lib/runtime/modules/employee-metadata.adapter.ts` (11, generated by
`employeeRelatedApi` at line 1900), `lib/runtime/modules/standard-module-specs.ts`
(1) and `lib/runtime/modules/payroll-foundation-runtime-specs.ts` (2).
`grep -rn "listPath" services/api/src` returns nothing, so no subgrid transport
metadata is served from the API and the list is complete.

| # | Parent | Related list | Create endpoint | Result | Missing field | Handler |
|---|---|---|---|---|---|---|
| 1 | Leave Policy | Eligibility | `POST /api/leave-policies/assignments` | 400 | `leavePolicyId` | `leave/leave-policies.controller.ts:53`; DTO `create-leave-policy-assignment.dto.ts:24` |
| 2 | Leave Policy | Assignments | `POST /api/leave-policies/assignments` | 400 | `leavePolicyId` | same route; registry line 3147 — **the tab reproduced live, BUG-1961** |
| 3 | Organization | Business Units | `POST /api/business-units` | 400 | `organizationId` | `organization/business-units.controller.ts:42` + `:97`; DTO `create-business-unit.dto.ts:30` |
| 4 | Business Unit | Departments | `POST /api/departments` | 400 | `businessUnitId` | `organization/departments.controller.ts:27` + `:52`; DTO `create-department.dto.ts:33` |
| 5 | Department | **Teams** | `POST /api/teams` | **201, orphan** | `departmentId` | `teams/teams.controller.ts:32` + `:63`; DTO has `@IsOptional() @IsUUID() departmentId?`; `teams.service.ts:88` writes `departmentId: dto.departmentId` (undefined) |
| 6 | State / Province | Cities | `POST /api/lookups/cities` | 400 `Country is required.` | `stateProvinceId` (hence `countryId`) | `lookups/lookups.controller.ts:127`; `lookups.service.ts:299`, with `countryId` derived from `stateProvinceId` at `:296` |
| 7 | Benefit Policy | Assignments | `POST /api/benefits/assignments` | 400 | `benefitPolicyId` | `benefits/benefits.controller.ts:33` + `:90`; DTO `benefit.dto.ts:145` |

**Row 5 is the dangerous one.** Its DTO marks `departmentId` optional, so
validation passes, the row is written with a null parent, and nothing tells
anyone. A defect that returns 201 is not caught by "did the dialog show an
error", which is how six of these would be found and the seventh would not.

Twenty-one further related lists were checked and are **correct** — all use a
nested create path (`POST /api/salary-package-rules/{parentId}/components`,
`/api/leave-policies/{parentId}/rules`, `/api/employees/{parentId}/education`,
and so on) — and eighteen more are read-only with no `createPath`, so they render
no create action (`canCreate` is `Boolean(subgrid.api.createPath)`,
`module-related-subgrid.tsx:399-401`).

A useful predictor for reviewers: every subgrid whose **list** path is
query-string shaped (`?xId={parentId}`) and which **also** declares a
`createPath` is broken — rows 3, 4, 5, 6 and 7. Rows 1 and 2 are the exception
that makes path-reading alone insufficient: their list path is nested and only
their create path is flat.

### This class has been patched entity-by-entity before

`standard-module-data.adapter.ts:1088`, `withRelatedRecordDefaults`, hardcodes
`accrualType: "FIXED_ANNUAL"` for `leave_policy_rules` because the Entitlements
dialog does not render a field `CreateLeavePolicyRuleDto` requires
(`leave/dto/create-leave-policy-rule.dto.ts:66`). A per-entity default was
chosen over reconciling the form with the DTO — see ITEM-0105. It is also why
"Entitlements > New > Save works" while Assignments does not: that endpoint is
nested, so the parent id comes from the URL, and the one missing required field
is silently defaulted here.

### The guard was a mistake, not a policy

`module-related-subgrid.tsx:589` — only api-less subgrids fetch generic entity
metadata: `if (subgrid.api || !subgrid.relatedEntityLogicalName) return;`. The
runtime has two disjoint transports; FK injection was written for one branch and
never generalised, and nothing forces the other branch's `createPath` to be
nested.

### Not fixed in `develop`

`git log --oneline 949f461c..origin/develop` over
`module-related-subgrid.tsx`, `standard-module-data.adapter.ts`,
`related-record-api.ts`, `module-quick-create-panel.tsx` and
`settings-adapter-registry.ts` returns nothing. `origin/develop` is
byte-identical to the deployed `949f461c` for every file in the failure path.

## Root Cause

**Established.** `standard-module-data.adapter.ts:453` gates parent-foreign-key
injection on `!input.subgrid.api` instead of on whether the resolved create path
actually consumed `{parentId}`. Every subgrid that declares an `api` block with a
flat `createPath` therefore posts without the key.

## Impact

Release-blocking for the organization-setup path. A customer configuring
DijiPeople through the product cannot create a business unit from an
organization, a department from a business unit, a city from a state, a
leave-policy assignment or a benefit assignment — five of the six things
onboarding consists of — and each failure names a field their screen does not
have.

The Department > Teams case is worse than a block: it writes an orphan row that
the parent record will never show, so a customer believes the team exists,
cannot find it, and creates it again. That is silent data corruption of the
recoverable kind, and it is the reason this record is HIGH rather than the sum
of six 400s.

Leave is one of the seven Starter entitlements, and rows 1 and 2 are the reason
no employee can be attached to a leave policy through the UI — no assignment, no
entitlement, no balance, no leave request.

Rated HIGH: a primary journey blocked in production for every tenant, plus silent
creation of unreachable records. Not CRITICAL: no cross-tenant effect, and the
orphan rows are recoverable.

## Affected Areas

`apps/web/lib/runtime/modules/standard-module-data.adapter.ts` (`:453`, and
`withRelatedRecordDefaults` at `:1088`);
`apps/web/lib/runtime/related-record-api.ts` (`relatedRecordPaths`,
`interpolate`); `apps/web/lib/runtime/modules/employee-data.adapter.ts:265`;
`apps/web/app/components/runtime/module-quick-create-panel.tsx` and
`module-related-subgrid.tsx`; the seven declarations in
`settings/_lib/settings-adapter-registry.ts`; and the seven API endpoints listed
above, none of which is at fault.

## Proposed Resolution

The minimal correct change is at the guard.

- Have `relatedRecordPaths` report whether the create template consumed the
  parent id — e.g. `createConsumedParentId: template.includes("{parentId}")`.
- Change the adapter guard to
  `...(!createConsumedParentId && input.parentLookupField ? { … } : {})`.
- Mirror the same injection in `employee-data.adapter.ts:265`, which has none
  today and is one flat endpoint away from the same failure.
- Add the invariant spec described under Regression Coverage, so a future flat
  `createPath` fails CI rather than a QA pass.
- Separately mark `effectiveFrom` `required: true` on both leave-policy
  assignment tabs (BUG-1962), and reconcile `accrualType` on the four
  leave-policy-rule tabs (ITEM-0105) so the hardcoded default at `:1088` can
  eventually be retired.

Do **not** fix this by adding another per-entity special case in
`withRelatedRecordDefaults`. That is how the `accrualType` band-aid happened, and
it hides the class instead of closing it.

## Acceptance Criteria

- All seven related lists in the table create a record attached to the parent the
  dialog was opened from.
- Department > Teams creates a team with the correct `departmentId`, and the team
  appears in the parent's list.
- `employee-data.adapter.ts` injects the parent key on the same rule.
- A spec fails when any declared subgrid's `createPath` neither contains
  `{parentId}` nor lists the parent lookup field in `quickCreateFields`.
- The existing orphan teams on the demo tenant are identified, since they will
  not surface on their own.

## Regression Coverage

None yet, and the gap is structural: **there is no test anywhere in `apps/web`
that exercises related-record creation.**

```
grep -rln "createRelatedRecord\|relatedRecordPaths\|ModuleRelatedSubgrid\|related-subgrid" \
  --include=*.spec.ts --include=*.spec.tsx --include=*.test.ts apps/web/
(no output)
```

The nearest miss is
`apps/web/lib/runtime/modules/standard-module-views.spec.ts`, which already runs
a `describe.each` over every `StandardModuleRuntimeSpec` asserting view
invariants — and asserts nothing about `relatedTabs`, which sit in the same spec
object. A sibling assertion — *"a related tab's `createPath` either contains
`{parentId}` or lists `targetFieldLogicalName` in `quickCreateFields`"* — would
have failed on all seven rows. Note it covers only `standard-module-specs.ts`;
the 33 settings subgrids, where six of the seven live, are not in `SPECS` at all
and need the same assertion over the settings registry.

`settings-runtime.spec.ts` validates that settings items route to pages that
exist and never opens `relatedTabs`. The API-side e2e suites exercise these
endpoints with correct bodies, so they confirm the backend is fine and by
construction cannot see the frontend's payload.

## Dependencies

None. BUG-1962 and ITEM-0105 are adjacent fixes in the same dialogs and will
still bite after this lands.

## Related Items

BUG-1961 is the live reproduction of rows 1 and 2 and is the record this one
generalises. BUG-2012 is the parent-value pre-fill collision found in the same
sweep — a distinct defect in the same code path. BUG-1962 (`effectiveFrom`
rendered optional) and ITEM-0105 (`accrualType` not settable) are the remaining
form-versus-DTO gaps once the foreign key is fixed. BUG-1963 and BUG-1966 are why
the six loud failures are still hard to act on from the screen.

## Resolution

Fixed on `agent/web-shell-accessibility`, exactly as this record proposed - at
the guard, not with another per-entity special case.

- `relatedRecordPaths` now reports `createConsumedParentId`, computed from the
  raw create template rather than the interpolated path, since after
  interpolation the token is gone by definition.
- `standard-module-data.adapter.ts` injects the parent key when the path did
  **not** consume it, replacing the `!input.subgrid.api` test. That test asked
  whether the subgrid was configured; the question that matters is whether the
  configured path took the parent id.
- `employee-data.adapter.ts` now does the same. It had no injection at all.
  Nothing is broken there today - every employee subgrid names `{parentId}` -
  so this is the mirror the record asked for rather than a fix to an observed
  failure, and it is worth saying which of the two it is.

`withRelatedRecordDefaults` was left alone deliberately, per this record.

**One acceptance criterion is not met and is not being quietly dropped:** the
orphan teams already created on the demo tenant are not identified here. They
carry `departmentId = null` and will not surface on their own. That is a data
question on a live tenant rather than a code fix, and it is tracked as its own
line in this record's QA Retest rather than assumed away.


## QA Retest

Retested by the regression suite, not in a browser: 39 assertions in
`related-record-parent-key.spec.ts` pass, and the body assertion was confirmed
to fail against the previous guard.

The suite covers all 33 declared subgrids across both registries by
construction, which is broader than the seven this record found and is the point
of asserting over the registries rather than over a list of known-bad rows.

**Not retested live**, and two things are therefore still open:

- The seven journeys have not been walked in a browser against a running
  tenant. The unit coverage establishes that the request body now carries the
  key; it does not establish that each of the seven endpoints accepts the body
  it now receives. Six were failing on a *missing* field, so they should - but
  should is not the same as observed.
- **The existing orphan teams on the demo tenant have not been identified.**
  Any team created through Department > Teams before this fix has
  `departmentId = null` and is invisible in the UI, so it needs a direct query
  rather than a screen. Nothing here deletes or reassigns them; that is a
  decision for whoever owns that tenant.


## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; root cause and blast radius established by code sweep against the deployed `949f461c`, generalising the live reproduction in BUG-1961. Disposition FIX_NOW.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]
- Regression — REG-305 (see the regression register)

<!-- GRAPH:END -->
