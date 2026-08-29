---
ID: BUG-1956
aliases: [BUG-1956]
Title: Runtime lookup comboboxes expose no listbox or option semantics to assistive technology
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-338
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1956 — Runtime lookup comboboxes expose no listbox or option semantics to assistive technology

## Summary

Every lookup field rendered by the metadata form runtime in the tenant product
announces itself as a combobox controlling a listbox, and then presents no
listbox and no options. The popup is a plain `div` of `button` elements. A screen
reader user is told there is a list to choose from and is given nothing to
perceive or navigate.

## Expected Behavior

A combobox that claims `aria-haspopup="listbox"` and `aria-controls` points at an
element with `role="listbox"` whose children carry `role="option"` and
`aria-selected`, and the combobox sets `aria-activedescendant` to the focused
option as the user arrows through them. `AGENTS.md` makes accessibility mandatory
for the tenant product: "label every control … never encode meaning in colour
alone", and this is the shared runtime component every module inherits.

## Actual Behavior

With the popup open:

- the trigger has `role="combobox"`, `aria-haspopup="listbox"`,
  `aria-expanded="true"`, `aria-controls="_r_N_"`;
- the element it controls is `<div class="fixed z-[80] …">` with **no**
  `role="listbox"`;
- its options are bare `<button>` elements — no `role="option"`, no
  `aria-selected`;
- the combobox never sets `aria-activedescendant`;
- `document.querySelectorAll('[role=listbox]').length === 0` while the popup is
  open.

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, production API commit
`949f461c`, observed 2026-08-29.

1. Sign in to the tenant workspace.
2. Open `/settings/general-setup/organization/departments/new`.
3. Click the Business Unit picker to open its popup.
4. Inspect the control: the trigger matches
   `[data-runtime-field] [role=combobox]` with the ARIA attributes above; the
   popup is a `div` with no role; the options are `button` elements.
5. Evaluate `document.querySelectorAll('[role=listbox]').length` — it is `0`.

## Evidence

Live DOM inspection on the production tenant workspace, as quoted above. The
selector `[data-runtime-field] [role=combobox]` matches every lookup field the
metadata form runtime renders, which is what makes this systemic rather than one
screen's mistake.

No file:line evidence was collected — the specific component under
`apps/web/app/components/` that renders the popup was not identified during the
run and should be located before the fix.

## Root Cause

Not established. The ARIA attributes on the trigger were written; the
corresponding roles on the popup and its options were not.

## Impact

Screen-reader users cannot perceive or navigate the options of **every** lookup
field in the tenant product — which includes the required Business Unit field on
department creation, and every other relational picker the runtime renders. The
attributes present make it worse than a plain unlabelled control: the user is
told a listbox exists and then finds nothing.

Rated MEDIUM on this repository's scale (missing UI state / architectural
divergence) while noting it is systemic; the QA run judged it MEDIUM-HIGH and the
Architect may reasonably raise it.

## Affected Areas

`apps/web` metadata form runtime lookup field — every module rendered through
`app/components/metadata/` and `app/components/runtime/`.

## Proposed Resolution

Add the missing semantics to the shared component rather than to any one screen:
`role="listbox"` on the popup container, `role="option"` and `aria-selected` on
each option, and `aria-activedescendant` maintained on the combobox as the
highlighted option changes. Keyboard interaction (arrow keys, Home/End, Escape,
Enter) should be verified in the same change.

## Acceptance Criteria

- With any runtime lookup popup open, `document.querySelectorAll('[role=listbox]')`
  is non-empty and matches the element named by the trigger's `aria-controls`.
- Every option carries `role="option"` and an accurate `aria-selected`.
- `aria-activedescendant` on the combobox names the currently highlighted option.
- The Business Unit picker on department creation is operable by keyboard alone.

## Regression Coverage

None yet. An accessibility assertion over one runtime lookup field would cover
every module, since the component is shared.

## Dependencies

None identified.

## Related Items

BUG-1423 (runtime form controls have no accessible name so screen readers
announce every field as blank) is the Platform Admin runtime's equivalent and is
already VERIFIED; this is the tenant product's form runtime, a different app and
a different component.

BUG-1986 (tenant settings has four blocking accessibility violations, filed
independently on 2026-08-29 from an axe run over `/settings/organization`) is
adjacent and **not a duplicate of this record — both stand.** The two were
checked against each other explicitly, because filing an a11y defect next to
another a11y defect on the same app invites exactly that assumption:

