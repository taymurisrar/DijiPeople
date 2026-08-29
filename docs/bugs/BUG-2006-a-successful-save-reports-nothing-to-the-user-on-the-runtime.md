---
ID: BUG-2006
aliases: [BUG-2006]
Title: A successful save reports nothing to the user on the runtime forms and the branding page
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt:
---

# BUG-2006 — A successful save reports nothing to the user on the runtime forms and the branding page

## Summary

A save that works looks exactly like a save that did nothing. On
`/attendance/new` the POST returns 201 and the page stays where it is: no toast,
no inline confirmation, no redirect, no cleared form. The branding settings page
behaves the same way. Combined with BUG-1966, which swallows *failed* saves, the
result is that neither outcome of pressing Save is reported — so the user's only
way to find out what happened is to navigate away and look.

## Expected Behavior

Every save reports its outcome. On success: a confirmation, and then whichever of
redirect-to-record, clear-the-form or stay-and-confirm the surface intends —
stated deliberately rather than left to whatever the component happens to do.

## Actual Behavior

**Manual attendance.** `POST /api/attendance/manual` returns 201. The browser
stays on `/attendance/new` with the form still filled in and no message. Nothing
distinguishes this from a submit that never fired. A user who reasonably presses
Save again gets:

```
409 "An attendance entry already exists for this employee on this date."
```

which is the first feedback the flow gives them, and it is an error.

**Branding settings.** Changing the brand colours and the display name and
pressing Save persists correctly — `GET /api/tenant-settings/resolved` returns
`branding.primaryColor: "#0f766e"`, and the live CSS custom property
`--brand-primary` updates immediately with no reload — with no toast and no
inline confirmation.

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, tenant `DijiPeople Demo`,
production API commit `949f461c`, observed 2026-08-29.

**Attendance**

1. Open `/attendance/new` and complete a valid manual attendance entry.
2. Press Save. The network call returns 201.
3. Observe: the page does not move, the form is not cleared, and no message
   appears.
4. Press Save again. A 409 duplicate error appears — the first outcome the user
   is shown.

**Branding**

1. Open `/settings/branding`.
2. Change `primaryColor` from `#059669` to `#0f766e` and set the display name.
3. Press Save. The change persists and the live theme updates.
4. Observe: no confirmation of any kind.

## Evidence

Both sequences above, observed live on the production demo tenant, with the
persistence independently confirmed by `GET /api/tenant-settings/resolved` in the
branding case and by the subsequent 409 in the attendance case.

No file:line evidence was collected. The attendance create page and the settings
form both need locating before the fix, and the question of whether they share a
submit handler answered there — BUG-1966 is the same silence on the failure path
and may well be the same component.

## Root Cause

Not established. Observably, neither surface renders a success state after a
2xx response.

## Impact

The user cannot tell whether their work was saved. On attendance that produces a
concrete second failure — the duplicate 409 — because pressing Save again is the
rational response to no feedback. On branding it produces uncertainty on a page
an administrator configures once during onboarding, which is exactly when they
have least basis for assuming it worked.

The compounding factor is BUG-1966: with failures swallowed too, Save is a
control whose outcome is never reported in either direction. That is what makes
this worth fixing as a pair rather than as a piece of polish.

Rated MEDIUM: missing UI state on production write paths, with a demonstrated
knock-on failure. Not HIGH: no journey is blocked and no data is wrong.

## Affected Areas

`apps/web` — the manual attendance create page (`/attendance/new`), the branding
settings page (`/settings/branding`), and whatever submit handling the runtime
forms and the settings runtime share with them.

## Proposed Resolution

Fix this together with BUG-1966, in whatever layer both outcomes pass through.
One handler that reports success and failure is a smaller change than two
handlers that each report one, and it removes the class rather than the
instances.

Decide the post-save behaviour per surface deliberately — a create form should
usually redirect to the created record or clear itself; a settings page should
usually stay and confirm — and write it down, because "stays put and says
nothing" is currently the default by omission rather than by choice.

## Acceptance Criteria

- A successful save on `/attendance/new` shows a confirmation and either
  redirects to the created entry or clears the form.
- A successful save on `/settings/branding` shows a confirmation.
- No production write surface in `apps/web` completes a 2xx save with no visible
  outcome.
- Verified together with BUG-1966, so both branches of the same Save are covered.

## Regression Coverage

None yet. `apps/web` has no jsdom, so a unit test cannot assert what the user
sees. Browser coverage now exists (`e2e/tests/flow-h`, `flow-i`, `flow-j`, added
for ITEM-0034 on 2026-08-29) and is the natural home for an assertion that a 2xx
save produces a visible outcome — but none of those three flows performs a
runtime-form save today, so nothing covers it yet. Until one does, this is
covered by asserting the shared handler's returned state as pure logic, or by the
smoke check described in BUG-2003.

## Dependencies

None technically. Should be scheduled with BUG-1966.

## Related Items

BUG-1966 (a failed save swallowed with no message) is the same silence on the
other branch and is the higher-leverage half. BUG-2005 concerns the same
attendance endpoint from the validation side. BUG-1963 (raw server messages in
runtime dialogs) is the third member of the same feedback cluster.

## Resolution

Open. No fix has been written.

## QA Retest

Awaiting a fix — nothing to retest yet.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`. Merges two observations of the same silence (manual attendance and branding) into one record, since a single handler is the likely fix. Disposition FIX_NOW.
- 2026-08-29 — Regression Coverage updated: browser E2E coverage for `apps/web` landed on `origin/develop` (ITEM-0034, 2026-08-29). Its three flows are read-only navigation and perform no runtime-form save, so this is still uncovered — and that suite is now the natural home for the assertion.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
