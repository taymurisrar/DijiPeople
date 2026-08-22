---
ID: ITEM-0002
aliases: [ITEM-0002]
Title: Live API session and database proof for admin sign-out
Type: TEST_GAP
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [services/api, apps/admin]
Source: QA_RUN
OwnerAgent: qa
ArchitectDisposition: DONE
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-22
RelatedBug: BUG-0627
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

## Resolution — 2026-08-22, SESSION-0040

Closed by `services/api/test/admin-logout-revocation.e2e-spec.ts` — six tests,
DB-backed, driven over real HTTP from a booted `AppModule`, registered as
REG-221. [[QA-AUTH-002]] is promoted from PARTIAL.

**The item was a test gap hiding a defect.** The proof was written first, and the
central case failed:

```
● revokes the persisted token when the refresh cookie has already expired
    Expected constructor: Date
    Received value: null
```

`AuthService.logout` keyed revocation on the refresh token alone and read it only
from the cookie. The refresh cookie is the shortest-lived of the three, so the
sign-out that follows a session-expired modal — the flow [[BUG-0009]] was raised
about — arrives without it, and the handler cleared the response cookies and
returned success without touching a row. The operator sees the login screen; the
`PlatformRefreshToken` stays live for up to seven days.

That is [[BUG-0627]], fixed in the same change: `logout` now revokes by the
forwarded session cookie, scoped to `{ sessionId, appClientId, revokedAt: null }`.

### Against the acceptance criteria

| Criterion | Where |
|---|---|
| GET and POST invoked against a real session | POST over HTTP here; GET in `logout-route.behaviour.spec.ts` |
| A missing refresh cookie still leaves the persisted token revoked | proven — and it did not, until [[BUG-0627]] was fixed |
| Rejected cookie configuration returns the redirect rather than 500 | `logout-route.behaviour.spec.ts`, both methods |
| `QA-AUTH-002` promoted from PARTIAL only after those assertions pass | promoted on this evidence |

### Why this item was right to stay open

It was rejected once, on 2026-08-17, for being closed against a static
source-shape test. That rejection was correct, and the reason is now concrete
rather than procedural: the behaviour spec that followed invokes the handlers but
mocks `fetch`. A mock proves the request is **sent**; it cannot prove anything
was **revoked**. The defect sat behind a green test for five days, and only
reading a database row back surfaced it.

### Verification

```
npx jest --config ./test/jest-e2e.json \
  --runTestsByPath test/admin-logout-revocation.e2e-spec.ts
→ 6 passed
npx jest --testPathPatterns "auth|logout|session"
→ 16 suites, 173 tests, all passing
```

Mutation-proven twice: removing the revocation call fails both primary tests;
removing `appClientId` from the filter fails the scope test. The scope test
needed that second probe — its first version could not fail, and is written up in
[[BUG-0627]].

## History

- 2026-08-15 — imported from the admin session-expired QA run's follow-ups.

- 2026-08-15 — Architect triage: FIX_NOW. The blocker this item described has gone — the browser suite holds a real admin session through a real login, and `test/helpers/db-fixtures.ts` plus the DB-backed suites cover database assertions. What is left is narrow and worth doing: the two named follow-ups that would move BUG-0009 and BUG-0010 from FIXED to VERIFIED on evidence rather than on reading.

- 2026-08-17 — independent WP-02 review rejected the attempted `DONE` closure:
  the named spec is a static source-shape test and does not prove persisted
  revocation or execute the rejected-cookie path. Restored to `READY/FIX_NOW`.

- 2026-08-22 — resolved in SESSION-0040. The live proof was written, failed, and surfaced BUG-0627; both landed together and QA-AUTH-002 was promoted.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-0627]]
- Modules — [[api-architecture]], [[platform-admin]]
- QA run — [[2026-08-14-admin-session-expired-logout-cbc2db8]]

<!-- GRAPH:END -->