- BUG-1986 is a set of axe rule failures on one page at rest —
  `aria-allowed-attr` and `nested-interactive` on `.cursor-pointer`,
  `button-name` on five unnamed buttons, and a contrast failure on the
  current-page navigation indicator.
- This record is a structural gap in the shared lookup component, visible only
  while the popup is **open**: no `role="listbox"` on the popup, no
  `role="option"` on the choices, no `aria-activedescendant`. Those four axe
  rules do not report it — `aria-controls` resolves to an element that exists,
  it merely has no role — and an axe scan of a page at rest never sees the popup
  at all.

Fixing either one leaves the other. They may well be worked together, since both
land in the tenant product's shared component kit.

## Resolution

Fixed in the shared component, so every module the metadata form runtime serves
is covered at once.

**The component the record could not name.** It is
`apps/web/app/components/ui/form-control.tsx`, and there are two controls in it
with this defect, not one: `LookupField` — the Business Unit picker in the
reproduction — and `SelectField` beside it. The second was worth finding: it
already carried `role="listbox"` on its popup and filled it with `button`
elements, which is a *different* violation of the same pattern and would have
survived a fix aimed only at the reported control.

**What was wrong, in the order it matters.**

The options were `button` elements. That is the root of it, and it explains why
`aria-activedescendant` was never set: the popup was navigated with Tab, so
there was no "active" option to name. A listbox whose children are buttons is
also `nested-interactive` — every option is a focusable child of a widget role.
Both controls now render `div` elements with `role="option"` and
`aria-selected` (`form-control.tsx:341` and `:1209`), reached from the keyboard
rather than by Tab.

`LookupField`'s popup had `id={listboxId}` and no role at all. The role could
not simply be added to it: that element also contains the search input and the
Clear button, so a listbox there would own two focusable controls. The role and
the id are on the options container instead (`form-control.tsx:1196`), which is
what `aria-controls` was always supposed to be pointing at.

`aria-controls` dangled. It was set unconditionally to a portalled id that does
not exist while the field is closed — and, in the lookup, does not exist when
the search matches nothing either. It is now conditional on the popup actually
being rendered (`form-control.tsx:1279`), which is the same class of defect as
the missing roles: an attribute written for something that was not built.

**Keyboard.** Arrow keys, Home and End move the highlight; Enter selects it;
Escape closes. The movement is a pure function in
`apps/web/lib/a11y/listbox-navigation.ts`, shared by both controls — two
implementations of arrow-key movement would diverge in exactly the way that
produced this record. `aria-activedescendant` is set on both triggers and, in
the lookup, on the search input as well, because that input is the element that
actually holds focus while the popup is open. A highlight that outlives a
narrowing filter is reset rather than left pointing at an option that no longer
exists.

**One thing beyond the record, for the same reason.** The link to the selected
record sat *inside* the lookup's combobox. A combobox may not own focusable
children, so it was a second `nested-interactive` on the same control — and in
practice a Tab stop inside the thing the user was trying to open. It is a
sibling now, and names the record it opens ("Open Engineering") rather than
leaving the reader to infer it.

**Coverage.** `apps/web/lib/a11y/listbox-navigation.spec.ts` tests the movement
as logic, including that an empty list yields no index and that
`aria-activedescendant` resolves to `undefined` rather than to a dangling id.
`apps/web/app/components/ui/lookup-listbox-semantics.spec.ts` asserts the
correspondence rather than either half alone: as many listboxes as comboboxes,
an option role and a selected state for each, no `type="button"` inside a
listbox, no link inside a trigger, and no unconditional `aria-controls`. It
strips comments before counting, because this fix is explained in prose that
quotes the attributes being counted and a raw match would count the explanation
as an implementation.

**Not verified in a browser.** The reproduction is on the production tenant
workspace and the browser tooling was unavailable for this work. The assertions
above are over the source; the `document.querySelectorAll('[role=listbox]')`
check in the Acceptance Criteria still wants running against a live stack.

## QA Retest

Awaiting a fix — nothing to retest yet.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition PLAN_REQUIRED — shared runtime component; needs a proper listbox/option implementation and a11y coverage, not a spot fix.
- 2026-08-29 — Checked against BUG-1986 (axe violations on `/settings/organization`, filed independently the same day) and recorded as distinct rather than duplicate: those axe rules cannot see a popup that is only wrong while open. Both records stand.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
