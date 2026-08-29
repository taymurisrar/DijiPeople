---
ID: BUG-2012
aliases: [BUG-2012]
Title: The related-list create dialog pre-fills child fields with the parent record values
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-2012 — The related-list create dialog pre-fills child fields with the parent record values

## Summary

The runtime related-list "New" dialog spreads the **parent record's own field
values** into the child form's initial state. Any field name shared between
parent and child therefore opens pre-filled with the parent's value, and is
posted with it unless the user notices and overwrites it. Creating a business
unit from an organization pre-names it after the organization; creating a
department from a business unit does the same; creating a team from a department
pre-fills the name, and the team `key` is derived from the name, so a second
attempt can collide with a 409. This is a distinct defect from BUG-2011 in the
same code path, and the sweep that found it recommended recording it separately
because fixing it is a behaviour change rather than a bug fix.

## Expected Behavior

A create dialog opens empty except for values the runtime deliberately supplies —
the parent foreign key, and any default declared for that field. A child field
does not inherit a parent field's value merely because the two happen to share a
name.

## Actual Behavior

The parent record's values are spread into the dialog's value map and survive
into the POST wherever the child form declares a field of the same name.

Confirmed name collisions, from the declarations:

| Parent > child | Colliding fields | Consequence |
|---|---|---|
| Organization > Business Units | `name`, `description` | the new business unit opens named after the organization |
| Business Unit > Departments | `name`, `description` | the new department opens named after the business unit |
| Department > Teams | `name` | pre-filled, and `teams.service.ts:72` derives the team `key` from `name`, so a second attempt can return 409 `Team key is already in use.` |
| State / Province > Cities | `name`, `isActive`, `sortOrder` | three fields inherited, including the city's name |

## Reproduction

Established by reading the code at `eb457d9d`; the dialogs themselves are
currently hard to exercise end to end because the same code path drops the parent
foreign key (BUG-2011), so most of these saves fail before the pre-filled value
matters.

1. Open an organization record in `/settings/organizations`.
2. Open the **Business Units** related list and press **New**.
3. Observe the `name` and `description` fields: they open carrying the
   organization's own name and description rather than empty.
4. Repeat from a business unit's **Departments** tab, a department's **Teams**
   tab and a state's **Cities** tab.

Department > Teams is the one that currently completes, because its API accepts
the missing foreign key as optional (BUG-2011, row 5) — so it is the row where
the inherited name is actually persisted today.

## Evidence

The chain, at `eb457d9d`:

- `apps/web/app/components/runtime/runtime-metadata-form-renderer.tsx:333`
  passes `parentRecord={values}` — the parent record's own field values.
- `apps/web/app/components/runtime/module-related-subgrid.tsx:787` forwards it as
  `contextValues={parentRecord}`.
- `apps/web/app/components/runtime/module-quick-create-panel.tsx:52` spreads it
  first into the dialog's value map:

```ts
const values = parentBinding
  ? {
      ...contextValues,        // the parent record's values
      ...record,
      ...draftValues,
      [parentBinding.fieldLogicalName]: parentBinding.recordId,
    }
  : { ...contextValues, ...record, ...draftValues };
```

- `formValues` (`module-quick-create-panel.tsx:119`) then keeps every key that
  also exists in the child form — which is precisely the set of colliding names —
  and those are what the POST carries.
- The team `key` derivation that turns an inherited name into a 409:
  `services/api/src/modules/teams/teams.service.ts:72`.

**An inferred, unreproduced consequence — do not treat it as confirmed.** On
Salary Package Rule > Components, `quickCreateFields` include `effectiveFrom`,
`effectiveTo` and `status`, none of which exists on
`CreateSalaryPackageRuleComponentDto`
(`compensation/dto/salary-package-rule.dto.ts:113-163`). The salary-package-rule
*parent* has `status` and `effectiveFrom`, so the bleed would supply them, and
with the global `ValidationPipe`'s `forbidNonWhitelisted: true` the submit would
return `400 property … should not exist`. This was not reproduced live and is
recorded as a lead for whoever fixes this, not as a finding.

## Root Cause

**Established.** `contextValues` is populated with the parent record's complete
field values and spread into the child dialog's initial state, with no narrowing
to fields the runtime intends to seed.

