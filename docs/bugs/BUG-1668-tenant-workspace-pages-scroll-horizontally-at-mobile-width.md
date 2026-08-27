---
ID: BUG-1668
aliases: [BUG-1668]
Title: Tenant workspace pages scroll horizontally at mobile width
Status: DEFERRED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-27
DetectedInSha: 21032ae
AffectedModules: [views]
OwnerAgent: architect
ArchitectDisposition: DEFER
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-27
UpdatedAt: 2026-08-27
ResolvedAt:
---

# BUG-1668 — Tenant workspace pages scroll horizontally at mobile width

> **Architect triage, 2026-08-27 — `DEFER`.** Real, and named by AGENTS.md, but it costs scrolling rather than access, and the two causes want separating before anyone touches the shell. Sequenced behind the FIX_NOW items on the same screens ([[BUG-1649]], [[BUG-1654]]) so the workspace chrome is opened once.


## Summary

At a 390 px viewport the tenant workspace scrolls sideways. `AGENTS.md` states
the rule plainly — wide content scrolls inside its own container and "the page
body must never scroll horizontally". The data tables obey it; the page chrome
around them does not.

## Expected Behavior

`document.body.scrollWidth` equals the viewport width at mobile and tablet sizes.
Anything wider than the screen scrolls within its own `overflow-x: auto`
container.

## Actual Behavior

The body itself is wider than the viewport, so the whole page — header,
navigation and all — slides under the thumb.

## Reproduction

1. Sign in to a tenant workspace and set the viewport to 390 × 844.
2. Open `/payroll/cycles`, then `/employees`.
3. Compare `document.body.scrollWidth` with `document.documentElement.clientWidth`.

## Evidence

Measured on production 2026-08-27, tenant `dijipeople-demo`, viewport 390 px:

| Page | `body.scrollWidth` | Overflow |
|---|---|---|
| `/payroll/cycles` | 678 | +288 px |
| `/employees` | 451 | +61 px |

On `/payroll/cycles` the widest offenders are the page header and the payroll
sub-navigation, not the grid:

```
section  right=678  "PayrollPayroll CyclesManage reusable pay…"
nav      right=657  "OperationsOverviewRunsExceptionsPayslips…"
h1       right=657  "Payroll Cycles"
```

The `nav` carries `flex flex-wrap gap-x-4 gap-y-2` — it is allowed to wrap, but
its parent is not narrow enough for wrapping to help.

On `/employees` the offender is different: a column-resize handle,
`absolute right-0 top-0 h-full w-1.5 cursor-col-resize`, positioned at
`right: 1079` against a 390 px viewport. It is absolutely positioned against the
full table width rather than the visible area, so it drags the body out even
though the table itself is correctly contained.

**The tables are not at fault.** Verified separately on `/payroll/cycles` at
1440 px: the grid is 2049 px inside a 1102 px container with
`overflow-x: auto`, it scrolls internally, and the body stays at 1440. That part
of the design is right, which is what makes the surrounding chrome the defect.

## Root Cause

Not established. Two distinct causes are visible and they need separating: page
chrome that does not reflow on `/payroll/cycles`, and an absolutely-positioned
resize handle escaping its container on `/employees`. Fixing one will not fix the
other.

## Impact

An employee opening the workspace on a phone gets a page that slides sideways,
with the header and navigation partly off-screen. Self-service is exactly the
use most likely to happen on a phone — checking a payslip, requesting leave —
so this lands on the audience least able to work around it.

Nothing is unreachable; horizontal scrolling is a usability cost rather than a
barrier, which is why this is MEDIUM. But `AGENTS.md` names it specifically, and
the product is sold to companies whose staff are mostly not at a desk.

## Affected Areas

- The tenant workspace shell and page headers in `apps/web`
- `/payroll/cycles` sub-navigation
- The data-table column-resize handle
- Not verified: tablet widths, `apps/admin`, and the landing site

## Proposed Resolution

Treat the two causes separately.

For the chrome, let the header and sub-navigation reflow below the shell's
minimum width rather than sitting on a fixed track.

For the resize handle, constrain it to the scroll container instead of the table
so it cannot report a position outside the viewport — or hide the affordance
below the width where dragging a 1.5 px target is realistic anyway.

Then add the measurement to the browser suite. `body.scrollWidth` against
`clientWidth` is a one-line assertion, it is exactly what `AGENTS.md` requires,
and nothing currently checks it.

## Acceptance Criteria

- At 390 px, `document.body.scrollWidth` equals the viewport on the overview,
  employees, payroll and settings screens.
- Wide tables still scroll inside their own container.
- The same holds at a tablet width.

## Regression Coverage

None yet. Needs an assertion in the browser suite that no page body scrolls
horizontally at a mobile viewport. Requires a `REG-nnn` entry once written.

## Dependencies

None.

## Related Items

Found in the first responsive pass over the tenant workspace, which the
2026-08-27 handoff lists as never having been run. Same session as
[[BUG-1649]] and [[BUG-1654]].

## Resolution

Not yet resolved.

## QA Retest

Not yet retested. Retest by measuring, not by looking — the page renders without
obvious clipping and the overflow is only apparent when you scroll or compare the
two widths.

## History

- 2026-08-27 — found in the first responsive pass over a real tenant workspace.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
