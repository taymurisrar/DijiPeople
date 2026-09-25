---
ID: BUG-3499
aliases: [BUG-3499]
Title: The reporting hierarchy dialog pins a clipped detail card, has no close control and cannot open a record
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: USER_REPORT
DetectedDate: 2026-09-13
DetectedInSha: df0f84f1
AffectedModules: [apps/web, employees]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-498
RelatedBacklogItem:
RelatedDecision: docs/decisions/ADR-0017-the-hierarchy-viewer-stays-a-chain-scoped-dialog.md
RelatedImplementation: [docs/plans/EXECPLAN-0047-employee-record-walkthrough-two-remediation.md, apps/web/app/components/runtime/module-widget-renderer.tsx, apps/web/lib/runtime/modules/employee-hierarchy-tree.ts]
CreatedAt: 2026-09-13
UpdatedAt: 2026-09-13
ResolvedAt:
---

# BUG-3499 — The reporting hierarchy dialog pins a clipped detail card, has no close control and cannot open a record

## Summary

The **View hierarchy** dialog on the employee record's Reporting Hierarchy
section was shipped by [[ITEM-0164]]. That item is DONE on `develop`, but its
browser checks were never run. Exercised in the browser it fails at its core
interaction:
- A detail card opens on its own for the top node, is clipped by the dialog and covers the first child.
- Hovering or tapping any other person shows nothing, although the dialog's own text promises exactly that.
- People are not links to their records.
- The tree is drawn as one vertical column rather than branches.
- The dialog has no close control and no accessible name.

## Expected Behavior

Per the owner decision of 2026-09-13 (ADR-0017), the viewer stays a
chain-scoped dialog, not a full organisation chart, and:
- It draws a real branching tree: children side by side beneath their manager.
- It has a visible close control.
- Hover, keyboard focus and tap each show that person's detail card. The card is fully visible, not clipped, and never obscures another node while it is not the active one.
- Activating a person opens that employee's record.
- The dialog has an accessible name.
- It carries no introductory explanatory paragraph.

## Actual Behavior

- On open, the detail card for the root node is already shown. It is clipped by the dialog's overflow (text cut on the left) and covers the first child node.
- While that card is pinned, hovering any other node shows no card, and clicking or tapping any other node shows no card either.
- Nodes are buttons that open nothing; there is no way to reach a person's record.
- The tree renders as a single vertical column of nodes, not a branching layout.
- There is no close button, and the dialog exposes no accessible name.
- The dialog shows the intro paragraph "An avatar and a name at rest. Hover, focus, or tap a person for their role, department, work email, and work site."
- Scope observed: the top manager of this employee's chain plus that manager's descendants. The owner has decided this scope stays.

## Reproduction

1. Sign in to `https://dijipeople-demo.ws.dijipeople.com` (demo tenant) as the workspace owner.
2. Open an employee record whose reporting chain has a manager with more than one report.
3. In the Reporting Hierarchy section, click **View hierarchy**.
4. Observe the root node's card already open, clipped on the left and covering the first child.
5. Hover another node, then click or tap it. Observe that no card appears.
6. Observe the single-column layout, the absence of a close control and the intro paragraph.
7. Inspect the dialog in the accessibility tree and observe it has no accessible name.

## Evidence

Browser QA on the live demo tenant at `df0f84f1`. Code references are at the
worktree HEAD.

The component is `ReportingHierarchyTreeDialog` in
`apps/web/app/components/runtime/module-widget-renderer.tsx:2756-2799`, with each
node rendered by `ReportingHierarchyTreeNodeItem` at lines 2801-2895. It is
hand-rolled per
`docs/decisions/ADR-0012-hand-rolled-reporting-hierarchy-tree-no-new-dependency.md`.

