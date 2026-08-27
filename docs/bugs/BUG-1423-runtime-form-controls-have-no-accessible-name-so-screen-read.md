---
ID: BUG-1423
aliases: [BUG-1423]
Title: Runtime form controls have no accessible name so screen readers announce every field as blank
Status: OPEN
Severity: HIGH
Priority: P1
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 8d6be21b
AffectedModules: [apps/admin]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport: docs/qa/runs/2026-08-26-admin-prod-e2e-8d6be21.md
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-27
ResolvedAt:
---

# BUG-1423 — Runtime form controls have no accessible name so screen readers announce every field as blank

> **Architect triage, 2026-08-27 — `PLAN_REQUIRED`.** The shared runtime form, across every metadata-driven screen in two apps. Needs a plan, not a patch, and it subsumes BUG-1552 and touches BUG-1421.


## Summary

The shared runtime form draws each field's label as a `<span>` and never
connects it to the control. The text is visible, so the form looks correct; it
is not a `<label>`, the input carries no `id`, `name`, `aria-label` or
`aria-labelledby`, and nothing associates the two.

axe-core rates this **critical**. Across four create screens on production it
found **28 unlabelled controls**. `/plans/new` and `/templates/new`, which are
bespoke forms rather than runtime ones, are clean — which is what identifies the
shared component as the cause.

## Expected Behavior

Every form control has a programmatic accessible name — WCAG 1.3.1 Info and
Relationships and 4.1.2 Name, Role, Value. A screen reader announces the field's
label when focus reaches it; clicking the label focuses the control; browser
autofill can recognise the field.

## Actual Behavior

Controls have no accessible name at all. A screen reader announces "edit, blank"
for every field on the form. Clicking a label does nothing. Autofill cannot
match anything, because there is no `name` or `id` either.

Select and lookup controls are exempt: `FieldControl` passes `ariaLabel` for
those. It is the plain `text`, `email`, `number`, `tel`, `url` and `date` inputs
that have nothing.

## Reproduction

1. Sign in to https://admin.dijipeople.com.
2. Open `/leads/new`.
3. Run axe-core with the `wcag2a`/`wcag2aa`/`wcag21a`/`wcag21aa` tags, or
   inspect any text input and look for a label association.

Observed, 2026-08-26 against `8d6be21b`:

```
/leads/new          [critical] label  x  5   Form elements must have labels
/customers/new      [critical] label  x 10
/partners/new       [critical] label  x  6
/support/cases/new  [critical] label  x  7

ROLL-UP ACROSS 17 ROUTES
[critical] label            4 routes,  28 nodes — Form elements must have labels
           e.g. <input class="min-h-10 w-full roun..." required="" type="text" step="any" value="">

/plans/new          0 violations      (bespoke form)
/templates/new      0 violations      (bespoke form)
```

The sample node shows the whole problem: `required=""` is present, an `id` is
not.

## Evidence

[`runtime-form.tsx:207-218`](../../apps/admin/app/_components/runtime/runtime-form.tsx#L207)
renders the label as a `<span>` inside a `<div>`:

```tsx
<div
  data-field-key={field.key}
  className={`flex flex-col gap-1.5 ... ${span}`}
>
  <span className="block min-h-4">
    {field.label}
    {required ? <span className="ml-1 text-rose-600">*</span> : null}
  </span>
  ...
  <FieldControl field={field} ... />
```

There is no `<label>`, no `htmlFor`, no generated `id`, and no
`aria-labelledby` pointing at the span.

`FieldControl` does pass a name for the composite controls —
[`runtime-form.tsx:615`](../../apps/admin/app/_components/runtime/runtime-form.tsx#L615)
and [`:863`](../../apps/admin/app/_components/runtime/runtime-form.tsx#L863)
both pass `ariaLabel={field.label}` — which is exactly why those pass axe and
the plain inputs do not. The mechanism is understood in the file; it is simply
not applied to the ordinary case.

## Root Cause

The wrapper was written for layout, and the label is styling rather than
semantics. Because the text renders in the right place and the form looks
finished, nothing in review or in use reveals the missing association. The
composite controls needed an explicit `ariaLabel` to work at all, so they got
one; plain inputs appeared to work without one.

## Impact

Production, every metadata-driven create and edit form in the admin console —
leads, customers, partners, support cases, contracts, tenants and every future
runtime module. The runtime is the documented default for new admin modules, so
new screens inherit this by construction.

A screen reader user cannot fill in any runtime form: the fields are
indistinguishable. Sighted keyboard and pointer users lose label-click focusing
and autofill.

Combined with [[BUG-1422]], a runtime form neither names its fields nor explains
which one it is rejecting.

## Affected Areas

- `apps/admin/app/_components/runtime/runtime-form.tsx` — `renderField`
- Every screen composing `RuntimeForm`, in both create and edit mode

## Proposed Resolution

Give the field a stable id and make the label a real label. In `renderField`,
derive `const controlId = \`field-${field.key}\`` (the wrapper already has a
unique `data-field-key`), render `<label htmlFor={controlId}>` instead of the
outer `<span>`, and thread `id={controlId}` into `FieldControl` so each control
renders it.

Where a control is composite and cannot take an id, keep the existing
`ariaLabel` route and add `aria-labelledby` pointing at the label element.

Adding `name` alongside `id` would additionally restore browser autofill, which
is worth doing in the same pass.

## Acceptance Criteria

- axe reports zero `label` violations on every admin create and edit screen.
- Clicking a field's label moves focus into that field.
- A screen reader announces the field's label on focus, for every field type.
- A test fails if a runtime form renders a control with no accessible name.

## Regression Coverage

Needed: an axe assertion over the runtime create forms, gating on the `label`
rule at minimum. `PLAN-019` already calls for the shell and its shared
components to be audited in their own right; this is the form half of that.

## Dependencies

None.

## Related Items

- [[BUG-1421]] — the shell's landmark and title defects, same audit
- [[BUG-1422]] — the same forms cannot report which field is invalid
- [[PLAN-019-platform-admin]]

## Resolution

Not yet fixed.

## QA Retest

Pending.

## History

- 2026-08-26 — created from qa run at `8d6be21b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-admin]]

<!-- GRAPH:END -->
