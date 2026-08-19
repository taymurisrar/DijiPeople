---
ID: BUG-0074
aliases: [BUG-0074]
Title: The provisioning queue scroll container was unreachable by keyboard
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-19
DetectedInSha: 4290c03
AffectedModules: [apps/admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-068
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-19
UpdatedAt: 2026-08-19
ResolvedAt: 2026-08-19
---

# BUG-0074 - The provisioning queue scroll container was unreachable by keyboard

## Summary

The provisioning queue's table is wider than the viewport and scrolls inside an
`overflow-x-auto` container. That container had no `tabIndex`, so it could be
scrolled with a mouse or trackpad and by nothing else. A keyboard user could tab
to elements *inside* the table but had no way to scroll it horizontally, leaving
the right-hand columns - Blocker, Attempt, Correlation - permanently
unreachable.

## Expected Behavior

A scrollable region is focusable and named, so a keyboard user can focus it and
scroll with the arrow keys. This is axe's `scrollable-region-focusable` rule.

## Actual Behavior

axe reported `scrollable-region-focusable` at **serious** impact against
`.overflow-x-auto`, and the off-screen columns were keyboard-unreachable.

## Reproduction

1. Sign in to Platform Admin and open `/operations/provisioning` with enough
   runs to make the table exceed the viewport width.
2. Navigate by keyboard only.
3. There is no way to bring the Blocker, Attempt or Correlation columns into
   view.

## Evidence

```
E3 provisioning operations - SERIOUS scrollable-region-focusable
  "Scrollable region must have keyboard access" [.overflow-x-auto]
```

`apps/admin/app/(internal)/operations/provisioning/provisioning-queue.tsx` - the
container introduced by WP-11 in this same session.

## Root Cause

The container was added to solve a *different* correct problem: a wide table
must scroll inside itself rather than making the page body scroll sideways,
which drags the navigation shell off-screen. That fix was right and has its own
test. What it missed is that making a region scrollable creates a new
interaction, and an interaction only a pointer can perform is not available to
everyone.

The screen's own E5 test asserted the table was "reachable and readable by
keyboard" on the strength of header `scope` and a caption - real properties, but
not the one that mattered here. A hand-written structural check saw what its
author thought to look for; axe saw what the rule set knows to look for. That is
the argument for the tool, made against my own code.

## Impact

Keyboard-only and screen-reader users could not read three of the ten columns on
the screen built specifically to tell an operator that a paying customer is
stuck. Confined to Platform Admin.

## Affected Areas

`apps/admin` - the provisioning queue introduced by TASK-0007 WP-11.

## Proposed Resolution

Give the container `tabIndex={0}`, plus `role="region"` and an `aria-label` so
it is announced as something rather than as an unnamed group. No ExecPlan.

## Acceptance Criteria

- axe reports no `scrollable-region-focusable` violation on the queue.
- The container is focusable and scrolls with the arrow keys.
- The page body still does not scroll sideways at 390, 768 or 1366 pixels - the
  original defect must not return in exchange.

## Regression Coverage

`e2e/tests/flow-e-accessibility-and-layout.spec.ts` - E3 audits the screen, and
E4 independently checks the body-overflow property so the two cannot be traded
against each other. REG-068.

## Dependencies

None.

## Related Items

- [[BUG-0073]] - found in the same audit
- [[platform-admin]]

## Resolution

Fixed on branch `agent/provisioning-ops-and-qa`: `role="region"`,
`aria-label="Provisioning runs"` and `tabIndex={0}` on the container, with a
comment recording why.

## QA Retest

Re-run 2026-08-19: E3 and E4 both pass. Full browser suite 30 passed.

## History

- 2026-08-19 - found by the first axe audit, on a screen whose own hand-written
  keyboard test had passed; fixed and retested the same day.