- **Intro copy:** `description=` at line 2775.
- **No close control:** the dialog passes no `footer` and no close control (lines 2774-2797). The shared `Dialog` in `apps/web/app/components/ui/dialog.tsx:270-365` renders only a title, description, body and optional footer. A close button exists only as the separately exported `DialogCloseButton`, which this dialog does not use.
- **Auto-opened card:** `useDialogBehavior` moves focus to the first focusable element on open (`dialog.tsx:165-174`). In this dialog that is the root node's button, and its `onFocus` sets `detailOpen` to true (`module-widget-renderer.tsx:2834`).
- **Tap shows nothing:** the same button's `onClick` toggles `detailOpen` (line 2833). A click or tap first focuses the button (open) and then toggles it (closed).
- **Clipping:** the card is `absolute` (line 2858) inside the tree's `overflow-auto` container (line 2787). That container sits inside the dialog body's `overflow-y-auto` region and the panel's `overflow-hidden` (`dialog.tsx:307`, `:343`).
- **Single column:** both the root list and every child list are `flex flex-col` with a left rule (lines 2788 and 2881). This is the indent-and-rule layout ADR-0012 chose.
- **Not links:** nodes are `<button type="button">` with no navigation (lines 2825-2838).

## Root Cause

Established for most of the defects:
- The card auto-opens and tap does nothing because focus-open and click-toggle are combined on one control (`module-widget-renderer.tsx:2832-2836`), together with the dialog's initial-focus behaviour (`dialog.tsx:167-174`).
- The card is clipped because it is positioned absolutely inside scrolling and overflow-hidden ancestors.
- The layout is a single column by construction (lines 2788, 2881).
- There is no close control and no record navigation because the component provides neither.
- The intro text is passed explicitly (line 2775).

**Not yet established:**
- Why hovering another node shows no card while the root card is pinned. That node's `onMouseEnter` does set its own state, so its card may be rendering and clipped, but this is unconfirmed.
- Why the dialog has no accessible name. `useDialogBehavior` does supply `aria-labelledby` pointing at the rendered title (`dialog.tsx:246-247`, `:326`).

TASK-0031 WP-03 narrowed both, by inference only, to be confirmed in the browser:
each node's card rendered inside the scroll container, extending its scroll area
below the visible region instead of overlaying, and the first child was covered
by the pinned root card, so the pointer never entered it. The missing accessible
name remains unconfirmed because `aria-labelledby` was set; the rewrite keeps the
shared `Dialog` title and names the tree list.

## Impact

- Every user who opens the hierarchy from an employee record, in production, gets a viewer whose main interaction does not work.
- Keyboard and screen-reader users additionally get an unnamed dialog with no close control other than Escape.
- There is no data risk. The item that shipped it is marked DONE, so the defect is invisible to the backlog without this record.

## Affected Areas

- `apps/web`: `ReportingHierarchyTreeDialog` and `ReportingHierarchyTreeNodeItem` in `module-widget-renderer.tsx`.
- The employee record's Reporting Hierarchy section.
- The shared `Dialog` usage.

## Proposed Resolution

Fix the current dialog within the scope ADR-0017 fixes (chain-scoped; not an
organisation chart):
- Lay the tree out as branches: children in a row beneath their parent, scrolling in both axes when wide.
- Add a visible close control (`DialogCloseButton`).
- Separate "show details" from "open record". Hover and focus show the card. The node itself opens the employee record.
- Render the card so no ancestor can clip it, and dismiss it when another node becomes active.
- Ensure the dialog is announced with its title as its name.
- Remove the `description` intro paragraph.

Revisit ADR-0012's "no drawn connectors" reasoning only as far as a branching
layout requires. ADR-0012 ruled out a graph library, and a CSS layout does not
need one. No ExecPlan needed.

## Acceptance Criteria

- Opening the dialog shows no detail card until the user hovers, focuses or taps a node.
- Hovering, focusing or tapping any node shows that node's card, fully visible, with no text cut off and no other node's card still displayed.
- Activating a node opens that employee's record.
- Siblings render side by side beneath their manager.
- The dialog has a visible close control and an accessible name equal to its title.
- No introductory paragraph is rendered.
- The dialog still shows only this employee's chain (top manager plus descendants), and still honours the `canReadWorkEmail` / `canReadWorkSite` field-security checks.

## Regression Coverage

REG-498 and REG-499, QA scenario QA-EMPLOYEE-004:
`apps/web/lib/runtime/modules/employee-hierarchy-tree.spec.ts` — no card
initially; hover moves the card; a stale blur does not close another node's
card; a tap after focus keeps the card; tap intent (mouse and keyboard navigate,
touch shows then navigates); placement below, above, clamped left and right.

The interaction rules were extracted into a pure module and tested there,
because the web jest environment has no DOM; the close control, accessible name
and node links are checked in the browser scenario, which is also the only check
for clipping.

