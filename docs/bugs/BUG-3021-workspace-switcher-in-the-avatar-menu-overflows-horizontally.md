---
ID: BUG-3021
aliases: [BUG-3021]
Title: Workspace switcher in the avatar menu overflows horizontally and shows a scrollbar
Status: FIXED
Severity: LOW
Priority: P3
Type: UX
Source: USER_REPORT
DetectedDate: 2026-09-09
DetectedInSha: 72d9db1f
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-400
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-09
UpdatedAt: 2026-09-11
ResolvedAt: 2026-09-11
---

# BUG-3021 — Workspace switcher in the avatar menu overflows horizontally and shows a scrollbar

## Summary

The account menu behind the avatar contains a "Switch workspace" list. Each row
prints the workspace's full hostname, which is longer than the menu, so the list
renders a horizontal scrollbar across the bottom of the section.

## Expected Behavior

A menu sized to its content, with long hostnames truncated with an ellipsis and
the full value available on hover. A dropdown should never scroll sideways.

## Actual Behavior

With one workspace in the list, the row reads
`qa-e2e-signup-b-20260826.ws.dijipeople.com` and a horizontal scrollbar appears
beneath it, with visible left and right arrows. The scrollbar is present with a
single entry, so it is caused by width rather than by the number of workspaces.

## Reproduction

1. Sign in as a user who belongs to more than one workspace.
2. Open the avatar menu.
3. Observe the horizontal scrollbar under the "Switch workspace" section.

Reproduced with the workspace `qa-e2e-signup-b-20260826.ws.dijipeople.com`, whose
subdomain is long enough to overflow; a short hostname will not show it.

## Evidence

Screenshot supplied by the user on 2026-09-09, taken on the production tenant
workspace. The scrollbar spans the full width of the section and the row is
clipped mid-hostname.

## Root Cause

Not established. The row renders the hostname without a truncation rule, and the
container permits horizontal overflow instead of constraining the child.

## Impact

Cosmetic, and on a control every user opens. Rated LOW because nothing is
unreachable — the workspace can still be selected — but it is the kind of defect
that reads as unfinished, on the one menu that carries the product's identity
switching.

## Affected Areas

`apps/web` — the account menu component in the authenticated shell.

## Proposed Resolution

Truncate the hostname with an ellipsis, keep the workspace name as the primary
line, and put the full hostname in a `title`. Constrain the list container so it
cannot scroll horizontally regardless of hostname length.

Check the same treatment for the tenant name above it, which will overflow at a
longer name for the same reason.

## Acceptance Criteria

- No horizontal scrollbar in the account menu at any hostname length.
- A hostname too long for the menu is truncated with an ellipsis and reachable
  by hover.
- Verified with a hostname of at least sixty characters.

## Regression Coverage

REG-400.
`apps/web/app/components/workspace-switcher-overflow.spec.ts` — asserts the
`<li>` grid item carries `min-w-0` and that the list declares
`overflow-x-hidden` alongside its `overflow-y-auto`, plus that the name and
hostname lines both still sit on a `min-w-0`/`truncate` element. A
source-reading suite, matching the existing
`workspace-switcher-placement.spec.ts` in the same directory — `apps/web` has
no jsdom or testing library configured, so a rendered-layout measurement is
not available here.

## Dependencies

None.

## Related Items

- [[ITEM-0130]] — why the review missed this.
- Modules — [[tenant-application]]

## Resolution

Fixed on `agent/cs-s1-openbugs`. Root cause confirmed as the record guessed —
"a truncation rule" and "the container permits horizontal overflow" — with
the specific CSS mechanism identified:

- `apps/web/app/components/workspace-switcher.tsx` — the "Switch workspace"
  list is `display: grid`, and a `<li>` grid item defaults to
  `min-width: auto`, which for grid track sizing means "at least the
  min-content width". A `truncate` span forces `white-space: nowrap`, so its
  min-content width is the *entire* unwrapped hostname — a 43-character one
  (`qa-e2e-signup-b-20260826.ws.dijipeople.com`, the record's own repro)
  widened the grid track to fit it, and the `truncate` ellipsis never had a
  narrower box to clip against. Separately, the list declared
  `overflow-y-auto` with no `overflow-x` at all; per the CSS overflow spec, a
  non-`visible` `overflow-y` paired with a `visible` `overflow-x` computes the
  x-axis to `auto` too, so the oversized row got its own independent
  horizontal scrollbar that the dropdown's own `overflow-hidden` could not
  suppress.
- Fixed with `min-w-0` on each `<li>` (lets the grid track shrink to the
  menu's actual width) and `overflow-x-hidden` added alongside the existing
  `overflow-y-auto`. Both were needed together: `min-w-0` alone leaves the
  scrollbar in place should another overflow source appear, and
  `overflow-x-hidden` alone would have hidden the scrollbar while the row
  still visually overflowed the menu.
- "The tenant name above it" (the Proposed Resolution's second bullet) is
  `workspace.name`, rendered directly above the hostname inside the same
  `<li>`. It shares the identical grid-item ancestor, so the one fix covers
  both lines — no second change was needed for it.

## QA Retest

Not retested live — no access to a deployed environment from this branch.
The regression spec below is source-reading, by necessity (`apps/web` has no
jsdom/testing-library); a live check with a hostname at least sixty
characters long, as the record's own acceptance criteria asks for, is still
owed.

## History

- 2026-09-09 — reported by the user with a screenshot during the Reports &
  Analytics review.
- 2026-09-11 — fixed on `agent/cs-s1-openbugs`: `min-w-0` on the list item and
  `overflow-x-hidden` on the list, addressing both the grid-item sizing and
  the CSS overflow-axis interaction that produced the scrollbar.
  `RegressionId` set to `REG-400` — not centrally reserved; chosen as the
  next unused integer after `REG-399`, following the same precedent the other
  records in this branch used for an unallocated regression id.
- 2026-09-09 — triaged FIX_NOW by the Architect for SESSION-0095: small, local,
  and on a control every user opens.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
