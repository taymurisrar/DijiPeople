---
ID: BUG-0062
aliases: [BUG-0062]
Title: Landing mobile navigation menu stays open after navigating and ignores Escape
Status: OPEN
Severity: HIGH
Priority: P1
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-17
DetectedInSha: f58ee1d
AffectedModules: [apps/landing]
OwnerAgent: frontend
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-17-landing-uiux-browser-qa-f58ee1d.md
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
ResolvedAt:
---

# BUG-0062 — Landing mobile navigation menu stays open after navigating and ignores Escape

## Summary

On mobile widths the site header's only navigation is a `<details>` disclosure.
Tapping any link inside it navigates client-side, but nothing closes the panel —
and because the header lives in the root layout, it is never remounted. The open
menu then covers the top of the page the visitor just asked for, including its
`<h1>`. Escape does not dismiss it either.

## Expected Behavior

Selecting a destination closes the menu and reveals the page. Escape closes the
menu and returns focus to the trigger, which is the standard dismissal contract
for any overlay.

## Actual Behavior

The panel remains open over the newly rendered page. The visitor must tap the
trigger a second time to see where they landed. Escape does nothing.

## Reproduction

1. Open `http://localhost:3010/` at a 390x844 viewport.
2. Tap **Menu** in the header.
3. Tap **Plans**.
4. The URL becomes `/plans`, and the menu panel is still open over the page.
5. Separately: open the menu and press Escape. It stays open.

## Evidence

Chromium probes:

```
PROBE mobile-menu-closes-on-navigate :: FAIL ::
  openedBeforeNav=true stillOpenAfterNav=true url=http://localhost:3010/plans
PROBE mobile-menu-escape-dismiss :: FAIL :: openAfterEscape=true
```

Screenshot `probe-mobile-menu-stuck-open.png` shows the panel covering the
`/plans` heading and hero copy after the navigation completed.

Click-outside dismissal was **not** established either way by this pass — the
probe toggled the menu shut before testing it, so that check is inconclusive.
A bare `<details>` has no click-outside behaviour of its own, so it should be
assumed missing until measured.

## Root Cause

`apps/landing/app/_components/site-shell.tsx:65-93`. The menu is a plain
`<details>` element with no `open` state management. Next.js App Router
navigation re-renders the page slot but keeps the layout — and with it the
element's `open` property — mounted across the transition.

## Impact

Every mobile visitor, on every in-site navigation. Mobile is the only viewport
where this menu is the navigation, so there is no unaffected path. The obscured
region is the top of the page, which is where the heading and primary CTA live.

## Affected Areas

`apps/landing/app/_components/site-shell.tsx` — affects all 14 public routes.

## Proposed Resolution

Make the disclosure controlled: hold `open` in state, close it on `pathname`
change, on Escape, and on outside click, returning focus to the trigger on
dismissal. Client component boundaries already exist elsewhere in this app, so
this does not force the whole header client-side beyond the menu itself.

## Acceptance Criteria

1. Selecting any item in the mobile menu closes it and the destination page is
   unobscured.
2. Escape closes the menu and focus returns to the trigger.
3. A click outside the panel closes it.
4. The desktop (>=768px) navigation is unchanged.

## Regression Coverage

Needs a mobile-viewport browser scenario asserting the panel is closed after an
in-menu navigation. No `REG-nnn` yet.

## Dependencies

None.

## Related Items

[[BUG-0064-landing-public-pages-fail-wcag-bypass-blocks-and-text-contra]]

## Resolution

Not yet fixed.

## QA Retest

Pending.

## History

- 2026-08-17 — created from qa run at `f58ee1d`.