As filed, the record required:

- A web component test must fail today: render the dialog with a two-level tree and assert no card on open, a card on a subsequent node's focus and on its click, a close control, an accessible name, and a link or navigation on the node.
- Add a browser check on the demo tenant for the clipping. A DOM test cannot see overflow clipping.
- REG entry to be added when the tests exist.

## Dependencies

ADR-0017 records the owner's scope decision.

## Related Items

[[ITEM-0164]] shipped this viewer and is marked DONE without browser verification.
ADR-0012 chose the hand-rolled nested-list tree. ADR-0017 keeps the viewer a
chain-scoped dialog. [[ITEM-0183]] removes agent-added explanatory text across
tenant screens, including this dialog's intro.

## Resolution

Fixed in TASK-0031 WP-03 (commit 270757ba on `agent/walkthrough2-employee-record`,
merged into `agent/walkthrough2-integration`; plan EXECPLAN-0047), within the
chain-scoped dialog ADR-0017 keeps. Code:
`apps/web/app/components/runtime/module-widget-renderer.tsx`
(`ReportingHierarchyTreeDialog`, `ReportingHierarchyBranch`,
`ReportingHierarchyNodeLink`, `ReportingHierarchyDetailCard`), with the
interaction rules in `apps/web/lib/runtime/modules/employee-hierarchy-tree.ts`.

- **Branching layout.** Children sit in a row under their manager, joined by CSS
  pseudo-element connectors, inside an `overflow-x-auto` region. Still
  hand-rolled with no dependency (ADR-0012).
- **Close control.** A visible `DialogCloseButton` is the first focusable
  element, so opening the dialog shows no card.
- **Navigation.** Nodes are links to `/employees/{id}`, with `aria-current` on
  the viewed employee.
- **Interaction.** Mouse: hover shows the card, click opens the record.
  Keyboard: focus shows it, Enter opens. Touch: the first tap shows the card, the
  second opens the record.
- **No clipping.** The card renders in a portal (`z-[120]`,
  `pointer-events-none`), placed in viewport coordinates inside the viewport,
  and repositions on scroll or resize.
- The intro paragraph is removed; the chain scope and the `canReadWorkEmail` /
  `canReadWorkSite` checks are unchanged. The dialog keeps the shared `Dialog`
  title as its name and names the tree list.

Connector alignment and the Tailwind v4 `first:`/`last:`/`only:` pseudo-element
variants are unverified visually; clipping can only be confirmed in a browser.

## QA Retest

**PASS.** Browser-verified in the local QA run
(`docs/qa/runs/2026-09-13-task-0031-demo-walkthrough-2-local-browser-qa-e253306.md`,
scenarios S6–S11) on a throwaway database: the dialog is named, Close works,
the tree renders branches, the hover card fits inside the viewport and hides
on leave, the focus card shows, clicking a node opens its record, the first
touch tap shows the card, and the dialog fits at 400px. Not separately
re-exercised on production. CI runs 34732185363, 34732682935 and 34732697734
passed on f865ac5e (the merged tree). Scenario QA-EMPLOYEE-004:

1. View hierarchy on a record whose chain has a manager with two or more
   reports: no card; Close visible top-right with focus.
2. Siblings side by side with connectors; a wide tree scrolls inside the dialog.
3. Hover each node: its card is fully visible and moves with the pointer.
4. Tab to a node: the card shows; Enter opens that record.
5. Touch emulation: first tap shows the card, second opens the record.
6. A card near the bottom or right edge flips or clamps; scrolling keeps it
   attached.
7. The dialog is named "Reporting hierarchy"; no intro paragraph.
8. At 400px the dialog is usable.

## History

- 2026-09-13 — created from the second demo walkthrough (browser QA on the live demo tenant at df0f84f1); disposition set by the Architect after owner decisions.
- 2026-09-13 — fixed in TASK-0031 WP-03; unit-tested; browser verification pending.
- 2026-09-13 — QA retest: PASS — local browser QA run and production verification at e253306a.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]], [[employees]]
- Implementation — [[EXECPLAN-0047-employee-record-walkthrough-two-remediation]]
- Regression — REG-498 (see the regression register)

<!-- GRAPH:END -->
