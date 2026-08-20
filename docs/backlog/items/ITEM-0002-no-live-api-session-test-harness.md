---
ID: ITEM-0002
aliases: [ITEM-0002]
Title: Live API session and database proof for admin sign-out
Type: TEST_GAP
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [services/api, apps/admin]
Source: QA_RUN
OwnerAgent: qa
ArchitectDisposition: FIX_NOW
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-17
RelatedBug: BUG-0009
RelatedQA: docs/qa/runs/2026-08-14-admin-session-expired-logout-cbc2db8.md
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0002 — Live API session and database proof for admin sign-out

## Summary

The gap remains. `REG-032` statically inspects the logout route's source shape,
but no test invokes GET/POST with a persisted platform session and proves the
`PlatformRefreshToken` row is revoked when the refresh cookie is absent. The
same source-shape test does not execute the rejected-cookie-configuration path.

## Why It Matters

Session revocation is the one auth behaviour where "the code looks right" is
least convincing: the failure mode is a session that *appears* closed. Static
guards are useful, but cannot prove persisted revocation or a real response.

More generally, the boundary between "provable with jest and supertest" and
"needs a live process" is where this repository keeps accumulating unverified
fixes.

## Evidence

The original limitation is recorded in
`docs/qa/runs/2026-08-14-admin-session-expired-logout-cbc2db8.md`. `REG-032`
and `apps/admin/app/api/auth/logout/logout-route.spec.ts` prove only that the
current source contains unconditional-looking calls and a safe wrapper. The
spec never invokes either route handler and never queries a token row.

## Proposed Approach

Add a focused integration/E2E harness that creates a platform session and
refresh-token row, invokes both logout methods with the refresh cookie absent,
and asserts the row is revoked. Execute the rejected cookie-domain path and
assert a non-500 redirect plus best-effort cookie expiry. Reuse the existing DB
fixtures and ephemeral PostgreSQL; do not introduce another test framework.

## Acceptance Criteria

- GET and POST are invoked against a real session.
- A missing refresh cookie still leaves the persisted token revoked.
- Rejected cookie configuration returns the intended redirect rather than 500.
- `QA-AUTH-002` is promoted from PARTIAL only after those assertions pass.

## Dependencies

No external blocker. Existing DB fixtures and CI PostgreSQL make this
technically resolvable.

## Related Items

[[BUG-0009]] · [[BUG-0010]] · [[ITEM-0001]] · architecture note
[[qa-and-ci-architecture|QA and CI Architecture]].

## History

- 2026-08-15 — imported from the admin session-expired QA run's follow-ups.

- 2026-08-15 — Architect triage: FIX_NOW. The blocker this item described has gone — the browser suite holds a real admin session through a real login, and `test/helpers/db-fixtures.ts` plus the DB-backed suites cover database assertions. What is left is narrow and worth doing: the two named follow-ups that would move BUG-0009 and BUG-0010 from FIXED to VERIFIED on evidence rather than on reading.

- 2026-08-17 — independent WP-02 review rejected the attempted `DONE` closure:
  the named spec is a static source-shape test and does not prove persisted
  revocation or execute the rejected-cookie path. Restored to `READY/FIX_NOW`.