## Impact

Wrong data, entered by the product rather than by the user, on records the user
believes they created from scratch. A business unit silently named after its
organization is the kind of error that is noticed weeks later and is tedious to
unpick, because nothing distinguishes it from a deliberate choice.

It also produces a confusing secondary failure: on Department > Teams the
inherited name drives a derived `key`, so the second team created that way
collides with the first and the user is told the key is in use for a name they
did not type.

Today most of these dialogs fail before reaching the server for an unrelated
reason (BUG-2011), which masks the defect. **Fixing BUG-2011 unmasks it** — that
is the main reason to schedule the two together.

Rated MEDIUM: it writes wrong values into tenant data without the user's intent,
but it is visible in the form before saving, recoverable by editing, and
currently limited in reach.

## Affected Areas

`apps/web/app/components/runtime/runtime-metadata-form-renderer.tsx:333`;
`module-related-subgrid.tsx:787`; `module-quick-create-panel.tsx:52` and `:119`;
every related list whose child form shares a field name with its parent —
confirmed for Organization > Business Units, Business Unit > Departments,
Department > Teams and State > Cities.

## Proposed Resolution

Needs a small plan rather than a one-line change, because `contextValues` exists
deliberately and something depends on it.

Establish first **what `contextValues` is for** — which dialogs rely on inheriting
a parent value on purpose. Then narrow it: seed only fields the child form
declares *and* the runtime intends to seed, rather than every field whose name
matches. A declaration on the subgrid ("inherit these fields from the parent")
makes the intent explicit and turns today's accident into a feature where it is
actually wanted.

Schedule with BUG-2011, since that fix is what makes these dialogs reach the
server.

## Acceptance Criteria

- Opening **New** on a related list shows empty fields except the parent foreign
  key and declared defaults.
- Creating a business unit from an organization does not inherit the
  organization's name or description.
- Creating a second team from the same department does not fail with a duplicate
  key derived from an inherited name.
- Any dialog that is *supposed* to inherit a parent value declares that
  explicitly.

## Regression Coverage

None yet, and as BUG-2011 records, there is no test anywhere in `apps/web` that
exercises related-record creation. A pure-logic test over the value-assembly
function — given a parent record, a child form and a subgrid declaration, assert
the resulting initial values — would fail today and needs no jsdom.

## Dependencies

BUG-2011 should land first or alongside; until it does, most of these dialogs
never reach the server and the defect cannot be verified end to end.

## Related Items

BUG-2011 is the parent-foreign-key defect in the same code path, found in the
same sweep, and is what currently hides this one. BUG-1962 and ITEM-0105 are the
other form-versus-DTO gaps in the same dialogs.

## Resolution

Fixed as the record proposed: inheritance is now **declared** rather than
inferred from a matching field name.

**The premise was verified first.** At this branch's base
`module-quick-create-panel.tsx:52-59` still spread `contextValues` - the parent
record in full, forwarded from `module-related-subgrid.tsx:787` - into the
dialog's value map, and `runtime-metadata-form-renderer.tsx:333` still passed
`parentRecord={values}`. The defect was live.

**What `contextValues` was for.** The record asked this question first, and the
answer is that it had exactly one producer and one consumer: the related-list
subgrid handing the panel the parent record, whole. Nothing narrowed it, and
nothing declared an intent to inherit anything. The one *deliberate* inheritance
in this file is `withAssignmentParentDefaults`
(`module-related-subgrid.tsx:1285-1302`), which copies a project's
`currencyCode` onto a `projectAssignment` - and it is on the assignment panel's
path, not the quick-create dialog's, so it is untouched here and stays the
precedent for how a wanted inheritance should look.

**The change.**

- `RelatedSubgridMetadata` gains `inheritParentFields?: readonly string[]`
  (`metadata-runtime.types.ts:348-354`). No subgrid declares it today, which is
  the correct starting state: none of the four confirmed collisions is wanted.
- The value assembly moved out of the client component into
  `apps/web/lib/runtime/related-record-create-values.ts`, so it can be tested -
  `resolveInheritedParentValues` narrows the parent record to the declared
  fields, `buildQuickCreateValues` assembles the dialog's value map, and
  `filterToFormFields` (which was `formValues`, moved verbatim) drops anything
  the child form does not declare.
