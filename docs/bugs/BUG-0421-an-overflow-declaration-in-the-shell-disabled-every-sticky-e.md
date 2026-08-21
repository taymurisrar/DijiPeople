---
ID: BUG-0421
aliases: [BUG-0421]
Title: An overflow declaration in the shell disabled every sticky element
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-22
DetectedInSha: fb7c771
AffectedModules: [apps/admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-188
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/document-render-and-theme
CreatedAt: 2026-08-22
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-22
---

# BUG-0421 — An overflow declaration in the shell disabled every sticky element

## Summary

`admin-shell.tsx` wrapped every page in `overflow-x-hidden`. `overflow-x:
hidden` forces the other axis to compute to `auto`, making that wrapper a scroll
container — and a sticky element sticks to its nearest scroll container, which
here has auto height and never scrolls. Every `position: sticky` in the console
was inert.

## Expected Behavior

An element declaring `sticky` stays in view while the page scrolls.

## Actual Behavior

Nothing stuck. The contract editor's fields rail, delivered and reported as
sticky the previous round, scrolled away with the page.

## Reproduction

1. Open a contract template in Platform Admin.
2. Open **Fields & signatures** and scroll the document.
3. The panel leaves the viewport.

## Evidence

- `apps/admin/app/_components/admin-shell.tsx` — `<div className="min-w-0
  overflow-x-hidden">{children}</div>`.
- CSS Overflow 3: an `overflow` value other than `visible`/`clip` on one axis
  computes the other from `visible` to `auto`.
- Reported twice: "Fields & signature is sticky on the right side" (delivered),
  then "'Fields & signatures' should sticky on the right side" (still not).

## Root Cause

A declaration on one file silently disabling a property on another, with no
error and nothing in either file to connect them. `hidden` and `clip` are one
word apart and only one of them creates a scrollport.

Compounding it, the template editor put the document in a `minmax(0,1fr)` column
beside a permanent 280px Version history column, and the editor then opened its
own 20rem rail inside that — so an 816px sheet rendered at roughly 650px. The
one element on the page that needs width had the least of it.

## Impact

Every sticky surface in Platform Admin, including data-table headers and
pagination bars that were written to stick and never did.

## Affected Areas

`apps/admin` — the shell wrapper, the contract template editor layout, the
document editor's rail.

## Proposed Resolution

`overflow-x-clip`, which contains horizontal overflow without creating a
scrollport. Move Version history beside the settings card and give the document
editor the full page width, with the rail taking leftover space rather than
taking it from the sheet.

## Acceptance Criteria

- The fields rail stays in view while the document scrolls.
- The document sheet renders at its full 816px wherever the viewport allows.
- No horizontal page scrollbar is introduced.

## Regression Coverage

REG-188 — `apps/admin/lib/sticky-containment.spec.ts`, which fails on any
`overflow-x-hidden` wrapper that is not itself a scrollport.

## Dependencies

None.

## Related Items

[[BUG-0420]] — reported in the same message.

## Resolution

Fixed on `agent/document-render-and-theme`.

## QA Retest

Not opened in a browser. The containment rule is asserted; whether the rail
visually holds is unobserved.

## History

- 2026-08-22 — reported as "'Fields & signatures' should sticky on the right
  side ... keep the document editor canvas full".
