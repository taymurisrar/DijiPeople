---
ID: BUG-1961
aliases: [BUG-1961]
Title: A leave policy assignment cannot be created from the UI because the parent id is never sent
Status: FIXED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [apps/web, services/api/src/modules/leave]
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

# BUG-1961 — A leave policy assignment cannot be created from the UI because the parent id is never sent

## Summary

Leave is a Starter-plan entitlement, and a leave policy cannot be assigned to
anyone through the product. The Assignments related-list dialog on the leave
policy record posts without `leavePolicyId`, so the API rejects it. The backend is
correct: the identical request with the parent id included succeeds. No employee
can be attached to a leave policy through the UI, so no employee gets a leave
balance, so the leave request and approval flow is dead for any customer who
onboards through the product.

## Expected Behavior

Saving a new Assignment from a leave policy's related list creates an assignment
against that policy. The parent record's foreign key is supplied by the runtime,
not typed by the user, because the dialog is opened from the parent record and
offers no field for it.

## Actual Behavior

The dialog stays open and shows, verbatim:

```
leavePolicyId must be a UUID, effectiveFrom must be a valid ISO 8601 date string
(POST /api/leave-policies/assignments)
```

Filling in "Assigned On" removes the second half and leaves the first:

```
leavePolicyId must be a UUID (POST /api/leave-policies/assignments)
```

There is no field in the dialog for the policy id, so the user has no way to
satisfy it.

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, tenant `DijiPeople Demo`,
production API commit `949f461c`, observed 2026-08-29.

1. Settings > People Configuration > Leave Configuration > Leave Policies > Add
   Leave Policy. Name it and Save. (This works — policy
   `0f32d305-adc3-4277-b31c-c318ead8e26d` was created.)
2. On the policy record, open the **Entitlements** tab > New. Leave Type =
   Annual Leave, Annual Entitlement Days = 20 > Save & Close. **This works**
   (201).
3. Open the **Assignments** tab > New. Scope Type = Tenant > Save & Close.
   **Fails** with the message above; the dialog stays open.
4. Set "Assigned On" = 2026-01-01 and retry. **Still fails**, with
   `leavePolicyId must be a UUID (POST /api/leave-policies/assignments)`.

The backend accepts the same thing when the id is present:

```
POST /api/leave-policies/assignments
{"leavePolicyId":"0f32d305-adc3-4277-b31c-c318ead8e26d",
 "scopeType":"TENANT",
 "effectiveFrom":"2026-01-01T00:00:00.000Z"}
-> 201, assignment d8409726-a460-4a90-b2c6-4909c1429c6b
```

## Evidence

The verbatim dialog errors and the successful direct POST above, from the
production demo tenant.

The contrast with step 2 is the diagnostic: Entitlements succeeds from the same
kind of dialog because its endpoint **nests** the parent id in the path
(`POST /api/leave-policies/:id/rules`), so the runtime never has to put it in the
body. Assignments fails because its endpoint is **flat**
(`POST /api/leave-policies/assignments`) and expects `leavePolicyId` in the body,
which the related-list dialog does not inject.

**The root cause was subsequently established in code, and the file:line evidence
this section originally said was missing now exists.** It is recorded in full in
BUG-2011, along with the blast radius; the essentials are repeated under Root
Cause below so this record is readable on its own.

## Root Cause

**Established** — see BUG-2011 for the full trace and the sweep.

`apps/web/lib/runtime/modules/standard-module-data.adapter.ts:453` injects the
parent foreign key into the request body **only when the subgrid has no `api`
block**:

```ts
...(!input.subgrid.api && input.parentLookupField        // line 453
  ? { [input.parentLookupField]: input.parentRecordId }  // line 454
  : {}),                                                 // line 455
```

The guard encodes the assumption that a subgrid declaring its own transport
carries the parent id in its URL. This subgrid declares an `api` block with a
flat `createPath`, so the assumption is false and the key is dropped.

