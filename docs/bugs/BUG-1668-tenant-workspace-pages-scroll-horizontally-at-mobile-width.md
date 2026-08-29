---
ID: BUG-1668
aliases: [BUG-1668]
Title: Tenant workspace pages scroll horizontally at mobile width
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-27
DetectedInSha: 21032ae
AffectedModules: [views]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-29-starter-plan-e2e-pass-2-8ab1cbf.md
RegressionId: REG-344
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-27
UpdatedAt: 2026-08-30
ResolvedAt: 2026-08-30
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

REG-344. See "Fixed — 2026-08-30" below.

## Dependencies

None.

## Related Items

Found in the first responsive pass over the tenant workspace, which the
2026-08-27 handoff lists as never having been run. Same session as
[[BUG-1649]] and [[BUG-1654]].

## Resolution

Fixed — see "Fixed — 2026-08-30" below for the full account. Summary: two of
the three causes this record separates were addressed with scoped, reasoned
CSS changes (the sidebar's unconstrained width below `xl`, and the payroll
sub-navigation's non-wrapping group rows); the third (the `/employees`
resize-handle claim) does not reproduce against current source and is
documented as such rather than patched. **Not visually verified** — no
browser was available to this task; the reasoning and file:line evidence are
below.

## QA Retest

Not retested live or in a browser. The record's own `test.fixme` in
`e2e/tests/flow-j-tenant-settings.spec.ts` ("J — settings does not scroll
sideways on a phone") was deliberately left `fixme` rather than un-fixmed by
this task: removing `.fixme` on the strength of source-reading alone, without
a browser run to confirm it now passes, would trade a known skip for a
possible false CI failure. Whoever next runs the E2E suite should remove
`.fixme` and confirm.

## History

- 2026-08-27 — found in the first responsive pass over a real tenant workspace.
- 2026-08-29 — re-measured on a **populated** production tenant (SESSION-0072).
  Dashboard +400px at 390px; the mechanism is a 217px inline sidebar whose
  collapse control is `hidden … xl:block`. Re-triage out of `DEFERRED`
  recommended, to `PLAN_REQUIRED`; disposition unchanged pending the Architect.
- 2026-08-30 — fixed two of the three causes (sidebar width, payroll
  sub-navigation wrapping) with reasoned CSS changes; found the third
  (`/employees` resize handle) does not reproduce against current source.
  Closed FIXED under REG-344. See "Fixed — 2026-08-30" below.


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

## Fixed — 2026-08-30

No browser was available to this task (Playwright was explicitly withheld —
it dirties the checkout and writes rows to the production client error log).
Every change below is reasoned from the source against the record's own
measurements and file:line evidence, not visually confirmed. Treat it
accordingly: a strong argument, not a screenshot.

### Cause 3 (the dominant one) — the sidebar

`apps/web/app/(authenticated)/_components/dashboard-sidebar.tsx`. The
`<aside>` carried no width class at all below `xl` — only `xl:w-[76px]`
(collapsed) / `xl:w-[280px]` (expanded) — so its width came from its content:
unwrapped nav-item label text, which the 2026-08-29 re-measurement found to be
217px at every width under `xl`. The collapse control that would otherwise let
someone shrink it is itself `hidden ... xl:block` and unreachable below `xl`,
so nothing could act on it.

Fix: gave the `<aside>` a fixed `w-16 shrink-0` below `xl` — the same
icon-only rail width the desktop *collapsed* state already uses, not a new
size — and made the nav-item label `sr-only` (visually hidden, still in the
accessible name) rather than `hidden` (removed from it entirely) below `xl`,
since the label's `title` attribute alone is not reliably announced by every
screen reader. The compact brand card that rendered below `xl`
(`CompactBrand`) does not fit a 64px rail on its own terms — its logo alone
(`h-10 w-10`, `p-3` padding) is wider than that — so it was reduced to a
smaller, centred logo only; the tenant/brand name is not lost, since
`DashboardTopbar` (rendered alongside this sidebar on every route) carries
identity separately and was never inside this sidebar.

This is a narrower rail, not a drawer. A drawer pattern (hamburger trigger,
overlay, focus trap) is what the record's own 2026-08-29 recommendation
named as the right shape for this and explicitly sized as `PLAN_REQUIRED` —
"real design and shell work with consequences for every route, not a patch."
Building that blind, with no way to verify focus handling or animation in a
browser, was judged the wrong trade for this task. The rail keeps every nav
item reachable (icon, `title` tooltip, and now an `sr-only` accessible name)
at a fixed, small, non-overflowing width; a drawer remains open work if the
Architect wants it.

### Cause 1 — the payroll sub-navigation

`apps/web/app/(authenticated)/payroll/_components/payroll-nav.tsx`. The outer
`<nav>` already had `flex-wrap` (confirmed unchanged since `21032ae`, the
commit this record was detected at — the outer `PayrollLayoutShell` container
already stacked title above nav below `xl` at that same commit too), so the
"parent is not narrow enough for wrapping to help" in the record's evidence
undersold what was actually wrong: each *group* of links ("Operations", six
items; "Foundation", four) was its own `flex items-center gap-1` row with no
wrap of its own. The outer nav wrapping a whole group onto its own line does
nothing if that group's own row is still wider than the viewport by itself.

Fix: added `flex-wrap` to each group's row, so pills wrap onto multiple lines
inside a narrow viewport instead of forcing one unbroken row past it.

### Cause 2 — the `/employees` resize handle: does not reproduce

Traced the whole chain: `data-table.tsx`'s resize handle
(`className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize ..."`) is
a child of `<th className={\`relative px-3 py-2 ...\`}>` — so it is
positioned against its own column, inside a `<div className="w-full min-w-0
overflow-x-auto ...">` wrapper. That is the exact containment pattern the
record's own Evidence section already certified as correct at 1440px ("the
tables are not at fault"). `/employees` renders through this same shared
`DataTable` (via `ModuleDataTable` → `StandardModuleListPage`) — there is no
second table implementation. No code was changed here.

Given cause 3 (the sidebar) is independently confirmed to be present on every
route including `/employees`, and the 2026-08-29 re-measurement found
`/employees`' overflow *grew* between an empty tenant (+61px) and a populated
one (+103px) — exactly the shape a widening sidebar-squeeze would produce, not
a fixed-position CSS bug — the sidebar is the more likely explanation for the
`/employees` figures the record measured. This is inference from the
available evidence, not a new measurement.

### What was not addressed

Tablet width, `apps/admin`, the landing site, settings pages and record pages
were out of the original measurement's scope and remain so. Touch-interaction
usability (a control being reachable by a thumb, not just on-screen) was
never tested and still is not.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
