---
ID: ITEM-0012
aliases: [ITEM-0012]
Title: Cross-check app/api route methods against the hrefs that target them
Type: TEST_GAP
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [apps/web, apps/admin]
Source: QA_RUN
OwnerAgent: frontend
ArchitectDisposition: FIX_NOW
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-15
RelatedBug: BUG-0008
RelatedQA: docs/qa/runs/2026-08-14-admin-session-expired-logout-cbc2db8.md
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0012 — Cross-check app/api route methods against the hrefs that target them

## Summary

[[BUG-0008]] was an `<a href>` pointing at a route that exported only `POST`.
Nothing cross-references the two, so the mismatch shipped and stranded every
admin operator whose session expired.

## Why It Matters

The QA run that fixed it did the audit **by grep**, and said so: *"it will
drift."* That is a prediction, not a hypothetical — the same class already
produced one production incident, and the divergence survived because
`apps/web` happened to export both methods and hid the admin gap.

## Evidence

`docs/qa/runs/2026-08-14-admin-session-expired-logout-cbc2db8.md`, Follow-up:
"Consider extending the `route-method-mismatch` check into a lint rule or a
repo-wide test that cross-references `href` targets under `app/api/` with the
methods those route files export. This run did that audit by grep; it will
drift."

Bug pattern: `docs/qa/known-bug-patterns/route-method-mismatch.md`.

## Proposed Approach

A repo-wide test — not a lint rule; this is a cross-file relationship and lint is
per-file. Collect every string literal under `apps/*/app/**` that targets
`/api/…`, resolve it to the route file, and assert the route exports a handler
for the method the call site implies (`<a href>` and `router.push` mean GET;
`fetch` carries its own).

The same walk answers [[BUG-0024]]'s question — an `app/api` proxy with **no**
caller at all — so build it to report both.

## Acceptance Criteria

A test fails when an `href` targets a route that does not export `GET`, and
reports any `app/api` route with no call site. It passes on the current tree,
minus the one known dead route in BUG-0024.

## Dependencies

None. Runs in jest's node environment, so it is unaffected by the jsdom gap.

## Related Items

[[BUG-0008]] · [[BUG-0024]] · bug pattern [[route-method-mismatch]] ·
modules [[platform-admin|Platform Admin]], [[tenant-application|Tenant Application]].

## History

- 2026-08-15 — imported from the admin session-expired QA run's follow-up.

- 2026-08-15 — Architect triage: FIX_NOW. The class already produced one production incident (BUG-0008), the audit that caught it was done by grep and was predicted to drift, and the same walk answers BUG-0024. It runs in the jest node environment, so it is unaffected by the jsdom gap and independent of the new browser suite.
