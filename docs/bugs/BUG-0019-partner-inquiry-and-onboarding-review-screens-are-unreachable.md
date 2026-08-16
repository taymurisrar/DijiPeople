---
ID: BUG-0019
aliases: [BUG-0019]
Title: Partner inquiry and onboarding review screens have no inbound link
Status: FIXED
Severity: HIGH
Priority: P1
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-15
DetectedInSha: 7bbab3d
AffectedModules: [apps/admin]
OwnerAgent: frontend
ArchitectDisposition: PLAN_REQUIRED
QAReport: docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-16
ResolvedAt: 2026-08-16
---

# BUG-0019 — Partner inquiry and onboarding review screens have no inbound link

## Summary

`/partner-inquiries/[inquiryId]` and `/partner-onboarding/[applicationId]` are
bespoke review screens with **no inbound link anywhere in the app**. The list
routes redirect to `/partners?viewId=…`, whose rows navigate to
`/partners/{partnerId}` — a different entity from the one the detail pages load.

## Expected Behavior

A reviewer can reach the partner inquiry and onboarding review screens from the
partner surfaces, and the list they arrive from lists the entity the detail page
shows.

## Actual Behavior

The screens are only reachable by typing a URL with an id nobody is shown. The
`partner-inquiries` view filters **Partner** rows by status, which is a different
entity from the `PartnerInquiry` the detail page loads — so even the list is
showing the wrong thing.

## Reproduction

From the admin app, attempt to open a partner inquiry for review starting from
any navigation entry.

## Evidence

QA run, UI / UX section, rated HIGH. Verified at `main` `ad8f77f`: the only
references to those routes outside the pages themselves are
`apps/admin/proxy.ts:433-434`; no navigation entry, list row or action links to
either.

## Root Cause

Two review surfaces were built and the routing that reaches them was never
completed — a list route redirect stood in for the list, pointing at a
neighbouring entity that happened to render.

## Impact

The partner compliance review step is effectively unperformable through the
product. It is also why
[[BUG-0016-partner-onboarding-review-has-no-state-machine]] is hard to trigger
in the UI — mitigation by accident, which disappears the moment this is fixed.

## Affected Areas

`apps/admin` — partner navigation, the `partner-inquiries` runtime view, and
both detail routes.

## Proposed Resolution

Route the partner-inquiry list at `PartnerInquiry` rows rather than `Partner`
rows, and link both detail screens from the partner surfaces. This is a
navigation and runtime-view fix, not a redesign.

**Sequence matters:** fixing this makes BUG-0016 reachable by ordinary users. The
two should land together, or this one should wait.

## Acceptance Criteria

- A reviewer reaches an inquiry review screen from navigation, in one path.
- The `partner-inquiries` view lists `PartnerInquiry` rows and its rows open the
  matching detail page.
- The onboarding review screen is reachable from the partner record.

## Regression Coverage

**None.** `BROWSER_E2E` is `BLOCKED_INFRASTRUCTURE` in this repository — see
[[ITEM-0001]]. The reachability half is testable without a browser: assert the
runtime view's entity and the navigation entries.

## Dependencies

Sequencing dependency on [[BUG-0016-partner-onboarding-review-has-no-state-machine]].

## Related Items

Modules [[partners|Partners]], [[partner-onboarding|Partner Onboarding]], [[platform-admin|Platform Admin]].
Requirement [[partner-onboarding|Partner Onboarding]]. Bug pattern
[[ui-permission-backend-mismatch]] is adjacent but not this — nothing here is
about permissions; the surface simply cannot be reached.

## Resolution

Fixed. The cause was narrower and stranger than "routing was never completed":
**both runtime modules already existed, fully defined**, and their list routes
redirected away from them.

`apps/admin/app/(internal)/partner-inquiries/page.tsx` was
`redirect("/partners?viewId=partner-inquiries")` and the partner-onboarding page
was the equivalent. So a reviewer was sent to a **Partner** list — a different
entity — whose rows link to `/partners/{partnerId}`, an id the detail screens
cannot resolve. Every individual piece was present and correct; only the route
that joined them navigated somewhere else.

Both pages now render their own module. `partner-inquiries` was already in the
sidebar and had simply been redirecting; `partner-onboarding` had no entry at
all and now has one.

**Sequencing satisfied.** This record warned that fixing it makes
[[BUG-0016-partner-onboarding-review-has-no-state-machine]] reachable by ordinary
users, and that the two should land together. BUG-0016 is FIXED, so the state
machine is in place before the screens became reachable.

**A third instance was found by the invariant, not by the report.**
`/signature-requests` redirected to `/contracts?viewId=awaiting-external-signature`
while the `signature-requests` module is defined over SignatureRequest rows —
recipients, expiry, completion — which a Contract list cannot show. Fixed the
same way.

## QA Retest

`apps/admin/lib/runtime/module-routes.invariant.spec.ts` — 20 assertions. For
every module declaring a `routeBase`, the page at that route must render the
module rather than navigate away.

It found all three instances on its first run, including the one no record
mentioned. Admin suite: 10 suites, 91 tests passing; typecheck and ESLint clean.

The check strips comment lines before matching, because an earlier draft flagged
the *fix's own doc comment* — which quotes the old `redirect(...)` — as the
defect.

## History

- 2026-08-15 — found during the commercial onboarding E2E UI/UX assessment.
- 2026-08-15 — re-verified against `main` `ad8f77f` and recorded as OPEN,
  awaiting Architect triage.

- 2026-08-15 — Architect triage: PLAN_REQUIRED. The sequencing dependency on BUG-0016 is now discharged — the review endpoint refuses illegal transitions, so making the screens reachable no longer exposes an ungoverned endpoint. The fix itself is not a navigation tweak: the `partner-inquiries` runtime view is bound to **Partner** rows and must be re-pointed at `PartnerInquiry`, which changes what its columns, filters and row actions mean. That is a runtime-registry change with three consumers and warrants a plan. Browser scenario B4 now carries the reachability assertion, marked `fixme`, so the gap appears in every report instead of being absent.
- 2026-08-16 — fixed by pointing both routes at the modules that already
  existed, plus a missing sidebar entry. An invariant written for the two
  reported instances immediately found a third (`signature-requests`).
