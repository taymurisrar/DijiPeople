---
ID: ITEM-0012
aliases: [ITEM-0012]
Title: Cross-check app/api route methods against the hrefs that target them
Type: TEST_GAP
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [apps/web, apps/admin]
Source: QA_RUN
OwnerAgent: frontend
ArchitectDisposition: DONE
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-17
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

- 2026-08-17 — Architect reconciliation: terminal `DONE` status normalized to
  `ArchitectDisposition: DONE`; no runtime behavior changed.

- 2026-08-15 — imported from the admin session-expired QA run's follow-up.

- 2026-08-15 — Architect triage: FIX_NOW. The class already produced one production incident (BUG-0008), the audit that caught it was done by grep and was predicted to drift, and the same walk answers BUG-0024. It runs in the jest node environment, so it is unaffected by the jsdom gap and independent of the new browser suite.

## Resolution

Implemented as `scripts/check-route-method-callers.mjs`, a required CI step —
**and it found a live defect on its first run.**

BUG-0008 was an `<a href>` at a route exporting only `POST`: 405, and every
admin operator whose session expired was stranded. Each side was individually
correct; only the pair was wrong, and nothing looked at pairs.

The check resolves same-app `/api/...` targets to their handler file and
compares the method actually sent — a link is always `GET`, a `fetch` with no
`method` is `GET` — against the methods that file exports.

Scope is deliberately narrow, for the reason ITEM-0011 gives about checks nobody
trusts: only statically resolvable same-app paths are examined. A dynamic
segment, an external URL, or a route in another app is **skipped rather than
guessed at**, so every failure it reports is real.

**First run: 1 offender.** `tenant-commercial-panel.tsx:442` fetched
`/api/super-admin/plans` with `GET` while the proxy exported only `POST`, so
the plan dropdown on the tenant commercial panel had never loaded — it showed
"Unable to load plans", which reads as a backend outage rather than a method
mismatch. The API's `GET /super-admin/plans` existed the whole time; only the
proxy was missing the half that reaches it.

Recorded as [[BUG-0038]] and fixed in the same change. That is this item working
exactly as intended: the check written after the first instance found the second
before anyone reported it.

## Verification

`npm run check:route-method-callers` — **72 caller/route pairs agree on
method**, was 1 offender.

Verified to fail: it reported BUG-0038 by file, line, method sent and methods
exported, before that defect was known to exist. Registered as REG-033.
