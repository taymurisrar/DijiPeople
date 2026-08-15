---
ID: BUG-0019
aliases: [BUG-0019]
Title: Partner inquiry and onboarding review screens have no inbound link
Status: OPEN
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
UpdatedAt: 2026-08-15
ResolvedAt:
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

Not resolved.

## QA Retest

Not applicable. All UI findings in the source run are code-read, not observed in
a browser.

## History

- 2026-08-15 — found during the commercial onboarding E2E UI/UX assessment.
- 2026-08-15 — re-verified against `main` `ad8f77f` and recorded as OPEN,
  awaiting Architect triage.

- 2026-08-15 — Architect triage: PLAN_REQUIRED. The sequencing dependency on BUG-0016 is now discharged — the review endpoint refuses illegal transitions, so making the screens reachable no longer exposes an ungoverned endpoint. The fix itself is not a navigation tweak: the `partner-inquiries` runtime view is bound to **Partner** rows and must be re-pointed at `PartnerInquiry`, which changes what its columns, filters and row actions mean. That is a runtime-registry change with three consumers and warrants a plan. Browser scenario B4 now carries the reachability assertion, marked `fixme`, so the gap appears in every report instead of being absent.
