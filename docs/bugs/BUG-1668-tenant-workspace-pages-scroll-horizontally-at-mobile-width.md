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
QAReport: docs/qa/runs/2026-08-29-starter-plan-e2e-pass-2-8ab1cbf.md
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-27
UpdatedAt: 2026-08-29
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
- 2026-08-29 — re-measured on a **populated** production tenant (SESSION-0072).
  Dashboard +400px at 390px; the mechanism is a 217px inline sidebar whose
  collapse control is `hidden … xl:block`. Re-triage out of `DEFERRED`
  recommended, to `PLAN_REQUIRED`; disposition unchanged pending the Architect.


## Reproduction obtained — 2026-08-29

This record was deferred for want of a reproducible case. It has one.

Flow J, the first browser coverage of `apps/web` (ITEM-0034), asserts that the
settings page does not scroll sideways at 390px. It **fails**:

```
Error: the settings page scrolls horizontally at 390px
expect(received).toBe(expected)
Expected: false
Received: true
```

Measured against a live stack at `41eaadb4` with `seed-demo` data, on
`/settings` at the `mobile` viewport (390 × 844).

The assertion is a property rather than a screenshot, deliberately: pixel
baselines generated on one operating system do not match another's renderer and
cannot gate CI, while "the body does not scroll sideways at 390px" is true or
false identically everywhere.

It is marked `test.fixme` naming this record — so it does not fail the suite
today, and it will start passing on its own when this is fixed rather than
needing somebody to remember to re-check. **The disposition is unchanged.** This
adds evidence, not a decision; whether to fix it now is still the Architect's
call, and it stays `DEFERRED` until somebody makes it.


## Re-measured on a populated tenant, and the mechanism identified — 2026-08-29

Second Starter-plan production pass, SESSION-0072, deployed API `949f461c`,
tenant `DijiPeople Demo` carrying real data (11 employees, 60 attendance entries,
4 leave requests). Full run:
`docs/qa/runs/2026-08-29-starter-plan-e2e-pass-2-8ab1cbf.md`.

Overflow is `max(body.scrollWidth, documentElement.scrollWidth) - innerWidth`.

| Route | Overflow at 390px | Against the earlier figure |
|---|---|---|
| `/` (dashboard) | **+400px** | never measured before — `body.scrollWidth` 790 against a 390 viewport |
| `/employees` | +103px | was +61px on an **empty** tenant; real data widened it |
| `/leaves` | +95px | not previously measured |
| `/attendance` | +95px | not previously measured |

At 768px the same dashboard overflows by only **+26px**. This is a phone problem
specifically, not a general layout failure.

### The mechanism: the sidebar never becomes a drawer

The tenant shell renders its navigation as an inline `<aside>` that is **217px
wide at every viewport**, with no small-screen treatment at all:

| Viewport | Sidebar | Share of screen | Collapse control |
|---|---|---|---|
| 390px | 217px | **56%** | not rendered |
| 768px | 217px | 28% | not rendered |
| ≥1280px | 217px | 17% | rendered |

At 390px that leaves roughly 157px of usable width for a dashboard grid that
measures 529px and cannot reflow into what is left — which is where the 400px
comes from. There is no drawer pattern anywhere in the shell.

**And there is no escape.** The collapse control exists in the DOM at every
width, but its ancestor is Tailwind `hidden px-2 pt-2 xl:block`:

```
button[aria-label="Collapse sidebar"]
  → hidden by ancestor: div.hidden px-2 pt-2 xl:block   [computed display: none]
  → getBoundingClientRect() = 0 × 0 at 390px and at 768px
```

So the sidebar is collapsible only at ≥1280px — the one width at which collapsing
it saves nothing. On a phone it takes over half the screen permanently and the
control that would fix it is `display: none`.

This is a **third** cause, distinct from the two the Root Cause section already
separates. It is not the payroll sub-navigation and it is not the resize handle:
it is present on every route in the workspace because it is the shell itself, and
it is the largest single contributor at phone width.

### Recommendation to the Architect: re-triage out of `DEFERRED`

**This is a recommendation, not a decision.** QA does not set disposition, and
nothing in this section changes `Status` or `ArchitectDisposition` — they remain
`DEFERRED` / `DEFER` until the Architect rules.

The argument for revisiting:

- The deferral was taken on an **empty** tenant, where the worst case was
  `/payroll/cycles` at +288 and `/employees` at +61. The landing screen of a
  populated tenant is **+400**, and the first screen every user sees was never in
  the measured set.
- The 2026-08-27 triage note reasoned that this "costs scrolling rather than
  access". Navigation occupying 56% of a phone screen, with its collapse control
  unreachable below 1280px, is closer to access than to scrolling.
- This is an HR product whose **employees** are the primary users — a payslip, a
  leave request, an attendance check. The phone is not a secondary surface for
  that audience.

Suggested disposition: **`PLAN_REQUIRED`**, not `FIX_NOW`. A drawer pattern for
the shell plus a breakpoint for the collapse control is real design and shell
work with consequences for every route, not a patch — and the third cause found
here strengthens the original triage note's instinct that the causes want
separating before anyone opens the shell.

### Scope of this measurement

`/`, `/employees`, `/leaves` and `/attendance`, at 390×844 and 768×1024, signed
in as the tenant owner. Settings pages, record pages and `apps/admin` were not
measured at these widths. Layout only: no touch-interaction testing was done, and
a control being on screen is not the same as it being usable with a thumb.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
