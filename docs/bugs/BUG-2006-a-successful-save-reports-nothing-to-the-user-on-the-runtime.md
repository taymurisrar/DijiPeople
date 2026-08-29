---
ID: BUG-2006
aliases: [BUG-2006]
Title: A successful save reports nothing to the user on the runtime forms and the branding page
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-340
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-30
ResolvedAt: 2026-08-30
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

## Dependencies

None technically. Should be scheduled with BUG-1966.

## Related Items

BUG-1966 (a failed save swallowed with no message) is the same silence on the
other branch and is the higher-leverage half. BUG-2005 concerns the same
attendance endpoint from the validation side. BUG-1963 (raw server messages in
runtime dialogs) is the third member of the same feedback cluster.

## Resolution

Two surfaces, two different states found on investigation — not the shared
handler this record's Proposed Resolution expected:

**Branding settings (`/settings/branding`) — already fixed, not by this
task.** `apps/web/app/(authenticated)/settings/branding/_components/branding-settings-form.tsx:315-321`
already calls `setToast({ title: "Branding updated", description: … , variant:
"success" })` on the 2xx branch of `persistBranding`, rendered by the
`SideToast` at line 757. Last touched at `ee10f739`, well before this branch's
work. The premise that branding reports nothing has not held since before this
record's own reproduction — no code change was made here; verified from
source, not re-fixed.

**Manual attendance (`/attendance/new`) — fixed.** The 2xx branch of
`handleSubmit` in
`apps/web/app/(authenticated)/attendance/_components/manual-attendance-form.tsx`
already reset the form (`setForm(initialForm)`) but reported nothing. Wired the
existing shared `useSideToast()` hook
(`app/components/notifications/use-side-toast.tsx`, already used elsewhere —
`leave-request-action-buttons.tsx`) rather than hand-rolling a second toast
mechanism: `notifySuccess("Manual attendance entry created", …)` is called on
the 201 branch before the form clears, and `{toast}` is rendered inside the
form.

The two surfaces turned out not to share a handler — attendance is a bespoke
client form, branding is a bespoke settings form — so there was no single
layer to fix once. Both now use the same shared primitive
(`useSideToast`/`SideToast`), which is the closest thing to "one mechanism"
available without inventing a new abstraction for two call sites.

## Regression Coverage

REG-340. `apps/web/app/(authenticated)/attendance/_components/manual-attendance-form.spec.ts`
asserts over the source (no jsdom in this app's jest config) that the success
branch calls `notifySuccess(...)` before `setForm(initialForm)`, and that
`{toast}` is rendered. Mutation-tested: removing the `notifySuccess(...)` call
fails the "calls notifySuccess on the 201 branch" assertion; reverted
immediately after confirming.

No test was added for the branding page, because no code changed there — its
behaviour was already correct and is not this task's evidence to claim.

## QA Retest

Not retested live against a running tenant. Verified from source: the
attendance form's success branch now calls `notifySuccess` and renders the
toast (asserted by the spec above); the branding form's success branch already
did (unchanged, read at the cited line numbers).

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`. Merges two observations of the same silence (manual attendance and branding) into one record, since a single handler is the likely fix. Disposition FIX_NOW.
- 2026-08-29 — Regression Coverage updated: browser E2E coverage for `apps/web` landed on `origin/develop` (ITEM-0034, 2026-08-29). Its three flows are read-only navigation and perform no runtime-form save, so this is still uncovered — and that suite is now the natural home for the assertion.
- 2026-08-30 — investigated both surfaces: branding already reports success (unrelated prior work, `ee10f739`); wired `useSideToast` into the manual attendance form, which did not. No shared handler existed to fix once, contrary to the Proposed Resolution's expectation. Closed FIXED under REG-340.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