The key is not merely absent — it is present and then removed twice on the way
down: injected at `module-quick-create-panel.tsx:57`, filtered out by
`formValues` at `:119` because no `quickCreateFields` list contains the parent
lookup field, deleted again by the subgrid's save handler at
`module-related-subgrid.tsx:796`, and then re-added at the adapter only for
api-less subgrids.

**The blast radius is seven related lists across six parent record types**, not
this one. The other six are Leave Policy > Eligibility, Organization > Business
Units, Business Unit > Departments, **Department > Teams**, State/Province >
Cities and Benefit Policy > Assignments. Department > Teams is the dangerous one:
its DTO marks `departmentId` optional, so it returns **201** and silently creates
a team with a null parent that never appears in the list it was created from.
BUG-2011 carries the full table, the twenty-one related lists that are correct,
and the sweep method.

## Impact

Release-blocking for the Starter plan. Leave is one of the seven Starter
entitlements, and the chain is: no assignment, therefore no entitlement reaches
an employee, therefore no balance, therefore no leave request. A customer who
sets everything up through the product reaches a dead end with an error naming a
field their screen does not have.

**The wider blast radius is now measured, not suspected.** The sweep this section
called for has been done and is recorded in BUG-2011: seven related lists across
six parent record types fail the same way, six loudly with a 400 and one — the
Department > Teams tab — silently with a 201 that writes an orphan row.

## Affected Areas

`apps/web` metadata runtime related-list dialog; `services/api/src/modules/leave`
(`POST /api/leave-policies/assignments`); every module with a flat related-record
endpoint.

## Proposed Resolution

Make the runtime supply the parent record's foreign key to the request body when
the related list's endpoint does not carry it in the path — declared once in the
module adapter rather than patched per dialog. Then sweep the runtime module
adapters for other flat related-record endpoints and cover them in the same
change.

## Acceptance Criteria

- Creating an Assignment from the leave policy record's Assignments tab succeeds
  with Scope Type = Tenant and a date.
- The created assignment is attached to the policy the dialog was opened from.
- Every related list whose endpoint is flat sends the parent id, verified by an
  inventory of the runtime adapters rather than by spot checks.

## Regression Coverage

None yet. An e2e test that creates a leave policy and then an assignment through
the UI would fail today.

## Dependencies

None identified. BUG-1962 (Assigned On is required by the API but rendered
optional) is independent and will still bite after this is fixed.

## Related Items

**BUG-2011 is this defect's root cause and full blast radius**, filed separately
because it covers six further related lists and a silent-orphan case that this
record cannot claim. Fix them together; BUG-2011 carries the proposed one-line
change and the invariant spec. BUG-2012 is the parent-value pre-fill collision in
the same code path, found in the same sweep.

BUG-1962, BUG-1963 and BUG-1964 were all found in this same dialog. ITEM-0105
(`accrualType` not settable) is the band-aid that makes the neighbouring
Entitlements tab appear to work. BUG-1967 and BUG-1968 are the next two links in
the leave chain, and each blocks it again after this one is fixed.

## Resolution

Fixed by the root-cause change recorded on BUG-2011, of which this was the
instance found live.

The leave-policy assignment dialog declared an `api` block with a flat
`createPath`, so the adapter's `!input.subgrid.api` guard skipped injecting the
parent key and the POST arrived without `leavePolicyId` - a field the dialog has
no control for, because the user opened it from the policy. The guard now asks
whether the create path consumed the parent id instead.

Nothing leave-specific was changed. This record stays open in its own right only
as far as its own journey goes: see QA Retest.


## QA Retest

Retested by `related-record-parent-key.spec.ts`, which asserts the create body
carries the parent key for a flat create path, and mutation-tested against the
original guard.

**Not retested live.** The specific journey this record describes - Leave Policy
> Assignments > New, through the UI, against a running tenant - has not been
re-walked. It could not be while BUG-1967 blocked the leave journey behind it,
and the two are worth retesting together now that both are fixed: assigning a
policy is what allocates the entitlement, so the two defects meet on the same
screen.


## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition FIX_NOW — one-line root cause, blocks a sold feature, and fixes six other screens with it.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]
- Regression — REG-305 (see the regression register)

<!-- GRAPH:END -->
