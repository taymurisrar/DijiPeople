---
ID: BUG-3377
aliases: [BUG-3377]
Title: Admin lookup controls still carry the nested-interactive listbox that BUG-1956 fixed only in web
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: USER_REPORT
DetectedDate: 2026-09-11
DetectedInSha: cbd9b812
AffectedModules: [apps/admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/scenarios/QA-UI-001-admin-lookup-controls-are-keyboard-operable-and-expose-no-ne.md
RegressionId: REG-413
RelatedBacklogItem: ITEM-0163
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-12
ResolvedAt: 2026-09-12
---

# BUG-3377 — Admin lookup controls still carry the nested-interactive listbox that BUG-1956 fixed only in web

## Summary

[[BUG-1956]] corrected the tenant product's lookup combobox so that its option
list uses real listbox semantics and does not nest focusable controls inside a
combobox. It scoped itself to `apps/web/app/components/ui/form-control.tsx` and
never looked at the admin console. The admin console has two of its own lookup
controls, and both still have the defect that record described.

One of them has no keyboard support at all. Its file contains zero key
handlers, so the control can be opened only with a pointer and its options can
never be reached from the keyboard.

## Expected Behavior

A lookup in the admin console is operable by keyboard and announces itself
correctly: options are reachable with the arrow keys, selectable with Enter,
dismissable with Escape, and are not themselves Tab stops inside a composite
widget.

## Actual Behavior

Options are rendered as `button` elements carrying `role="option"` inside a
`role="listbox"`. A listbox that owns focusable children is the
`nested-interactive` violation, and it makes every option its own Tab stop.
Neither control sets `aria-activedescendant`. `LookupControl` additionally has
no key handling whatsoever, and its clear affordance is unreachable by keyboard.

## Reproduction

1. Open any admin console screen with a lookup or searchable select, for example
   a runtime form with a reference field.
2. Focus the control with the keyboard and press the arrow keys. Nothing moves.
3. Tab instead. Focus enters the option list one option at a time.
4. With a value selected, try to reach the clear control by keyboard. It cannot
   be focused.

## Evidence

- `apps/admin/app/_components/ui/form-control.tsx:562` — an option rendered as
  `button ... role="option"` inside the control's `role="listbox"` container.
- `apps/admin/app/_components/runtime/runtime-form.tsx:1152` and `:1166` — the
  same pattern in `SearchableSelect`, including the "No selection" row.
- `apps/admin/app/_components/ui/form-control.tsx` contains **zero** occurrences
  of `onKeyDown`. `LookupControl` has no arrow, Enter, Escape, Home or End
  handling.
- `apps/admin/app/_components/ui/form-control.tsx:502-514` — the clear control
  is a `span` with `role="button"` and `tabIndex={-1}`, nested inside the
  trigger `button` at line 495. A `button` may not contain another interactive
  element, and `tabIndex={-1}` removes it from the tab order, so keyboard users
  have no way to clear a value.
- Neither control sets `aria-activedescendant` anywhere.

For contrast, the fixed web control at
`apps/web/app/components/ui/form-control.tsx:1215-1256` renders options as
non-focusable `div` elements reached through `aria-activedescendant`, with the
reasoning recorded in a comment at that site.

## Root Cause

[[BUG-1956]] was scoped to one file in one app. The admin console maintains its
own copies of the same control and they were not in that scope, so the fix did
not reach them.

## Impact

Keyboard-only and assistive-technology users cannot operate lookups in the
platform admin console, and cannot clear a lookup value at all. This is the
console DijiPeople's own operations staff use, so the population is small but
the barrier is total rather than partial.

## Affected Areas

`LookupControl` in `apps/admin/app/_components/ui/form-control.tsx` and
`SearchableSelect` in `apps/admin/app/_components/runtime/runtime-form.tsx`, and
therefore every admin runtime form that renders a reference field.

## Proposed Resolution

Port the pattern already proven in `apps/web`: options become non-focusable
elements inside the listbox, the combobox keeps focus and points at the active
option through `aria-activedescendant`, and the key handling for arrows, Enter,
Escape, Home and End lives on the search input. Move the clear control out of
the trigger `button` and make it a real, focusable `button` sibling.

The better long-term answer is one shared control rather than three; that is
[[ITEM-0163]]. This record is the narrower correctness fix and should not wait
for it.

## Acceptance Criteria

- No element with `role="option"` in either admin control is focusable.
- Arrow keys move an active option, Enter selects it, Escape closes the list,
  in both controls.
- `aria-activedescendant` names the active option while the list is open.
- The clear affordance is a focusable button outside the trigger and can be
  reached and activated by keyboard.
- An automated accessibility scan of an admin runtime form reports no
  `nested-interactive` violation on these controls.

## Regression Coverage

Needs a test asserting that options rendered by both admin controls are not
focusable and that `aria-activedescendant` is set while open, mirroring the
existing web coverage. A register entry follows once written.

## Dependencies

None. Consolidating the implementations is [[ITEM-0163]] and is separate.

## Related Items

[[BUG-1956]] is the web fix whose scope excluded these files. [[ITEM-0163]]
covers unifying the lookup implementations. [[BUG-3376]] is the data-loss defect
in the same family of controls.

## Resolution

**Fixed 2026-09-12**, in SESSION-0103, by porting the pattern already proven in
`apps/web/app/components/ui/form-control.tsx` (BUG-1956) to both admin
controls, rather than reinventing it.

### `LookupControl` (`apps/admin/app/_components/ui/form-control.tsx`)

- The trigger is a `div[role="combobox"]` with `tabIndex`, `aria-expanded`,
  `aria-haspopup="listbox"`, `aria-controls` (only while the popup exists) and
  `aria-activedescendant` — not a `<button>` any more. It could not stay a
  `<button>`: a `<button>` may not contain another interactive element, which
  is exactly why the old clear affordance was a `span role="button"
  tabIndex={-1}` instead of a real button.
- The clear affordance is now a real, focusable `<button aria-label="Clear
  selection">`, a sibling inside that `div`, reachable by keyboard.
- Options in the popup are non-focusable `div`s with `role="option"` and
  `aria-selected`, reached from the search input via
  `aria-activedescendant`/`id={listboxOptionId(...)}` — not `button`s inside
  the `listbox` any more.
- Arrow keys (wrapping), Home, End, Enter and Escape are all handled on the
  search input, via the same pure `nextActiveIndex`/`activeDescendantId`
  resolver `apps/web` uses. Previously there was no key handling anywhere in
  this component.
- Gained an opt-in `onSearch` prop for contract consistency with
  `LookupField` (see ITEM-0163); nothing calls it yet.

### `SearchableSelect` (`apps/admin/app/_components/runtime/runtime-form.tsx`)

- Same conversion: options are non-focusable `div`s, `aria-activedescendant`
  is set on both the trigger and the search input, `aria-controls` is
  conditional on the popup existing, and the "No selection" row is one of the
  keyboard-reachable entries rather than a `button` bolted on above the
  listbox.
- Gained `onQueryChange`, `serverFiltered`, `loading` and `resultsTruncated`
  props (used by `RuntimeLookup` for BUG-3376's admin-side search fix — see
  that record).

### Shared

- New `apps/admin/lib/a11y/listbox-navigation.ts` ports
  `apps/web/lib/a11y/listbox-navigation.ts`'s three pure functions
  (`nextActiveIndex`, `listboxOptionId`, `activeDescendantId`) — no shared
  package exists between the two apps for this (root `AGENTS.md`: `packages/`
  holds exactly four workspaces), so it is a deliberate duplication rather
  than a new cross-app dependency, with a spec mirroring the web original.
- New `apps/admin/lib/runtime/lookup-listbox-semantics.spec.ts` source-scans
  both controls for the fixed pattern (no `<button>` inside `role="listbox"`,
  `aria-activedescendant` present, `aria-controls` conditional, no
  `role="button"`/`tabIndex={-1}` remaining), mirroring
  `apps/web/app/components/ui/lookup-listbox-semantics.spec.ts`.
- Regression register entry: REG-413. Reusable QA scenario: QA-UI-001 (manual —
  neither app installs jsdom, so the live-keyboard half cannot be automated;
  see that scenario's "Why This Is Reusable").

### What this did not touch

Retiring the third admin lookup implementation named in [[ITEM-0163]] (the
bespoke native `<select>` in `contract-creation-launcher.tsx`) was out of
scope — this bug named only `LookupControl` and `SearchableSelect`.

## QA Retest

Pending — QA-UI-001 is filed and its steps are written, but has not yet been
run against a live admin session (`LAST_RESULT: NOT_RUN`). The claims above
are backed by the passing source-level specs listed, not by a browser pass.

## History

- 2026-09-11 — created at `cbd9b812` from a lookup consistency audit; each claim
  re-verified against the two admin source files before filing.
- 2026-09-12 — fixed in SESSION-0103, branch `agent/r-s6-lookups`. REG-413 and
  QA-UI-001 filed alongside.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0163]]
- Modules — [[platform-admin]]
- Regression — REG-413 (see the regression register)

<!-- GRAPH:END -->
