---
ID: ITEM-0002
aliases: [ITEM-0002]
Title: No harness exists for testing against a running API with real sessions
Type: TEST_GAP
Status: TRIAGE_REQUIRED
Priority: P2
Severity: MEDIUM
AffectedModules: [services/api, apps/admin]
Source: QA_RUN
OwnerAgent: qa
ArchitectDisposition: TRIAGE_REQUIRED
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-15
RelatedBug: BUG-0009
RelatedQA: docs/qa/runs/2026-08-14-admin-session-expired-logout-cbc2db8.md
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0002 — No harness exists for testing against a running API with real sessions

## Summary

Two fixed defects — [[BUG-0009]] (revocation depended on the refresh cookie) and
[[BUG-0010]] (unguarded cookie options could 500 sign-out) — are `FIXED` rather
than `VERIFIED` because neither is observable without a running API holding a
real session, and no harness for that exists.

## Why It Matters

Session revocation is the one auth behaviour where "the code looks right" is
least convincing: the failure mode is a session that *appears* closed. Two
security-adjacent fixes are currently claims.

More generally, the boundary between "provable with jest and supertest" and
"needs a live process" is where this repository keeps accumulating unverified
fixes.

## Evidence

`docs/qa/runs/2026-08-14-admin-session-expired-logout-cbc2db8.md`, Known
Limitations: "Server-side revocation was not observed. The API was not running."
Its Follow-up section names the exact missing test: sign out with the refresh
cookie already expired and confirm the `PlatformRefreshToken` row is revoked.

The commercial onboarding run *did* drive a live local API successfully, which
shows the capability is reachable — it was built ad hoc as a bespoke HTTP+SQL
harness and not kept.

## Proposed Approach

Promote the ad-hoc harness pattern the commercial onboarding run used into
something reusable under `services/api/test/helpers/`, alongside the existing
`db-fixtures.ts`. Scope it deliberately: enough to authenticate, hold cookies
and assert database state — not a second e2e framework.

## Acceptance Criteria

The two follow-ups named above run as tests, and [[BUG-0009]] can move to
`VERIFIED` on evidence rather than on reading.

## Dependencies

Needs an isolated database, which CI already provides via the
`database-migration` job's ephemeral PostgreSQL service.

## Related Items

[[BUG-0009]] · [[BUG-0010]] · [[ITEM-0001]] · architecture note
[[qa-and-ci-architecture|QA and CI Architecture]].

## History

- 2026-08-15 — imported from the admin session-expired QA run's follow-ups.
