---
ID: BUG-3378
aliases: [BUG-3378]
Title: The responsive runtime tab strip hides a measurement copy from screen readers while leaving thirteen buttons in the tab order
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: UX
Source: USER_REPORT
DetectedDate: 2026-09-11
DetectedInSha: cbd9b812
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem: ITEM-0167
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3378 — The responsive runtime tab strip hides a measurement copy from screen readers while leaving thirteen buttons in the tab order

## Summary

The shared responsive tab strip renders a second, invisible copy of every tab so
it can measure how many fit before collapsing the rest into a More menu. That
copy is correctly marked `aria-hidden="true"`, but its buttons are still
focusable. A keyboard user tabbing through an employee record walks through
thirteen invisible buttons that a screen reader has been told do not exist.

Separately, the visible strip is not a tab strip in the accessibility tree at
all. The record page contains **zero** elements with `role="tab"`,
`role="tablist"` or `role="tabpanel"`. The tabs are plain buttons.

This matters more than its severity suggests, because the employee record is the
layout the product owner has asked every other module to copy. Standardising on
it as it stands would propagate both defects across the product. See
[[ITEM-0167]].

## Expected Behavior

Content hidden from assistive technology is also removed from the tab order. A
strip of tabs exposes tab semantics, so that a screen reader announces "tab 3 of
13" and the arrow keys move between tabs in the way the pattern specifies.

## Actual Behavior

The measurement copy is `aria-hidden` but not `inert`, so its thirteen buttons
remain focusable. The visible strip exposes no tab semantics whatsoever.

## Reproduction

1. Open an employee record in the tenant product, for example
   `/employees/{employeeId}`.
2. Tab through the page from the action bar. Focus disappears into elements that
   are not visible on screen and stays there for thirteen stops.
3. Inspect the accessibility tree. There is no `tablist`, no `tab` and no
   `tabpanel`.

## Evidence

Measured on the live demo workspace at `cbd9b812`, on the employee record for a
seeded employee:

| Measurement | Value |
|---|---|
| Elements with `role="tab"`, `role="tablist"` or `role="tabpanel"` in `main` | 0 |
| Measurement copy `aria-hidden` | `"true"` |
| Measurement copy `inert` attribute present | no |
| Focusable descendants inside the measurement copy | 13 |
| Buttons labelled `Summary` in `main` | 2 |

The measurement copy is the element carrying
`pointer-events-none fixed left-0 top-0 -z-10 flex h-0 gap-2 overflow-hidden opacity-0`,
rendered by `apps/web/app/components/runtime/responsive-runtime-tabs.tsx`. It is
visually hidden through zero height and zero opacity, which does not remove an
element from the focus order.

The duplication itself is deliberate and correct — a width measurement needs a
rendered copy. The defect is only that the copy is left focusable.

## Root Cause

`aria-hidden` and focusability are independent. Marking a subtree
`aria-hidden="true"` tells assistive technology to skip it but does nothing to
the tab order; removing it from the tab order needs `inert`, or `tabindex="-1"`
on each control. Only the first half was applied.

The missing tab semantics are a separate omission in the same component: the
strip was built from buttons and never given the roles.

## Impact

Every keyboard user of the tenant product meets thirteen dead tab stops on every
runtime record page that uses the responsive tab strip, which is most of them. A
screen reader user gets no indication that the buttons are tabs, so there is no
announcement of position, count or selected state, and the arrow-key navigation
the pattern implies does not work.

This is the classic `aria-hidden-focus` finding and will be flagged by any
automated accessibility scan.

## Affected Areas

`apps/web/app/components/runtime/responsive-runtime-tabs.tsx`, and therefore
every record page rendered through `ModuleRecordPage` and
`StandardModuleRecordPage`.

## Proposed Resolution

Add `inert` to the measurement copy, so it is removed from the focus order by
the same attribute that removes it from interaction. Where `inert` is not
acceptable for the supported browser range, set `tabIndex={-1}` on every control
inside the copy.

Then give the visible strip real tab semantics: `role="tablist"` on the
container, `role="tab"` with `aria-selected` and `aria-controls` on each tab,
`role="tabpanel"` with `aria-labelledby` on the panel, roving `tabindex`, and
arrow-key movement. The More menu needs to stay reachable as part of that.

No ExecPlan needed; this is one shared component. It should land **before**
[[ITEM-0167]] propagates this shell to further modules.

## Acceptance Criteria

- The measurement copy contains no focusable element, verified by counting
  focusable descendants on a rendered record page.
- Tabbing from the action bar reaches the first visible tab and then the panel,
  with no invisible stops.
- The strip exposes one `tablist`, one `tab` per visible tab with
  `aria-selected`, and a `tabpanel` associated with the selected tab.
- Arrow keys move between tabs; Tab moves out of the strip.
- An automated accessibility scan of an employee record reports no
  `aria-hidden-focus` violation.

## Regression Coverage

Needs a test that renders the responsive tab strip and asserts both that the
measurement copy has no focusable descendants and that the visible strip exposes
tab roles. A register entry follows once written.

## Dependencies

None. [[ITEM-0167]] should wait on this rather than the other way round.

## Related Items

[[ITEM-0167]] would spread this shell to the record pages that do not yet use
it. [[BUG-1956]] is the same class of defect in the lookup control and carries
the reasoning about focusable children inside composite widgets.

## Resolution

Not yet fixed.

## QA Retest

Pending.

## History

- 2026-09-11 — created at `cbd9b812`; measured directly on the live employee
  record while auditing the record layout the owner proposed standardising on.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0167]]
- Modules — [[tenant-application]]

<!-- GRAPH:END -->
