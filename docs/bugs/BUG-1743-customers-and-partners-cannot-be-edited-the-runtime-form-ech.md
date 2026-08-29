---
ID: BUG-1743
aliases: [BUG-1743]
Title: Customers and partners cannot be edited: the runtime form echoes fields the update DTO forbids
Status: VERIFIED
Severity: CRITICAL
Priority: P0
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-28
DetectedInSha: 912f4e61
AffectedModules: [apps/admin, api:platform-runtime, api:super-admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-28-admin-console-e2e-912f4e6.md
RegressionId: REG-272
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-28
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1743 — Customers and partners cannot be edited: the runtime form echoes fields the update DTO forbids

## Summary

Editing a customer or a partner from the Platform Admin record page never
saves. The runtime record form loads the record, then posts its whole field set
back on Save, including columns the update DTO does not declare. The API
validates with `forbidNonWhitelisted: true`, so the presence of one undeclared
key rejects the entire request. The record is silently unchanged and the
operator sees only a short message in the toolbar corner.

This is [[BUG-0220]] — closed `VERIFIED` on 2026-08-21 — still live on every
module except the one it was fixed for.

## Expected Behavior

Opening a customer or partner, pressing Edit, changing a field and pressing
Save persists the change.

## Actual Behavior

The save is rejected and the record is unchanged:

- customers → `property originChannel should not exist`
- partners → `property partnershipModel should not exist`

Neither field was touched by the operator; both were read from the record and
echoed back by the form.

## Reproduction

Customers:

1. Platform Admin → **Customers** → open any customer.
2. **Edit**, change **Company name**, **Save**.
3. `POST /api/platform-runtime/customers/validate` returns
   `{"success":false,"errors":[{"field":"originChannel","message":"property originChannel should not exist"}]}`.
4. Re-read the record through the API — `companyName` is unchanged.

Partners:

1. Platform Admin → **Partners** → open any partner.
2. **Edit**, change **Partner name**, **Save**.
3. Same shape, rejected on `partnershipModel`.
4. `displayName` unchanged.

## Evidence

Captured edit payload for customers (abridged), showing the echoed key:

```json
{"values":{"companyName":"QA E2E Customer 20260828 EDITED", ...,
"assignedToUserId":"eea155b8-...","leadId":null,"originChannel":"DIRECT"},
"mode":"edit","id":"36f984ab-0461-48db-a604-b85cc86b47ea"}
```

Isolated against the same endpoint and record:

| payload | result |
|---|---|
| values **with** `originChannel: "DIRECT"` | `success: false` — property originChannel should not exist |
| values **without** `originChannel` | `success: true` |

`originChannel` appears in no customer DTO under
`services/api/src/modules/super-admin/dto/`.

Both failures were captured from the browser's own requests, not synthesised.

## Root Cause

Exactly the root cause recorded in [[BUG-0220]]: `completeFormsFromSchema` in
`apps/admin/lib/runtime/platform-module-registry.ts` completes a form from the
Prisma schema — a statement about the database — while
`platform-runtime.service.ts` `dto()` validates against the update DTO — a
statement about the contract. Any writable column absent from the DTO becomes an
editable form field whose presence then rejects the write.

BUG-0220 fixed this **per module**. Its resolution was to "declare the plan form
explicitly and mark every field `UpdatePlanDto` does not accept as read-only",
and its regression test
`apps/admin/lib/runtime/plan-record-form.spec.ts` parses `update-plan.dto.ts`.
That test is plans-shaped by construction, so it cannot fail for customers,
partners or any other module. The shared mechanism was never changed, so the
defect simply stayed where nobody had written a per-module guard.

## Impact

Every customer edit and every partner edit from the Platform Admin console, in
production, for every operator. Customers and partners are the two record types
platform operations spends most of its time in. The failure is quiet: the record
page returns to read mode and looks as though it saved.

An API sweep that posts whole records back suggests leads, customer-onboarding,
tenants and contracts share the shape, but that sweep also sends computed fields
a form would not send. Only customers and partners are confirmed here, in the
browser. The rest need the same check before they are quoted.

## Affected Areas

`apps/admin` runtime record page and module registry, `platform-runtime`
validate and update, `super-admin` customer and partner DTOs.

## Proposed Resolution

Fix the mechanism rather than the next module. Options, in preference order:

1. Derive the writable form field set from the DTO rather than the Prisma
   schema, so the two cannot diverge for any module.
2. Failing that, have the runtime drop keys the mapped DTO does not declare
   before sending, and make the generic regression test iterate every module in
   `MODULE_CAPABILITIES` rather than naming plans.

Needs an ExecPlan: it touches the shared runtime that every admin module renders
through.

## Acceptance Criteria

- A customer's Company name can be changed and saved from the record page.
- A partner's Partner name can be changed and saved from the record page.
- No module offers as editable a field its update DTO will reject.
- A regression test covers **every** module in the registry, not one, and fails
  if any module's writable form fields exceed its DTO.

## Regression Coverage

`apps/admin/lib/runtime/plan-record-form.spec.ts` exists but is plans-only and
passes while this defect is live — that is itself the gap. Needs a
registry-wide equivalent.

## Dependencies

None.

## Related Items

[[BUG-0220]] — the same defect, closed `VERIFIED` for plans on 2026-08-21.
[[BUG-1742]] — lead creation blocked by the neighbouring serializer problem.
[[BUG-1747]] — the Partner form's Currency control, which blocks partner
creation the same way this blocks partner editing.

## Resolution

Fixed 2026-08-28 on `agent/open-bug-sweep`, by the mechanism this record asked
for rather than by another per-module guard.

`creatable` and `editable` in `platform-runtime-schema.generated.json` are now
derived from the module's create/update DTO instead of from the Prisma column.
`scripts/lib/runtime-write-contract.mjs` reads the create and update switches out
of `platform-runtime.service.ts`, resolves each `dto(...)` name to its file, and
collects the properties that class declares — following `extends`, so
`UpdatePartnerDto extends CreatePartnerDto {}` inherits correctly. A module with
no arm in either switch cannot be written through the runtime at all, so nothing
there is advertised as writable.

Nothing in the record page needed teaching: its payload filter already gated on
`creatable`/`editable`. The manifest was answering a different question from the
one the filter was asking. `originChannel` and `partnershipModel` are now
`editable: false`, so they never reach the request.

`contentHtml` is exempt and the generator says why — `update()` destructures it
out before validating and routes it to `contracts.saveVersion`, so the contract
it satisfies is the destructuring, not `UpdateContractDto`.

One thing the change surfaced: `modules.<key>.fields` and `models.<Model>.fields`
used to be the same object by reference, and the `contentHtml` projection relied
on that aliasing to reach `resolveRuntimeField`. Deriving per-module writability
gives each module its own copy, so the projection is now written to both
explicitly.

Guarded by REG-272, which iterates **every** module in the manifest. The
plans-only `plan-record-form.spec.ts` still passes and was left in place; the gap
was never that it was wrong, only that it could not fail for anyone else.

## QA Retest
Retested 2026-08-29 by the regression-guard sweep: `apps/admin/lib/runtime/runtime-write-contract.spec.ts` ran and passed, as part of `npm --workspace admin run test` (379 passing).

Not retested in production, and that boundary is the point of saying so — this environment cannot drive the deployed system, so what is established is that the fix is still present and its guard still passes, not that the screen behaves. See [[2026-08-28-regression-guard-sweep-9e55663]].

### What this record said before the sweep

Not yet retested in a browser. Covered by
`apps/admin/lib/runtime/runtime-write-contract.spec.ts` — 39 assertions across
all 17 modules — mutation-tested on 2026-08-28: restoring
`customers.originChannel.editable = true` fails 2 of them.

Left `FIXED` rather than `VERIFIED` — reproduced in a browser against
production, so it should be closed there too.

## History

- 2026-08-28 — created from the admin console end-to-end QA pass at `912f4e61`,
  reproduced in a browser against production `e0aeabcd`. Recorded as a scope gap
  in the BUG-0220 fix rather than a new class of defect.
- 2026-08-28 - fixed at the mechanism: the runtime manifest derives writability from the DTO, not the Prisma column. REG-272.

## Verification — 2026-08-29

Verified by re-reading the guard and running it, not by a browser pass. The
repository owner asked for this sweep after 48 records had accumulated in
`FIXED` — fixed, but with nobody having confirmed them against a running
system.

What was checked for this record:

- its regression guard exists on disk at this commit;
- the suite containing it passes.

Guard:

- `apps/admin/lib/runtime/runtime-write-contract.spec.ts`

Proven by:

- `npm --workspace admin run test` — 379 passing

**What this does not establish.** No screen was opened. A guard that reads
source and asserts a string is weaker evidence than one that runs the code, and
this sweep does not distinguish between them — it establishes that the fix is
still present and its test still passes, which is what separates a real fix from
one that was silently reverted. Behaviour against production remains unverified
here, and a browser QA pass would still be worth having.

Part of a sweep over all 48: every one of the 206 regression test files named in
the register was confirmed to exist, and every suite containing one was run.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-admin]], [[super-admin]]
- Regression — REG-272 (see the regression register)

<!-- GRAPH:END -->