- `module-related-subgrid.tsx:108-112` computes the narrowed set and `:798`
  passes that as `contextValues` instead of the parent record.
- `module-quick-create-panel.tsx:61-66` calls the shared assembly.

**BUG-2011 is not undone, and is asserted not to be.** The parent foreign key
still reaches the server by both routes it did before: `buildQuickCreateValues`
sets `[parentBinding.fieldLogicalName]` last, so it cannot be overwritten by a
draft value, and the data adapters still inject it when the configured create
path did not consume it. `related-record-parent-key.spec.ts` - 39 assertions
across all 33 declared subgrids - passes unchanged after this change, and the
new suite carries two assertions of its own guarding that the key survives.

Against the acceptance criteria:

- **1, New opens empty except the parent foreign key and declared defaults** -
  met.
- **2, a business unit does not inherit the organization's name or
  description** - met, asserted directly.
- **3, a second team from the same department does not fail on a derived
  duplicate key** - met at the cause: the name is no longer inherited, so
  nothing derives a colliding `key` from it. Not observed against a running
  API, and that is the honest limit - see QA Retest.
- **4, any dialog that is supposed to inherit declares it** - met by
  construction. Nothing declares it, because nothing was found that wants it;
  the mechanism exists for when something does.

**The inferred Salary Package Rule > Components lead is untouched and remains
open.** The record recorded it as a lead rather than a finding. This change
makes it *less* likely to bite - `status` and `effectiveFrom` can no longer
bleed from the parent - but the underlying mismatch, `quickCreateFields`
declaring fields the DTO does not accept, is a form-versus-DTO gap of the kind
BUG-1962 and ITEM-0105 cover, and nothing here addresses it.

15 assertions in `related-record-create-values.spec.ts`, all passing. Five of
them - the four confirmed collisions plus the narrowing itself - fail if
`resolveInheritedParentValues` is made to return the parent record whole, which
is the previous behaviour; that mutation was run and reverted.

## QA Retest

Retested by unit coverage, not in a browser.

- 15 assertions in `apps/web/lib/runtime/related-record-create-values.spec.ts`
  pass. The four confirmed collisions from the table above are encoded as data
  and each asserts the posted body contains **only** the parent foreign key.
- BUG-2011's `related-record-parent-key.spec.ts` still passes - 39 assertions,
  unchanged - which is the specific thing this change had to not break.
- The full `apps/web` suite passes: 36 suites, 998 tests.

**Not retested live**, and three things are therefore still open:

- None of the four dialogs has been walked in a browser against a running
  tenant. The unit coverage establishes what the dialog assembles and posts; it
  does not establish how the form renders it.
- **Acceptance criterion 3 is met at the cause, not observed.** That a second
  team can now be created from the same department without a 409 follows from
  the name no longer being inherited, but it was not tried against a running
  API.
- Nothing here identifies or repairs records already created with an inherited
  value - business units named after their organization, departments named after
  their business unit. They are indistinguishable from a deliberate choice
  without knowing when they were created, and that is a data question on a live
  tenant rather than a code fix.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; found by the related-list code sweep that also produced BUG-2011, which recommended recording it separately because the fix is a behaviour change.
- 2026-08-29 — disposition PLAN_REQUIRED. The SESSION-0070 Architect triage ruled on the related-list sweep as FIX_NOW for the foreign-key defect; it did not separately rule on this pre-fill collision, which is a behaviour change touching a deliberate mechanism. Recorded as PLAN_REQUIRED so it is scheduled with BUG-2011 rather than patched inside it.
- 2026-08-29 - fixed in SESSION-0076 on `agent/bugfix-runtime`. Premise re-verified at the branch base first, and `contextValues` established to have exactly one producer and one consumer with no deliberate inheritance among them. `RelatedSubgridMetadata.inheritParentFields` added; the value assembly extracted to `lib/runtime/related-record-create-values.ts` and narrowed to declared fields only; 15 assertions added, mutation-tested against the previous spread. BUG-2011's 39 assertions confirmed still passing. All four acceptance criteria met. Status OPEN to FIXED, disposition PLAN_REQUIRED to DONE. **Not deployed.**

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
